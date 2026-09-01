#!/usr/bin/env node
// Draft the next release's CHANGELOG section automatically from the Conventional Commits since the
// last tag, using git-cliff (cliff.toml). This is the "stop hand-writing release notes" step:
//
//   node scripts/release-draft.mjs 1.2.3            print the drafted section
//   node scripts/release-draft.mjs 1.2.3 --write    insert it into CHANGELOG.md under [Unreleased]
//   node scripts/release-draft.mjs 1.2.3 --polish   rewrite the bullets as user-facing prose via
//                                                    Claude (needs ANTHROPIC_API_KEY; else raw)
//
// After drafting: review the section, bump plugin.json's version to match, and commit — the
// version-sync gate then holds VERSION + CHANGELOG + the tag in lockstep. release.yml publishes
// this section as the GitHub Release notes. git-cliff is invoked from PATH, so run this under mise
// (e.g. `./bin/mise exec -- node scripts/release-draft.mjs …`).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fail = (msg) => {
	console.error(`release-draft: ${msg}`);
	process.exit(1);
};

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('--'));
const write = args.includes('--write');
const polish = args.includes('--polish');
if (!version || !/^\d/.test(version)) {
	fail('usage: release-draft.mjs <version> [--write] [--polish]  (e.g. 1.2.3)');
}

const sh = (cmd, cmdArgs, input) =>
	execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8', input, timeout: 120_000 }).trim();

// The range is "since the last tag": git-cliff turns those commits into grouped bullets.
let lastTag;
try {
	lastTag = sh('git', ['describe', '--tags', '--abbrev=0']);
} catch {
	fail('no previous tag found (git describe --tags failed)');
}

let body;
try {
	body = sh('git-cliff', [`${lastTag}..HEAD`, '--tag', `v${version}`]);
} catch (error) {
	fail(`git-cliff failed (is it installed? run under mise): ${error.message}`);
}
if (!body) {
	fail(
		`no user-facing commits since ${lastTag} — nothing to release, or all commits were chore/ci/test`,
	);
}

// Optional: rewrite the grouped, commit-flavoured bullets into user-facing "What's New" prose with
// Claude (the Anthropic Messages API, keyed by ANTHROPIC_API_KEY). Never blocks a release — with no
// key, or on any API error, it keeps the raw git-cliff notes and points to the in-session route
// (asking Claude Code to rewrite the drafted section is the same polish, done by hand).
if (polish) {
	const key = process.env.ANTHROPIC_API_KEY;
	if (key) {
		try {
			const prompt =
				'Rewrite the following release notes as concise, user-facing bullets for a product "What\'s New". ' +
				'Plain language, benefit-led, no commit types, scopes, or engineering jargon. One bullet per ' +
				'user-visible change. If nothing is user-facing, say so in one honest line. Output only the ' +
				`bullets, each starting with "- ", no headings, no preamble.\n\n${body}`;
			const res = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-api-key': key,
					'anthropic-version': '2023-06-01',
				},
				body: JSON.stringify({
					model: process.env.RELEASE_NOTES_MODEL || 'claude-sonnet-5',
					max_tokens: 1024,
					messages: [{ role: 'user', content: prompt }],
				}),
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const data = await res.json();
			const text = (data.content ?? [])
				.map((block) => block.text ?? '')
				.join('')
				.trim();
			if (text) {
				body = text;
			}
		} catch (error) {
			console.error(
				`release-draft: polish via the Anthropic API failed, keeping raw notes (${error.message})`,
			);
		}
	} else {
		console.error(
			'release-draft: no ANTHROPIC_API_KEY set — keeping the raw notes. Set the key for automatic polish, or ask Claude Code to rewrite the drafted section for users.',
		);
	}
}

const today = new Date().toISOString().slice(0, 10);
const section = `## [${version}] - ${today}\n\n${body}`;

if (!write) {
	process.stdout.write(`${section}\n`);
	console.error(
		`\nrelease-draft: drafted v${version} from ${lastTag}..HEAD. Re-run with --write to insert into CHANGELOG.md.`,
	);
	process.exit(0);
}

// Insert under [Unreleased] and maintain the link-reference definitions.
const changelogPath = join(root, 'CHANGELOG.md');
let changelog = readFileSync(changelogPath, 'utf8');
if (!/## \[Unreleased\]\n/.test(changelog)) {
	fail('CHANGELOG.md has no "## [Unreleased]" heading to insert under');
}
if (changelog.includes(`## [${version}]`)) {
	fail(`CHANGELOG.md already has a "## [${version}]" section`);
}
changelog = changelog.replace(/## \[Unreleased\]\n+/, `## [Unreleased]\n\n${section}\n\n`);

const repoUrl = sh('git', ['remote', 'get-url', 'origin'])
	.replace(/\.git$/, '')
	.replace(/^git@github\.com:/, 'https://github.com/');
if (/\[Unreleased\]:\s*\S+/.test(changelog)) {
	changelog = changelog.replace(
		/\[Unreleased\]:\s*\S+/,
		`[Unreleased]: ${repoUrl}/compare/v${version}...HEAD\n[${version}]: ${repoUrl}/compare/${lastTag}...v${version}`,
	);
}
writeFileSync(changelogPath, changelog);
console.error(
	`release-draft: inserted v${version} into CHANGELOG.md (from ${lastTag}..HEAD). Review it, then bump the version to match and commit.`,
);
process.stdout.write(`${section}\n`);

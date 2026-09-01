#!/usr/bin/env node
// Single source of truth for the release version, to stop the plugin / marketplace / skill /
// VERSION / CHANGELOG versions drifting apart. The canonical value is plugin.json "version"; this
// propagates it to the marketplace manifest, every SKILL.md, and the VERSION file, and checks
// that CHANGELOG.md's topmost released heading matches (the changelog body is curated, so it is
// verified, never rewritten).
//
//   node scripts/sync-version.mjs           write the canonical version into every target
//   node scripts/sync-version.mjs --check   verify only; exit non-zero on any drift (the gate)
//
// To release: bump plugin.json "version" and add the matching "## [x.y.z] - date" section to
// CHANGELOG.md, commit (the pre-commit hook runs this to sync VERSION + the manifests), then cut
// the matching v<version> tag. The --check stage in pre-push + CI blocks drift; release.yml
// re-checks the tag against VERSION + CHANGELOG before publishing.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginJson = join(root, 'plugins/ttt-workflows/.claude-plugin/plugin.json');
const marketplaceJson = join(root, '.claude-plugin/marketplace.json');
const versionFile = join(root, 'VERSION');
const changelogFile = join(root, 'CHANGELOG.md');
const skillsDir = join(root, 'plugins/ttt-workflows/skills');

const check = process.argv.includes('--check');

// The canonical version — the first top-level `"version": "X"` in plugin.json.
const canonical = readFileSync(pluginJson, 'utf8').match(/"version":\s*"([^"]+)"/)?.[1];
if (!canonical) {
	console.error(`sync-version: no "version" found in ${pluginJson}`);
	process.exit(1);
}

// Each target: its file, the regex that isolates its version string, and how to rebuild it.
const targets = [
	{
		label: 'marketplace.json',
		file: marketplaceJson,
		re: /("version":\s*)"[^"]+"/,
		repl: `$1"${canonical}"`,
		read: (t) => t.match(/"version":\s*"([^"]+)"/)?.[1],
	},
	{
		// The bare version string, one line. The whole file is the version, so replace it entirely.
		label: 'VERSION',
		file: versionFile,
		re: /^[\s\S]*$/,
		repl: `${canonical}\n`,
		read: (t) => t.trim(),
	},
];
for (const name of readdirSync(skillsDir)) {
	const file = join(skillsDir, name, 'SKILL.md');
	targets.push({
		label: `skills/${name}/SKILL.md`,
		file,
		re: /(\n\s*version:\s*)"[^"]+"/,
		repl: `$1"${canonical}"`,
		read: (t) => t.match(/\n\s*version:\s*"([^"]+)"/)?.[1],
	});
}

let drift = 0;
let wrote = 0;
for (const t of targets) {
	const text = readFileSync(t.file, 'utf8');
	const current = t.read(text);
	if (current === canonical) {
		continue;
	}
	if (check) {
		console.error(`sync-version: DRIFT ${t.label} is "${current}", expected "${canonical}"`);
		drift++;
	} else {
		writeFileSync(t.file, text.replace(t.re, t.repl));
		console.log(`sync-version: ${t.label} ${current} -> ${canonical}`);
		wrote++;
	}
}

// CHANGELOG.md is curated by hand, so it is verified but never rewritten: its topmost RELEASED
// heading (skipping "## [Unreleased]") must equal the canonical version. This is what keeps the
// changelog from drifting behind a version bump — you cannot bump without adding the section.
const changelogText = readFileSync(changelogFile, 'utf8');
const topReleased = [...changelogText.matchAll(/^## \[([^\]]+)\]/gm)]
	.map((m) => m[1])
	.find((v) => v.toLowerCase() !== 'unreleased');
if (topReleased !== canonical) {
	console.error(
		`sync-version: CHANGELOG.md top released heading is "${topReleased ?? 'none'}", expected "${canonical}" — ` +
			`add a "## [${canonical}] - <date>" section (curated, not auto-written)`,
	);
	if (check) {
		drift++;
	} else {
		process.exit(1);
	}
}

if (check) {
	if (drift > 0) {
		console.error(
			`sync-version: ${drift} file(s) out of sync with plugin.json (${canonical}). Run: node scripts/sync-version.mjs`,
		);
		process.exit(1);
	}
	console.log(`sync-version: all versions + VERSION + CHANGELOG match plugin.json (${canonical})`);
} else {
	console.log(
		wrote
			? `sync-version: synced ${wrote} file(s) to ${canonical}`
			: `sync-version: already in sync (${canonical})`,
	);
}

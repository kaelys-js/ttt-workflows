#!/usr/bin/env node
// Release gate + notes extractor, run by release.yml on a v* tag.
//
//   node scripts/release-notes.mjs v1.2.1
//
// It enforces the lockstep invariant — the tag version must equal VERSION, plugin.json, and the
// topmost released heading in CHANGELOG.md — and, on success, prints that CHANGELOG section to
// stdout to be published as the GitHub Release body. Any mismatch (or a missing/empty section)
// exits non-zero, failing the release before anything is published. Node builtins only, so it
// runs on a bare runner with no install step.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fail = (msg) => {
	console.error(`release-notes: ${msg}`);
	process.exit(1);
};

const tag = process.argv[2];
if (!tag) {
	fail('usage: release-notes.mjs <tag>  (e.g. v1.2.1)');
}
const version = tag.replace(/^v/, '');

// VERSION must match the tag.
const versionFile = readFileSync(join(root, 'VERSION'), 'utf8').trim();
if (versionFile !== version) {
	fail(`tag ${tag} (${version}) != VERSION (${versionFile})`);
}

// plugin.json must match the tag (the canonical version source the rest sync from).
const pluginVersion = readFileSync(
	join(root, 'plugins/ttt-workflows/.claude-plugin/plugin.json'),
	'utf8',
).match(/"version":\s*"([^"]+)"/)?.[1];
if (pluginVersion !== version) {
	fail(`tag ${tag} (${version}) != plugin.json version (${pluginVersion ?? 'none'})`);
}

// The CHANGELOG must carry a released section for exactly this version; extract its body.
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const escaped = version.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const section = changelog.match(
	new RegExp(`^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## |^\\[)`, 'm'),
)?.[1];
if (section === undefined) {
	fail(`no "## [${version}]" section in CHANGELOG.md`);
}
const notes = section.trim();
if (!notes) {
	fail(`the "## [${version}]" section in CHANGELOG.md is empty`);
}

process.stdout.write(`${notes}\n`);

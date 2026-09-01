#!/usr/bin/env node
// Single source of truth for the release version, to stop the plugin / marketplace / skill
// versions drifting apart. The canonical value is plugin.json "version"; this propagates it to
// the marketplace manifest and every SKILL.md.
//
//   node scripts/sync-version.mjs           write the canonical version into every target
//   node scripts/sync-version.mjs --check   verify only; exit non-zero on any drift (the gate)
//
// To release: bump plugin.json "version", commit (the pre-commit hook runs this to sync the
// rest), then cut the matching v<version> tag. The --check stage in pre-push + CI blocks drift.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginJson = join(root, 'plugins/ttt-workflows/.claude-plugin/plugin.json');
const marketplaceJson = join(root, '.claude-plugin/marketplace.json');
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

if (check) {
	if (drift > 0) {
		console.error(
			`sync-version: ${drift} file(s) out of sync with plugin.json (${canonical}). Run: node scripts/sync-version.mjs`,
		);
		process.exit(1);
	}
	console.log(`sync-version: all versions match plugin.json (${canonical})`);
} else {
	console.log(
		wrote
			? `sync-version: synced ${wrote} file(s) to ${canonical}`
			: `sync-version: already in sync (${canonical})`,
	);
}

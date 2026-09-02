#!/usr/bin/env node
// Runs each skill's selftest (the deterministic-layer regression battery) as one suite. Run
// under c8 by `npm run qa:scripts-test` for a coverage-gated pass over the skills' pure scripts;
// the live-I/O entry points (fetch-pr, fetch-ticket, probe-*) are excluded there — they talk to
// GitHub/Azure/ClickUp and are exercised by real runs, not unit coverage (see .c8rc.json).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skills = ['pr-review', 'sec-audit', 'trp', 'copy-audit'];

let failed = 0;
for (const s of skills) {
	const selftest = join(root, 'plugins/ttt-workflows/skills', s, 'scripts/selftest.mjs');
	console.log(`\n=== ${s} selftest ===`);
	const r = spawnSync('node', [selftest], { stdio: 'inherit' });
	if ((r.status ?? 1) !== 0) {
		failed++;
	}
}
if (failed > 0) {
	console.error(`\n${failed} skill selftest(s) failed.`);
	process.exit(1);
}
console.log('\nall skill selftests passed.');

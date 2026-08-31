#!/usr/bin/env node
// validate-skills.mjs — run every skill's selftest (deterministic battery + spec conformance
// + trigger eval). Exits non-zero if any skill fails. Used by npm + lefthook.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skills = ['pr-review', 'sec-audit', 'trp'];
let failed = 0;
for (const s of skills) {
	const r = spawnSync(
		'node',
		[join(root, 'plugins/ttt-workflows/skills', s, 'scripts/selftest.mjs')],
		{
			encoding: 'utf8',
		},
	);
	const ok = r.status === 0 && /ALL GREEN/.test(r.stdout || '');
	console.log(`${ok ? 'OK  ' : 'FAIL'} ${s}`);
	if (!ok) {
		failed++;
		process.stderr.write(r.stdout || '');
		process.stderr.write(r.stderr || '');
	}
}
if (failed) {
	console.error(`\n${failed} skill(s) failed validation`);
	process.exit(1);
}
console.log('\nall skills valid');

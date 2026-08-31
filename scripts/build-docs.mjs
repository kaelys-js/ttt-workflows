#!/usr/bin/env node
// Build (or verify) the operator-playbook PDFs from their typst sources.
//
//   node scripts/build-docs.mjs          # compile every docs/<skill>.typ -> .pdf
//   node scripts/build-docs.mjs --check  # rebuild to a temp file and fail if the
//                                          committed .pdf is stale (drifted from source)
//
// Must run with `typst` on PATH — invoke via `./bin/mise exec -- node ...` (see
// package.json). Output is made deterministic (fixed SOURCE_DATE_EPOCH,
// bundled fonts only) so --check is a reliable byte comparison.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'docs');
const check = process.argv.includes('--check');

// Fixed epoch so the embedded PDF creation date never varies build to build.
const env = { ...process.env, SOURCE_DATE_EPOCH: '1704067200' }; // 2024-01-01Z

const sources = readdirSync(docsDir)
	.filter((f) => f.endsWith('.typ') && f !== 'template.typ')
	.toSorted();

if (sources.length === 0) {
	console.error('build-docs: no docs/*.typ sources found');
	process.exit(1);
}

function compile(src, out) {
	execFileSync(
		'typst',
		['compile', '--format', 'pdf', '--ignore-system-fonts', '--root', root, src, out],
		{ env, stdio: ['ignore', 'ignore', 'inherit'] },
	);
}

function sha(file) {
	return createHash('sha256').update(readFileSync(file)).digest('hex');
}

let stale = 0;
for (const file of sources) {
	const src = join(docsDir, file);
	const pdf = join(docsDir, basename(file, '.typ') + '.pdf');
	if (check) {
		const tmp = pdf + '.tmp';
		compile(src, tmp);
		const fresh = sha(tmp);
		const current = existsSync(pdf) ? sha(pdf) : null;
		rmSync(tmp, { force: true });
		if (fresh === current) {
			console.log(`OK     ${basename(pdf)}`);
		} else {
			console.error(`STALE  ${file} -> ${basename(pdf)} (run: npm run docs)`);
			stale++;
		}
	} else {
		compile(src, pdf);
		console.log(`built  ${basename(pdf)}`);
	}
}

if (check && stale > 0) {
	console.error(`\n${stale} PDF(s) out of sync with source.`);
	process.exit(1);
}

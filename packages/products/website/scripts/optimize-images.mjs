#!/usr/bin/env node
// One-shot image optimizer for the site's static assets (public/). Recompresses every PNG with
// sharp at max effort, choosing palette quantization or lossless per file (whichever is smaller),
// and minifies favicon.svg. The icons and og card are flat/gradient brand art, so palette is
// visually lossless at these sizes. Re-run after changing any asset:
//   node scripts/optimize-images.mjs
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'public');

async function optimizePng(path) {
	const before = (await stat(path)).size;
	const src = await readFile(path);
	// Palette (256-colour) usually wins big on flat/gradient art; lossless wins on tiny images.
	const [palette, lossless] = await Promise.all([
		sharp(src).png({ compressionLevel: 9, effort: 10, palette: true }).toBuffer(),
		sharp(src).png({ compressionLevel: 9, effort: 10, palette: false }).toBuffer(),
	]);
	const best = palette.length <= lossless.length ? palette : lossless;
	if (best.length < before) {
		await writeFile(path, best);
		return { path, before, after: best.length };
	}
	return { path, before, after: before };
}

// Minify an SVG conservatively: drop the XML/whitespace between tags and collapse runs of spaces.
// Enough for our tiny hand-authored favicon without a full SVG toolchain.
async function optimizeSvg(path) {
	const before = (await stat(path)).size;
	const min = (await readFile(path, 'utf8'))
		.replace(/>\s+</g, '><')
		.replace(/\s{2,}/g, ' ')
		.trim();
	await writeFile(path, min);
	return { path, before, after: Buffer.byteLength(min) };
}

const files = await readdir(publicDir);
let before = 0;
let after = 0;
for (const f of files.sort()) {
	const path = join(publicDir, f);
	let r;
	if (f.endsWith('.png')) r = await optimizePng(path);
	else if (f.endsWith('.svg')) r = await optimizeSvg(path);
	else continue;
	before += r.before;
	after += r.after;
	const pct = r.before ? Math.round((1 - r.after / r.before) * 100) : 0;
	console.log(
		`${f.padEnd(24)} ${String(r.before).padStart(7)} -> ${String(r.after).padStart(7)}  (${pct}% off)`,
	);
}
console.log(
	`TOTAL ${String(before).padStart(29)} -> ${String(after).padStart(7)}  (${Math.round((1 - after / before) * 100)}% off, saved ${before - after} bytes)`,
);

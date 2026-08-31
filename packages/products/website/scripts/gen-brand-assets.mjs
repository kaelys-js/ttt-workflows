#!/usr/bin/env node
// Regenerate the raster brand assets in public/ from SVG, so they stay in sync
// with favicon.svg and are reproducible. Run manually after a brand change:
//   node scripts/gen-brand-assets.mjs
// Uses sharp (already a dependency). Not part of the build — the PNGs are committed.

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const favicon = readFileSync(join(pub, 'favicon.svg'));

// Accent gradient shared with favicon.svg / the site theme.
const grad = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f6903a"/><stop offset="1" stop-color="#e2541f"/></linearGradient>`;

// Maskable icon: full-bleed background with the mark inside the safe zone (~60%).
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${grad}</defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
    <path d="M180 196l60 60-60 60"/><path d="M268 316h72"/>
  </g>
</svg>`;

// Open Graph card (1200x630).
const font = 'font-family="Helvetica Neue, Helvetica, Arial, sans-serif"';
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>${grad}
    <radialGradient id="glow" cx="0.16" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#e2541f" stop-opacity="0.18"/><stop offset="0.6" stop-color="#e2541f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0b0d"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="80" y="78" width="84" height="84" rx="18" fill="url(#g)"/>
  <g fill="none" stroke="#fff" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M108 108l14 12-14 12"/><path d="M126 132h14"/>
  </g>
  <text x="182" y="136" ${font} font-size="40" font-weight="700" fill="#f4f4f5">ttt-workflows</text>
  <text x="80" y="296" ${font} font-size="64" font-weight="800" fill="#fafafa">Three engineering workflows,</text>
  <text x="80" y="376" ${font} font-size="64" font-weight="800" fill="#fafafa">one <tspan fill="#f6903a">plugin.</tspan></text>
  <text x="80" y="460" ${font} font-size="32" font-weight="600" fill="#a1a1aa">pr-review · sec-audit · trp</text>
  <rect x="80" y="506" width="1040" height="1.5" fill="#27272a"/>
  <text x="80" y="552" ${font} font-size="27" fill="#8b8b93">A Claude Code plugin — read-only and approval-gated by default.</text>
</svg>`;

const jobs = [
	[favicon, 32, 'favicon-32.png'],
	[favicon, 180, 'apple-touch-icon.png'],
	[favicon, 192, 'icon-192.png'],
	[favicon, 512, 'icon-512.png'],
	[Buffer.from(maskable), 512, 'icon-maskable.png'],
];

for (const [svg, size, out] of jobs) {
	await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(pub, out));
	console.log(`icon  ${out} (${size}px)`);
}
await sharp(Buffer.from(og)).png().toFile(join(pub, 'og.png'));
console.log('og    og.png (1200x630)');

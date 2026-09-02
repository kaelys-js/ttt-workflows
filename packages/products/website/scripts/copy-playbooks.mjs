#!/usr/bin/env node
// Copy the operator-playbook PDFs from the repo's docs/ (their single source of
// truth, kept in sync by `npm run docs:check`) into the site's public/playbooks/
// so the built site can serve them. Runs automatically before `astro build` via
// the package.json `prebuild` hook. The destination is gitignored — it is a
// build input, not committed twice.

import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const srcDir = join(repoRoot, 'docs');
const outDir = join(here, '..', 'public', 'playbooks');

const pdfs = ['pr-review.pdf', 'sec-audit.pdf', 'trp.pdf', 'copy-audit.pdf'];

// The containerized E2E/visual build mounts only the website dir, so the repo's docs/ is
// absent there. The playbooks are download links, not needed to render or test the pages, so
// skip cleanly in that context. The real Pages build has the full repo (docs/ present) and the
// docs-drift gate guarantees the PDFs exist, so a genuine miss can't reach production silently.
if (!existsSync(srcDir)) {
	console.log(`copy-playbooks: ${srcDir} not present (containerized build?) — skipping.`);
	process.exit(0);
}

mkdirSync(outDir, { recursive: true });
for (const f of pdfs) {
	const src = join(srcDir, f);
	if (!existsSync(src)) {
		console.error(`copy-playbooks: missing ${src} (run \`npm run docs\` at the repo root first)`);
		process.exit(1);
	}
	copyFileSync(src, join(outDir, f));
	console.log(`playbook ${f}`);
}

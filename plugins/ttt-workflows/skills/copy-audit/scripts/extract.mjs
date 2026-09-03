#!/usr/bin/env node
// copy-audit: extract / review / apply / verify product COPY (prose + microcopy) in a
// repo or diff range. Mirrors comment-audit's pipeline (deterministic extract → sqlite →
// parallel-subagent judgment → approval-gated SHA-guarded apply → verify), but the unit
// is a copy span (markdown prose, UI microcopy, JSON/YAML copy values, string phrases),
// not a code comment, and splicing is exact-substring by char offset so a rewrite only
// ever changes the human-readable payload — never the surrounding structure.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { extractUnits, extractComments, extractPdf, isCopyAuditTarget } from './ast-extract.mjs';
import { treeSitterSupports } from './ts-extract.mjs';

const args = parseArgs(process.argv.slice(2));
const phase = args.phase;
if (!phase) {
	fatal('missing --phase');
}
// Audit mode: 'copy' (product copy, default), 'comments' (comment slop + test-runner
// names — the subsumed comment-audit behaviour), or 'all'.
const AUDIT_MODE = ['copy', 'comments', 'all'].includes(args.mode) ? args.mode : 'copy';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(path.join(HERE, 'schema.sql'), 'utf8');

// ---------------------------------------------------------------------------
// File routing
// ---------------------------------------------------------------------------
const MD_EXT = new Set(['.md', '.mdx', '.markdown', '.mdc']);
const TEMPLATE_EXT = new Set([
	'.html',
	'.htm',
	'.vue',
	'.svelte',
	'.astro',
	'.xml',
	'.svg',
	'.hbs',
	'.handlebars',
	'.mustache',
	'.plist',
	'.xsl',
	'.xslt',
	'.erb',
	'.ejs',
	'.jinja',
	'.jinja2',
	'.j2',
	'.liquid',
	'.twig',
	'.heex',
]);
const JSX_EXT = new Set(['.jsx', '.tsx']);
const JS_EXT = new Set(['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts']);
const JSON_EXT = new Set(['.json', '.jsonc', '.json5', '.webmanifest']);
const YAML_EXT = new Set(['.yml', '.yaml']);
const TEXT_EXT = new Set(['.txt', '.text', '.typ', '.tpl', '.tsv', '.csv', '.pug', '.jade']);
// PDF is read-only (extracted for review, never spliced back). Kept in its own set so it
// is picked up by a repo sweep but routed through the binary reader.
const DOC_EXT = new Set(['.pdf']);
const INCLUDE_EXT = new Set([
	...MD_EXT,
	...TEMPLATE_EXT,
	...JSX_EXT,
	...JS_EXT,
	...JSON_EXT,
	...YAML_EXT,
	...TEXT_EXT,
	...DOC_EXT,
]);

const SKIP_BASENAME = new Set([
	'AGENTS.md',
	'CLAUDE.md',
	'MEMORY.md',
	'SKILL.md',
	'LICENSE',
	'LICENCE',
	'COPYING',
	'NOTICE',
	'package.json',
	'package-lock.json',
	'yarn.lock',
	'pnpm-lock.yaml',
	'composer.lock',
	'Cargo.lock',
	'tsconfig.json',
	'jsconfig.json',
	'.eslintrc.json',
	'.prettierrc.json',
]);
// Generated / non-authored trees — never product copy.
const SKIP_PATH_SUBSTRINGS_DEFAULT = [
	'/node_modules/',
	'/dist/',
	'/build/',
	'/coverage/',
	'/.next/',
	'/.astro/',
	'/.svelte-kit/',
	'/.turbo/',
	'/.cache/',
	'/vendor/',
	'/__snapshots__/',
	'/snapshots/',
	'/.git/',
	'/.storybook/',
];
// Test-directory substrings — skipped in copy mode, KEPT in comment mode (test-runner
// names live in these files).
const TEST_PATH_SUBSTRINGS = ['/test/', '/tests/', '/__tests__/', '/e2e/', '/spec/'];
// Test / spec / config / build files — code, not user-facing copy (copy mode only).
const SKIP_FILE_RE = /\.(test|spec|bench|stories|e2e|config|d)\.[cm]?[jt]sx?$/;
const SKIP_PATH_SUBSTRINGS = [...SKIP_PATH_SUBSTRINGS_DEFAULT];
function shouldSkip(f) {
	const base = path.basename(f);
	// Config / ignore / plain-text / env targets are supported regardless of copy — never
	// skip them (this also overrides the rc-config and SKIP_BASENAME rules below for them).
	if (isCopyAuditTarget(f)) {
		return false;
	}
	if (SKIP_BASENAME.has(base)) {
		return true;
	}
	if (base.startsWith('CHANGELOG')) {
		return true; // generated release notes, not authored copy
	}
	if (base === 'SKILL.md') {
		return true;
	}
	if (base.endsWith('.min.js') || base.endsWith('.min.css') || base.endsWith('.d.ts')) {
		return true;
	}
	if (SKIP_FILE_RE.test(base) && AUDIT_MODE === 'copy') {
		return true; // *.test.ts, *.spec.ts, … (kept in comment mode: test-runner names live there)
	}
	if (/^\.[\w.-]*rc(\.[\w]+)?$/.test(base)) {
		return true; // tool configs: .oxlintrc.json, .eslintrc, .prettierrc.json, .babelrc, …
	}
	if (/\.config\.(json|jsonc|js|cjs|mjs|ts)$/.test(base)) {
		return true; // *.config.json / *.config.js …
	}
	if (base === 'robots.txt' || base === 'sitemap.xml' || base.endsWith('.map')) {
		return true; // machine files, not copy
	}
	for (const s of SKIP_PATH_SUBSTRINGS) {
		if (f.includes(s)) {
			return true;
		}
	}
	if (AUDIT_MODE === 'copy') {
		for (const s of TEST_PATH_SUBSTRINGS) {
			if (f.includes(s)) {
				return true;
			}
		}
	}
	return false;
}

// ---------------------------------------------------------------------------
// Small shared helpers (mirrors comment-audit)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const m = a.match(/^--([^=]+)=(.*)$/);
		if (m) {
			out[m[1]] = m[2];
			continue;
		}
		if (a.startsWith('--')) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				out[key] = next;
				i++;
			} else {
				out[key] = true;
			}
		}
	}
	return out;
}
function git(repo, ...gargs) {
	const r = spawnSync('git', ['-C', repo, ...gargs], {
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
	});
	if (r.status !== 0) {
		fatal(`git ${gargs.join(' ')} failed: ${r.stderr}`);
	}
	return r.stdout;
}
// Like git() but returns raw bytes (no utf8 decode) — for binary blobs such as PDFs.
function gitShowBuffer(repo, spec) {
	const r = spawnSync('git', ['-C', repo, 'show', spec], { maxBuffer: 256 * 1024 * 1024 });
	if (r.status !== 0) {
		throw new Error(`git show ${spec} failed`);
	}
	return r.stdout;
}
// Is this path inside a git worktree? verify uses git when it can, and an exact
// reconstruction of the pre-image when it can't (direct --input / --stdin targets).
function isGitWorktree(dir) {
	const r = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], {
		encoding: 'utf8',
	});
	return r.status === 0 && r.stdout.trim() === 'true';
}
function fatal(msg) {
	process.stderr.write(`FATAL: ${msg}\n`);
	process.exit(phase === 'apply' || phase === 'verify' ? 2 : 1);
}
function sha256(s) {
	return createHash('sha256').update(s, 'utf8').digest('hex');
}
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
function diffRange(base, head) {
	// The empty tree is not a commit, so the symmetric `A...B` form fails against it;
	// the two-dot `A..B` form accepts a tree and surfaces every tracked line as added.
	return base === EMPTY_TREE ? `${base}..${head}` : `${base}...${head}`;
}
// Build an array of line-start offsets so a char offset can map back to a 1-based line.
function lineIndex(text) {
	const starts = [0];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			starts.push(i + 1);
		}
	}
	return starts;
}
function lineOf(starts, offset) {
	// binary search: greatest index whose start <= offset
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= offset) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}
	return lo + 1;
}

// ---------------------------------------------------------------------------
// PHASE: extract
// ---------------------------------------------------------------------------
// Turn a file's text (or, for PDF, its bytes) into copy units for the current mode.
// PDFs are read-only: extractPdf pulls their text with Node's zlib and tags units
// 'pdf-text', and the "full text" stored for the reviewer is that extracted text.
async function ingestFile({ routeName, isPdf, readUtf8, readBuffer }) {
	if (isPdf) {
		const { text, units } = extractPdf(readBuffer());
		return { fullText: text, units };
	}
	const content = readUtf8();
	let units;
	if (AUDIT_MODE === 'comments') {
		units = await extractComments(content, routeName);
	} else if (AUDIT_MODE === 'all') {
		units = [
			...(await extractUnits(content, routeName)),
			...(await extractComments(content, routeName)),
		];
	} else {
		units = await extractUnits(content, routeName);
	}
	return { fullText: content, units };
}

if (phase === 'extract') {
	const { db: dbPath } = args;
	if (!dbPath) {
		fatal('extract needs --db');
	}
	// Direct mode: audit one pasted string / standalone file instead of a git range.
	// Either --input <path> or --stdin (piped text); --as <.ext> hints the format.
	const directMode = typeof args.input === 'string' || args.stdin === true;

	const db = new Database(dbPath);
	db.exec(SCHEMA);

	const ins = db.prepare(
		`INSERT INTO units (repo,file,line_start,line_end,char_start,char_end,syntax,block_text,file_full_text_b64,file_sha) VALUES (?,?,?,?,?,?,?,?,?,?)`,
	);
	// One reusable transaction (better-sqlite3 pattern) rather than one closure per file.
	const insertUnits = db.transaction((repo, file, units, starts, b64, fsha) => {
		for (const u of units) {
			ins.run(
				repo,
				file,
				lineOf(starts, u.char_start),
				lineOf(starts, Math.max(u.char_start, u.char_end - 1)),
				u.char_start,
				u.char_end,
				u.syntax,
				u.block_text,
				b64,
				fsha,
			);
		}
	});

	if (directMode) {
		const normExt = (e) => (e ? (e.startsWith('.') ? e : `.${e}`) : '');
		const asExt = normExt(typeof args.as === 'string' ? args.as.toLowerCase() : '');
		let inputPath = typeof args.input === 'string' ? args.input : null;
		if (args.stdin === true) {
			// Read the pasted text off stdin and land it in a real file so apply/verify have
			// something on disk to splice and check. Use --input as the destination if given,
			// else a temp file named by the format hint.
			const piped = readFileSync(0);
			inputPath =
				inputPath ??
				path.join(os.tmpdir(), `copy-audit-paste-${process.pid}-${Date.now()}${asExt || '.txt'}`);
			writeFileSync(inputPath, piped);
		}
		if (!inputPath || !existsSync(inputPath)) {
			fatal('direct extract needs --input <path> (or --stdin), pointing at a readable file');
		}
		const abs = path.resolve(inputPath);
		const repo = path.dirname(abs);
		const file = path.basename(abs);
		const routeName = asExt ? `paste${asExt}` : file;
		const isPdf = path.extname(routeName).toLowerCase() === '.pdf';
		db.prepare('DELETE FROM units WHERE repo = ? AND file = ?').run(repo, file);
		const { fullText, units } = await ingestFile({
			routeName,
			isPdf,
			readUtf8: () => readFileSync(abs, 'utf8'),
			readBuffer: () => readFileSync(abs),
		});
		const starts = lineIndex(fullText);
		insertUnits(
			repo,
			file,
			units,
			starts,
			Buffer.from(fullText, 'utf8').toString('base64'),
			sha256(fullText),
		);
		db.close();
		console.log(
			JSON.stringify(
				{
					phase: 'extract',
					mode: 'direct',
					repo,
					file,
					input: abs,
					pdf: isPdf,
					total_units: units.length,
				},
				null,
				2,
			),
		);
		process.exit(0);
	}

	// Git mode: audit a diff range (or --full working tree) of a repo.
	const { repo, head } = args;
	const base = args.full ? EMPTY_TREE : args.base;
	if (!repo || !base || !head) {
		fatal(
			'extract needs --repo --base --head --db (or --repo --full --head --db, or --input/--stdin)',
		);
	}
	db.prepare('DELETE FROM units WHERE repo = ?').run(repo);

	if (typeof args['skip-path'] === 'string') {
		for (const s of args['skip-path']
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean)) {
			SKIP_PATH_SUBSTRINGS.push(s);
		}
	}
	const changed = git(repo, 'diff', '--name-only', '--diff-filter=ACMR', diffRange(base, head))
		.split('\n')
		.filter(Boolean);
	const filesListPath = typeof args['files-list'] === 'string' ? args['files-list'] : null;
	const filesListSet = filesListPath
		? new Set(
				readFileSync(filesListPath, 'utf8')
					.split('\n')
					.map((s) => s.trim())
					.filter(Boolean),
			)
		: null;
	const inFilesList = (f) => filesListSet === null || filesListSet.has(f);
	const candidates = changed.filter((f) => {
		const e = path.extname(f).toLowerCase();
		return (
			(INCLUDE_EXT.has(e) || treeSitterSupports(f) || isCopyAuditTarget(f)) &&
			!shouldSkip(f) &&
			inFilesList(f)
		);
	});

	// apply and verify are hard-coupled to the working tree (they readFileSync the on-disk file
	// and check its sha against file_sha). So when --head is the working tree's own HEAD, extract
	// must read the WORKING TREE too — otherwise a file with uncommitted edits is audited from its
	// committed content, re-surfacing already-applied copy and guaranteeing an apply SHA mismatch.
	// A historical --head (a past commit) still reads via `git show` (review-only, apply not meant).
	let headIsWorktree = false;
	try {
		headIsWorktree = git(repo, 'rev-parse', head).trim() === git(repo, 'rev-parse', 'HEAD').trim();
	} catch {
		headIsWorktree = false;
	}

	let n = 0;
	const perFile = {};
	for (const f of candidates) {
		const isPdf = path.extname(f).toLowerCase() === '.pdf';
		const abs = path.join(repo, f);
		const onDisk = headIsWorktree && existsSync(abs);
		let result;
		try {
			result = await ingestFile({
				routeName: f,
				isPdf,
				readUtf8: () => (onDisk ? readFileSync(abs, 'utf8') : git(repo, 'show', `${head}:${f}`)),
				readBuffer: () => (onDisk ? readFileSync(abs) : gitShowBuffer(repo, `${head}:${f}`)),
			});
		} catch {
			continue;
		}
		const { fullText, units } = result;
		if (units.length === 0) {
			continue;
		}
		const starts = lineIndex(fullText);
		insertUnits(
			repo,
			f,
			units,
			starts,
			Buffer.from(fullText, 'utf8').toString('base64'),
			sha256(fullText),
		);
		n += units.length;
		perFile[f] = units.length;
	}
	db.close();
	console.log(JSON.stringify({ phase: 'extract', total_units: n, files: perFile }, null, 2));
	process.exit(0);
}

// ---------------------------------------------------------------------------
// PHASE: bundle-emit
// ---------------------------------------------------------------------------
function reviewerSystemPrompt() {
	return `You are a senior product content designer auditing COPY (user-facing writing and UI microcopy) against best-practice content standards current as of August 2026. You judge one copy unit at a time, WITH the full file shown for context. The checklist below is the operative rubric — it is distilled from reference/standards.md (Federal Plain Language Guidelines; ISO 24495-1:2023; Nielsen Norman Group; WCAG 2.2; Apple HIG; Material Design 3; GOV.UK; Shopify Polaris; Microsoft, Google, Mailchimp, Chicago & AP style guides). Apply every relevant check; do not wait to be told which one applies.

BE STRICT AND ADVERSARIAL, NOT CHARITABLE. The owner has found that lenient review keeps missing real problems, so returning "keep" for a unit that carries ANY defensible pillar violation is a FAILURE — the single failure this audit exists to prevent. If a unit violates a pillar (a comma splice, a run-on over ~30 words, an empty intensifier like "real"/"actual"/"just", a buzzword, a vague CTA, terminology or ordering drift, an undefined acronym, repetition of a claim made elsewhere), you MUST return "flag" — or "rewrite" when a safe drop-in fix exists — and MUST NOT return "keep". "keep" is reserved for copy that is genuinely clean with nothing defensible to raise. Flagging is advisory and is never auto-applied, so it costs nothing: when you can articulate a defensible issue, flag it. Aim to surface every issue a strict senior content designer would raise on a close read, not just the egregious ones.

PILLAR 1 — PLAIN LANGUAGE & READABILITY
  □ Sentences short (aim < ~25 words) and one idea each; split run-ons.
  □ Common words over jargon/buzzwords — flag/replace "leverage", "utilize", "synergize", "facilitate", "best-in-class", "seamless", "robust", "aforementioned".
  □ Cut filler: "in order to"→"to", "in the event that"→"if", "at this point in time"→"now", "prior to"→"before", nominalizations ("the initialization of X"→"initialize X").
  □ Active voice; present tense; second person ("you") for instructions; front-load the point (BLUF).
  □ Define acronyms on first use.

PILLAR 2 — INCLUSIVE & BIAS-FREE
  □ No gendered defaults (use "they"; role nouns not "guys"/"manpower").
  □ No ableist idioms: "sanity check", "crazy", "insane", "dummy", "lame", "cripple", "blind to", "tone-deaf".
  □ Retire loaded tech terms: master/slave → primary/replica or primary/worker; blacklist/whitelist → blocklist/allowlist or denylist/allowlist.
  □ No assumptions about the reader's ability, age, geography, family, or tech-literacy ("simply", "just", "obviously", "everyone knows").

PILLAR 3 — UX MICROCOPY
  □ Buttons/CTAs are action verbs naming the OUTCOME: "Save changes", "Create account" — NOT "Submit", "OK", "Yes", "Click here", "Continue" alone.
  □ Sentence case for UI text unless the target system mandates title case.
  □ Error messages: say what happened + how to recover; no blame, no raw codes/stack ("Error 500") shown alone.
  □ Empty states guide the next action rather than just "No data".
  □ Link text is descriptive (WCAG 2.4.4) — never "click here" / "read more" / "learn more" alone.
  □ Labels concise, consistent, and not replaced by placeholder text.
  □ No dark patterns / confirmshaming ("No thanks, I don't want to save money").

PILLAR 4 — VOICE, GRAMMAR & MECHANICS
  □ Correct grammar/spelling/punctuation; fix comma splices, "its/it's", "your/you're", missing apostrophes, doubled words.
  □ Consistent terminology & product-name casing; consistent number & date formatting (prefer ISO 8601 where a raw date).
  □ Alt text describes the image's function/content, never starts with "image of"/"picture of" (WCAG 1.1.1). Decorative → empty.
  □ Headings: one H1, no skipped levels, descriptive not vague.
  □ Meta title ≈ 50-60 chars; meta description ≈ 150-160 chars.
  □ Consistent, on-brand voice; cut redundancy ("fast" + "quickly").

MANDATORY FLAGS — never return "keep" for these, even when the wording is otherwise good (flagging is not rewriting, so the keep-bias below does not excuse them):
  □ A page <title> / metaTitle over ~60 characters, or a meta description outside ~150-160 characters (count them).
  □ Any SINGLE sentence longer than ~30 words, or stacked clauses that force the reader to backtrack — flag for readability.
  □ Alt text that repeats the page/site title instead of describing the image.
  □ Link or button text that is not self-describing out of context ("here", "read more", "learn more").

FRAGMENTS: some units are a sentence fragment split by inline markup — they begin mid-sentence (e.g. with ":" , "," or a lowercase word) or end abruptly. Use the FULL FILE shown to reassemble the whole sentence, judge the COMPLETE sentence against the rubric, and attach the verdict to the fragment carrying the issue. Never excuse a problem just because the unit is a fragment.

For EACH unit id you receive, return one verdict object:
  - verdict "keep": the copy is already compliant. rewrite=null, category=null, severity=null, note=null.
  - verdict "rewrite": a concrete better wording exists AND is safe to apply mechanically. Put the improved copy in "rewrite" (plain text only — NO surrounding markup, quotes, markdown markers, HTML tags, or braces; preserve any inline URLs/links verbatim; keep it the same unit type, e.g. a heading stays a heading). Set category to the primary pillar (one of: plain-language, inclusive, microcopy, voice-grammar), severity (blocker|high|medium|low), and a one-line note explaining the change.
  - verdict "flag": a real issue exists but the fix needs human/brand judgment (voice, terminology decision, factual claim, or ambiguity). rewrite=null. Set category, severity, and a note describing the issue and suggested direction.
  - verdict "delete" (COMMENT units only): the comment is pure slop and should be removed entirely. rewrite=null. category="comment", severity, note.

SYNTAX-SPECIFIC RULES (the unit's syntax is shown next to each id):
  - syntax "comment" (a CODE comment, markers included in the text): judge by comment-quality rules, NOT the copy pillars. A comment is a defect budget. DELETE (verdict "delete") comments that: restate the code/next line ("increment i"), narrate task/PR/scar history ("R82: fixed the thing"), list callers/cross-refs, are dead commented-out code, or state behaviour the code no longer has. REWRITE a comment that carries a real WHY but is bloated/task-scarred — to one crisp line stating the WHY (rewrite text = the prose only, NO comment markers; the tool re-adds // or # etc.). KEEP comments that state a genuine hidden constraint, a workaround for a named bug, a warning the code cannot express, or a doc/JSDoc/param block. category="comment", severity as usual.
  - syntax "testname" (the first-argument string of it()/test()/describe()/…): apply Rule 9 — a test name must encode INTENT (why the behaviour matters), not restate mechanics. KEEP names that state a business-visible outcome ("rejects a payload missing the tenant header"). REWRITE names that only restate shape ("calls fetch", "returns 200", "works") to the intent (rewrite = the new string only, no quotes/wrapper). NEVER "delete" a testname (it breaks the runner call). category="testname".

Rules:
  - The keep-bias applies ONLY to whether you REWRITE or DELETE — not to whether you flag. Auto-applied edits (rewrite, and comment delete) must be safe and unambiguous, so do not rewrite for taste and do not delete a comment that might carry a real WHY. But flagging is advisory and safe, so DO flag every defensible pillar violation. A false "keep" is the failure this audit exists to prevent: when in doubt, flag rather than keep.
  - NEVER change meaning, product names, numbers, URLs, or code-like tokens. If a copy unit is actually a code string / identifier / config value that slipped through, verdict "keep".
  - Preserve the reader's language (do not translate).
  - "rewrite" must be a drop-in replacement for the exact text shown — same role, no added punctuation the unit didn't warrant, no markers.
  - Output ONLY the structured verdicts. No prose.`;
}

if (phase === 'bundle-emit') {
	const { db: dbPath, 'out-dir': outDir } = args;
	if (!dbPath || !outDir) {
		fatal('bundle-emit needs --db --out-dir');
	}
	const db = new Database(dbPath);
	db.exec(SCHEMA);
	const pending = db
		.prepare(`SELECT * FROM units WHERE verdict = 'pending' ORDER BY file, char_start`)
		.all();
	// group by file
	const byFile = new Map();
	for (const r of pending) {
		if (!byFile.has(r.file)) {
			byFile.set(r.file, []);
		}
		byFile.get(r.file).push(r);
	}
	const BUDGET = 40_000;
	const system = reviewerSystemPrompt();
	const bundles = [];
	let cur = { files: [], ids: [], chars: 0 };
	const flush = () => {
		if (cur.files.length === 0) {
			return;
		}
		bundles.push(cur);
		cur = { files: [], ids: [], chars: 0 };
	};
	const renderFile = (file, rows) => {
		const full = Buffer.from(rows[0].file_full_text_b64, 'base64').toString('utf8');
		const numbered = full
			.split('\n')
			.map((l, idx) => `${String(idx + 1).padStart(4)}\t${l}`)
			.join('\n');
		let s = `=== FILE: ${file} ===\n\nFULL FILE (line-numbered):\n${numbered}\n\nCOPY UNITS TO JUDGE (id · syntax · lines · exact text):\n`;
		for (const r of rows) {
			s += `  #${r.id} · ${r.syntax} · L${r.line_start}-${r.line_end}\n      ${JSON.stringify(r.block_text)}\n`;
		}
		return s;
	};
	for (const [file, rows] of byFile) {
		const block = renderFile(file, rows);
		if (block.length > BUDGET && cur.files.length > 0) {
			flush();
		}
		if (cur.chars + block.length > BUDGET && cur.files.length > 0) {
			flush();
		}
		cur.files.push(block);
		cur.ids.push(...rows.map((r) => r.id));
		cur.chars += block.length;
		if (cur.chars >= BUDGET) {
			flush();
		}
	}
	flush();
	// write bundles
	const { writeFileSync: wf, mkdirSync } = await import('node:fs');
	mkdirSync(outDir, { recursive: true });
	const manifest = { total_pending: pending.length, bundle_count: bundles.length, bundles: [] };
	bundles.forEach((b, idx) => {
		const name = `bundle-${String(idx).padStart(4, '0')}.json`;
		const user = `${b.files.join('\n\n')}\n\nExpected ids: [${b.ids.join(', ')}]\nReturn exactly one verdict object per id above.`;
		wf(path.join(outDir, name), JSON.stringify({ system, user }, null, 2));
		manifest.bundles.push({ index: idx, file: name, chars: b.chars, ids: b.ids });
	});
	wf(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
	db.close();
	console.log(
		JSON.stringify(
			{
				phase: 'bundle-emit',
				out_dir: outDir,
				total_pending: pending.length,
				bundle_count: bundles.length,
			},
			null,
			2,
		),
	);
	process.exit(0);
}

// ---------------------------------------------------------------------------
// PHASE: apply-verdicts
// ---------------------------------------------------------------------------
if (phase === 'apply-verdicts') {
	const { db: dbPath, verdicts: vPath } = args;
	if (!dbPath || !vPath) {
		fatal('apply-verdicts needs --db --verdicts');
	}
	const db = new Database(dbPath);
	db.exec(SCHEMA);
	const verdicts = JSON.parse(readFileSync(vPath, 'utf8'));
	const upd = db.prepare(
		`UPDATE units SET verdict=?, rewrite=?, category=?, severity=?, note=? WHERE id=? AND verdict='pending'`,
	);
	let updated = 0;
	let skipped = 0;
	const tx = db.transaction(() => {
		for (const v of verdicts) {
			if (!['keep', 'rewrite', 'flag', 'delete'].includes(v.verdict)) {
				skipped++;
				continue;
			}
			const r = upd.run(
				v.verdict,
				v.verdict === 'rewrite' ? (v.rewrite ?? null) : null,
				v.category ?? null,
				v.severity ?? null,
				v.note ?? null,
				v.id,
			);
			if (r.changes > 0) {
				updated++;
			} else {
				skipped++;
			}
		}
	});
	tx();
	const stillPending = db.prepare(`SELECT COUNT(*) c FROM units WHERE verdict='pending'`).get().c;
	db.close();
	console.log(
		JSON.stringify(
			{ phase: 'apply-verdicts', updated, skipped, still_pending: stillPending },
			null,
			2,
		),
	);
	process.exit(0);
}

// ---------------------------------------------------------------------------
// PHASE: apply — splice rewrites into files by exact char span
// ---------------------------------------------------------------------------
function escapeForSyntax(syntax, rewrite, file, charStart) {
	const prev = file[charStart - 1];
	if (syntax === 'json-copy') {
		return JSON.stringify(rewrite).slice(1, -1);
	}
	if (syntax === 'js-string' || syntax === 'code-string') {
		const q = prev;
		let out = rewrite.replaceAll('\\', String.raw`\\`);
		if (q === '`') {
			out = out.replaceAll('`', '\\`').replaceAll('${', '\\${');
		} else if (q === '"' || q === "'") {
			out = out.replaceAll(new RegExp(q, 'g'), `\\${q}`);
		}
		return out;
	}
	if (syntax === 'attr-copy') {
		const q = prev;
		let out = rewrite.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
		out = q === '"' ? out.replaceAll('"', '&quot;') : out.replaceAll("'", '&#39;');
		return out;
	}
	if (syntax === 'jsx-text') {
		return rewrite.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	}
	if ((syntax === 'yaml-copy' || syntax === 'frontmatter') && (prev === '"' || prev === "'")) {
		const q = prev;
		return q === '"' ? rewrite.replaceAll('"', String.raw`\"`) : rewrite.replaceAll("'", "''");
	}
	if (syntax === 'testname') {
		// inner string arg — escape for its quote (like js-string)
		const q = prev;
		let out = rewrite.replaceAll('\\', String.raw`\\`);
		if (q === '`') {
			out = out.replaceAll('`', '\\`').replaceAll('${', '\\${');
		} else if (q === '"' || q === "'") {
			out = out.replaceAll(new RegExp(q, 'g'), `\\${q}`);
		}
		return out;
	}
	if (syntax === 'comment') {
		// the span is the whole comment (markers included); re-wrap the rewritten prose in
		// the ORIGINAL comment's marker style (detected from the source at char_start).
		const head = file.slice(charStart, charStart + 4);
		const body = rewrite
			.replaceAll(/^\/\/+\s?|^#\s?|^--\s?|^;\s?|^\/\*+\s?|\s?\*+\/$|^<!--\s?|\s?-->$/g, '')
			.replaceAll('\n', ' ')
			.trim();
		if (head.startsWith('<!--')) {
			return `<!-- ${body} -->`;
		}
		// Preserve a JSDoc opener (/**) — downgrading it to /* strips the doc-comment
		// semantics tooling/IntelliSense keys on. Must be checked before the plain /* case.
		if (head.startsWith('/**')) {
			return `/** ${body} */`;
		}
		if (head.startsWith('/*')) {
			return `/* ${body} */`;
		}
		if (head.startsWith('//')) {
			return `// ${body}`;
		}
		if (head.startsWith('--')) {
			return `-- ${body}`;
		}
		if (head[0] === '#') {
			return `# ${body}`;
		}
		if (head[0] === ';') {
			return `; ${body}`;
		}
		return body;
	}
	// md-*, text-line, plain yaml scalar — plain text
	return rewrite;
}

// A comment that is the ONLY thing between an opening { and its closing } is load-bearing:
// deleting it empties the block, which a human reads as "intentionally empty" and which
// eslint rejects (no-empty / no-empty-function). Detect it so apply keeps it, never deletes it.
function commentIsSoleBlockBody(content, s, e) {
	let i = s - 1;
	while (i >= 0 && /\s/.test(content[i])) {
		i--;
	}
	let j = e;
	while (j < content.length && /\s/.test(content[j])) {
		j++;
	}
	return content[i] === '{' && content[j] === '}';
}

// Apply rewrite/delete rows to a file's content by exact char span, bottom-up so earlier
// offsets stay valid. Pure — no DB, no I/O — so both apply (to write disk) and the git-free
// verify (to reconstruct the expected post-image) share one splice, and can never diverge.
// Callers validate the rows first (drift, testname-delete, null rewrite); this only splices.
function spliceUnits(content, frs) {
	let out = content;
	for (const r of frs.toSorted((a, b) => b.char_start - a.char_start)) {
		if (r.verdict === 'delete') {
			// Keep a comment whose removal would empty its enclosing block (checked against the
			// pristine content so apply and verify agree). Mirrors the apply-phase guard.
			if (r.syntax === 'comment' && commentIsSoleBlockBody(content, r.char_start, r.char_end)) {
				continue;
			}
			let s = r.char_start;
			let e = r.char_end;
			let ls = s;
			while (ls > 0 && out[ls - 1] !== '\n') {
				ls--;
			}
			let le = e;
			while (le < out.length && out[le] !== '\n') {
				le++;
			}
			// if the span is alone on its line(s), remove the whole line
			if (out.slice(ls, s).trim() === '' && out.slice(e, le).trim() === '') {
				s = ls;
				e = Math.min(le + 1, out.length);
			}
			out = out.slice(0, s) + out.slice(e);
		} else {
			const replacement = escapeForSyntax(r.syntax, r.rewrite, out, r.char_start);
			out = out.slice(0, r.char_start) + replacement + out.slice(r.char_end);
		}
	}
	return out;
}

if (phase === 'apply') {
	const { db: dbPath, repo } = args;
	if (!dbPath || !repo) {
		fatal('apply needs --db --repo');
	}
	const db = new Database(dbPath);
	db.exec(SCHEMA);
	// pdf-text units are review-only — a rewrite can't be spliced back into the binary — so
	// apply never touches them; their verdicts surface in the report instead.
	const skippedPdf = db
		.prepare(
			`SELECT COUNT(*) c FROM units WHERE verdict IN ('rewrite','delete') AND applied=0 AND repo=? AND syntax='pdf-text'`,
		)
		.get(repo).c;
	if (skippedPdf > 0) {
		process.stderr.write(
			`note: ${skippedPdf} pdf-text rewrite(s) are review-only and not applied\n`,
		);
	}
	const rows = db
		.prepare(
			`SELECT * FROM units WHERE verdict IN ('rewrite','delete') AND applied=0 AND repo=? AND syntax!='pdf-text' ORDER BY file, char_start DESC`,
		)
		.all(repo);
	const byFile = new Map();
	for (const r of rows) {
		if (!byFile.has(r.file)) {
			byFile.set(r.file, []);
		}
		byFile.get(r.file).push(r);
	}
	const upd = db.prepare(`UPDATE units SET applied=1 WHERE id=?`);
	const summary = { files: 0, rewritten: 0, deleted: 0 };
	for (const [file, frs] of byFile) {
		const diskPath = path.join(repo, file);
		if (!existsSync(diskPath)) {
			process.stderr.write(`skip missing: ${file}\n`);
			continue;
		}
		const content = readFileSync(diskPath, 'utf8');
		if (sha256(content) !== frs[0].file_sha) {
			fatal(`file ${file} changed since extract (sha mismatch); refusing to apply`);
		}
		// Validate every row against the untouched pre-image (drift, testname-delete, null
		// rewrite) and record it, then splice once via the shared helper.
		const toApply = [];
		for (const r of frs) {
			const cur = content.slice(r.char_start, r.char_end);
			if (cur !== r.block_text) {
				fatal(
					`unit ${file}#${r.id} span drifted (expected ${JSON.stringify(r.block_text)}, found ${JSON.stringify(cur)}); refusing to apply`,
				);
			}
			if (r.verdict === 'delete' && r.syntax === 'testname') {
				fatal(`unit ${file}#${r.id} delete on a testname would break the runner call; refusing`);
			}
			// A delete that would empty its enclosing block is refused — keep the comment instead.
			if (
				r.verdict === 'delete' &&
				r.syntax === 'comment' &&
				commentIsSoleBlockBody(content, r.char_start, r.char_end)
			) {
				summary.kept_empty_block = (summary.kept_empty_block || 0) + 1;
				continue;
			}
			if (r.verdict !== 'delete' && (r.rewrite === null || r.rewrite === undefined)) {
				fatal(`unit ${file}#${r.id} verdict=rewrite but rewrite text is null`);
			}
			upd.run(r.id);
			toApply.push(r);
			if (r.verdict === 'delete') {
				summary.deleted++;
			} else {
				summary.rewritten++;
			}
		}
		if (toApply.length === 0) {
			continue;
		}
		const newContent = spliceUnits(content, toApply);
		const tmp = diskPath + '.tmp';
		writeFileSync(tmp, newContent);
		renameSync(tmp, diskPath);
		summary.files++;
	}
	db.close();
	console.log(JSON.stringify({ phase: 'apply', ...summary }, null, 2));
	process.exit(0);
}

// ---------------------------------------------------------------------------
// PHASE: verify — assert only recorded copy spans changed on disk
// ---------------------------------------------------------------------------
if (phase === 'verify') {
	const { db: dbPath, repo } = args;
	if (!dbPath || !repo) {
		fatal('verify needs --db --repo');
	}
	const db = new Database(dbPath);
	// pdf-text is never applied, so it can never have moved a byte on disk — exclude it.
	const rows = db.prepare(`SELECT * FROM units WHERE applied = 1 AND syntax != 'pdf-text'`).all();
	const rangesByFile = new Map();
	for (const r of rows) {
		if (!rangesByFile.has(r.file)) {
			rangesByFile.set(r.file, []);
		}
		rangesByFile.get(r.file).push([r.line_start, r.line_end]);
	}
	const useGit = isGitWorktree(repo);
	let files;
	if (useGit) {
		// Git target: assert every changed hunk lies within a recorded copy line-range.
		files = git(repo, 'diff', '--name-only').split('\n').filter(Boolean);
		for (const f of files) {
			const ranges = rangesByFile.get(f);
			if (!ranges) {
				process.stderr.write(`skip verify (not in DB): ${f}\n`);
				continue;
			}
			const raw = git(repo, 'diff', '--unified=0', '--', f);
			for (const line of raw.split('\n')) {
				const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+/);
				if (!m) {
					continue;
				}
				const oldStart = Number.parseInt(m[1], 10);
				const oldLen = m[2] ? Number.parseInt(m[2], 10) : 1;
				if (oldLen === 0) {
					continue;
				}
				const oldEnd = oldStart + oldLen - 1;
				const coverage = new Uint8Array(oldEnd - oldStart + 3);
				for (const [s, e] of ranges) {
					const lo = Math.max(s - 1, oldStart - 1);
					const hi = Math.min(e + 1, oldEnd + 1);
					for (let ln = lo; ln <= hi; ln++) {
						coverage[ln - (oldStart - 1)] = 1;
					}
				}
				let uncovered = null;
				for (let ln = oldStart; ln <= oldEnd; ln++) {
					if (!coverage[ln - (oldStart - 1)]) {
						uncovered = ln;
						break;
					}
				}
				if (uncovered !== null) {
					fatal(
						`hunk ${f}:${oldStart}-${oldEnd} touches non-copy lines (first uncovered: ${uncovered})`,
					);
				}
			}
		}
	} else {
		// Direct target (no git): reconstruct each file's expected post-image from its stored
		// pre-image plus the applied rewrites, and assert it matches disk byte-for-byte. Since
		// the reconstruction only ever splices recorded copy spans, an exact match proves no
		// code/structure outside those spans changed.
		const rowsByFile = new Map();
		const preByFile = new Map();
		for (const r of rows) {
			if (!rowsByFile.has(r.file)) {
				rowsByFile.set(r.file, []);
				preByFile.set(r.file, Buffer.from(r.file_full_text_b64, 'base64').toString('utf8'));
			}
			rowsByFile.get(r.file).push(r);
		}
		files = [...rowsByFile.keys()];
		for (const f of files) {
			const diskPath = path.join(repo, f);
			if (!existsSync(diskPath)) {
				process.stderr.write(`skip verify (missing): ${f}\n`);
				continue;
			}
			const disk = readFileSync(diskPath, 'utf8');
			const expected = spliceUnits(preByFile.get(f), rowsByFile.get(f));
			if (disk !== expected) {
				let i = 0;
				while (i < disk.length && i < expected.length && disk[i] === expected[i]) {
					i++;
				}
				fatal(`file ${f} differs from the copy-only reconstruction at char ${i}; refusing to pass`);
			}
		}
	}
	if (typeof args['post-verify-cmd'] === 'string' && args['post-verify-cmd'].length > 0) {
		const r = spawnSync(args['post-verify-cmd'], {
			cwd: repo,
			encoding: 'utf8',
			shell: true,
			stdio: 'inherit',
		});
		if (r.status !== 0) {
			process.stderr.write(`post-verify-cmd exited ${r.status}\n`);
		}
	}
	const c = (v) => db.prepare(`SELECT COUNT(*) c FROM units WHERE verdict=?`).get(v).c;
	const out = {
		phase: 'verify',
		mode: useGit ? 'git' : 'direct',
		files_touched: files.filter((f) => rangesByFile.has(f)).length,
		kept: c('keep'),
		rewritten: c('rewrite'),
		flagged: c('flag'),
		code_line_changes: 0,
		stat: useGit ? git(repo, 'diff', '--stat').trim() : `${files.length} file(s) reconstructed`,
	};
	db.close();
	console.log(JSON.stringify(out, null, 2));
	process.exit(0);
}

// ---------------------------------------------------------------------------
// PHASE: holistic-emit — pack the WHOLE copy corpus for a cross-cutting review
// ---------------------------------------------------------------------------
// Per-unit review is blind to terminology drift, repetition, and inconsistent voice.
// This phase packs all copy (grouped by file, in reading order) into as few bundles as
// possible so ONE reviewer sees a whole page/route at once and audits it holistically.
function holisticSystemPrompt() {
	return `You are a senior content designer running a STRICT, holistic copy audit against best-practice content standards current as of August 2026 (Federal Plain Language Guidelines, ISO 24495-1, Nielsen Norman Group, WCAG 2.2, Microsoft/Google/Mailchimp/Chicago/AP style guides — see the skill's reference/standards.md). Do NOT be charitable: the owner believes lenient review keeps missing real problems, and your job is to expose every defensible issue. Being conservative is a FAILURE.

You receive the full copy corpus for a page/route (grouped by file, each line: "#id  file  [syntax]  text"). Audit it AS A WHOLE. You MUST look for the cross-cutting problems a unit-by-unit review cannot see, in addition to per-line issues:
  - TERMINOLOGY / CONSISTENCY: the same concept named two ways (e.g. "workflows" vs "skills"), inconsistent product-name casing, sentence-case vs title-case drift, a tagline that varies ("by design" vs "by default").
  - REPETITION: the same claim/phrase repeated across sections; near-duplicate sentences; overused words.
  - DEAD CROSS-REFERENCES: a "see X" pointer, a "[text](#anchor)" link, or a phrase like "in this skill's reference files" whose target — a heading, section, file, or anchor — does not actually appear anywhere in the corpus you were given. Flag it (category consistency); name the missing target in the problem.
  - DUPLICATE / DIVERGENT DESCRIPTIONS: the same artifact (a file, script, workflow, command, or config key) introduced or described in two places with different or contradictory wording — e.g. one filename listed as two bullets with divergent descriptions, or a value stated two ways. Flag it (category consistency or repetition) and quote both.
  - VOICE: anthropomorphism ("it argues itself out of…", a report that is "honest"), hype/buzzwords/clichés ("leverage", "best-in-class", "signal not noise", "seamless"), empty intensifiers ("real gates", "actual code"), metaphors that obscure meaning.
  - CLARITY: sentences that don't parse, awkward constructions, unexplained internal jargon, redundant pairs.
  - PLAIN LANGUAGE: sentences over ~25-30 words, stacked clauses, passive voice, nominalizations.
  - MECHANICS/SEO: <title> length (~50-60), meta description (~150-160), alt text that repeats the title, heading hierarchy.

Return ONE StructuredOutput with a "findings" array. Each finding: { id (the #id it most relates to, or 0 for a cross-cutting theme), severity (blocker|high|medium|low), category (plain-language|inclusive|microcopy|voice-grammar|consistency|repetition), file, quote (the exact copy, trimmed), problem (one sentence), fix (a concrete suggested rewrite or action) }. Rank most-severe first. Do not pad with false positives, but do not suppress real issues. No prose outside the structured output.`;
}

if (phase === 'holistic-emit') {
	const { db: dbPath, 'out-dir': outDir } = args;
	if (!dbPath || !outDir) {
		fatal('holistic-emit needs --db --out-dir');
	}
	const db = new Database(dbPath);
	db.exec(SCHEMA);
	const rows = db
		.prepare(`SELECT id, file, line_start, syntax, block_text FROM units ORDER BY file, char_start`)
		.all();
	const { writeFileSync: wf, mkdirSync } = await import('node:fs');
	mkdirSync(outDir, { recursive: true });
	const BUDGET = 60_000;
	const system = holisticSystemPrompt();
	const bundles = [];
	let cur = { lines: [], chars: 0, lastFile: null };
	const flush = () => {
		if (cur.lines.length) {
			bundles.push(cur);
		}
		cur = { lines: [], chars: 0, lastFile: null };
	};
	for (const r of rows) {
		let line = '';
		if (r.file !== cur.lastFile) {
			line += `\n=== FILE: ${r.file} ===\n`;
			cur.lastFile = r.file;
		}
		line += `#${r.id} L${r.line_start} [${r.syntax}]  ${r.block_text.replaceAll(/\s+/g, ' ').trim()}\n`;
		if (cur.chars + line.length > BUDGET && cur.lines.length) {
			flush();
			cur.lastFile = null;
			line = `\n=== FILE: ${r.file} ===\n#${r.id} L${r.line_start} [${r.syntax}]  ${r.block_text.replaceAll(/\s+/g, ' ').trim()}\n`;
			cur.lastFile = r.file;
		}
		cur.lines.push(line);
		cur.chars += line.length;
	}
	flush();
	const manifest = { total_units: rows.length, bundle_count: bundles.length, bundles: [] };
	bundles.forEach((b, i) => {
		const name = `holistic-${String(i).padStart(4, '0')}.json`;
		const user = `Full copy corpus to audit holistically:\n${b.lines.join('')}`;
		wf(path.join(outDir, name), JSON.stringify({ system, user }, null, 2));
		manifest.bundles.push({ index: i, file: name, chars: b.chars });
	});
	wf(path.join(outDir, 'holistic-manifest.json'), JSON.stringify(manifest, null, 2));
	db.close();
	console.log(
		JSON.stringify(
			{
				phase: 'holistic-emit',
				out_dir: outDir,
				total_units: rows.length,
				bundle_count: bundles.length,
			},
			null,
			2,
		),
	);
	process.exit(0);
}

fatal(`unknown phase: ${phase}`);

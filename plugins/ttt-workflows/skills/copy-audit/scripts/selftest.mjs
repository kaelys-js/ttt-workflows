#!/usr/bin/env node
// selftest for copy-audit: run every phase against a synthetic git worktree covering each
// copy-unit family, then assert:
//   - extract captures the right unit per file type (markdown, json, yaml, template, js,
//     text, frontmatter) with correct, non-overlapping char spans
//   - apply splices rewrites by exact char span, preserving surrounding structure
//     (JSON stays valid, quotes/tags/markers intact)
//   - keep + flag verdicts never touch disk
//   - the SHA guard refuses a file that changed since extract
//   - verify's copy-only invariant holds
//   - SKILL.md is spec-conformant (name/description/line-limit) and the description
//     covers its trigger phrases

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const engine = join(scriptDir, 'extract.mjs');
const skillMd = join(scriptDir, '..', 'SKILL.md');

let failed = 0;
const fail = (m) => {
	console.error('FAIL:', m);
	failed++;
};
const ok = (m) => console.log('ok', m);
const sql = (db, q, json = false) =>
	spawnSync('sqlite3', json ? [db, '-json', q] : [db, q], { encoding: 'utf8' }).stdout;

const root = mkdtempSync(join(tmpdir(), 'cp-selftest-'));
const repo = join(root, 'repo');
const g = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
spawnSync('mkdir', ['-p', repo]);
g('init', '-q', '-b', 'main');
g('config', 'user.email', 'x@y');
g('config', 'user.name', 'x');

const fixtures = {
	'README.md': `---
title: Getting started with the thing
description: A short and friendly summary of the product
---

# Welcome to the product

This is a paragraph of prose that should read clearly and simply.

- First list item worth reviewing
- Second list item worth reviewing

> A blockquote with real words inside it.

![A friendly robot waving hello](./robot.png)
`,
	'data.json': `{
  "title": "Welcome back friend",
  "cta": "Submit",
  "nested": { "description": "Do the thing now please and thanks" },
  "features": ["First bullet point here", "Second bullet point here"],
  "slug": "not-copy-slug",
  "count": 5
}
`,
	'config.yml': `title: "Hello there wonderful world"
description: A short summary here for humans
slug: my-page-slug
`,
	'Page.astro': `---
const heading = "code not copy";
---
<html>
<head><style>.x{color:red}</style></head>
<body>
  <h1>Welcome aboard the ship</h1>
  <img alt="A friendly robot waving" src="/r.png" />
  <button>Submit</button>
  <script>console.log("not copy at all")</script>
</body>
</html>
`,
	'copy.ts': `export const copy = {
  hero: 'Sign up for free today',
  cta: 'Submit',
  path: 'utils/helpers/index',
};
`,
	'helpers.ts': `const label = 'Save your changes now please';
const ident = 'someIdentifierToken';
export function run() { return ident; }
`,
	'notes.txt': `This is a plain text paragraph that carries product copy.

Second paragraph here too.
`,
	'View.swift': `import SwiftUI
struct V: View {
  var body: some View {
    VStack {
      Text("Welcome to your dashboard")
      Button("Save changes") { save() }
      Label("Delete", systemImage: "trash")
      let id = "user_id_token"
    }
  }
}
`,
	'settings.toml': `title = "My Product Site"
description = "A friendly summary of the product for people"
slug = "my-product"
port = 8080
`,
	'flash.rb': `flash[:notice] = "Your password was reset successfully"
ROLE = "user_role_admin"
`,
	'strings.xml': `<resources>
  <string name="greeting">Welcome back to the app</string>
</resources>
`,
	'infra.tf': `variable "env" {
  description = "The name of the environment to deploy into"
}
`,
};
for (const [f, c] of Object.entries(fixtures)) {
	writeFileSync(join(repo, f), c);
}
g('add', '.');
g('commit', '-q', '-m', 'fixtures');

// ---- 1. extract (whole repo via --full) ----
const dbPath = join(root, 'db.sqlite');
let r = spawnSync(
	'node',
	[engine, '--phase=extract', '--repo', repo, '--full', '--head', 'HEAD', '--db', dbPath],
	{ encoding: 'utf8' },
);
if (r.status === 0) {
	ok('extract exit=0');
} else {
	fail(`extract non-zero: ${r.stderr}`);
}

const bySyntax = Object.fromEntries(
	sql(dbPath, 'SELECT syntax, COUNT(*) FROM units GROUP BY syntax;')
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((l) => l.split('|'))
		.map(([s, c]) => [s, Number(c)]),
);
const atLeast = {
	'md-heading': 1,
	'md-prose': 1,
	'md-listitem': 2,
	'md-blockquote': 1,
	'md-alt': 1,
	frontmatter: 2,
	'json-copy': 5, // title, cta, nested.description, 2 items  (slug/count excluded)
	'yaml-copy': 2, // title, description (slug excluded)
	'jsx-text': 2, // "Welcome aboard the ship", "Submit"
	'attr-copy': 1, // alt
	'js-string': 3, // copy.hero, copy.cta, helpers.label (path/ident excluded)
	'text-line': 2,
	'code-string': 3, // swift Text + Button + Label(first arg) + toml description (id_token/slug/systemImage excluded)
};
for (const [k, v] of Object.entries(atLeast)) {
	if ((bySyntax[k] || 0) >= v) {
		ok(`${k}: ${bySyntax[k]} (>=${v})`);
	} else {
		fail(
			`syntax ${k}: expected >=${v}, got ${bySyntax[k] || 0} (all: ${JSON.stringify(bySyntax)})`,
		);
	}
}
// negative: no code-ish strings captured
const slugHit = Number(
	sql(dbPath, "SELECT COUNT(*) FROM units WHERE block_text LIKE '%not-copy-slug%';").trim(),
);
const identHit = Number(
	sql(dbPath, "SELECT COUNT(*) FROM units WHERE block_text LIKE '%someIdentifierToken%';").trim(),
);
const notcopyHit = Number(
	sql(dbPath, "SELECT COUNT(*) FROM units WHERE block_text LIKE '%not copy at all%';").trim(),
);
if (slugHit === 0 && identHit === 0 && notcopyHit === 0) {
	ok('code-ish / identifier / script strings excluded');
} else {
	fail(`non-copy leaked: slug=${slugHit} ident=${identHit} script=${notcopyHit}`);
}
// multi-language capture (tree-sitter): ruby, Android strings.xml, terraform
const has = (needle) =>
	Number(sql(dbPath, `SELECT COUNT(*) FROM units WHERE block_text LIKE '%${needle}%';`).trim()) > 0;
const rbOk = has('password was reset successfully');
const xmlOk = has('Welcome back to the app');
const tfOk = has('environment to deploy into');
const rbRoleLeaked = has('user_role_admin');
if (rbOk && xmlOk && tfOk && !rbRoleLeaked) {
	ok('multi-language capture: ruby + android-xml + terraform (identifier excluded)');
} else {
	fail(`multi-lang: ruby=${rbOk} xml=${xmlOk} tf=${tfOk} roleLeaked=${rbRoleLeaked}`);
}

// ---- 2. bundle-emit ----
const outDir = join(root, 'bundles');
r = spawnSync('node', [engine, '--phase=bundle-emit', '--db', dbPath, '--out-dir', outDir], {
	encoding: 'utf8',
});
if (r.status !== 0) {
	fail(`bundle-emit non-zero: ${r.stderr}`);
}
const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
if (
	manifest.bundle_count >= 1 &&
	manifest.total_pending === Number(sql(dbPath, 'SELECT COUNT(*) FROM units;').trim())
) {
	ok(`bundle-emit: ${manifest.bundle_count} bundle(s), ${manifest.total_pending} units`);
} else {
	fail(`bundle-emit manifest off: ${JSON.stringify(manifest).slice(0, 200)}`);
}
// bundle carries a system + user prompt
const b0 = JSON.parse(readFileSync(join(outDir, 'bundle-0000.json'), 'utf8'));
if (b0.system && b0.user && /verdict/i.test(b0.system)) {
	ok('bundle has system+user prompt');
} else {
	fail('bundle prompt shape wrong');
}

// ---- 3. synthetic verdicts: rewrite a few (one per structural family), flag one, keep rest ----
const rows = JSON.parse(sql(dbPath, 'SELECT id, syntax, block_text FROM units;', true) || '[]');
const pick = (pred) => rows.find(pred);
const jTitle = pick(
	(x) => x.syntax === 'json-copy' && x.block_text.includes('Welcome back friend'),
);
const hHead = pick(
	(x) => x.syntax === 'md-heading' && x.block_text.includes('Welcome to the product'),
);
const aAlt = pick((x) => x.syntax === 'attr-copy' && x.block_text.includes('robot waving'));
const jsHero = pick((x) => x.syntax === 'js-string' && x.block_text.includes('Sign up for free'));
const yTitle = pick((x) => x.syntax === 'yaml-copy' && x.block_text.includes('wonderful world'));
const jCta = pick((x) => x.syntax === 'json-copy' && x.block_text === 'Submit');
for (const [nm, v] of Object.entries({ jTitle, hHead, aAlt, jsHero, yTitle, jCta })) {
	if (!v) {
		fail(`could not locate fixture unit: ${nm}`);
	}
}
const verdicts = rows.map((x) => {
	if (jTitle && x.id === jTitle.id) {
		return {
			id: x.id,
			verdict: 'rewrite',
			rewrite: 'Welcome back',
			category: 'plain-language',
			severity: 'low',
			note: 'trim',
		};
	}
	if (hHead && x.id === hHead.id) {
		return {
			id: x.id,
			verdict: 'rewrite',
			rewrite: 'Welcome',
			category: 'microcopy',
			severity: 'low',
			note: 'tighten',
		};
	}
	if (aAlt && x.id === aAlt.id) {
		return {
			id: x.id,
			verdict: 'rewrite',
			rewrite: 'Robot waving hello',
			category: 'voice-grammar',
			severity: 'low',
			note: 'alt',
		};
	}
	if (jsHero && x.id === jsHero.id) {
		return {
			id: x.id,
			verdict: 'rewrite',
			rewrite: 'Sign up free',
			category: 'microcopy',
			severity: 'low',
			note: 'tighten',
		};
	}
	if (yTitle && x.id === yTitle.id) {
		return {
			id: x.id,
			verdict: 'rewrite',
			rewrite: 'Hello world',
			category: 'plain-language',
			severity: 'low',
			note: 'trim',
		};
	}
	if (jCta && x.id === jCta.id) {
		return {
			id: x.id,
			verdict: 'flag',
			rewrite: null,
			category: 'microcopy',
			severity: 'medium',
			note: 'Vague CTA; name the action.',
		};
	}
	return { id: x.id, verdict: 'keep', rewrite: null };
});
const vPath = join(root, 'verdicts.json');
writeFileSync(vPath, JSON.stringify(verdicts));
r = spawnSync('node', [engine, '--phase=apply-verdicts', '--db', dbPath, '--verdicts', vPath], {
	encoding: 'utf8',
});
if (r.status === 0) {
	ok('apply-verdicts exit=0');
} else {
	fail(`apply-verdicts non-zero: ${r.stderr}`);
}

// ---- 4. apply ----
r = spawnSync('node', [engine, '--phase=apply', '--db', dbPath, '--repo', repo], {
	encoding: 'utf8',
});
if (r.status === 0) {
	ok('apply exit=0');
} else {
	fail(`apply failed: ${r.stderr}`);
}

// ---- 5. structural correctness of splices ----
const dataAfter = readFileSync(join(repo, 'data.json'), 'utf8');
try {
	const parsed = JSON.parse(dataAfter);
	if (parsed.title === 'Welcome back' && parsed.cta === 'Submit') {
		ok('json-copy splice: value changed, JSON still valid, flag untouched');
	} else {
		fail(`json splice wrong: title=${parsed.title} cta=${parsed.cta}`);
	}
} catch (error) {
	fail(`data.json no longer valid JSON: ${error.message}`);
}
const mdAfter = readFileSync(join(repo, 'README.md'), 'utf8');
if (/^# Welcome$/m.test(mdAfter) && !/# Welcome to the product/.test(mdAfter)) {
	ok('md-heading splice preserved the "# " marker');
} else {
	fail(`md heading splice wrong:\n${mdAfter}`);
}
const astroAfter = readFileSync(join(repo, 'Page.astro'), 'utf8');
if (/alt="Robot waving hello"/.test(astroAfter)) {
	ok('attr-copy splice preserved the alt="" quotes');
} else {
	fail(`attr splice wrong:\n${astroAfter}`);
}
const copyAfter = readFileSync(join(repo, 'copy.ts'), 'utf8');
if (/hero: 'Sign up free'/.test(copyAfter)) {
	ok('js-string splice preserved the single quotes');
} else {
	fail(`js-string splice wrong:\n${copyAfter}`);
}
const ymlAfter = readFileSync(join(repo, 'config.yml'), 'utf8');
if (/title: "Hello world"/.test(ymlAfter)) {
	ok('yaml-copy splice preserved the quotes');
} else {
	fail(`yaml splice wrong:\n${ymlAfter}`);
}

// ---- 6. verify (copy-only invariant) ----
r = spawnSync('node', [engine, '--phase=verify', '--db', dbPath, '--repo', repo], {
	encoding: 'utf8',
});
if (r.status === 0) {
	ok('verify exit=0 (copy-only invariant holds)');
} else {
	fail(`verify failed: ${r.stderr}`);
}

// ---- 7. SHA guard: a file changed since extract must be refused ----
const badDb = join(root, 'bad.sqlite');
const badRepo = join(root, 'bad-repo');
const gb = (...a) => spawnSync('git', ['-C', badRepo, ...a], { encoding: 'utf8' });
spawnSync('mkdir', ['-p', badRepo]);
gb('init', '-q', '-b', 'main');
gb('config', 'user.email', 'x@y');
gb('config', 'user.name', 'x');
writeFileSync(join(badRepo, 'a.json'), `{ "title": "Old headline here now" }\n`);
gb('add', '.');
gb('commit', '-q', '-m', 'base');
spawnSync('node', [
	engine,
	'--phase=extract',
	'--repo',
	badRepo,
	'--full',
	'--head',
	'HEAD',
	'--db',
	badDb,
]);
const bid = JSON.parse(
	sql(badDb, "SELECT id FROM units WHERE syntax='json-copy' LIMIT 1;", true),
)[0].id;
writeFileSync(
	join(root, 'bad.json'),
	JSON.stringify([
		{
			id: bid,
			verdict: 'rewrite',
			rewrite: 'New headline',
			category: 'plain-language',
			severity: 'low',
			note: 'x',
		},
	]),
);
spawnSync('node', [
	engine,
	'--phase=apply-verdicts',
	'--db',
	badDb,
	'--verdicts',
	join(root, 'bad.json'),
]);
// mutate the file after extract
writeFileSync(join(badRepo, 'a.json'), `{ "title": "Old headline here now", "x": 1 }\n`);
r = spawnSync('node', [engine, '--phase=apply', '--db', badDb, '--repo', badRepo], {
	encoding: 'utf8',
});
if (r.status === 0) {
	fail('apply should have refused a drifted file');
} else if (/sha mismatch/i.test(r.stderr)) {
	ok('apply refused drifted file (SHA guard FATAL)');
} else {
	fail(`apply failed but not for sha mismatch: ${r.stderr}`);
}

// ---- 8. spec conformance + trigger eval ----
const md = readFileSync(skillMd, 'utf8');
const fm = md.match(/^---\n([\s\S]*?)\n---/);
if (fm) {
	const name = (fm[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
	const desc = (fm[1].match(/^description:\s*([\s\S]+?)(?:\n[a-z_]+:|$)/m) || [])[1]?.trim();
	if (name === 'copy-audit' && /^[a-z0-9-]{1,64}$/.test(name)) {
		ok('frontmatter name valid + matches dir');
	} else {
		fail(`name invalid: ${name}`);
	}
	if (desc && desc.length <= 1024) {
		ok(`description length ok (${desc.length})`);
	} else {
		fail(`description length ${desc ? desc.length : 'missing'}`);
	}
	// Trigger eval: every positive prompt in reference/eval-triggers.json must share a
	// salient word with the description (the same mechanical coverage proxy the sibling
	// skills use), and there must be >=5 positive + >=2 negative prompts.
	const ev = JSON.parse(
		readFileSync(join(scriptDir, '..', 'reference', 'eval-triggers.json'), 'utf8'),
	);
	const STOP = new Set([
		'the',
		'a',
		'an',
		'this',
		'that',
		'for',
		'can',
		'you',
		'please',
		'could',
		'would',
		'with',
		'your',
		'our',
		'my',
		'me',
		'it',
		'is',
		'are',
		'do',
		'does',
		'and',
		'or',
		'to',
		'of',
		'in',
		'on',
		'again',
		'after',
	]);
	const dl = (desc || '').toLowerCase();
	const salient = (s) =>
		(s.toLowerCase().match(/[a-z0-9.]{3,}/g) || []).filter((w) => !STOP.has(w));
	const miss = (ev.positive || []).filter((p) => !salient(p).some((w) => dl.includes(w)));
	if ((ev.positive || []).length >= 5 && (ev.negative || []).length >= 2) {
		ok(`eval-triggers: ${ev.positive.length} positive + ${ev.negative.length} negative`);
	} else {
		fail(
			`eval-triggers needs >=5 positive + >=2 negative (got ${(ev.positive || []).length}/${(ev.negative || []).length})`,
		);
	}
	if (miss.length === 0) {
		ok('description covers every positive trigger prompt');
	} else {
		fail(`description misses trigger(s): ${miss.slice(0, 2).join(' | ')}`);
	}
} else {
	fail('SKILL.md missing frontmatter');
}
const lineCount = md.split('\n').length;
if (lineCount <= 500) {
	ok(`SKILL.md ${lineCount} lines (<=500)`);
} else {
	fail(`SKILL.md too long: ${lineCount}`);
}

// ---- comment mode (subsumed comment-audit): extract comments + test names, apply ----
const cRepo = join(root, 'crepo');
const cg = (...a) => spawnSync('git', ['-C', cRepo, ...a], { encoding: 'utf8' });
spawnSync('mkdir', ['-p', cRepo]);
cg('init', '-q', '-b', 'main');
cg('config', 'user.email', 'x@y');
cg('config', 'user.name', 'x');
writeFileSync(
	join(cRepo, 'a.ts'),
	`// increment the counter by one\nlet counter = 0;\ncounter++;\n// TTL must match the cron interval or events double-fire\nconst ttl = 60;\nimport { it } from 'vitest';\nit('returns 200', () => {});\n`,
);
writeFileSync(join(cRepo, 'b.py'), `# restate: set x to one\nx = 1\n`);
cg('add', '.');
cg('commit', '-q', '-m', 'c');
const cDb = join(root, 'c.db');
r = spawnSync(
	'node',
	[
		engine,
		'--phase=extract',
		'--mode=comments',
		'--repo',
		cRepo,
		'--full',
		'--head',
		'HEAD',
		'--db',
		cDb,
	],
	{ encoding: 'utf8' },
);
const cSyn = Object.fromEntries(
	sql(cDb, 'SELECT syntax, COUNT(*) FROM units GROUP BY syntax;')
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((l) => l.split('|'))
		.map(([s, c]) => [s, Number(c)]),
);
if ((cSyn.comment || 0) >= 3 && (cSyn.testname || 0) >= 1) {
	ok(`comment mode: ${cSyn.comment} comments + ${cSyn.testname} testname`);
} else {
	fail(`comment mode extraction off: ${JSON.stringify(cSyn)}`);
}
const cRows = JSON.parse(sql(cDb, 'SELECT id, syntax, block_text FROM units;', true) || '[]');
const slop = cRows.find((x) => x.block_text.includes('increment the counter'));
const why = cRows.find((x) => x.block_text.includes('TTL must match'));
const tn = cRows.find((x) => x.syntax === 'testname');
writeFileSync(
	join(root, 'cv.json'),
	JSON.stringify([
		{
			id: slop.id,
			verdict: 'delete',
			category: 'comment',
			severity: 'low',
			note: 'restates code',
			rewrite: null,
		},
		{ id: why.id, verdict: 'keep', rewrite: null },
		{
			id: tn.id,
			verdict: 'rewrite',
			rewrite: 'returns 200 when the caller is authorized',
			category: 'testname',
			severity: 'medium',
			note: 'intent',
		},
	]),
);
spawnSync('node', [
	engine,
	'--phase=apply-verdicts',
	'--db',
	cDb,
	'--verdicts',
	join(root, 'cv.json'),
]);
r = spawnSync('node', [engine, '--phase=apply', '--db', cDb, '--repo', cRepo], {
	encoding: 'utf8',
});
const cAfter = readFileSync(join(cRepo, 'a.ts'), 'utf8');
if (
	!/increment the counter/.test(cAfter) &&
	/TTL must match/.test(cAfter) &&
	/it\('returns 200 when the caller is authorized'/.test(cAfter)
) {
	ok('comment mode apply: slop deleted, WHY kept, testname rewritten (call shape intact)');
} else {
	fail(`comment mode apply wrong:\n${cAfter}`);
}
r = spawnSync('node', [engine, '--phase=verify', '--db', cDb, '--repo', cRepo], {
	encoding: 'utf8',
});
if (r.status === 0) {
	ok('comment mode verify (comment-only invariant holds)');
} else {
	fail(`comment mode verify failed: ${r.stderr}`);
}

rmSync(root, { recursive: true, force: true });
if (failed) {
	console.error(`\n${failed} check(s) failed`);
	process.exit(1);
}
console.log('\nALL GREEN');

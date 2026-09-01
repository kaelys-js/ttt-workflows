#!/usr/bin/env node
// selftest.mjs — regression battery for the sec-audit deterministic layer.
// Run from this skill's scripts dir:  node selftest.mjs
// Network-free. Covers resolve-target classification + flag hardening, advisory-lint
// refusals, and coverage-claim arithmetic/honesty. The judgment layer (the audit itself)
// is proven by real runs, not here.

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const D = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'sec-audit-selftest-'));
let failures = 0;
const check = (n, c, d = '') => {
	console.log((c ? '  OK   ' : '  FAIL ') + n + (c || !d ? '' : `  [${d}]`));
	if (!c) {
		failures++;
	}
};
const run = (script, args) => {
	const r = spawnSync('node', [join(D, script), ...args], { encoding: 'utf8' });
	return { code: r.status ?? 1, out: r.stdout || '', err: r.stderr || '' };
};

// ---- resolve-target: classification + flag hardening ------------------------

let r = run('resolve-target.mjs', ['https://evil.example.com/x/y']);
check(
	'resolve refuses unsupported host',
	r.code !== 0 && /unsupported host/.test(r.err),
	r.err.trim().slice(0, 80),
);
r = run('resolve-target.mjs', ['/no/such/path/here']);
check(
	'resolve refuses missing path',
	r.code !== 0 && /does not exist/.test(r.err),
	r.err.trim().slice(0, 80),
);
r = run('resolve-target.mjs', ['/tmp', '--bogus', 'x']);
check(
	'resolve refuses unknown flag',
	r.code !== 0 && /unknown flag/.test(r.err),
	r.err.trim().slice(0, 80),
);
r = run('resolve-target.mjs', ['/tmp', '--out']);
check(
	'resolve refuses flag w/o value',
	r.code !== 0 && /needs a value/.test(r.err),
	r.err.trim().slice(0, 80),
);
r = run('resolve-target.mjs', []);
check('resolve refuses missing target', r.code !== 0 && /usage:/.test(r.err));
// a real local folder resolves
const folderOut = join(tmp, 'f.json');
r = run('resolve-target.mjs', [tmp, '--out', folderOut]);
check(
	'resolve classifies a local folder',
	r.code === 0 && /kind=folder/.test(r.out),
	r.err.trim().slice(0, 80),
);

// ---- advisory-lint ----------------------------------------------------------

const clean = join(tmp, 'clean.md');
writeFileSync(
	clean,
	'# SEC-99\nCVSS: 4.0/AV:N proposed\nAffected repo@a1b2c3d4 file.ts:1\nCWE-284. I traced and confirmed the gap.\n',
);
r = run('advisory-lint.mjs', [clean]);
check(
	'advisory-lint passes a clean advisory',
	r.code === 0 && /clean/.test(r.out),
	r.err.trim().slice(0, 80),
);

const attr = join(tmp, 'attr.md');
writeFileSync(
	attr,
	'# SEC-1\nCVSS: 4.0 proposed\nrepo@a1b2c3d4 f:1 CWE-1\nGenerated with Claude\n',
);
r = run('advisory-lint.mjs', [attr]);
check(
	'advisory-lint refuses AI attribution',
	r.code === 1 && /AI attribution/.test(r.err),
	r.err.trim().slice(0, 80),
);

const pub = join(tmp, 'pub.md');
writeFileSync(
	pub,
	'# SEC-1\nCVSS: 4.0 proposed\nrepo@a1b2c3d4 f:1 CWE-1\nsee github.com/x/y/issues/5\n',
);
r = run('advisory-lint.mjs', [pub]);
check(
	'advisory-lint refuses public-lane link (SR1)',
	r.code === 1 && /private-first/.test(r.err),
	r.err.trim().slice(0, 80),
);

const noscore = join(tmp, 'noscore.md');
writeFileSync(noscore, '# a finding with no score\nsome prose about a bug\n');
r = run('advisory-lint.mjs', [noscore]);
check(
	'advisory-lint refuses missing CVSS/CWE/SEC-nn/SHA',
	r.code === 1 && /missing/.test(r.err),
	r.err.trim().slice(0, 80),
);

// a legit finding that NAMES a vendor as content (not a self-credit) must PASS (warn only)
const vendor = join(tmp, 'vendor.md');
writeFileSync(
	vendor,
	'# SEC-2 finding in an Anthropic-model integration\nCVSS: 4.0 proposed\nAffected repo@a1b2c3d4 f.ts:1\nCWE-77. I traced the call and confirmed injection.\n',
);
r = run('advisory-lint.mjs', [vendor]);
check(
	'advisory-lint passes vendor-name-in-content (warn only)',
	r.code === 0 && /NOTE/.test(r.err),
	r.err.trim().slice(0, 80),
);

// an all-hex English word ("defaced") must NOT satisfy the SHA requirement
const fakesha = join(tmp, 'fakesha.md');
writeFileSync(
	fakesha,
	'# SEC-3\nCVSS: 4.0 proposed\nCWE-1. The page was defaced by the attacker.\n',
);
r = run('advisory-lint.mjs', [fakesha]);
check(
	'advisory-lint: all-hex word is not a SHA',
	r.code === 1 && /pinned commit SHA/.test(r.err),
	r.err.trim().slice(0, 80),
);

// a stand-down record (SR5, no vuln) passes without CWE/SHA but still needs to be clean
const standdown = join(tmp, 'standdown.md');
writeFileSync(
	standdown,
	'# review — no new security finding (assessed stand-down)\nSeverity: NONE. I read the diff; it touches no auth/token/secret surface. No SEC-nn opened.\n',
);
r = run('advisory-lint.mjs', [standdown]);
check(
	'advisory-lint passes a clean stand-down record',
	r.code === 0 && /stand-down/.test(r.out),
	r.err.trim().slice(0, 80),
);
// but a stand-down that carries attribution is still refused
const sdAttr = join(tmp, 'sd-attr.md');
writeFileSync(
	sdAttr,
	'# stand-down, no security finding\nSeverity: NONE. Generated with Claude.\n',
);
r = run('advisory-lint.mjs', [sdAttr]);
check(
	'advisory-lint refuses attribution even on stand-down',
	r.code === 1 && /AI attribution/.test(r.err),
	r.err.trim().slice(0, 80),
);

// ---- coverage-claim ---------------------------------------------------------

r = run('coverage-claim.mjs', [
	'--json',
	'{"surfaces":12,"rules":40,"hits":80,"triaged":30,"confirmed":10,"stood_down":20,"untriaged":5,"untriaged_reason":true}',
]);
check(
	'coverage-claim accepts a valid claim',
	r.code === 0 && /valid/.test(r.out),
	r.err.trim().slice(0, 80),
);
r = run('coverage-claim.mjs', [
	'--json',
	'{"surfaces":1,"rules":1,"hits":10,"triaged":9,"confirmed":5,"stood_down":3,"untriaged":0}',
]);
check(
	'coverage-claim catches bad arithmetic',
	r.code === 1 && /arithmetic/.test(r.err),
	r.err.trim().slice(0, 80),
);
r = run('coverage-claim.mjs', [
	'--json',
	'{"surfaces":1,"rules":1,"hits":10,"triaged":5,"confirmed":2,"stood_down":3,"untriaged":4}',
]);
check(
	'coverage-claim requires untriaged reason (SFP8)',
	r.code === 1 && /reason/.test(r.err),
	r.err.trim().slice(0, 80),
);
r = run('coverage-claim.mjs', [
	'--json',
	'{"surfaces":1,"rules":1,"hits":1,"triaged":1,"confirmed":1}',
]);
check(
	'coverage-claim refuses incomplete shape',
	r.code === 1 && /unreadable|missing/.test(r.err),
	r.err.trim().slice(0, 80),
);

// Format B — the repo's committed bullet layout must be READABLE (predates SFP8 → flagged, not "unreadable")
const fmtB = join(tmp, 'coverage-b.md');
writeFileSync(
	fmtB,
	'# SFP sweep coverage\n\n- Total candidates: **297**\n- Known-regression hits: **195**\n- Novel candidates (need triage): **102**\n\n## Rules that fired\n- `x`: 5\n',
);
r = run('coverage-claim.mjs', [fmtB]);
check(
	'coverage-claim reads Format-B + flags pre-SFP8 gap',
	r.code === 1 && /predates the SFP8 shape/.test(r.err) && /hits=297/.test(r.err),
	r.err.trim().slice(0, 90),
);

// ---- probes: read-only enforcement + flag hardening (network-free) ----------
r = run('probe-azure.mjs', ['--bogus', 'x']);
check(
	'probe-azure refuses unknown flag',
	r.code !== 0 && /unknown flag/.test(r.err),
	r.err.trim().slice(0, 80),
);
r = run('probe-entra.mjs', ['--out']);
check(
	'probe-entra refuses flag w/o value',
	r.code !== 0 && /needs a value/.test(r.err),
	r.err.trim().slice(0, 80),
);
// static guard: neither probe contains a mutating az verb
const azSrc =
	spawnSync('cat', [join(D, 'probe-azure.mjs')], { encoding: 'utf8' }).stdout +
	spawnSync('cat', [join(D, 'probe-entra.mjs')], { encoding: 'utf8' }).stdout;
check(
	'probes issue no mutating az verb (create/update/delete/set)',
	!/az[^\n]*\b(create|update|delete|set|add|remove|purge)\b/.test(
		azSrc.replaceAll(/\/\/.*/g, ''),
	) && /list|show/.test(azSrc),
);

// ---- probe-ado + report: flag hardening + read-only (network-free) ----------
r = run('probe-ado.mjs', ['--org', 'x']);
check(
	'probe-ado requires --project',
	r.code !== 0 && /need --org and --project/.test(r.err),
	r.err.trim().slice(0, 70),
);
r = run('report.mjs', ['--bogus']);
check(
	'report refuses unknown flag',
	r.code !== 0 && /unknown flag/.test(r.err),
	r.err.trim().slice(0, 70),
);
{
	const tmp = join(D, '..', 'selftest-cov.json');
	spawnSync('node', [
		'-e',
		`require("fs").writeFileSync(${JSON.stringify(tmp)}, JSON.stringify({total:1,cov:[{id:"FIND-01",title:"t",severity:"HIGH",status:"found",layers:["source"]}]}))`,
	]);
	const rr = spawnSync(
		'node',
		[join(D, 'report.mjs'), '--dir', join(D, '..'), '--out', join(D, '..', 'selftest-report.html')],
		{ encoding: 'utf8' },
	);
	const html = (() => {
		try {
			return spawnSync('cat', [join(D, '..', 'selftest-report.html')], { encoding: 'utf8' }).stdout;
		} catch {
			return '';
		}
	})();
	check(
		'report renders self-contained themed HTML',
		rr.status === 0 &&
			/<!doctype html>/i.test(html) &&
			/prefers-color-scheme/.test(html) &&
			!/http:\/\/|https:\/\/[^"']*\.(css|js)/.test(html),
		(rr.stderr || '').trim().slice(0, 60),
	);
	spawnSync('rm', [
		'-f',
		tmp,
		join(D, '..', 'selftest-report.html'),
		join(D, '..', 'coverage.json'),
	]);
}
const adoSrc = spawnSync('cat', [join(D, 'probe-ado.mjs')], { encoding: 'utf8' }).stdout;
check(
	'probe-ado is GET-only (no ADO write verb)',
	!/-X\s*(POST|PUT|PATCH|DELETE)/.test(adoSrc) && /Authorization: Bearer/.test(adoSrc),
);

// ---- preflight: produces an actionable auth report ----
{
	const r = run('preflight.mjs', []);
	check(
		'preflight prints an auth report',
		/preflight — what this run needs/.test(r.out) && /(✓|✗|–|!)/.test(r.out),
		(r.out || r.err || '').split('\n')[0],
	);
}

// ---- spec conformance + trigger eval (agentskills.io/specification) ----
{
	const cat = (p) => spawnSync('cat', [p], { encoding: 'utf8' }).stdout || '';
	const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
	const skillName = spawnSync('basename', [skillDir], { encoding: 'utf8' }).stdout.trim();
	const md = cat(join(skillDir, 'SKILL.md'));
	const fm = md.split(/^---$/m)[1] || '';
	const field = (k) => {
		const m = fm.match(new RegExp(`^${k}:\\s?(.*)$`, 'm'));
		return m ? m[1].trim() : null;
	};
	const name = field('name'),
		desc = field('description'),
		compat = field('compatibility');
	check(
		'spec: name valid + matches dir',
		Boolean(name) &&
			/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) &&
			name.length <= 64 &&
			name === skillName,
		name || 'missing',
	);
	check(
		'spec: description 1..1024 chars',
		Boolean(desc) && desc.length > 0 && desc.length <= 1024,
		desc ? String(desc.length) : 'missing',
	);
	check(
		'spec: compatibility <= 500 chars',
		compat === null || compat.length <= 500,
		compat ? String(compat.length) : 'n/a',
	);
	check(
		'spec: SKILL.md under 500 lines',
		md.split('\n').length < 500,
		String(md.split('\n').length),
	);
	const ev = JSON.parse(cat(join(skillDir, 'reference', 'eval-triggers.json')) || '{}');
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
	check(
		'eval: >=5 positive + >=2 negative prompts',
		(ev.positive || []).length >= 5 && (ev.negative || []).length >= 2,
		`${(ev.positive || []).length}/${(ev.negative || []).length}`,
	);
	check(
		'eval: every positive prompt is covered by the description',
		miss.length === 0,
		miss.slice(0, 2).join(' | '),
	);
}

// ---- aggregate: reconcile layer findings into a coverage matrix --------------
// Pure fs transform (no network), driven with fixtures across every mode + error path.
{
	const dir = join(tmp, 'agg');
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, 'azure-findings.json'),
		JSON.stringify({
			findings: [
				{
					id_hint: 'SEC-AZ-1',
					title: 'open firewall',
					severity: 'HIGH',
					class: 'net',
					evidence: '0.0.0.0',
					file: 'main.tf',
					ref_ids: ['SEC-AZ-1'],
				},
			],
			referenced_ids: ['SEC-REF-9'],
			corpus: 'a keyworded blob about weak tls',
		}),
	);
	writeFileSync(
		join(dir, 'source-findings.json'),
		JSON.stringify({ findings: [{ id_hint: 'SEC-SRC-2', title: 'sqli', severity: 'CRITICAL' }] }),
	);
	writeFileSync(
		join(dir, 'osv-scan.json'),
		JSON.stringify({ results: [{ packages: [{ vulnerabilities: [{}, {}] }] }] }),
	);
	const knownRows = [
		{ id: 'SEC-AZ-1', title: 'open firewall', severity: 'HIGH' },
		{ id: 'SEC-SRC-2', title: 'sqli', severity: 'CRITICAL' },
		{ id: 'SEC-MAP-3', title: 'keyworded', severity: 'MEDIUM' },
		{ id: 'SEC-REM-4', title: 'fixed', severity: 'LOW' },
		{ id: 'SEC-GAP-5', title: 'missing', severity: 'LOW' },
	];
	const csv = join(tmp, 'known.csv');
	writeFileSync(
		csv,
		`id,title,severity\n${knownRows.map((r) => `${r.id},${r.title},${r.severity}`).join('\n')}\n`,
	);
	const knownJson = join(tmp, 'known.json');
	writeFileSync(knownJson, JSON.stringify(knownRows));
	const mapJson = join(tmp, 'map.json');
	writeFileSync(mapJson, JSON.stringify({ 'SEC-MAP-3': 'weak tls' }));

	const rNone = run('aggregate.mjs', ['--dir', dir]);
	check('aggregate: no --known → rollup only', rNone.code === 0 && /rollup only/.test(rNone.out));
	check('aggregate: counts dep CVEs from osv-*.json', /2 dep CVEs/.test(rNone.err));

	const covPath = join(tmp, 'cov.json');
	const rCsv = run('aggregate.mjs', [
		'--dir',
		dir,
		'--known',
		csv,
		'--map',
		mapJson,
		'--remediated',
		'SEC-REM-4',
		'--out',
		covPath,
	]);
	const cov = JSON.parse(readFileSync(covPath, 'utf8'));
	const st = (id) => cov.cov.find((x) => x.id === id)?.status;
	check(
		'aggregate: coverage matrix (found/remediated/gap) from CSV known-list',
		rCsv.code === 0 &&
			st('SEC-AZ-1') === 'found' &&
			st('SEC-SRC-2') === 'found' &&
			st('SEC-MAP-3') === 'found' &&
			st('SEC-REM-4') === 'remediated' &&
			st('SEC-GAP-5') === 'gap',
		JSON.stringify(cov.cov.map((x) => `${x.id}:${x.status}`)),
	);
	const rJson = run('aggregate.mjs', [
		'--dir',
		dir,
		'--known',
		knownJson,
		'--out',
		join(tmp, 'covj.json'),
	]);
	check('aggregate: accepts a JSON known-list', rJson.code === 0 && /of 5/.test(rJson.out));

	check(
		'aggregate: refuses a missing --known file',
		run('aggregate.mjs', ['--dir', dir, '--known', '/nonexistent.csv']).code !== 0,
	);
	const badCsv = join(tmp, 'bad.csv');
	writeFileSync(badCsv, 'name,sev\nx,HIGH\n');
	check(
		'aggregate: refuses a CSV with no id column',
		/no 'id' column/.test(run('aggregate.mjs', ['--dir', dir, '--known', badCsv]).err),
	);
	check(
		'aggregate: refuses an unknown flag',
		/unknown flag/.test(run('aggregate.mjs', ['--nope', 'x']).err),
	);
}

// ---- collect-findings: normalize workflow output into flat findings JSON ------
{
	const result = join(tmp, 'result.json');
	writeFileSync(
		result,
		JSON.stringify({
			findings: [
				{
					summary: 'idor on the orders endpoint',
					severity: 'high',
					proposed_sec: 'SEC-R-1',
					evidence: [{ file: 'orders.ts', line: 5, snippet: 'no authz check' }],
				},
			],
		}),
	);
	const jdir = join(tmp, 'jr');
	mkdirSync(jdir, { recursive: true });
	writeFileSync(
		join(jdir, 'journal.jsonl'),
		[
			JSON.stringify({
				type: 'result',
				value: {
					findings: [
						{
							verdict: 'CONFIRMED',
							summary: 'confirmed sqli in the search filter',
							proposed_sec: 'SEC-J-1',
							proposed_cvss: '8.1 high',
							evidence: [{ file: 'search.ts', line: 42, snippet: 'raw string concat into SQL' }],
						},
						{ verdict: 'REFUTED', summary: 'not a real bug' },
						// duplicate title (deduped) and a placeholder title (filtered) exercise those guards
						{ verdict: 'CONFIRMED', summary: 'confirmed sqli in the search filter' },
						{ verdict: 'CONFIRMED', summary: 'item 1' },
					],
				},
			}),
			// a result whose value is a JSON string (the workflow's stringified form)
			JSON.stringify({
				type: 'result',
				value: JSON.stringify({
					findings: [{ verdict: 'CONFIRMED', summary: 'weak jwt secret', proposed_cvss: 'low' }],
				}),
			}),
			JSON.stringify({ type: 'log', value: 'noise' }),
			'{ not json',
			'',
		].join('\n'),
	);

	const rRes = run('collect-findings.mjs', ['--result', result, '--out', join(tmp, 'exp.json')]);
	const exp = JSON.parse(readFileSync(join(tmp, 'exp.json'), 'utf8'));
	check(
		'collect-findings --result: passes a workflow result through',
		rRes.code === 0 && exp.findings.length === 1,
		rRes.out.trim(),
	);
	const srcOut = join(tmp, 'src.json');
	const rJr = run('collect-findings.mjs', ['--journal', jdir, '--out', srcOut]);
	const src = JSON.parse(readFileSync(srcOut, 'utf8'));
	check(
		'collect-findings --journal: keeps CONFIRMED, drops REFUTED/dupes/placeholders',
		rJr.code === 0 &&
			src.findings.length === 2 &&
			src.findings.some((f) => f.id_hint === 'SEC-J-1' && f.severity === 'HIGH') &&
			src.findings.some((f) => f.severity === 'LOW'),
		JSON.stringify(src.findings.map((f) => `${f.id_hint}:${f.severity}`)),
	);
	const rMerge = run('collect-findings.mjs', [
		'--merge-results',
		result,
		'--out',
		join(tmp, 'merged.json'),
	]);
	check(
		'collect-findings --merge-results: merges results',
		rMerge.code === 0 && /merged from 1/.test(rMerge.out),
	);

	check(
		'collect-findings: needs --out',
		/need --out/.test(run('collect-findings.mjs', ['--journal', jdir]).err),
	);
	check(
		'collect-findings: needs a mode',
		/need --journal/.test(run('collect-findings.mjs', ['--out', join(tmp, 'x.json')]).err),
	);
	check(
		'collect-findings: modes are mutually exclusive',
		/mutually exclusive/.test(
			run('collect-findings.mjs', [
				'--journal',
				jdir,
				'--result',
				result,
				'--out',
				join(tmp, 'x.json'),
			]).err,
		),
	);
	const noFind = join(tmp, 'nofind.json');
	writeFileSync(noFind, JSON.stringify({ nope: true }));
	check(
		'collect-findings --result: refuses a result with no findings[]',
		/no findings\[\] array/.test(
			run('collect-findings.mjs', ['--result', noFind, '--out', join(tmp, 'x.json')]).err,
		),
	);
	check(
		'collect-findings: refuses an unknown flag',
		/unknown flag/.test(
			run('collect-findings.mjs', ['--nope', 'x', '--out', join(tmp, 'x.json')]).err,
		),
	);
}

// ---- report: renders finding cards + the coverage grid from real fixtures ----
// The prior report test renders an empty dir; drive it against findings + a coverage matrix so the
// card, coverage-cell, and severity-rank renderers actually run.
{
	const rep = join(tmp, 'rep');
	mkdirSync(rep, { recursive: true });
	writeFileSync(
		join(rep, 'azure-findings.json'),
		JSON.stringify({
			findings: [
				{
					id_hint: 'SEC-AZ-1',
					severity: 'HIGH',
					cvss: '7.5',
					title: 'Postgres firewall allows 0.0.0.0/0',
					file: 'main.tf',
					resource: 'pg-flex-01',
					evidence: 'startIpAddress 0.0.0.0 endIpAddress 255.255.255.255',
				},
			],
		}),
	);
	writeFileSync(
		join(rep, 'coverage.json'),
		JSON.stringify({
			total: 2,
			rollup: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 1, INFO: 0 },
			osvCount: 0,
			cov: [
				{
					id: 'SEC-AZ-1',
					title: 'open firewall',
					severity: 'HIGH',
					status: 'found',
					layers: ['live-azure'],
				},
				{ id: 'SEC-GAP-2', title: 'unmapped item', severity: 'LOW', status: 'gap', layers: [] },
			],
		}),
	);
	const repOut = join(tmp, 'report.html');
	const rRep = run('report.mjs', ['--dir', rep, '--title', 'Selftest Audit', '--out', repOut]);
	const html = readFileSync(repOut, 'utf8');
	check(
		'report: renders finding cards + coverage grid from findings',
		rRep.code === 0 &&
			html.includes('Postgres firewall') &&
			html.includes('SEC-AZ-1') &&
			/gap/i.test(html) &&
			html.includes('Selftest Audit'),
		rRep.err.trim().slice(0, 60),
	);
}

// ---- resolve-target: local repo + file resolution ---------------------------
// The clone + pr-review-delegation paths need git/network and are c8-ignored; the local-repo and
// single-file resolution (git sha + provenance stamping) is proven here against a real temp repo.
{
	const repo = join(tmp, 'localrepo');
	mkdirSync(repo, { recursive: true });
	const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
	git('init', '-q');
	git('config', 'user.email', 't@example.com');
	git('config', 'user.name', 'selftest');
	writeFileSync(join(repo, 'a.ts'), 'export const x = 1;\n');
	git('add', '-A');
	git('commit', '-qm', 'init');

	const tgtPath = join(tmp, 'tgt.json');
	const rRepo = run('resolve-target.mjs', [repo, '--out', tgtPath]);
	const tgt = JSON.parse(readFileSync(tgtPath, 'utf8'));
	check(
		'resolve-target: local repo → kind=repo, platform=local, sha stamped',
		rRepo.code === 0 && tgt.kind === 'repo' && tgt.platform === 'local' && Boolean(tgt.sha),
		JSON.stringify({ kind: tgt.kind, platform: tgt.platform, sha: Boolean(tgt.sha) }),
	);
	const tgtfPath = join(tmp, 'tgtf.json');
	const rFile = run('resolve-target.mjs', [join(repo, 'a.ts'), '--out', tgtfPath]);
	const tgtf = JSON.parse(readFileSync(tgtfPath, 'utf8'));
	check(
		'resolve-target: local file → kind=file, path-scoped, content hashed',
		rFile.code === 0 &&
			tgtf.kind === 'file' &&
			Array.isArray(tgtf.scope) &&
			Boolean(tgtf.provenance?.contentSha256),
		JSON.stringify({ kind: tgtf.kind, scope: tgtf.scope }),
	);
}

// ---- probe-{azure,entra,ado}: arg-parse hardening ----------------------------
// The live cloud posture I/O is c8-ignored (real sweeps cover it); the argument surface must
// still refuse a bad invocation before any az/Graph call, and that is proven here.
for (const [script, valid] of [
	['probe-azure.mjs', '--sub'],
	['probe-entra.mjs', '--filter'],
	['probe-ado.mjs', '--org'],
]) {
	// A valid flag followed by an unknown one: exercises the valid-flag advance AND the unknown-flag
	// refusal, and exits before the first live call.
	const rUnknown = run(script, [valid, 'x', '--nope', 'y']);
	check(
		`${script} refuses an unknown flag (pre-network)`,
		rUnknown.code !== 0 && /unknown flag/.test(rUnknown.err),
		rUnknown.err.trim().slice(0, 50),
	);
	const rNoVal = run(script, [valid]);
	check(
		`${script} refuses a flag with no value (pre-network)`,
		rNoVal.code !== 0 && /needs a value/.test(rNoVal.err),
		rNoVal.err.trim().slice(0, 50),
	);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL GREEN');
process.exit(failures ? 1 : 0);

#!/usr/bin/env node
// collect-findings.mjs — normalize a Workflow run's output into the flat findings JSON the
// report/aggregate layer consumes. Replaces any hand extraction: the deep-read and
// expansion workflows return structured findings; this turns them into <layer>-findings.json.
//
// Usage:
//   node collect-findings.mjs --journal <dir|journal.jsonl>... --out source-findings.json
//        Reads one or more Workflow journal.jsonl files (a dir is scanned recursively for
//        journal.jsonl), pulls every CONFIRMED finding, records each finding's referenced
//        finding-ids + a bounded free-text corpus for keyword reconciliation.
//   node collect-findings.mjs --result <result.json> --out expansion.json
//        Reads a single Workflow result object (or a {result:"<json>"} task wrapper) and
//        writes it through unchanged (validating it has a findings[] array).
//
// READ-ONLY: only reads the given files; writes only --out.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const KNOWN = new Set([
	'--journal',
	'--result',
	'--merge-results',
	'--out',
	'--max-corpus',
	'--exclude',
]);
function die(m) {
	console.error(`collect-findings: ${m}`);
	process.exit(1);
}
const journals = [],
	excludes = [],
	mergeResults = [];
let maxCorpus = 120_000,
	out = null,
	resultPath = null;
for (let i = 0; i < args.length; i++) {
	const a = args[i];
	if (!a.startsWith('--')) {
		die(`unexpected arg '${a}'`);
	}
	if (!KNOWN.has(a)) {
		die(`unknown flag '${a}'`);
	}
	const v = args[++i];
	if (v === undefined || v.startsWith('--')) {
		die(`flag '${a}' needs a value`);
	}
	if (a === '--journal') {
		journals.push(v);
	} else if (a === '--exclude') {
		excludes.push(v);
	} else if (a === '--result') {
		resultPath = v;
	} else if (a === '--merge-results') {
		mergeResults.push(v);
	} else if (a === '--out') {
		out = v;
	} else if (a === '--max-corpus') {
		maxCorpus = Number.parseInt(v, 10) || maxCorpus;
	}
}
if (!out) {
	die('need --out');
}
const modes = [
	journals.length && 'journal',
	resultPath && 'result',
	mergeResults.length && 'merge-results',
].filter(Boolean);
if (modes.length === 0) {
	die('need --journal <path>... , --result <file>, or --merge-results <file>...');
}
if (modes.length > 1) {
	die(`modes are mutually exclusive (got: ${modes.join(', ')})`);
}

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const unwrap = (p) => {
	let d = loadJson(p);
	if (d && d.result !== undefined) {
		d = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
	}
	return d;
};

// ---- --result mode: pass a single workflow result through, unwrapping a task wrapper ----
if (resultPath) {
	if (!existsSync(resultPath)) {
		die(`not found: ${resultPath}`);
	}
	const d = unwrap(resultPath);
	if (!d || !Array.isArray(d.findings)) {
		die(`result has no findings[] array (keys: ${Object.keys(d || {}).join(', ')})`);
	}
	writeFileSync(out, JSON.stringify(d, null, 2));
	console.log(`wrote ${out} — ${d.findings.length} findings (result pass-through)`);
	process.exit(0);
}

// ---- --merge-results mode: merge many workflow results into a source bundle ----
if (mergeResults.length > 0) {
	const findings = [],
		seen = new Set(),
		refIds = new Set();
	let corpus = '';
	for (const p of mergeResults) {
		if (!existsSync(p)) {
			die(`not found: ${p}`);
		}
		const d = unwrap(p);
		if (!d || !Array.isArray(d.findings)) {
			console.error(`collect-findings: warn — ${p} has no findings[]; skipped`);
			continue;
		}
		for (const f of d.findings) {
			const title = f.summary || f.title || f.class || '';
			if (!title || /^(item \d|the .*audit as specified)/i.test(title.trim())) {
				continue;
			}
			const key = title.slice(0, 60);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			const blob = JSON.stringify(f);
			corpus += ` ${blob}`;
			const ref = [...new Set(blob.match(/SEC-[A-Z0-9]+-\d+/g) || [])].toSorted();
			ref.forEach((r) => refIds.add(r));
			let file = '',
				ev = f.evidence;
			if (Array.isArray(ev) && ev[0] && typeof ev[0] === 'object') {
				file = `${ev[0].file || ''}:${ev[0].line || ''}`;
				ev = ev
					.map((e) => (e && e.snippet ? e.snippet.slice(0, 80) : ''))
					.filter(Boolean)
					.join('; ')
					.slice(0, 360);
			}
			findings.push({
				id_hint: f.proposed_sec || ref[0] || 'NEW',
				ref_ids: ref,
				severity: (f.severity || 'MEDIUM').toUpperCase(),
				title: title.slice(0, 140),
				file: file || f.file || '',
				evidence: typeof ev === 'string' ? ev : '',
				cvss: f.proposed_cvss || f.cvss || '',
			});
		}
	}
	writeFileSync(
		out,
		JSON.stringify(
			{
				findings,
				referenced_ids: [...refIds].toSorted(),
				corpus: corpus.replaceAll(/\s+/g, ' ').slice(0, maxCorpus),
			},
			null,
			2,
		),
	);
	console.log(
		`wrote ${out} — ${findings.length} findings merged from ${mergeResults.length} results; ${refIds.size} referenced ids`,
	);
	process.exit(0);
}

// ---- --journal mode: extract CONFIRMED findings from deep-read workflow journals ----
function findJournals(p) {
	if (!existsSync(p)) {
		die(`not found: ${p}`);
	}
	if (statSync(p).isFile()) {
		return [p];
	}
	const acc = [];
	(function walk(d) {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const fp = join(d, e.name);
			if (e.isDirectory()) {
				walk(fp);
			} else if (e.name === 'journal.jsonl') {
				acc.push(fp);
			}
		}
	})(p);
	return acc;
}
function sevOf(f) {
	const c = `${f.proposed_cvss || ''} ${f.severity || ''}`;
	if (/crit|9\.\d/i.test(c)) {
		return 'CRITICAL';
	}
	if (/high|[78]\.\d/i.test(c)) {
		return 'HIGH';
	}
	if (/low|info|[0-3]\.\d/i.test(c)) {
		return 'LOW';
	}
	return 'MEDIUM';
}
const SEC = /SEC-[A-Z0-9]+-\d+/g; // stable id shape: SEC-<scope>-<n> (client-agnostic)

const files = journals.flatMap(findJournals).filter((p) => !excludes.some((x) => p.includes(x)));
const findings = [],
	seen = new Set(),
	refIds = new Set();
let corpus = '';
for (const jf of files) {
	for (const line of readFileSync(jf, 'utf8').split('\n')) {
		if (!line.trim()) {
			continue;
		}
		let rec;
		try {
			rec = JSON.parse(line);
		} catch {
			continue;
		}
		if (rec.type !== 'result') {
			continue;
		}
		let val = rec.value ?? rec.result ?? {};
		if (typeof val === 'string') {
			try {
				val = JSON.parse(val);
			} catch {
				continue;
			}
		}
		if (!val || !Array.isArray(val.findings)) {
			continue;
		}
		for (const f of val.findings) {
			if ((f.verdict || 'CONFIRMED').toUpperCase() !== 'CONFIRMED') {
				continue;
			}
			const title = f.summary || f.title || f.class || '';
			if (!title || /^(item \d|the .*audit as specified)/i.test(title.trim())) {
				continue;
			}
			const key = title.slice(0, 60);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			const blob = JSON.stringify(f);
			corpus += ` ${blob}`;
			const ref = [...new Set(blob.match(SEC) || [])].toSorted();
			ref.forEach((r) => refIds.add(r));
			let file = '';
			let ev = f.evidence;
			if (Array.isArray(ev) && ev[0] && typeof ev[0] === 'object') {
				file = `${ev[0].file || ''}:${ev[0].line || ''}`;
				ev = ev
					.map((e) => (e && e.snippet ? e.snippet.slice(0, 80) : ''))
					.filter(Boolean)
					.join('; ')
					.slice(0, 360);
			}
			findings.push({
				id_hint: f.proposed_sec || ref[0] || 'NEW',
				ref_ids: ref,
				severity: sevOf(f),
				title: title.slice(0, 140),
				file,
				evidence: typeof ev === 'string' ? ev : '',
				cvss: f.proposed_cvss || '',
			});
		}
	}
}
writeFileSync(
	out,
	JSON.stringify(
		{
			findings,
			referenced_ids: [...refIds].toSorted(),
			corpus: corpus.replaceAll(/\s+/g, ' ').slice(0, maxCorpus),
		},
		null,
		2,
	),
);
console.log(
	`wrote ${out} — ${findings.length} confirmed findings from ${files.length} journal(s); ${refIds.size} referenced ids`,
);

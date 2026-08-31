#!/usr/bin/env node
// clickup-update.mjs — TRP Phase 5: status transition + two-layer comment, with
// verification that the comment actually landed.
//
// DRY-RUN BY DEFAULT: without --live it prints exactly what it WOULD do and performs
// zero writes. Pass --live only when Phase 5 is actually reached, post-approval.
//
// Usage:
//   node clickup-update.mjs <TICKET_URL_OR_ID> [--status "<status>"] [--comment-file <path>] [--live]
//
// Gates enforced here, mechanically:
//  - attribution scan on the comment body — a contaminated body is refused, dry-run or live
//  - two-layer shape check — the body must carry a non-technical summary AND a technical
//    detail section (the templates.md shape); a single-layer body is refused
//  - landed-verification — after a live comment post, the latest comment is re-fetched
//    and must match what was posted, else exit non-zero (Phase 5 INCOMPLETE)

import { readFileSync, existsSync } from 'node:fs';

if (typeof fetch !== 'function') {
	console.error('clickup-update: Node 18+ required (global fetch missing)');
	process.exit(1);
}
const HTTP_TIMEOUT_MS = 30_000;

const TOKEN_FILE =
	process.env.CLICKUP_TOKEN_FILE || `${process.env.HOME}/.config/ttt/clickup.token`;
const TEAM_ID = process.env.CLICKUP_TEAM_ID || '8593845';

function die(msg) {
	console.error(`clickup-update: ${msg}`);
	process.exit(1);
}

function token() {
	if (process.env.CLICKUP_TOKEN) {
		return process.env.CLICKUP_TOKEN.trim();
	}
	if (existsSync(TOKEN_FILE)) {
		return readFileSync(TOKEN_FILE, 'utf8').trim();
	}
	die(`no ClickUp token: set $CLICKUP_TOKEN or put the bare pk_ value at ${TOKEN_FILE}`);
}

function parseRef(raw) {
	const s = raw.trim();
	const url = s.match(/app\.clickup\.com\/t\/(?:(\d+)\/)?([A-Za-z0-9_-]+)/);
	const id = url ? url[2] : s;
	return { id, custom: /^[A-Z][A-Z0-9_]*-\d+$/.test(id) };
}

const args = process.argv.slice(2);
const FLAGS_WITH_VALUE = new Set(['--status', '--comment-file']);
const FLAGS_BARE = new Set(['--live']);
for (let i = 0; i < args.length; i++) {
	if (args[i].startsWith('--')) {
		if (FLAGS_WITH_VALUE.has(args[i])) {
			const v = args[i + 1];
			if (v === undefined || v.startsWith('--')) {
				die(`flag '${args[i]}' needs a value`);
			}
			i++;
			continue;
		}
		if (FLAGS_BARE.has(args[i])) {
			continue;
		}
		die(`unknown flag '${args[i]}' (known: --status <s>, --comment-file <p>, --live)`);
	}
}
const ref = args.find((a) => !a.startsWith('--'));
if (!ref) {
	die('usage: node clickup-update.mjs <TICKET_URL_OR_ID> [--status s] [--comment-file p] [--live]');
}
const live = args.includes('--live');
const sIdx = args.indexOf('--status');
const status = sIdx >= 0 ? args[sIdx + 1] : null;
const cIdx = args.indexOf('--comment-file');
const commentFile = cIdx >= 0 ? args[cIdx + 1] : null;
if (!status && !commentFile) {
	die('nothing to do: pass --status and/or --comment-file');
}

// ---- gates (run in BOTH modes, so a dry-run catches the defect early) --------

let comment = null;
if (commentFile) {
	comment = readFileSync(commentFile, 'utf8').trim();
	const banned =
		/co-authored|generated (with|by)|claude|anthropic|copilot|chatgpt|openai|\bopus\b|\bsonnet\b|\bhaiku\b|noreply@anthropic|\u{1F916}/iu;
	const m = comment.match(banned);
	if (m) {
		die(
			`attribution scan FAILED: comment body matches "${m[0]}" — fix the body; nothing was posted`,
		);
	}
	// two-layer shape: a summary layer and a technical layer must both be present
	const hasTech = /technical detail/i.test(comment);
	const hasSummary = /summary/i.test(comment);
	if (!hasTech || !hasSummary) {
		die(
			`two-layer check FAILED: body must contain both a "Summary (non-technical)" layer and a "Technical detail" layer (templates.md); missing: ${[!hasSummary && 'summary', !hasTech && 'technical'].filter(Boolean).join('+')}`,
		);
	}
}

const { id, custom } = parseRef(ref);
const q = custom ? `?custom_task_ids=true&team_id=${TEAM_ID}` : '';
const tok = token();

async function req(method, url, body) {
	const res = await fetch(url, {
		method,
		headers: { Authorization: tok, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
	});
	const txt = await res.text();
	if (!res.ok) {
		die(`ClickUp ${method} ${res.status}: ${txt.slice(0, 300)}`);
	}
	return txt ? JSON.parse(txt) : {};
}

// resolve the task first (read) — needed for the real id + current status either way
const task = await req('GET', `https://api.clickup.com/api/v2/task/${encodeURIComponent(id)}${q}`);
console.log(
	`task: ${task.custom_id || task.id} "${task.name}" · current status: ${task.status?.status}`,
);

if (!live) {
	console.log('--- DRY RUN (no writes; pass --live to execute) ---');
	if (status) {
		console.log(`would set status: "${task.status?.status}" → "${status}"`);
	}
	if (comment) {
		console.log(
			`would post two-layer comment (${comment.length} chars):\n${'-'.repeat(60)}\n${comment}\n${'-'.repeat(60)}`,
		);
	}
	console.log('gates passed: attribution ✓ two-layer ✓ (dry-run)');
	process.exit(0);
}

// ---- live writes -------------------------------------------------------------

if (status) {
	await req('PUT', `https://api.clickup.com/api/v2/task/${task.id}`, { status });
	const after = await req('GET', `https://api.clickup.com/api/v2/task/${task.id}`);
	if ((after.status?.status || '').toLowerCase() !== status.toLowerCase()) {
		die(`status verification FAILED: wanted "${status}", task reads "${after.status?.status}"`);
	}
	console.log(`status set + verified: ${after.status?.status}`);
}

if (comment) {
	await req('POST', `https://api.clickup.com/api/v2/task/${task.id}/comment`, {
		comment_text: comment,
	});
	// landed-verification: the latest comment must be ours, not a system event
	const list = await req('GET', `https://api.clickup.com/api/v2/task/${task.id}/comment`);
	const latest = (list.comments || [])[0];
	const latestText = (latest?.comment_text || '').trim();
	if (!latestText.startsWith(comment.slice(0, 80))) {
		die(
			`landed-verification FAILED: latest comment is not the posted body (got: "${latestText.slice(0, 80)}…") — Phase 5 INCOMPLETE`,
		);
	}
	console.log(`comment posted + landed-verified (${comment.length} chars, latest comment matches)`);
}

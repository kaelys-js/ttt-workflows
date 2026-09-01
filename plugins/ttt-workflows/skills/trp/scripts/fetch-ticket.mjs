#!/usr/bin/env node
// fetch-ticket.mjs — READ-ONLY fetch of a ClickUp ticket + ALL its comments into
// ticket.json, for TRP Phase 0 grounding.
//
// Usage:  node fetch-ticket.mjs <TICKET_URL_OR_ID> [--out ticket.json]
// Accepts: app.clickup.com/t/<team>/<CUSTOM-ID>, app.clickup.com/t/<id>,
//          a bare custom id (PROJ-123, HAND_GitHub-487), or a raw id (868…).
//
// READ-ONLY: GET requests only. The token is sent in the Authorization header and is
// never printed or written to the output file.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (typeof fetch !== 'function') {
	console.error('fetch-ticket: Node 18+ required (global fetch missing)');
	process.exit(1);
}
const HTTP_TIMEOUT_MS = 30_000;

const TOKEN_FILE =
	process.env.CLICKUP_TOKEN_FILE || `${process.env.HOME}/.config/ttt/clickup.token`;
const TEAM_ID = process.env.CLICKUP_TEAM_ID || '8593845';

function die(msg) {
	console.error(`fetch-ticket: ${msg}`);
	process.exit(1);
}

// Exported so the offline token resolution and ref parsing are unit-tested directly. `get` below
// is the only live-ClickUp part; it is c8-ignored and covered by real runs.
export function token() {
	if (process.env.CLICKUP_TOKEN) {
		return process.env.CLICKUP_TOKEN.trim();
	}
	if (existsSync(TOKEN_FILE)) {
		return readFileSync(TOKEN_FILE, 'utf8').trim();
	}
	die(`no ClickUp token: set $CLICKUP_TOKEN or put the bare pk_ value at ${TOKEN_FILE}`);
}

export function parseRef(raw) {
	const s = raw.trim();
	const url = s.match(/app\.clickup\.com\/t\/(?:(\d+)\/)?([A-Za-z0-9_-]+)/);
	const id = url ? url[2] : s;
	return { id, custom: /^[A-Z][A-Z0-9_]*-\d+$/.test(id) };
}

/* c8 ignore start -- live ClickUp GET; exercised by real fetch runs, not unit tests */
async function get(url, tok) {
	const res = await fetch(url, {
		headers: { Authorization: tok },
		signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
	});
	const txt = await res.text();
	if (!res.ok) {
		die(
			`ClickUp GET ${res.status} ${url.replace(/team_id=\d+/, 'team_id=…')}: ${txt.slice(0, 200)}`,
		);
	}
	return JSON.parse(txt);
}
/* c8 ignore stop */

// ---- main -------------------------------------------------------------------
// The arg + ref parse + token resolution here are offline (tested); the ClickUp fetch onward is
// c8-ignored (real runs cover it).
async function main() {
	const args = process.argv.slice(2);
	const KNOWN_FLAGS = new Set(['--out']);
	for (let i = 0; i < args.length; i++) {
		if (args[i].startsWith('--')) {
			if (!KNOWN_FLAGS.has(args[i])) {
				die(`unknown flag '${args[i]}' (known: ${[...KNOWN_FLAGS].join(', ')})`);
			}
			const v = args[i + 1];
			if (v === undefined || v.startsWith('--')) {
				die(`flag '${args[i]}' needs a value`);
			}
			i++;
		}
	}
	const ref = args.find((a) => !a.startsWith('--'));
	if (!ref) {
		die('usage: node fetch-ticket.mjs <TICKET_URL_OR_ID> [--out ticket.json]');
	}
	const outIdx = args.indexOf('--out');
	const out = outIdx >= 0 ? args[outIdx + 1] : 'ticket.json';

	const { id, custom } = parseRef(ref);
	const q = custom ? `?custom_task_ids=true&team_id=${TEAM_ID}` : '';
	const tok = token();

	/* c8 ignore start -- live ClickUp fetch + write; exercised by real runs */
	const t = await get(`https://api.clickup.com/api/v2/task/${encodeURIComponent(id)}${q}`, tok);
	// Comments use the RESOLVED task id (comment endpoint + custom ids is unreliable).
	// ClickUp pages newest-first (~25/page, cursor = start + start_id of the oldest seen);
	// loop so long threads are ACTUALLY all fetched, not just page one.
	const allComments = [];
	let cursor = '';
	for (let page = 0; page < 40; page++) {
		// hard stop at ~1000 comments
		const batch =
			(await get(`https://api.clickup.com/api/v2/task/${t.id}/comment${cursor}`, tok)).comments ||
			[];
		for (const cm of batch) {
			if (!allComments.some((x) => x.id === cm.id)) {
				allComments.push(cm);
			}
		} // page-boundary dedupe
		if (batch.length < 25) {
			break;
		}
		const oldest = batch.at(-1);
		cursor = `?start=${encodeURIComponent(oldest.date)}&start_id=${encodeURIComponent(oldest.id)}`;
	}
	const c = { comments: allComments };

	const ticket = {
		id: t.id,
		custom_id: t.custom_id || null,
		name: t.name,
		status: t.status?.status || null,
		url: t.url,
		list: t.list?.name || null,
		assignees: (t.assignees || []).map((a) => a.username),
		priority: t.priority?.priority || null,
		due_date: t.due_date || null,
		description: t.description || '',
		comments: (c.comments || [])
			.map((x) => ({
				author: x.user?.username || null,
				date: x.date ? new Date(Number(x.date)).toISOString() : null,
				text: (x.comment_text || '').slice(0, 8000),
			}))
			.toReversed(), // oldest first, so the thread reads top-down
		fetchedAt: new Date().toISOString(),
	};

	writeFileSync(out, JSON.stringify(ticket, null, 2));
	console.log(
		`wrote ${out} — ${ticket.custom_id || ticket.id} "${ticket.name}" · ${ticket.status} · ${ticket.comments.length} comments · assignees: ${ticket.assignees.join(', ') || 'none'}`,
	);
	/* c8 ignore stop */
}

// Run only as a CLI entrypoint, so importing parseRef/token for unit tests never triggers a fetch.
/* c8 ignore start -- entrypoint dispatch */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	try {
		await main();
	} catch (error) {
		console.error(`fetch-ticket: ${error.message}`);
		process.exit(1);
	}
}
/* c8 ignore stop */

#!/usr/bin/env node
// fetch-ticket.mjs — READ-ONLY fetch of a ClickUp ticket + ALL its comments into
// ticket.json, for TRP Phase 0 grounding.
//
// Usage:  node fetch-ticket.mjs <TICKET_URL_OR_ID> [--out ticket.json]
// Accepts: app.clickup.com/t/<team>/<CUSTOM-ID>, app.clickup.com/t/<id>,
//          a bare custom id (WPMP3-229, HAND_ITC-487), or a raw id (868…).
//
// READ-ONLY: GET requests only. The token is sent in the Authorization header and is
// never printed or written to the output file.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

if (typeof fetch !== "function") { console.error("fetch-ticket: Node 18+ required (global fetch missing)"); process.exit(1); }
const HTTP_TIMEOUT_MS = 30_000;

const TOKEN_FILE = process.env.CLICKUP_TOKEN_FILE || `${process.env.HOME}/.config/ttt/clickup.token`;
const TEAM_ID = process.env.CLICKUP_TEAM_ID || "8593845";

function die(msg) { console.error(`fetch-ticket: ${msg}`); process.exit(1); }

function token() {
  if (process.env.CLICKUP_TOKEN) return process.env.CLICKUP_TOKEN.trim();
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, "utf8").trim();
  die(`no ClickUp token: set $CLICKUP_TOKEN or put the bare pk_ value at ${TOKEN_FILE}`);
}

function parseRef(raw) {
  const s = raw.trim();
  const url = s.match(/app\.clickup\.com\/t\/(?:(\d+)\/)?([A-Za-z0-9_-]+)/);
  const id = url ? url[2] : s;
  return { id, custom: /^[A-Z][A-Z0-9_]*-\d+$/.test(id) };
}

async function get(url, tok) {
  const res = await fetch(url, { headers: { Authorization: tok }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  const txt = await res.text();
  if (!res.ok) die(`ClickUp GET ${res.status} ${url.replace(/team_id=\d+/, "team_id=…")}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

const args = process.argv.slice(2);
const KNOWN_FLAGS = new Set(["--out"]);
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    if (!KNOWN_FLAGS.has(args[i])) die(`unknown flag '${args[i]}' (known: ${[...KNOWN_FLAGS].join(", ")})`);
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) die(`flag '${args[i]}' needs a value`);
    i++;
  }
}
const ref = args.find((a) => !a.startsWith("--"));
if (!ref) die("usage: node fetch-ticket.mjs <TICKET_URL_OR_ID> [--out ticket.json]");
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : "ticket.json";

const { id, custom } = parseRef(ref);
const q = custom ? `?custom_task_ids=true&team_id=${TEAM_ID}` : "";
const tok = token();

const t = await get(`https://api.clickup.com/api/v2/task/${encodeURIComponent(id)}${q}`, tok);
// Comments use the RESOLVED task id (comment endpoint + custom ids is unreliable).
// ClickUp pages newest-first (~25/page, cursor = start + start_id of the oldest seen);
// loop so long threads are ACTUALLY all fetched, not just page one.
const allComments = [];
let cursor = "";
for (let page = 0; page < 40; page++) { // hard stop at ~1000 comments
  const batch = (await get(`https://api.clickup.com/api/v2/task/${t.id}/comment${cursor}`, tok)).comments || [];
  for (const cm of batch) if (!allComments.some((x) => x.id === cm.id)) allComments.push(cm); // page-boundary dedupe
  if (batch.length < 25) break;
  const oldest = batch[batch.length - 1];
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
  description: t.description || "",
  comments: (c.comments || []).map((x) => ({
    author: x.user?.username || null,
    date: x.date ? new Date(Number(x.date)).toISOString() : null,
    text: (x.comment_text || "").slice(0, 8000),
  })).reverse(), // oldest first, so the thread reads top-down
  fetchedAt: new Date().toISOString(),
};

writeFileSync(out, JSON.stringify(ticket, null, 2));
console.log(`wrote ${out} — ${ticket.custom_id || ticket.id} "${ticket.name}" · ${ticket.status} · ${ticket.comments.length} comments · assignees: ${ticket.assignees.join(", ") || "none"}`);

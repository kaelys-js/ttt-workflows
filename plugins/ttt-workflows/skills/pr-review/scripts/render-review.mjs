#!/usr/bin/env node
// render-review.mjs — turn findings.json into the deterministic, scan-first
// paste-ready review block, then gate the output against the hard band.
//
// Usage:  node render-review.mjs <findings.json> [--platform github|ado]
// Output: prints the review block to stdout. Exits non-zero (emits nothing) if the
//         block violates the hard band, so a contaminated review can never be posted.
//
// Layout (R13 scan-first): verdict+tally line → one-line bottom line → findings-at-a-
// glance table → depth layer → Does/Praise footer. The depth layer renders as GitHub
// <details> collapsibles or, on Azure DevOps (no <details> in PR comments), as flat
// numbered sections. Same findings and depth either way.
//
// Deterministic: the same inputs always render byte-identical output.

import { readFileSync } from "node:fs";

function die(msg) { console.error(`render-review: ${msg}`); process.exit(1); }

const args = process.argv.slice(2);
const KNOWN_FLAGS = new Set(["--platform", "--pr"]);
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    if (!KNOWN_FLAGS.has(args[i])) die(`unknown flag '${args[i]}' (known: ${[...KNOWN_FLAGS].join(", ")})`);
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) die(`flag '${args[i]}' needs a value`);
    i++;
  }
}
const path = args.find((a) => !a.startsWith("--"));
if (!path) die("usage: node render-review.mjs <findings.json> [--platform github|ado] [--pr pr.json]");
const pIdx = args.indexOf("--platform");
let platform = pIdx >= 0 ? args[pIdx + 1] : (process.env.PR_PLATFORM || "github");
if (!["github", "ado"].includes(platform)) die(`--platform must be github or ado (got '${platform}')`);

let doc;
try { doc = JSON.parse(readFileSync(path, "utf8")); } catch (e) { die(`cannot read ${path}: ${e.message}`); }

// Optional fetched-PR context (--pr pr.json): supplies the scope chip (files/±lines),
// the ticket line, and — when present — overrides --platform with the fetched one.
let prMeta = null;
const prIdx = args.indexOf("--pr");
if (prIdx >= 0) {
  try { prMeta = JSON.parse(readFileSync(args[prIdx + 1], "utf8")); } catch (e) { die(`cannot read --pr file: ${e.message}`); }
  if (prMeta.platform && pIdx < 0) platform = prMeta.platform;
}

const LABELS = ["issue", "suggestion", "nitpick", "question", "todo", "note", "praise"];
const findings = Array.isArray(doc.findings) ? doc.findings : [];

// ---- validate + derive ------------------------------------------------------

for (const f of findings) {
  if (!LABELS.includes(f.label)) die(`invalid label '${f.label}' (allowed: ${LABELS.join(", ")})`);
  if (f.label === "praise") f.severity = "non-blocking";
  if (!["blocking", "non-blocking"].includes(f.severity)) die(`finding "${f.headline || f.problem || f.label}" has invalid severity '${f.severity}'`);
  if (f.severity === "blocking" && !(f.fix && String(f.fix).trim())) die(`blocking finding "${f.headline || "?"}" has no fix — every blocking finding must state a fix`);
  if (f.confidence === "low" && f.severity === "blocking") die(`finding "${f.headline || "?"}" is low-confidence but blocking — a blocker must be high-confidence (R12)`);
  if (f.label !== "praise" && !(f.headline && String(f.headline).trim())) die(`finding at ${f.file || "?"}:${f.line ?? "?"} has no headline — required for the scan table (R13)`);
  if (f.suggestion && String(f.suggestion).includes("\u0060\u0060\u0060")) die(`finding "${f.headline}" has a code fence inside its suggestion — it would break the emitted block; strip the fence, the renderer adds its own`);
}

const listed = findings.filter((f) => f.label !== "praise"); // shown in tally + table
const praiseAll = findings.filter((f) => f.label === "praise");
if (praiseAll.length > 2) console.error(`render-review: note — ${praiseAll.length} praise findings; only the first 2 render (no silent caps: trim findings.json yourself if a different pair should survive)`);
const praise = praiseAll.slice(0, 2);
const nBlock = listed.filter((f) => f.severity === "blocking").length;
const nNon = listed.filter((f) => f.severity === "non-blocking").length;

const verdict = doc.verdict || (nBlock ? "request-changes" : nNon ? "comment" : "approve");
const VERDICT = { "request-changes": "🔴 Request changes", comment: "💬 Comment", approve: "✅ Approve" }[verdict];
if (!VERDICT) die(`invalid verdict '${verdict}'`);

// Order by altitude (R13): blocking first, then by label weight (issue > suggestion >
// todo > question > nitpick > note), then file, then line. Keeps the most important
// finding at the top of the scan table; low-value notes sink.
const LABEL_RANK = { issue: 0, suggestion: 1, todo: 2, question: 3, nitpick: 4, note: 5 };
const sortKey = (a, b) =>
  (a.severity === "blocking" ? 0 : 1) - (b.severity === "blocking" ? 0 : 1) ||
  (LABEL_RANK[a.label] ?? 9) - (LABEL_RANK[b.label] ?? 9) ||
  String(a.file || "").localeCompare(String(b.file || "")) || (a.line ?? 0) - (b.line ?? 0);
const ordered = [...listed].sort(sortKey);

const emojiOf = (f) => (f.severity === "blocking" ? "🔴" : "🟡");
const whereOf = (f) => (f.file ? `${f.file}${f.line != null ? ":" + f.line : ""}` : "");

// Deep link to the file at the reviewed head, so "Where" is clickable.
function whereUrl(f) {
  if (!prMeta || !f.file || !prMeta.headSha) return null;
  if (prMeta.platform === "github")
    {
    const encPath = String(f.file).split("/").map(encodeURIComponent).join("/");
    return `https://github.com/${prMeta.owner}/${prMeta.repo}/blob/${prMeta.headSha}/${encPath}${f.line != null ? `#L${f.line}` : ""}`;
  }
  if (prMeta.platform === "ado") {
    const repoRoot = String(prMeta.url || "").replace(/\/pullrequest\/\d+$/, "");
    if (!repoRoot) return null;
    let u = `${repoRoot}?path=${encodeURIComponent("/" + f.file)}&version=GC${prMeta.headSha}&_a=contents`;
    if (f.line != null) u += `&line=${f.line}&lineEnd=${f.line}&lineStartColumn=1&lineEndColumn=500`;
    return u;
  }
  return null;
}
const whereMd = (f) => { const w = whereOf(f); if (!w) return "—"; const u = whereUrl(f); return u ? `[\`${w}\`](${u})` : `\`${w}\``; };
const whereHtml = (f) => { const w = whereOf(f); if (!w) return ""; const u = whereUrl(f); return u ? ` · <a href="${u}"><code>${w}</code></a>` : ` · <code>${w}</code>`; };
const bodyOf = (f) => {
  let b = `${String(f.problem).trim()} ${String(f.fix || "").trim()}`.trim();
  if (f.suggestion && String(f.suggestion).trim()) b += "\n\n```suggestion\n" + String(f.suggestion).replace(/\n+$/, "") + "\n```";
  return b;
};

// ---- mechanical anchor gate (runs whenever --pr is given) -------------------
// The classic review defect is a stale or wrong file:line. With the fetched diff in
// hand this is checkable, so it is checked: an anchored file must be part of the PR's
// changed files, and when the anchored line falls inside a diff hunk its new-side text
// is resolved — a finding may carry `anchor_snippet` (a substring expected on that
// line) and a mismatch refuses the render. Lines outside hunks (context of a changed
// file) only warn: they exist at head but the diff cannot prove their content.

function diffNewLines(diff) {
  const byFile = new Map();
  let file = null, newNo = 0;
  for (const ln of diff.split("\n")) {
    const d = ln.match(/^diff --git a\/.* b\/(.*)$/);
    if (d) { file = d[1]; if (!byFile.has(file)) byFile.set(file, new Map()); continue; }
    const h = ln.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (h) { newNo = parseInt(h[1], 10) - 1; continue; }
    if (!file) continue;
    if (ln.startsWith("+") && !ln.startsWith("+++")) { newNo++; byFile.get(file).set(newNo, ln.slice(1)); }
    else if (ln.startsWith(" ")) { newNo++; byFile.get(file).set(newNo, ln.slice(1)); }
  }
  return byFile;
}

if (prMeta) {
  const lineMap = diffNewLines(prMeta.diff || "");
  // Union of the fetched file list and the diff's own paths: a capped/truncated
  // files[] must not make the gate refuse a legitimately-anchored finding.
  const changedPaths = new Set([...(prMeta.files || []).map((f) => f.path), ...lineMap.keys()]);
  for (const f of ordered) {
    if (!f.file) continue;
    if (!changedPaths.has(f.file))
      die(`anchor gate: "${f.headline}" anchors ${f.file}, which is not a changed file of this PR — findings anchor the diff (R1); flag pre-existing code via a changed-file anchor or as a global note`);
    if (f.line == null) continue;
    const text = lineMap.get(f.file)?.get(f.line);
    if (text === undefined) {
      console.error(`render-review: note — ${f.file}:${f.line} ("${f.headline}") is outside the diff hunks; the diff cannot confirm its content, verify against head manually`);
    } else if (f.anchor_snippet && !text.includes(f.anchor_snippet)) {
      die(`anchor gate: ${f.file}:${f.line} reads "${text.trim().slice(0, 80)}" — does not contain anchor_snippet "${f.anchor_snippet}" ("${f.headline}"); the line number is stale or wrong`);
    }
  }
}

// ---- assemble ---------------------------------------------------------------

const out = [];

// 1. verdict + tally + scope chip (files / ±lines from the fetched PR, when given)
const tally = [nBlock ? `🔴 ${nBlock} blocking` : "", nNon ? `🟡 ${nNon} non-blocking` : ""].filter(Boolean).join(" · ") || "clean";
let headLine = `**${VERDICT}** · ${tally}`;
if (prMeta) {
  const scope = [];
  const nFiles = prMeta.filesTruncated && typeof prMeta.changedFiles === "number" ? prMeta.changedFiles : prMeta.files?.length;
  if (nFiles) scope.push(`${nFiles} file${nFiles === 1 ? "" : "s"}`);
  if (typeof prMeta.additions === "number") scope.push(`+${prMeta.additions} −${prMeta.deletions}`);
  if (scope.length) headLine += ` · \`${scope.join(" · ")}\``;
}
out.push(headLine);

// 2. TL;DR + what the PR does — orientation belongs in the scan layer, not the footer
const bottom = String(doc.bottom_line || doc.summary || "").trim();
if (bottom) out.push("", `> **TL;DR:** ${bottom}`);
if (doc.what_it_does && String(doc.what_it_does).trim()) out.push("", `**Does:** ${String(doc.what_it_does).trim()}`);

// 2b. ticket line — compact; repeat the ticket name only when it differs from the PR title
if (prMeta?.ticket) {
  const t = prMeta.ticket;
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const nameNote = norm(t.name) && norm(t.name) !== norm(prMeta.title) ? ` — "${t.name}"` : "";
  const extras = (prMeta.tickets || []).filter((x) => x.id !== t.id);
  const also = extras.length ? ` · also ${extras.map((x) => `[${x.custom_id || x.id}](${x.url})`).join(", ")}` : "";
  out.push("", `**Ticket:** [${t.custom_id || t.id}](${t.url}) · ${t.status || "status unknown"}${nameNote}${also}`);
}

// 2b2. honest coverage (R15) — past ~500 changed lines review rigor measurably degrades,
// so an oversized diff must say where the review focused. Rendered when provided;
// demanded (warning) when the scope crosses the threshold without one.
const OVERSIZE_LINES = 500;
const changed = prMeta && typeof prMeta.additions === "number" ? prMeta.additions + prMeta.deletions : null;
if (doc.coverage && String(doc.coverage).trim()) {
  out.push("", `**Coverage:** ${String(doc.coverage).trim()}`);
} else if (changed != null && changed > OVERSIZE_LINES) {
  console.error(`render-review: WARNING — ${changed} changed lines exceeds ${OVERSIZE_LINES} but findings.json has no "coverage" field; R15 requires stating where the review focused on an oversized diff.`);
}

// 2c. path to merge — for request-changes, name exactly what stands between this and merge
if (verdict === "request-changes") {
  const blockers = ordered.filter((f) => f.severity === "blocking");
  out.push("", `**Mergeable after:** ${blockers.map((f, i) => `#${i + 1} ${String(f.headline).trim()}`).join(" · ")}`);
}

// 3. scan table — numbered rows, Conventional-Comment type visible at scan level
if (ordered.length) {
  out.push("", "| # | | Type | Finding | Where |", "|--:|--|------|---------|-------|");
  ordered.forEach((f, i) => {
    const head = String(f.headline).replace(/\|/g, "\\|").trim();
    out.push(`| ${i + 1} | ${emojiOf(f)} | ${f.label} | ${head} | ${whereMd(f)} |`);
  });
}

// 4. depth layer
if (ordered.length) {
  if (platform === "github") {
    out.push("");
    ordered.forEach((f, i) => {
      out.push(`<details><summary>${emojiOf(f)} <b>${i + 1} · ${f.label} (${f.severity})</b> — ${String(f.headline).trim()}${whereHtml(f)}</summary>`);
      out.push("", bodyOf(f), "", "</details>", "");
    });
  } else {
    out.push("", "### Details");
    ordered.forEach((f, i) => {
      const where = whereOf(f) ? ` · ${whereMd(f)}` : "";
      out.push("", `**${i + 1}. ${emojiOf(f)} ${f.label} (${f.severity})** — ${String(f.headline).trim()}${where}`, "", bodyOf(f));
    });
  }
}

// 5. footer
if (praise.length) { out.push("", "**Praise:**"); for (const p of praise) out.push(`- ${String(p.problem).trim()}`); }

const block = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

// ---- hard-band gate ---------------------------------------------------------

// Unambiguous AI-attribution tells → refuse. (Bare "Claude"/"Anthropic" only warn —
// a review of an Anthropic-model PR may cite them legitimately.)
const REFUSE = [/co-authored-by/i, /generated (with|by)/i, /noreply@anthropic\.com/i, /\u{1F916}/u /* 🤖 */];
for (const re of REFUSE) if (re.test(block)) die(`hard-band violation: output matches ${re}`);
for (const re of [/\bclaude\b/i, /\banthropic\b/i]) if (re.test(block)) console.error(`render-review: NOTE — output mentions ${re}; confirm it is review content, not attribution.`);

// Only the four functional emojis may appear.
const ALLOWED = new Set(["✅", "💬", "🔴", "🟡"]);
for (const ch of block) {
  const o = ch.codePointAt(0);
  const isEmoji = (o >= 0x1f300 && o <= 0x1faff) || (o >= 0x2600 && o <= 0x27bf) || o === 0x2705 || o === 0x1f4ac;
  if (isEmoji && !ALLOWED.has(ch)) die(`hard-band violation: decorative emoji '${ch}' in output (only ✅ 💬 🔴 🟡 allowed)`);
}

process.stdout.write(block);

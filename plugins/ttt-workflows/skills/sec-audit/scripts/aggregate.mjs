#!/usr/bin/env node
// aggregate.mjs — reconcile every layer's findings into one coverage matrix + rollup.
// TARGET-AGNOSTIC: the known-finding list and any keyword map are PASSED IN as files;
// nothing about any client is baked into this script.
//
// Usage:
//   node aggregate.mjs --dir <findings-dir> [--known <known.csv|known.json>]
//        [--map <map.json>] [--remediated <id,id>] [--out coverage.json]
//
//   --dir       directory holding any of: azure-findings.json entra-findings.json
//               ado-findings.json expansion.json source-findings.json osv-*.json
//   --known     the prior/known finding list to reconcile against. CSV needs columns
//               id,title,severity (extra cols ignored); JSON is an array of {id,title,severity}.
//               Omit → no coverage matrix, just the severity rollup across live findings.
//   --map       optional JSON { "<known-id>": "<regexp>" } — a known finding counts as FOUND
//               if any layer finding's id_hint equals it OR the regexp matches its text.
//               This is where client-specific class→id attribution lives, OUT of the code.
//   --remediated  comma list of known ids verified remediated in the live estate.
//   Writes coverage.json ({ total, cov:[{id,title,severity,status,layers}] }) when --known given.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const KNOWN = new Set(["--dir", "--known", "--map", "--remediated", "--out"]);
for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { if (!KNOWN.has(args[i])) die(`unknown flag ${args[i]}`); if (!args[i+1] || args[i+1].startsWith("--")) die(`${args[i]} needs a value`); i++; }
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const dir = opt("--dir", ".");
const out = opt("--out", "coverage.json");
function die(m) { console.error(`aggregate: ${m}`); process.exit(1); }
const loadJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { die(`${p}: ${e.message}`); } };
function layerName(fn) { return fn.includes("azure") ? "live-azure" : fn.includes("entra") ? "live-entra" : fn.includes("ado") ? "live-ado" : fn.includes("expansion") ? "expansion" : "source"; }

// ---- collect every layer finding ----
const layerFindings = [];
const referencedIds = {}; // id -> layer, from a findings file's top-level referenced_ids[]
for (const fn of readdirSync(dir)) {
  if (!/findings\.json$|^expansion\.json$/.test(fn)) continue;
  const d = loadJson(join(dir, fn));
  for (const f of (d.findings || [])) layerFindings.push({ ...f, _file: fn });
  for (const id of (d.referenced_ids || [])) referencedIds[id] = layerName(fn);
}
// dependency scanner rollup (osv-*.json)
let osvCount = 0;
for (const fn of readdirSync(dir)) if (/^osv.*\.json$/.test(fn)) { const d = loadJson(join(dir, fn)); osvCount += (d.results || []).flatMap((r) => (r.packages || []).flatMap((p) => p.vulnerabilities || [])).length; }

const SEV = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const rollup = SEV.reduce((m, s) => ((m[s] = layerFindings.filter((f) => (f.severity || "").toUpperCase() === s).length), m), {});
console.error(`aggregate: ${layerFindings.length} layer findings (${SEV.map((s) => `${s[0]}${rollup[s]}`).join(" ")})${osvCount ? ` + ${osvCount} dep CVEs` : ""}`);

// ---- coverage matrix (only if a known list is supplied) ----
const knownPath = opt("--known");
if (!knownPath) { console.log(`no --known list — wrote nothing; rollup only: ${JSON.stringify(rollup)}`); process.exit(0); }
if (!existsSync(knownPath)) die(`--known file not found: ${knownPath}`);

let rows;
if (knownPath.endsWith(".json")) rows = loadJson(knownPath);
else {
  const recs = parseCsv(readFileSync(knownPath, "utf8"));
  const hdr = recs.shift().map((h) => h.trim());
  const ci = (n) => hdr.indexOf(n);
  if (ci("id") < 0) die(`--known CSV has no 'id' column (header: ${hdr.join(",")})`);
  rows = recs.map((c) => ({ id: (c[ci("id")] || "").trim(), title: c[ci("title")] || "", severity: c[ci("severity")] || "" })).filter((r) => r.id);
}
// RFC-4180-ish CSV: quote-aware, handles embedded newlines and "" escapes.
function parseCsv(text) {
  const recs = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") recs.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.length > 1 || row[0] !== "") recs.push(row); }
  return recs;
}

const map = opt("--map") && existsSync(opt("--map")) ? loadJson(opt("--map")) : {};
const remediated = new Set((opt("--remediated", "") || "").split(",").map((s) => s.trim()).filter(Boolean));

// index layer findings by id_hint + a searchable text blob
const byId = {};
let blob = layerFindings.map((f) => `${f.id_hint || ""} ${f.title || ""} ${f.class || ""} ${f.evidence || ""} ${f.file || ""}`).join("\n");
// a layer may ship a free-text corpus (e.g. the deep-read's full evidence) for keyword matching
for (const fn of readdirSync(dir)) if (/findings\.json$/.test(fn)) { const d = loadJson(join(dir, fn)); if (d.corpus) blob += "\n" + d.corpus; }
// the dependency scanner (osv) contributes a synthetic token so a known dep-debt finding can match
if (osvCount) blob += `\ndependency-cve dep-cve osv-scanner ${osvCount} dependency vulnerabilities`;
blob = blob.toLowerCase();
for (const f of layerFindings) {
  const L = layerName(f._file);
  for (const id of [f.id_hint, ...(f.ref_ids || [])]) if (id && id.startsWith("SEC")) (byId[id] = byId[id] || new Set()).add(L);
}

const cov = rows.map((r) => {
  if (remediated.has(r.id)) return { id: r.id, title: r.title, severity: r.severity, status: "remediated", layers: ["live-verify"] };
  const layers = new Set(byId[r.id] ? [...byId[r.id]] : []);
  if (referencedIds[r.id]) layers.add(referencedIds[r.id]);
  const re = map[r.id];
  if (re && new RegExp(re, "i").test(blob)) layers.add("source");
  return { id: r.id, title: r.title, severity: r.severity, status: layers.size ? "found" : "gap", layers: [...layers].sort() };
});

writeFileSync(out, JSON.stringify({ total: cov.length, rollup, osvCount, cov }, null, 2));
const c = (s) => cov.filter((x) => x.status === s).length;
console.log(`wrote ${out} — found ${c("found")} · remediated ${c("remediated")} · gap ${c("gap")} of ${cov.length}${c("gap") ? " · GAPS: " + cov.filter((x) => x.status === "gap").map((x) => x.id).join(", ") : ""}`);

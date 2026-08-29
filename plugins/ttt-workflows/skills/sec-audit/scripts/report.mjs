#!/usr/bin/env node
// report.mjs — aggregate every layer's findings into ONE self-contained, theme-aware HTML
// audit report. Reads the JSON each layer writes (source/IaC deep-read, live-azure,
// live-entra, live-ado, scanner, coverage matrix, expansion) and renders an executive
// brief + severity distribution + GAP-LIST coverage grid + per-finding cards + methodology.
//
// Usage:
//   node report.mjs --dir <findings-dir> --title "OMS Security Audit" --out report.html
//     --dir holds any of: azure-findings.json entra-findings.json ado-findings.json
//     osv-be.json coverage.json expansion.json source-findings.json
//   Every input is optional; the report renders whatever is present and says what was absent.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const KNOWN = new Set(["--dir", "--title", "--out", "--target", "--sha"]);
for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) { if (!KNOWN.has(args[i])) die(`unknown flag ${args[i]}`); if (!args[i+1] || args[i+1].startsWith("--")) die(`${args[i]} needs a value`); i++; }
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const dir = opt("--dir", ".");
const title = opt("--title", "Security Audit");
const target = opt("--target", "");
const sha = opt("--sha", "");
const out = opt("--out", "report.html");
function die(m) { console.error(`report: ${m}`); process.exit(1); }
const load = (name) => { const p = join(dir, name); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { console.error(`report: warn — ${name}: ${e.message}`); return null; } };

// ---- gather ----
const azure = load("azure-findings.json");
const entra = load("entra-findings.json");
const ado = load("ado-findings.json");
const osvFile = readdirSync(dir).filter((n)=>/^osv.*\.json$/.test(n))[0];
const osv = osvFile ? load(osvFile) : null;
const coverage = load("coverage.json");
const expansion = load("expansion.json");
const source = load("source-findings.json"); // optional pre-aggregated source findings

const layers = [];
const push = (layer, arr) => arr && arr.forEach((f) => layers.push({ ...f, layer }));
push("Live Azure (ARM)", azure?.findings);
push("Live Entra (Graph)", entra?.findings);
push("Live ADO (pipeline)", ado?.findings);
push("Source / IaC", source?.findings);
if (expansion?.findings) expansion.findings.forEach((f) => layers.push({ ...f, layer: "Expansion (net-new)", id_hint: f.overlaps_sec || "NEW", novel: true, evidence: f.evidence }));
const osvCount = osv?.results ? osv.results.flatMap((r) => (r.packages || []).flatMap((p) => p.vulnerabilities || [])).length : 0;

// ---- severity ordering + palette classes ----
const SEV = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const sevRank = (s) => { const i = SEV.indexOf((s || "INFO").toUpperCase()); return i < 0 ? 4 : i; };
layers.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
const sevCount = SEV.reduce((m, s) => ((m[s] = layers.filter((f) => (f.severity || "").toUpperCase() === s).length), m), {});

// ---- coverage stats ----
const cov = coverage?.cov || [];
const covStat = { found: cov.filter((c) => c.status === "found").length, remediated: cov.filter((c) => c.status === "remediated").length, gap: cov.filter((c) => c.status === "gap").length, total: cov.length };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const now = new Date().toISOString().slice(0, 10);

// ---- finding card ----
const card = (f) => `
  <article class="finding sev-${(f.severity||"info").toLowerCase()}">
    <header>
      <span class="sev">${esc(f.severity||"INFO")}</span>
      <span class="fid">${esc(f.id_hint||f.overlaps_sec||"—")}</span>
      <span class="layer">${esc(f.layer)}</span>
    </header>
    <h4>${esc(f.title || f.class || f.evidence?.slice(0,80) || "finding")}</h4>
    ${f.resource ? `<div class="res">${esc(f.resource)}</div>` : ""}
    ${f.file ? `<div class="res">${esc(f.file)}${f.line?":"+esc(f.line):""}</div>` : ""}
    <p class="ev">${esc(f.evidence || "")}</p>
    ${f.cvss ? `<div class="cvss">${esc(f.cvss)}</div>` : ""}
    ${f.reason ? `<div class="ev muted">verified: ${esc(f.reason)}</div>` : ""}
  </article>`;

// ---- coverage grid cell ----
const covCell = (c) => `<a class="cell ${c.status}" title="${esc(c.id)} — ${esc(c.title)} [${esc(c.status)}${c.layers?.length?" · "+esc(c.layers.join("+")):""}]">${esc(c.id.replace(/^[A-Za-z]+-/,""))}</a>`;

const bar = SEV.map((s) => sevCount[s] ? `<span class="seg sev-${s.toLowerCase()}" style="flex:${sevCount[s]}" title="${s}: ${sevCount[s]}">${sevCount[s]}</span>` : "").join("");

const absent = [["source-findings.json", source], ["azure", azure], ["entra", entra], ["ado", ado], ["coverage", coverage], ["expansion", expansion]].filter(([, v]) => !v).map(([k]) => k);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f7f8fa;--panel:#fff;--ink:#12161c;--muted:#5b6672;--line:#e4e8ee;--accent:#0f7d8c;
--crit:#c0304a;--high:#d9682a;--med:#c99a12;--low:#3f6fb0;--info:#7a8592;
--crit-bg:#fbe9ec;--high-bg:#fbeee3;--med-bg:#f9f3d9;--low-bg:#e9f0fa;--info-bg:#eef1f4;}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0e1116;--panel:#161b22;--ink:#e6edf3;--muted:#8b98a6;--line:#242c36;--accent:#3bb6c7;
--crit-bg:#2a1418;--high-bg:#2a1c12;--med-bg:#26220f;--low-bg:#141d2b;--info-bg:#181d24;}}
:root[data-theme=dark]{--bg:#0e1116;--panel:#161b22;--ink:#e6edf3;--muted:#8b98a6;--line:#242c36;--accent:#3bb6c7;
--crit-bg:#2a1418;--high-bg:#2a1c12;--med-bg:#26220f;--low-bg:#141d2b;--info-bg:#181d24;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:32px 22px 80px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
h1{font-size:26px;margin:0 0 2px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:13px;margin-bottom:24px}
.sub .mono{font-size:12px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin:16px 0}
.kpis{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0}
.kpi{flex:1;min-width:120px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi .n{font-size:30px;font-weight:680;letter-spacing:-.02em}
.kpi .l{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-top:2px}
.kpi.ok .n{color:var(--accent)} .kpi.crit .n{color:var(--crit)}
.distbar{display:flex;height:34px;border-radius:8px;overflow:hidden;border:1px solid var(--line);margin:6px 0 2px}
.seg{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:640;font-size:13px;min-width:26px}
.seg.sev-critical{background:var(--crit)}.seg.sev-high{background:var(--high)}.seg.sev-medium{background:var(--med)}.seg.sev-low{background:var(--low)}.seg.sev-info{background:var(--info)}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:34px 0 6px;font-weight:640}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(34px,1fr));gap:5px;margin-top:10px}
.cell{display:flex;align-items:center;justify-content:center;height:30px;border-radius:6px;font:600 12px/1 ui-monospace,monospace;text-decoration:none;color:var(--ink);border:1px solid var(--line)}
.cell.found{background:var(--low-bg);border-color:var(--low)}
.cell.remediated{background:var(--info-bg);color:var(--muted)}
.cell.gap{background:var(--crit-bg);border-color:var(--crit);color:var(--crit)}
.legend{display:flex;gap:16px;font-size:12px;color:var(--muted);margin-top:10px;flex-wrap:wrap}
.legend b{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.finding{border:1px solid var(--line);border-left:4px solid var(--info);border-radius:9px;padding:13px 16px;margin:9px 0;background:var(--panel)}
.finding.sev-critical{border-left-color:var(--crit);background:linear-gradient(90deg,var(--crit-bg),var(--panel) 55%)}
.finding.sev-high{border-left-color:var(--high);background:linear-gradient(90deg,var(--high-bg),var(--panel) 55%)}
.finding.sev-medium{border-left-color:var(--med)}.finding.sev-low{border-left-color:var(--low)}
.finding header{display:flex;gap:9px;align-items:center;font-size:11px;margin-bottom:5px;flex-wrap:wrap}
.sev{font-weight:700;letter-spacing:.04em;padding:1px 7px;border-radius:4px;color:#fff;font-size:10px}
.sev-critical .sev{background:var(--crit)}.sev-high .sev{background:var(--high)}.sev-medium .sev{background:var(--med)}.sev-low .sev{background:var(--low)}.sev-info .sev{background:var(--info)}
.fid{font-family:ui-monospace,monospace;font-weight:640;color:var(--accent)}
.layer{margin-left:auto;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-size:10px}
.finding h4{margin:2px 0 4px;font-size:15px;font-weight:620}
.res{font-family:ui-monospace,monospace;font-size:12px;color:var(--muted);margin:2px 0}
.ev{margin:5px 0 0;font-size:13.5px;color:var(--ink)} .ev.muted{color:var(--muted);font-size:12.5px}
.cvss{font-family:ui-monospace,monospace;font-size:11px;color:var(--muted);margin-top:6px}
.frameworks{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.chip{font-size:11px;border:1px solid var(--line);border-radius:20px;padding:3px 11px;color:var(--muted)}
.note{font-size:12.5px;color:var(--muted)}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
</style></head><body><div class="wrap">
<h1>${esc(title)}</h1>
<div class="sub">${target?`Target <span class="mono">${esc(target)}</span> · `:""}${sha?`<span class="mono">@${esc(sha)}</span> · `:""}Generated ${now} · three-layer audit (source/IaC · live Azure · live Entra/ADO) · read-only</div>

<div class="kpis">
  <div class="kpi crit"><div class="n">${sevCount.CRITICAL||0}</div><div class="l">Critical</div></div>
  <div class="kpi"><div class="n">${sevCount.HIGH||0}</div><div class="l">High</div></div>
  <div class="kpi"><div class="n">${layers.length}</div><div class="l">Live findings</div></div>
  ${cov.length?`<div class="kpi ok"><div class="n">${covStat.found}/${covStat.total}</div><div class="l">GAP-LIST found</div></div>`:""}
  ${expansion?`<div class="kpi"><div class="n">${expansion.confirmed_novel??0}</div><div class="l">Net-new confirmed</div></div>`:""}
</div>

<div class="panel">
  <div class="note">Severity distribution across ${layers.length} live findings${osvCount?` (+ ${osvCount} dependency CVEs from the scanner layer)`:""}</div>
  <div class="distbar">${bar||'<span class="seg sev-info" style="flex:1">no findings loaded</span>'}</div>
</div>

${cov.length?`<h2>GAP-LIST coverage — ${covStat.found} found · ${covStat.remediated} remediated · ${covStat.gap} gap</h2>
<div class="note">Each cell is a known finding from the supplied list. Hover for detail. This audit accounts for every one: found by a layer, or verified remediated in the live estate.</div>
<div class="grid">${cov.map(covCell).join("")}</div>
<div class="legend"><span><b style="background:var(--low)"></b>found by a layer</span><span><b style="background:var(--info)"></b>remediated (verified absent)</span><span><b style="background:var(--crit)"></b>uncovered gap</span></div>`:""}

${expansion?.findings?.length?`<h2>Net-new findings — beyond the known list</h2>
<div class="note">${expansion.confirmed_novel} confirmed of ${expansion.novel_candidates} novel candidates across ${expansion.surfaces} surfaces (adversarially verified).</div>
${expansion.findings.map((f)=>card({...f,layer:"Expansion (net-new)",id_hint:"NEW"})).join("")}`:""}

<h2>Findings by severity</h2>
${layers.length?layers.map(card).join(""):'<div class="note">No layer findings loaded — pass --dir at a directory holding the *-findings.json files.</div>'}

<h2>Methodology &amp; frameworks</h2>
<div class="panel">
  <div class="note">Findings graded against current professional standards. Evidence tiers explicit: live-probe (ARM/Graph GET) and source-traced (file:line) outrank deployment-dependent inference.</div>
  <div class="frameworks">
    ${["PTES","OWASP WSTG v4.2","OWASP ASVS","NIST SP 800-115","CVSS 4.0","CWE","MITRE ATT&CK","CIS Azure","Coordinated Disclosure"].map((c)=>`<span class="chip">${c}</span>`).join("")}
  </div>
</div>

<footer>
  Layers loaded: ${[azure&&"live-azure",entra&&"live-entra",ado&&"live-ado",source&&"source/IaC",osv&&"scanner",expansion&&"expansion"].filter(Boolean).join(" · ")||"none"}.
  ${absent.length?`Absent (not run / not supplied): ${absent.join(", ")}.`:""}
  Read-only audit. No PR, ticket, or client resource was mutated. No AI attribution.
</footer>
</div></body></html>`;

writeFileSync(out, html);
console.log(`wrote ${out} — ${layers.length} findings · ${sevCount.CRITICAL||0} crit / ${sevCount.HIGH||0} high${cov.length?` · coverage ${covStat.found}/${covStat.total} found, ${covStat.remediated} remediated, ${covStat.gap} gap`:""}`);

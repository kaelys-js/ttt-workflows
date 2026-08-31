#!/usr/bin/env node
// selftest.mjs — regression battery for the sec-audit deterministic layer.
// Run from this skill's scripts dir:  node selftest.mjs
// Network-free. Covers resolve-target classification + flag hardening, advisory-lint
// refusals, and coverage-claim arithmetic/honesty. The judgment layer (the audit itself)
// is proven by real runs, not here.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const D = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sec-audit-selftest-"));
let failures = 0;
const check = (n, c, d = "") => { console.log((c ? "  OK   " : "  FAIL ") + n + (c || !d ? "" : `  [${d}]`)); if (!c) failures++; };
const run = (script, args) => { const r = spawnSync("node", [join(D, script), ...args], { encoding: "utf8" }); return { code: r.status ?? 1, out: r.stdout || "", err: r.stderr || "" }; };

// ---- resolve-target: classification + flag hardening ------------------------

let r = run("resolve-target.mjs", ["https://evil.example.com/x/y"]);
check("resolve refuses unsupported host", r.code !== 0 && /unsupported host/.test(r.err), r.err.trim().slice(0, 80));
r = run("resolve-target.mjs", ["/no/such/path/here"]);
check("resolve refuses missing path", r.code !== 0 && /does not exist/.test(r.err), r.err.trim().slice(0, 80));
r = run("resolve-target.mjs", ["/tmp", "--bogus", "x"]);
check("resolve refuses unknown flag", r.code !== 0 && /unknown flag/.test(r.err), r.err.trim().slice(0, 80));
r = run("resolve-target.mjs", ["/tmp", "--out"]);
check("resolve refuses flag w/o value", r.code !== 0 && /needs a value/.test(r.err), r.err.trim().slice(0, 80));
r = run("resolve-target.mjs", []);
check("resolve refuses missing target", r.code !== 0 && /usage:/.test(r.err));
// a real local folder resolves
const folderOut = join(tmp, "f.json");
r = run("resolve-target.mjs", [tmp, "--out", folderOut]);
check("resolve classifies a local folder", r.code === 0 && /kind=folder/.test(r.out), r.err.trim().slice(0, 80));

// ---- advisory-lint ----------------------------------------------------------

const clean = join(tmp, "clean.md");
writeFileSync(clean, "# SEC-99\nCVSS: 4.0/AV:N proposed\nAffected repo@a1b2c3d4 file.ts:1\nCWE-284. I traced and confirmed the gap.\n");
r = run("advisory-lint.mjs", [clean]);
check("advisory-lint passes a clean advisory", r.code === 0 && /clean/.test(r.out), r.err.trim().slice(0, 80));

const attr = join(tmp, "attr.md");
writeFileSync(attr, "# SEC-1\nCVSS: 4.0 proposed\nrepo@a1b2c3d4 f:1 CWE-1\nGenerated with Claude\n");
r = run("advisory-lint.mjs", [attr]);
check("advisory-lint refuses AI attribution", r.code === 1 && /AI attribution/.test(r.err), r.err.trim().slice(0, 80));

const pub = join(tmp, "pub.md");
writeFileSync(pub, "# SEC-1\nCVSS: 4.0 proposed\nrepo@a1b2c3d4 f:1 CWE-1\nsee github.com/x/y/issues/5\n");
r = run("advisory-lint.mjs", [pub]);
check("advisory-lint refuses public-lane link (SR1)", r.code === 1 && /private-first/.test(r.err), r.err.trim().slice(0, 80));

const noscore = join(tmp, "noscore.md");
writeFileSync(noscore, "# a finding with no score\nsome prose about a bug\n");
r = run("advisory-lint.mjs", [noscore]);
check("advisory-lint refuses missing CVSS/CWE/SEC-nn/SHA", r.code === 1 && /missing/.test(r.err), r.err.trim().slice(0, 80));

// a legit finding that NAMES a vendor as content (not a self-credit) must PASS (warn only)
const vendor = join(tmp, "vendor.md");
writeFileSync(vendor, "# SEC-2 finding in an Anthropic-model integration\nCVSS: 4.0 proposed\nAffected repo@a1b2c3d4 f.ts:1\nCWE-77. I traced the call and confirmed injection.\n");
r = run("advisory-lint.mjs", [vendor]);
check("advisory-lint passes vendor-name-in-content (warn only)", r.code === 0 && /NOTE/.test(r.err), r.err.trim().slice(0, 80));

// an all-hex English word ("defaced") must NOT satisfy the SHA requirement
const fakesha = join(tmp, "fakesha.md");
writeFileSync(fakesha, "# SEC-3\nCVSS: 4.0 proposed\nCWE-1. The page was defaced by the attacker.\n");
r = run("advisory-lint.mjs", [fakesha]);
check("advisory-lint: all-hex word is not a SHA", r.code === 1 && /pinned commit SHA/.test(r.err), r.err.trim().slice(0, 80));

// a stand-down record (SR5, no vuln) passes without CWE/SHA but still needs to be clean
const standdown = join(tmp, "standdown.md");
writeFileSync(standdown, "# review — no new security finding (assessed stand-down)\nSeverity: NONE. I read the diff; it touches no auth/token/secret surface. No SEC-nn opened.\n");
r = run("advisory-lint.mjs", [standdown]);
check("advisory-lint passes a clean stand-down record", r.code === 0 && /stand-down/.test(r.out), r.err.trim().slice(0, 80));
// but a stand-down that carries attribution is still refused
const sdAttr = join(tmp, "sd-attr.md");
writeFileSync(sdAttr, "# stand-down, no security finding\nSeverity: NONE. Generated with Claude.\n");
r = run("advisory-lint.mjs", [sdAttr]);
check("advisory-lint refuses attribution even on stand-down", r.code === 1 && /AI attribution/.test(r.err), r.err.trim().slice(0, 80));

// ---- coverage-claim ---------------------------------------------------------

r = run("coverage-claim.mjs", ["--json", '{"surfaces":12,"rules":40,"hits":80,"triaged":30,"confirmed":10,"stood_down":20,"untriaged":5,"untriaged_reason":true}']);
check("coverage-claim accepts a valid claim", r.code === 0 && /valid/.test(r.out), r.err.trim().slice(0, 80));
r = run("coverage-claim.mjs", ["--json", '{"surfaces":1,"rules":1,"hits":10,"triaged":9,"confirmed":5,"stood_down":3,"untriaged":0}']);
check("coverage-claim catches bad arithmetic", r.code === 1 && /arithmetic/.test(r.err), r.err.trim().slice(0, 80));
r = run("coverage-claim.mjs", ["--json", '{"surfaces":1,"rules":1,"hits":10,"triaged":5,"confirmed":2,"stood_down":3,"untriaged":4}']);
check("coverage-claim requires untriaged reason (SFP8)", r.code === 1 && /reason/.test(r.err), r.err.trim().slice(0, 80));
r = run("coverage-claim.mjs", ["--json", '{"surfaces":1,"rules":1,"hits":1,"triaged":1,"confirmed":1}']);
check("coverage-claim refuses incomplete shape", r.code === 1 && /unreadable|missing/.test(r.err), r.err.trim().slice(0, 80));

// Format B — the repo's committed bullet layout must be READABLE (predates SFP8 → flagged, not "unreadable")
const fmtB = join(tmp, "coverage-b.md");
writeFileSync(fmtB, "# SFP sweep coverage\n\n- Total candidates: **297**\n- Known-regression hits: **195**\n- Novel candidates (need triage): **102**\n\n## Rules that fired\n- `x`: 5\n");
r = run("coverage-claim.mjs", [fmtB]);
check("coverage-claim reads Format-B + flags pre-SFP8 gap", r.code === 1 && /predates the SFP8 shape/.test(r.err) && /hits=297/.test(r.err), r.err.trim().slice(0, 90));


// ---- probes: read-only enforcement + flag hardening (network-free) ----------
r = run("probe-azure.mjs", ["--bogus", "x"]);
check("probe-azure refuses unknown flag", r.code !== 0 && /unknown flag/.test(r.err), r.err.trim().slice(0,80));
r = run("probe-entra.mjs", ["--out"]);
check("probe-entra refuses flag w/o value", r.code !== 0 && /needs a value/.test(r.err), r.err.trim().slice(0,80));
// static guard: neither probe contains a mutating az verb
const azSrc = spawnSync("cat", [join(D,"probe-azure.mjs")], {encoding:"utf8"}).stdout + spawnSync("cat",[join(D,"probe-entra.mjs")],{encoding:"utf8"}).stdout;
check("probes issue no mutating az verb (create/update/delete/set)", !/az[^\n]*\b(create|update|delete|set|add|remove|purge)\b/.test(azSrc.replace(/\/\/.*/g,"")) && /list|show/.test(azSrc));


// ---- probe-ado + report: flag hardening + read-only (network-free) ----------
r = run("probe-ado.mjs", ["--org", "x"]);
check("probe-ado requires --project", r.code !== 0 && /need --org and --project/.test(r.err), r.err.trim().slice(0,70));
r = run("report.mjs", ["--bogus"]);
check("report refuses unknown flag", r.code !== 0 && /unknown flag/.test(r.err), r.err.trim().slice(0,70));
{ const tmp = join(D, "..", "selftest-cov.json");
  spawnSync("node", ["-e", `require("fs").writeFileSync(${JSON.stringify(tmp)}, JSON.stringify({total:1,cov:[{id:"FIND-01",title:"t",severity:"HIGH",status:"found",layers:["source"]}]}))`]);
  const rr = spawnSync("node", [join(D,"report.mjs"), "--dir", join(D,".."), "--out", join(D,"..","selftest-report.html")], {encoding:"utf8"});
  const html = (()=>{try{return spawnSync("cat",[join(D,"..","selftest-report.html")],{encoding:"utf8"}).stdout;}catch{return "";}})();
  check("report renders self-contained themed HTML", rr.status===0 && /<!doctype html>/i.test(html) && /prefers-color-scheme/.test(html) && !/http:\/\/|https:\/\/[^"']*\.(css|js)/.test(html), (rr.stderr||"").trim().slice(0,60));
  spawnSync("rm",["-f",tmp,join(D,"..","selftest-report.html"),join(D,"..","coverage.json")]);
}
const adoSrc = spawnSync("cat",[join(D,"probe-ado.mjs")],{encoding:"utf8"}).stdout;
check("probe-ado is GET-only (no ADO write verb)", !/-X\s*(POST|PUT|PATCH|DELETE)/.test(adoSrc) && /Authorization: Bearer/.test(adoSrc));


// ---- preflight: produces an actionable auth report ----
{ const r = run("preflight.mjs", []);
  check("preflight prints an auth report", /preflight — what this run needs/.test(r.out) && /(✓|✗|–|!)/.test(r.out), (r.out||r.err||"").split("\n")[0]); }


// ---- spec conformance + trigger eval (agentskills.io/specification) ----
{
  const cat = (p) => spawnSync("cat", [p], { encoding: "utf8" }).stdout || "";
  const skillDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const skillName = spawnSync("basename", [skillDir], { encoding: "utf8" }).stdout.trim();
  const md = cat(join(skillDir, "SKILL.md"));
  const fm = md.split(/^---$/m)[1] || "";
  const field = (k) => { const m = fm.match(new RegExp("^" + k + ":\\s?(.*)$", "m")); return m ? m[1].trim() : null; };
  const name = field("name"), desc = field("description"), compat = field("compatibility");
  check("spec: name valid + matches dir", !!name && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64 && name === skillName, name || "missing");
  check("spec: description 1..1024 chars", !!desc && desc.length >= 1 && desc.length <= 1024, desc ? String(desc.length) : "missing");
  check("spec: compatibility <= 500 chars", compat === null || compat.length <= 500, compat ? String(compat.length) : "n/a");
  check("spec: SKILL.md under 500 lines", md.split("\n").length < 500, String(md.split("\n").length));
  const ev = JSON.parse(cat(join(skillDir, "reference", "eval-triggers.json")) || "{}");
  const STOP = new Set(["the","a","an","this","that","for","can","you","please","could","would","with","your","our","my","me","it","is","are","do","does","and","or","to","of","in","on","again","after"]);
  const dl = (desc || "").toLowerCase();
  const salient = (s) => (s.toLowerCase().match(/[a-z0-9.]{3,}/g) || []).filter((w) => !STOP.has(w));
  const miss = (ev.positive || []).filter((p) => !salient(p).some((w) => dl.includes(w)));
  check("eval: >=5 positive + >=2 negative prompts", (ev.positive || []).length >= 5 && (ev.negative || []).length >= 2, `${(ev.positive || []).length}/${(ev.negative || []).length}`);
  check("eval: every positive prompt is covered by the description", miss.length === 0, miss.slice(0, 2).join(" | "));
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GREEN");
process.exit(failures ? 1 : 0);

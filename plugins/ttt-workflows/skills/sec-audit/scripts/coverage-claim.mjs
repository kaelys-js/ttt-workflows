#!/usr/bin/env node
// coverage-claim.mjs — validate an SFP8 coverage claim so "covered everything" can never
// be silent truncation. Checks the required shape and the arithmetic.
//
// Usage:
//   node coverage-claim.mjs <coverage.md>          # parse the SFP8 sentence from a file
//   node coverage-claim.mjs --json '{...}'         # validate a structured claim
// Fields: surfaces, rules, hits, triaged, confirmed, stood_down, untriaged (+ untriaged_reason)
// Exit 0 = valid; non-zero = invalid, with the reason.

import { readFileSync } from "node:fs";

function die(m) { console.error(`coverage-claim: ${m}`); process.exit(1); }
const args = process.argv.slice(2);
if (!args.length) die("usage: node coverage-claim.mjs <coverage.md> | --json '<obj>'");

let c;
if (args[0] === "--json") {
  try { c = JSON.parse(args.slice(1).join(" ")); } catch (e) { die(`bad --json: ${e.message}`); }
} else {
  const text = readFileSync(args[0], "utf8");
  const num = (re) => { const m = text.match(re); return m ? parseInt(m[1], 10) : null; };
  // Format A — the canonical SFP8 sentence ("N surfaces ... M rules ... K hits ...
  // J triaged ... C confirmed ... S stood down ... U un-triaged").
  // Format B — the repo's committed bullet layout ("Total candidates: N",
  // "Known-regression hits: N", "Novel candidates (need triage): N", "## Rules that fired").
  // Count only bullets under the "## Rules that fired" section, not category/SEC-nn tables.
  const rulesSection = (text.split(/^##\s+/m).find((s) => /^rules that fired/i.test(s)) || "");
  const rulesFired = (rulesSection.match(/^-\s+`[^`]+`:\s*\d+/gim) || []).length || null;
  const categories = (text.match(/^-\s+`(auth|secrets|transport|input|iac|cicd|storage|deps|dependencies)`:/gim) || []).length || null;
  c = {
    surfaces: num(/(\d+)\s+surfaces?/i) ?? categories,
    rules: num(/(\d+)\s+rules?\s+applied/i) ?? num(/(\d+)\s+rules?/i) ?? rulesFired,
    hits: num(/total candidates:\s*\*{0,2}(\d+)/i) ?? num(/(\d+)\s+(?:raw\s+)?hits?/i),
    triaged: num(/(\d+)\s+triaged/i),
    confirmed: num(/(\d+)\s+confirmed/i),
    stood_down: num(/(\d+)\s+stood[\s-]down/i) ?? num(/known-regression hits:\s*\*{0,2}(\d+)/i),
    untriaged: num(/(\d+)\s+un[\s-]?triaged/i) ?? num(/novel candidates[^:]*:\s*\*{0,2}(\d+)/i),
    untriaged_reason: /un[\s-]?triaged[^.]*\(([^)]*reason[^)]*)\)/i.test(text) || /need triage/i.test(text) || null,
  };
  // Format B lacks an explicit "triaged" total; derive it when both parts are known.
  if (c.triaged == null && c.confirmed != null && c.stood_down != null) c.triaged = c.confirmed + c.stood_down;
}

const REQ = ["surfaces", "rules", "hits", "triaged", "confirmed", "stood_down", "untriaged"];
const missing = REQ.filter((k) => typeof c[k] !== "number");
if (missing.length) {
  // Distinguish "unreadable" from "readable but pre-SFP8". If we got the core counts
  // (hits + untriaged) but not the confirmed/stood-down split, the file is a real
  // coverage report that predates the SFP8 shape — say exactly that, and exit non-zero
  // so it gets upgraded, rather than a useless generic parse failure.
  if (typeof c.hits === "number" && typeof c.untriaged === "number") {
    console.error(`coverage-claim: this report is readable but predates the SFP8 shape — has hits=${c.hits}, untriaged=${c.untriaged}, but is missing: ${missing.join(", ")}. Upgrade it to state confirmed/stood-down explicitly (SFP8).`);
    process.exit(1);
  }
  die(`unreadable as a coverage claim — no SFP8 sentence and no recognizable bullet counts (missing: ${missing.join(", ")})`);
}

// arithmetic: triaged = confirmed + stood_down; triaged + untriaged <= hits
if (c.confirmed + c.stood_down !== c.triaged)
  die(`arithmetic: confirmed(${c.confirmed}) + stood_down(${c.stood_down}) != triaged(${c.triaged})`);
if (c.triaged + c.untriaged > c.hits)
  die(`arithmetic: triaged(${c.triaged}) + untriaged(${c.untriaged}) > hits(${c.hits})`);

// honesty: a real sweep has non-zero un-triaged, and if it does it must state a reason
if (c.untriaged > 0 && !c.untriaged_reason)
  die(`honesty: untriaged=${c.untriaged} but no reason given (SFP8: un-triaged must carry a reason)`);
if (c.untriaged === 0) console.error(`coverage-claim: NOTE — untriaged=0 is unusual on a real sweep (SFP8); confirm nothing was silently dropped`);

console.log(`coverage-claim: valid — ${c.surfaces} surfaces, ${c.rules} rules, ${c.hits} hits, ${c.triaged} triaged (${c.confirmed} confirmed / ${c.stood_down} stood-down), ${c.untriaged} un-triaged`);

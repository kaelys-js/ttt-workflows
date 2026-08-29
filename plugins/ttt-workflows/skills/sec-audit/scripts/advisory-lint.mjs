#!/usr/bin/env node
// advisory-lint.mjs — gate an advisory / PoC-README / finding body before it is shared.
// Enforces the checks the repo doesn't already have a script for: SR1 private-first,
// SR11 voice, no AI attribution, and the required disclosure-standard sections.
//
// Usage:  node advisory-lint.mjs <advisory.md>
// Exit 0 = clean; non-zero = refused, with every violation printed.

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: node advisory-lint.mjs <advisory.md>"); process.exit(2); }

let body;
try { body = readFileSync(path, "utf8"); } catch (e) { console.error(`advisory-lint: cannot read ${path}: ${e.message}`); process.exit(2); }

const violations = [];

// --- HARD: unambiguous AI attribution (SR11 / no-attribution) ---
for (const re of [/co-authored-by/i, /generated (with|by)\s+(claude|copilot|chatgpt|an ai|ai)/i, /noreply@anthropic\.com/i, /\u{1F916}/u]) {
  const m = body.match(re);
  if (m) violations.push(`AI attribution: matches ${re} ("${m[0]}") — advisories carry no attribution`);
}
// --- WARN: bare vendor names (a finding may legitimately name a vendor; a self-credit may not) ---
for (const re of [/\bclaude\b/i, /\banthropic\b/i, /\bcopilot\b/i]) {
  const m = body.match(re);
  if (m) console.error(`advisory-lint: NOTE — body mentions "${m[0]}"; confirm it is finding content, not a self-credit (SR11).`);
}

// --- HARD: private-first leak signals (SR1) ---
// A finding body must not carry a public issue/PR link or "public" disclosure language.
for (const re of [/github\.com\/[^\s)]+\/(issues|pull)\/\d+/i, /\bpublic (issue|advisory|disclosure|thread)\b/i]) {
  const m = body.match(re);
  if (m) violations.push(`private-first (SR1): body references a public lane ("${m[0]}") — findings stay private until GHSA`);
}

// A stand-down / no-finding record (SR5) has no vuln to anchor — it still must be clean
// on attribution + private-first, but CWE/SHA/CVSS-vector are not required.
const isStandDown = /\bstand[\s-]?down\b|no (new )?security (finding|vulnerabilit)|no sec-nn|severity[:\s]*none/i.test(body);

// --- HARD: required disclosure-standard sections (SP8 / SR2) — findings only ---
const REQUIRED = isStandDown ? [] : [
  [/cvss[:\s]/i, "a CVSS vector line"],
  [/\bsec-[a-z0-9]+/i, "a stable SEC-nn id"],
  [/@[0-9a-f]{7,40}\b|commit[:\s@]+[0-9a-f]{7,40}\b|\b[0-9a-f]{40}\b/i, "a pinned commit SHA (affected component — use repo@sha, 'commit <sha>', or a full 40-char sha)"],
  [/\bcwe-\d+/i, "a CWE mapping"],
];
for (const [re, label] of REQUIRED) if (!re.test(body)) violations.push(`missing ${label}`);

// --- SOFT (warn): SR11 voice ---
const emDashes = (body.match(/—/g) || []).length;
const paras = body.split(/\n\s*\n/).length;
if (emDashes > paras) console.error(`advisory-lint: NOTE — ${emDashes} em-dashes across ~${paras} paragraphs; ration them (SR11)`);
for (const filler of ["genuinely", "really", "simply", "just ", "very "]) {
  const n = (body.toLowerCase().match(new RegExp(`\\b${filler.trim()}\\b`, "g")) || []).length;
  if (n > 2) console.error(`advisory-lint: NOTE — filler "${filler.trim()}" x${n} (SR11)`);
}
for (const emoji of body) { const o = emoji.codePointAt(0); if ((o >= 0x1f300 && o <= 0x1faff) || (o >= 0x2600 && o <= 0x27bf)) { console.error(`advisory-lint: NOTE — decorative emoji '${emoji}' (SR11: an advisory is not a chat message)`); break; } }

if (violations.length) {
  console.error(`advisory-lint: REFUSED — ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`advisory-lint: clean (attribution ✓ private-first ✓${isStandDown ? " stand-down record — vuln-anchors waived" : " required sections ✓"})`);

#!/usr/bin/env node
// selftest.mjs — regression battery for the deterministic layer of the pr-review skill.
// Run from this skill's scripts dir:  node selftest.mjs
// Exits non-zero on any failure. Covers: render fixtures for all three verdicts on both
// platforms, determinism, every hard-band/validation refusal, and the anchor gate
// (pass, wrong-file refusal, stale-line refusal, outside-hunk warning).
// The judgment layer (finding real defects) is NOT covered here — that is what cold
// runs on real PRs are for.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RENDER = join(dirname(fileURLToPath(import.meta.url)), "render-review.mjs");
const tmp = mkdtempSync(join(tmpdir(), "pr-review-selftest-"));
let failures = 0;

function run(args) {
  const r = spawnSync("node", [RENDER, ...args], { encoding: "utf8" });
  return { code: r.status ?? 1, out: r.stdout || "", err: r.stderr || "" };
}
function J(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj)); return p; }
function check(name, cond, detail = "") {
  console.log((cond ? "  OK   " : "  FAIL ") + name + (cond || !detail ? "" : `  [${detail}]`));
  if (!cond) failures++;
}

// ---- shared fixtures --------------------------------------------------------

const GH_DIFF = [
  "diff --git a/src/widget.ts b/src/widget.ts",
  "index 000..111 100644", "--- a/src/widget.ts", "+++ b/src/widget.ts",
  "@@ -1,3 +1,4 @@",
  " const a = 1;",
  "+export const leak = secret;",
  " const b = 2;",
  " const c = 3;",
].join("\n");

const prGh = J("pr-gh.json", {
  platform: "github", owner: "acme", repo: "demo", number: 7, title: "Add widget",
  url: "https://github.com/acme/demo/pull/7", headSha: "a".repeat(40),
  additions: 120, deletions: 30,
  files: [{ path: "src/widget.ts" }, { path: "src/app.ts" }],
  ticket: { id: "9z", custom_id: "ACME-1", name: "Different ticket name", status: "in review", url: "https://app.clickup.com/t/9z" },
  tickets: [
    { id: "9z", custom_id: "ACME-1", name: "Different ticket name", status: "in review", url: "https://app.clickup.com/t/9z" },
    { id: "8y", custom_id: "ACME-2", name: "Sibling", status: "open", url: "https://app.clickup.com/t/8y" },
  ],
  diff: GH_DIFF,
});

const prAdoOversize = J("pr-ado.json", {
  platform: "ado", org: "acme", repo: "demo", number: 9, title: "Big change",
  url: "https://dev.azure.com/acme/P/_git/demo/pullrequest/9", headSha: "b".repeat(40),
  additions: 600, deletions: 10, files: [{ path: "src/widget.ts" }, { path: "src/app.ts" }],
  diff: "diff --git a/src/widget.ts b/src/widget.ts\n@@ -1,1 +1,2 @@\n const a = 1;\n+const d = 4;\n",
});

const okFinding = { severity: "blocking", label: "issue", confidence: "high", headline: "Secret leaks", file: "src/widget.ts", line: 2, anchor_snippet: "leak = secret", problem: "p, so q.", fix: "redact." };

// ---- 1. verdict fixtures render on both platforms ---------------------------

const fx = {
  rc: J("rc.json", { verdict: "request-changes", bottom_line: "b.", what_it_does: "d.", findings: [okFinding, { severity: "non-blocking", label: "nitpick", confidence: "high", headline: "Nit", file: "src/app.ts", problem: "p, so q.", fix: "f." }, { severity: "non-blocking", label: "praise", problem: "well tested." }] }),
  cm: J("cm.json", { verdict: "comment", bottom_line: "b.", findings: [{ severity: "non-blocking", label: "question", confidence: "high", headline: "Q", file: "src/app.ts", problem: "p, so q?", fix: "confirm." }] }),
  ap: J("ap.json", { verdict: "approve", bottom_line: "b.", findings: [] }),
};

for (const [k, p] of Object.entries(fx)) {
  const g = run([p, "--pr", prGh]);
  check(`fixture ${k} renders (github)`, g.code === 0, g.err.trim());
  const a = run([p, "--platform", "ado"]);
  check(`fixture ${k} renders (ado, no pr)`, a.code === 0, a.err.trim());
}
const rc1 = run([fx.rc, "--pr", prGh]);
check("request-changes: Mergeable after present", rc1.out.includes("**Mergeable after:** #1 Secret leaks"));
check("scope chip present", rc1.out.includes("`2 files · +120 −30`"));
check("TL;DR label present", rc1.out.includes("> **TL;DR:** b."));
check("ticket line + differing name + sibling ticket", rc1.out.includes('[ACME-1](https://app.clickup.com/t/9z) · in review — "Different ticket name" · also [ACME-2]'));
check("github depth uses <details>", rc1.out.includes("<details><summary>"));
check("where deep-links to head sha", rc1.out.includes(`blob/${"a".repeat(40)}/src/widget.ts#L2`));
const rcAdoFx = J("rc-ado.json", { verdict: "request-changes", bottom_line: "b.", coverage: "Focused on widget.ts.", findings: [{ severity: "blocking", label: "issue", confidence: "high", headline: "Bad constant", file: "src/widget.ts", line: 2, anchor_snippet: "const d = 4", problem: "p, so q.", fix: "f." }] });
const rcAdo = run([rcAdoFx, "--pr", prAdoOversize]);
check("ado depth is flat (### Details)", rcAdo.code === 0 && rcAdo.out.includes("### Details") && !rcAdo.out.includes("<details>"), rcAdo.err.trim().slice(0, 90));
check("ado where deep-links with GC<sha>&line", rcAdo.out.includes(`version=GC${"b".repeat(40)}`) && rcAdo.out.includes("line=2"));

// determinism
check("deterministic re-render", run([fx.rc, "--pr", prGh]).out === rc1.out);

// ---- 2. refusal battery -----------------------------------------------------

const refusals = [
  ["blocking without fix", { findings: [{ ...okFinding, fix: "" }] }, /has no fix/],
  ["low-confidence blocker", { findings: [{ ...okFinding, confidence: "low" }] }, /low-confidence but blocking/],
  ["missing headline", { findings: [{ ...okFinding, headline: "" }] }, /no headline/],
  ["invalid label", { findings: [{ ...okFinding, label: "vibes" }] }, /invalid label/],
  ["AI attribution in output", { bottom_line: "Generated with tooling", findings: [] }, /hard-band violation/],
  ["decorative emoji in output", { bottom_line: "ship it \u{1F680}", findings: [] }, /decorative emoji/],
];
for (const [name, doc, re] of refusals) {
  const r = run([J(name.replace(/\W+/g, "-") + ".json", { verdict: doc.findings?.some((f) => f.severity === "blocking") ? "request-changes" : "comment", bottom_line: doc.bottom_line || "b.", findings: doc.findings || [] })]);
  check(`refuses: ${name}`, r.code !== 0 && re.test(r.err), r.err.trim().slice(0, 90));
}

// ---- 3. anchor gate ---------------------------------------------------------

const wrongFile = J("af1.json", { verdict: "comment", bottom_line: "b.", findings: [{ severity: "non-blocking", label: "note", confidence: "high", headline: "H", file: "src/nope.ts", line: 1, problem: "p, so q.", fix: "f." }] });
let r = run([wrongFile, "--pr", prGh]);
check("anchor gate: refuses file not in PR", r.code !== 0 && /not a changed file/.test(r.err), r.err.trim().slice(0, 90));

const staleLine = J("af2.json", { verdict: "comment", bottom_line: "b.", findings: [{ severity: "non-blocking", label: "note", confidence: "high", headline: "H", file: "src/widget.ts", line: 1, anchor_snippet: "leak = secret", problem: "p, so q.", fix: "f." }] });
r = run([staleLine, "--pr", prGh]);
check("anchor gate: refuses stale line (snippet mismatch)", r.code !== 0 && /does not contain anchor_snippet/.test(r.err), r.err.trim().slice(0, 90));

const outsideHunk = J("af3.json", { verdict: "comment", bottom_line: "b.", findings: [{ severity: "non-blocking", label: "note", confidence: "high", headline: "H", file: "src/widget.ts", line: 400, problem: "p, so q.", fix: "f." }] });
r = run([outsideHunk, "--pr", prGh]);
check("anchor gate: warns (not refuses) outside hunks", r.code === 0 && /outside the diff hunks/.test(r.err), r.err.trim().slice(0, 90));

// ---- 3b. hardening (unknown flags, fence-in-suggestion, files[] union) ------

r = run([fx.ap, "--platfrom", "github"]);
check("refuses unknown flag (typo'd --platform)", r.code !== 0 && /unknown flag/.test(r.err), r.err.trim().slice(0, 90));

const fenceFx = J("fence.json", { verdict: "comment", bottom_line: "b.", findings: [{ severity: "non-blocking", label: "note", confidence: "high", headline: "H", file: "src/widget.ts", line: 2, problem: "p, so q.", fix: "f.", suggestion: "a\n```\nb" }] });
r = run([fenceFx, "--pr", prGh]);
check("refuses code fence inside suggestion", r.code !== 0 && /code fence inside its suggestion/.test(r.err), r.err.trim().slice(0, 90));

// files[] truncated but the file IS in the diff → union must let the anchor pass
const prTrunc = J("pr-trunc.json", { platform: "github", owner: "acme", repo: "demo", number: 7, title: "t", url: "https://github.com/acme/demo/pull/7", headSha: "a".repeat(40), additions: 1, deletions: 0, files: [], diff: GH_DIFF });
const unionFx = J("union.json", { verdict: "comment", bottom_line: "b.", findings: [{ severity: "non-blocking", label: "note", confidence: "high", headline: "H", file: "src/widget.ts", line: 2, anchor_snippet: "leak = secret", problem: "p, so q.", fix: "f." }] });
r = run([unionFx, "--pr", prTrunc]);
check("anchor passes via diff-derived path union (files[] empty)", r.code === 0, r.err.trim().slice(0, 90));

r = run([fx.ap, "--pr"]);
check("refuses flag with missing value (--pr)", r.code !== 0 && /needs a value/.test(r.err), r.err.trim().slice(0, 90));

const praise3 = J("praise3.json", { verdict: "approve", bottom_line: "b.", findings: [1, 2, 3].map((i) => ({ severity: "non-blocking", label: "praise", problem: `nice thing ${i}.` })) });
r = run([praise3]);
check("warns when >2 praise (no silent caps)", r.code === 0 && /only the first 2 render/.test(r.err), r.err.trim().slice(0, 90));

const prCapped = J("pr-capped.json", { platform: "github", owner: "acme", repo: "demo", number: 7, title: "t", url: "https://github.com/acme/demo/pull/7", headSha: "a".repeat(40), additions: 9, deletions: 1, changedFiles: 250, filesTruncated: true, files: [{ path: "src/widget.ts" }], diff: GH_DIFF });
r = run([fx.ap, "--pr", prCapped]);
check("scope chip uses true changedFiles when files[] capped", r.out.includes("`250 files"), r.out.split("\n")[0]);

// ---- 4. oversize coverage gate ----------------------------------------------

const noCov = J("cov1.json", { verdict: "approve", bottom_line: "b.", findings: [] });
r = run([noCov, "--pr", prAdoOversize]);
check("oversize without coverage → warning", r.code === 0 && /no "coverage" field/.test(r.err), r.err.trim().slice(0, 90));
const withCov = J("cov2.json", { verdict: "approve", bottom_line: "b.", coverage: "Focused on X; skimmed Y.", findings: [] });
r = run([withCov, "--pr", prAdoOversize]);
check("oversize with coverage → rendered, no warning", r.code === 0 && r.out.includes("**Coverage:** Focused on X") && !/no "coverage"/.test(r.err));


// ---- preflight: produces an actionable auth report ----
{ const PF = join(dirname(fileURLToPath(import.meta.url)), "preflight.mjs");
  const r = spawnSync("node", [PF], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  check("preflight prints an auth report", /preflight — what this run needs/.test(out) && /(✓|✗|–|!)/.test(out), out.split("\n")[0]); }

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GREEN");
process.exit(failures ? 1 : 0);

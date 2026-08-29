#!/usr/bin/env node
// selftest.mjs — regression battery for the trp skill's deterministic layer.
// Run from this skill's scripts dir:  node selftest.mjs
// Network-free: exercises parsing, gate refusals, and dry-run safety with a stubbed
// token + unreachable API guard. The judgment layer (Phase 0 grounding, the package
// itself) is proven by real runs, not here.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const D = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "trp-selftest-"));
let failures = 0;
const check = (n, c, d = "") => { console.log((c ? "  OK   " : "  FAIL ") + n + (c || !d ? "" : `  [${d}]`)); if (!c) failures++; };

function run(script, args, env = {}) {
  const r = spawnSync("node", [join(D, script), ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status ?? 1, out: r.stdout || "", err: r.stderr || "" };
}

// A fake token so scripts get past the token gate without touching the real file;
// gate tests below must fail BEFORE any network call is attempted.
const ENV = { CLICKUP_TOKEN: "pk_selftest_dummy" };

// ---- fetch-ticket: ref parsing (fails at network, which proves parse ran) ----

for (const [name, ref, expectIn] of [
  ["custom id URL", "https://app.clickup.com/t/8593845/WPMP3-229", "task/WPMP3-229"],
  ["raw id URL", "https://app.clickup.com/t/868kmd1n7", "task/868kmd1n7"],
  ["bare custom id", "HAND_ITC-487", "task/HAND_ITC-487"],
]) {
  const r = run("fetch-ticket.mjs", [ref, "--out", join(tmp, "t.json")], { ...ENV, CLICKUP_TEAM_ID: "1" });
  // dummy token → ClickUp 401; the error URL proves the ref parsed to the right endpoint
  check(`fetch-ticket parses ${name}`, r.code !== 0 && r.err.includes(expectIn), r.err.trim().slice(0, 100));
}
const r0 = run("fetch-ticket.mjs", [], ENV);
check("fetch-ticket refuses missing ref", r0.code !== 0 && /usage:/.test(r0.err));

// ---- clickup-update: gates fire BEFORE any network use ----------------------

const good = join(tmp, "good.md");
writeFileSync(good, "**Summary (non-technical):**\nplain words.\n\n---\n\n**Technical detail:**\n- PR: x\n");
const attr = join(tmp, "attr.md");
writeFileSync(attr, "**Summary (non-technical):** x\n\n**Technical detail:** Generated with tooling\n");
const single = join(tmp, "single.md");
writeFileSync(single, "only one layer here\n");

let r = run("clickup-update.mjs", ["WPMP3-1", "--comment-file", attr], ENV);
check("update refuses attribution (pre-network)", r.code !== 0 && /attribution scan FAILED/.test(r.err) && !/ClickUp/.test(r.err), r.err.trim().slice(0, 100));

r = run("clickup-update.mjs", ["WPMP3-1", "--comment-file", single], ENV);
check("update refuses single-layer (pre-network)", r.code !== 0 && /two-layer check FAILED/.test(r.err), r.err.trim().slice(0, 100));

r = run("clickup-update.mjs", ["WPMP3-1"], ENV);
check("update refuses no-op invocation", r.code !== 0 && /nothing to do/.test(r.err));

// dry-run safety: with a good body + dummy token, the only network call is the initial
// GET resolve — it 401s, proving no write path was reached before task resolution.
r = run("clickup-update.mjs", ["WPMP3-1", "--comment-file", good], ENV);
check("dry-run reaches only the resolve GET (401, no write)", r.code !== 0 && /ClickUp GET 401/.test(r.err), r.err.trim().slice(0, 100));

// static guard: PUT/POST appear only after the dry-run exit
const src = spawnSync("cat", [join(D, "clickup-update.mjs")], { encoding: "utf8" }).stdout;
const dryExit = src.indexOf("process.exit(0)");
const firstPut = src.indexOf('req("PUT"');
const firstPost = src.indexOf('req("POST"');
check("write verbs only after the dry-run exit", dryExit > 0 && firstPut > dryExit && firstPost > dryExit);

// attribution regex parity with gates.md (the mechanical scan and the doc agree)
check("attribution scan covers model names + robot emoji", /opus|sonnet|haiku/.test(src) && src.includes("1F916"));

// unknown-flag refusals (typo safety: --liv must NOT silently dry-run)
r = run("clickup-update.mjs", ["WPMP3-1", "--comment-file", good, "--liv"], ENV);
check("update refuses typo'd --liv", r.code !== 0 && /unknown flag/.test(r.err), r.err.trim().slice(0, 90));
r = run("fetch-ticket.mjs", ["WPMP3-1", "--otu", "x.json"], ENV);
check("fetch-ticket refuses typo'd flag", r.code !== 0 && /unknown flag/.test(r.err), r.err.trim().slice(0, 90));

r = run("clickup-update.mjs", ["WPMP3-1", "--comment-file", good, "--status"], ENV);
check("update refuses --status with missing value", r.code !== 0 && /needs a value/.test(r.err), r.err.trim().slice(0, 90));
r = run("fetch-ticket.mjs", ["WPMP3-1", "--out"], ENV);
check("fetch-ticket refuses --out with missing value", r.code !== 0 && /needs a value/.test(r.err), r.err.trim().slice(0, 90));
r = run("clickup-update.mjs", ["WPMP3-1", "--comment-file", join(tmp, "cop.md")], ENV, writeFileSync(join(tmp, "cop.md"), "**Summary (non-technical):** x\n\n**Technical detail:** reviewed by Copilot\n"));
check("update refuses other-vendor attribution (copilot)", r.code !== 0 && /attribution scan FAILED/.test(r.err), r.err.trim().slice(0, 90));


// ---- preflight: produces an actionable auth report ----
{ const r = run("preflight.mjs", []);
  check("preflight prints an auth report", /preflight — what this run needs/.test(r.out) && /(✓|✗|–|!)/.test(r.out), (r.out||r.err||"").split("\n")[0]); }

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GREEN");
process.exit(failures ? 1 : 0);

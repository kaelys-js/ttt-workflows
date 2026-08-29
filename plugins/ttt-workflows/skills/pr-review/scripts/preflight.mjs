#!/usr/bin/env node
// preflight.mjs — check the auth this skill needs and tell the operator exactly what to
// provide and where. Run it first; if it exits non-zero, relay the ✗ lines to the operator
// and wait for them to provide the missing auth before running the review.
//
// Usage:  node preflight.mjs [--platform github|ado]   (platform inferred from the PR URL)

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const opt = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : ""; };
const platform = opt("--platform");
const cmdOk = (cmd, args) => { try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch { return false; } };

const rows = []; let missing = 0;
const need = (ok, label, detail, how) => { rows.push({ ok, label, detail, how }); if (!ok) missing++; };
const info = (ok, label, detail, how) => rows.push({ ok, label, detail, how, optional: true });

need(cmdOk("node", ["--version"]), "node", "runs the skill scripts", "install Node 18+ — https://nodejs.org");

const ghOk = cmdOk("gh", ["auth", "status"]);
const azOk = cmdOk("az", ["account", "show"]);
if (platform === "github") need(ghOk, "gh (GitHub auth)", "fetch the PR diff + threads", "run:  gh auth login");
else if (platform === "ado") need(azOk, "az (Azure DevOps login)", "mint the ADO bearer", "run:  az login --tenant <your-tenant>   (or set AZURE_CONFIG_DIR to a logged-in context)");
else {
  need(ghOk || azOk, "gh OR az", "GitHub PRs need gh; Azure DevOps PRs need az", "gh auth login   (GitHub)   |   az login --tenant <tenant>   (Azure DevOps)");
  if (ghOk) rows.push({ ok: true, label: "gh (GitHub)", detail: "authenticated" });
  if (azOk) rows.push({ ok: true, label: "az (Azure DevOps)", detail: "authenticated" });
}

const tokenFile = process.env.CLICKUP_TOKEN_FILE || `${homedir()}/.config/ttt/clickup.token`;
info(existsSync(tokenFile), "ClickUp token (optional)", `only for ticket-linked PRs — read from ${tokenFile}`,
     `put your ClickUp pk_ token in ${tokenFile}  (mkdir -p its dir first), or set CLICKUP_TOKEN_FILE=<path>`);

console.log("pr-review preflight — what this run needs:\n");
for (const r of rows) {
  console.log(`  ${r.ok ? "✓" : r.optional ? "–" : "✗"} ${r.label}${r.detail ? "  (" + r.detail + ")" : ""}`);
  if (!r.ok && r.how) console.log(`      → ${r.how}`);
}
console.log();
if (missing) { console.error(`Missing ${missing} required item(s). Provide them, then re-run.`); process.exit(1); }
console.log("All required auth present.");

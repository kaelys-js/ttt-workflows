#!/usr/bin/env node
// preflight.mjs — check the auth this skill needs and tell the operator exactly what to
// provide and where. Run it first; if it exits non-zero, relay the ✗ lines to the operator
// and wait for them to provide the missing auth before fetching the ticket.
//
// Usage:  node preflight.mjs [--platform github|ado]

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const opt = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : ""; };
const platform = opt("--platform");   // github | ado | "" (check either)
const cmdOk = (cmd, args) => { try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch { return false; } };

const rows = []; let missing = 0;
const need = (ok, label, detail, how) => { rows.push({ ok, label, detail, how }); if (!ok) missing++; };

need(cmdOk("node", ["--version"]), "node", "runs the skill scripts", "install Node 18+ — https://nodejs.org");

// ClickUp token — hard-required: the whole workflow reads + updates a ticket.
const tokenFile = process.env.CLICKUP_TOKEN_FILE || `${homedir()}/.config/ttt/clickup.token`;
need(existsSync(tokenFile), "ClickUp token", `reads/updates the ticket — read from ${tokenFile}`,
     `put your ClickUp pk_ token in ${tokenFile}  (run: mkdir -p "$(dirname ${tokenFile})" first), or set CLICKUP_TOKEN_FILE=<path>`);

// Git host — GitHub needs gh, Azure DevOps needs az. Detected from the repo at run time;
// preflight just confirms the right tool (or either) is authenticated.
const ghOk = cmdOk("gh", ["auth", "status"]);
const azOk = cmdOk("az", ["account", "show"]);
if (platform === "github") need(ghOk, "gh (GitHub auth)", "push the branch + open the PR", "run:  gh auth login");
else if (platform === "ado") need(azOk, "az (Azure DevOps login)", "push the branch + open the PR", "run:  az login --tenant <tenant>");
else {
  need(ghOk || azOk, "gh or az", "GitHub repos need gh; Azure DevOps repos need az", "gh auth login   (GitHub)   |   az login --tenant <tenant>   (Azure DevOps)");
  if (ghOk) rows.push({ ok: true, label: "gh (GitHub)", detail: "authenticated" });
  if (azOk) rows.push({ ok: true, label: "az (Azure DevOps)", detail: "authenticated" });
}

console.log("trp preflight — what this run needs:\n");
for (const r of rows) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}${r.detail ? "  (" + r.detail + ")" : ""}`);
  if (!r.ok && r.how) console.log(`      → ${r.how}`);
}
console.log();
if (missing) { console.error(`Missing ${missing} required item(s). Provide them, then re-run.`); process.exit(1); }
console.log("All required auth present.");

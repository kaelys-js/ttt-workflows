#!/usr/bin/env node
// preflight.mjs — check the tools + auth this skill needs and tell the operator exactly what
// to provide and where. Run it first; if it exits non-zero, relay the ✗ lines to the operator
// and wait for them to provide what's missing before running the audit.
//
// Usage:  node preflight.mjs [--layers code,azure,entra,ado]   (default: all)

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const opt = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : ""; };
const layers = (opt("--layers") || "code,azure,entra,ado").split(",").map((s) => s.trim());
const cmdOk = (cmd, args) => { try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch { return false; } };

const rows = []; let missing = 0;
const need = (ok, label, detail, how) => { rows.push({ ok, label, detail, how }); if (!ok) missing++; };
const warn = (ok, label, detail, how) => rows.push({ ok, label, detail, how, soft: true });

need(cmdOk("node", ["--version"]), "node", "runs the skill scripts", "install Node 18+ — https://nodejs.org");
need(cmdOk("git", ["--version"]), "git", "clone/read the target repo", "install git");

if (layers.includes("code")) {
  // scanners — a missing one narrows the source layer; warn (don't hard-fail the whole run).
  for (const [cmd, why] of [["semgrep", "SAST"], ["gitleaks", "secret scan"], ["checkov", "IaC static"], ["osv-scanner", "dependency CVEs"], ["trivy", "container/deps"]])
    warn(cmdOk(cmd, ["--version"]), `${cmd} (${why})`, "source-layer scanner", `install: pipx install ${cmd}  (or: brew install ${cmd})`);
  warn(cmdOk("gh", ["auth", "status"]), "gh (GitHub auth)", "only for GitHub repo/PR targets", "run:  gh auth login");
  const spd = process.env.SECURITY_POCS_DIR;
  warn(!!spd && existsSync(spd), "security-pocs toolkit ($SECURITY_POCS_DIR)", "source deep-read + poc/remediate modes", "set SECURITY_POCS_DIR to your security-pocs checkout (not needed for the live-cloud probes)");
}

// az login covers all three live layers (ARM + Graph + ADO bearer).
const azOk = cmdOk("az", ["account", "show"]);
if (layers.some((l) => ["azure", "entra", "ado"].includes(l)))
  need(azOk, "az (Azure login)", "live probes: ARM (azure) + Graph (entra) + pipeline bearer (ado)",
       "run:  az login --tenant <your-tenant>   (or set AZURE_CONFIG_DIR to a logged-in context). Reader on the subscription + Directory app-read for the Entra probe.");

console.log("sec-audit preflight — what this run needs:\n");
for (const r of rows) {
  const mark = r.ok ? "✓" : r.soft ? "!" : "✗";
  console.log(`  ${mark} ${r.label}${r.detail ? "  (" + r.detail + ")" : ""}`);
  if (!r.ok && r.how) console.log(`      → ${r.how}`);
}
console.log();
const softMissing = rows.filter((r) => r.soft && !r.ok).length;
if (softMissing) console.log(`${softMissing} scanner(s)/optional auth missing (marked !): those checks are skipped and reported as NOT covered (SFP8), not silently dropped.`);
if (missing) { console.error(`Missing ${missing} REQUIRED item(s) (✗). Provide them, then re-run.`); process.exit(1); }
console.log("All required tools present." + (softMissing ? " Install the ! items for full coverage." : ""));

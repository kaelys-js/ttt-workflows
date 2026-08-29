# sec-audit

Security audit across three layers — your code, your live Azure, and your identity/CI — reconciled
into one report. Read-only until you approve a change.

**Point it at something and say what to do:**

```
sweep https://github.com/org/repo                  # full audit
review "USER can PATCH role=ADMIN" in ./oms-be      # score one finding (CVSS + CWE)
poc for SEC-01                                       # prove one is real
```

**Modes:** `sweep` (find everything) · `review` (score one) · `poc` (prove one) · `remediate` (fix as a PR).
**Point at:** a repo or PR URL (GitHub / Azure DevOps), a local repo, or a file/folder.

Live layers need an `az` login; source scanners are semgrep/gitleaks/checkov/osv/trivy. Checked on start.

_Say **"options"** for the layers, coverage flags, and the full run._

<details>
<summary>Options — full reference</summary>

**A `sweep` checks three layers** (most scanners read only code; half the problems live in the cloud):
- **code** (git) — auth logic, injection, mass-assignment, upload limits, IaC network/TLS, dep CVEs.
- **azure** (live ARM) — public DBs, weak TLS, open Key Vaults, ACR admin, Defender off, missing diagnostics.
- **entra** (live Graph) — app-registration reply-URLs, implicit flow, long-lived / shared credentials.
- **ado** (live pipeline) — cleartext secrets in variable groups + build definitions.

**Coverage vs a prior audit** (optional — hand `sweep` your prior findings, get a found/remediated/gap grid):
- `--known <list.csv|json>` — the prior findings (`id,title,severity`).
- `--map <map.json>` — `{ "<your-id>": "<regex>" }`, attributes a finding to your ID by its evidence.
- `--remediated <id,id>` — IDs you've verified fixed live.

**Auth:** `node`, `git` (required). Live layers: `az login` — Reader + Directory app-read (Graph) +
ADO bearer; pick a context with `AZURE_CONFIG_DIR`. Full code layer: the five scanners — a missing
one is reported as *not covered*, never silently skipped.

**Guarantees:** read-only until you approve · live probes are GET-only · multi-agent sweeps only on
your per-run opt-in · no AI attribution · always states what it did **not** cover.

**Scripting:**
```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"
S=$D/sec-audit/scripts ; DIR=./audit-out
node $S/resolve-target.mjs "<repo|pr|path>" --out $DIR/target.json
AZURE_CONFIG_DIR=<ctx> node $S/probe-azure.mjs --rg-prefix <p> --out $DIR/azure-findings.json
AZURE_CONFIG_DIR=<ctx> node $S/probe-entra.mjs --filter <p1,p2> --out $DIR/entra-findings.json
AZURE_CONFIG_DIR=<ctx> node $S/probe-ado.mjs --org <o> --project <p> --out $DIR/ado-findings.json
node $S/collect-findings.mjs --merge-results <run>.json... --out $DIR/source-findings.json
node $S/aggregate.mjs --dir $DIR --known <prior.csv> [--map <map.json>] [--remediated <ids>] --out $DIR/coverage.json
node $S/report.mjs --dir $DIR --title "<Target>" --out $DIR/report.html
```
</details>

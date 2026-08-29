# sec-audit

Audits your code, live Azure, and identity/CI in one read-only pass, and returns one report.

**→ Point me at a repo, PR, or folder** — then say `sweep`, `review`, `poc`, or `remediate`.

Type **`options`** for the three layers, coverage grids, and flags.

<details>
<summary><code>options</code></summary>

**Modes:** `sweep` (find everything) · `review` (score one finding, CVSS + CWE) · `poc` (prove one is real) · `remediate` (fix as a PR, never merged).

**Three layers a sweep runs** — most scanners read only code; half the problems live in the cloud:
- **code** — auth logic, injection, mass-assignment, upload limits, IaC network/TLS, dep CVEs.
- **live Azure** — public DBs, weak TLS, open Key Vaults, ACR admin, Defender off, missing diagnostics.
- **live Entra + CI** — app-registration login flaws, long-lived secrets, cleartext pipeline tokens.

**Coverage vs a prior audit** (optional): pass `--known <list>` and get a found/remediated/gap grid. `--map` attributes to your IDs; `--remediated` marks ones fixed live.

**Auth:** `node`, `git`. Live layers need `az login`. Code scanners: semgrep, gitleaks, checkov, osv-scanner, trivy — a missing one is reported, never silently skipped.

**Never:** changes anything until you approve. Live probes are GET-only. No AI attribution. Always states what it did *not* cover.

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

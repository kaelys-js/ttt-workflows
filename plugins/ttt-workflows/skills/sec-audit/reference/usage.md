# 🛡 sec-audit

**A security audit that checks three places at once** — your code, your live Azure, and your
identity + CI setup — and hands you one report. Read-only; changes nothing until you say so.

**Bring →**  a target + a mode
**Get →**  a scored findings report · plus a coverage grid, if you hand it a prior finding list

### Ready check
_Runs on start. If something's missing it names it and says where to put it._

| | needs | for |
|---|---|---|
| **required** | `node` · `git` | read the target |
| for live layers | `az` login (Reader + Graph + ADO bearer) | Azure / Entra / pipeline probes |
| for full code layer | `semgrep` `gitleaks` `checkov` `osv-scanner` `trivy` | source scanners (missing = reported as not-covered, never silently skipped) |

### ▶ Start
**Name a target and a mode** — e.g. *"sweep this repo"* with a URL, or *"review PR #28"*.

**Target:** a GH/ADO repo · a PR · a local repo · a file or folder.
**Mode:** `sweep` (find everything) · `review` (score one thing) · `poc` (prove it's real) · `remediate` (write the fix as a PR, never merged).

---

<details>
<summary><b>Why three layers</b> — and what each one catches</summary>

Most scanners only read code. Half the real problems never appear in git — they live in the
running cloud. This checks all three:

- 🧩 **Your code** — auth logic, injection, mass-assignment, upload limits, IaC network/TLS, old deps.
- ☁️ **Your live Azure** — public databases, weak TLS, open Key Vaults, admin registries, missing monitoring.
- 🔑 **Your identity + CI** — app-registration login flaws, long-lived secrets, plaintext pipeline tokens.
</details>

<details>
<summary><b>Guarantees + the full run</b></summary>

**Read-only until you approve.** It won't stand up infra, write your repo, open a PR, or
touch a ticket without your go-ahead. No AI attribution. Always states what it did *not*
cover, so "all clear" never hides a gap.

Probes emit **neutral finding classes** (`PUBLIC-DB`, `IMPLICIT-FLOW`, …); matching them to a
client's prior finding IDs happens only in the passed-in `--known` + `--map` files, never in
skill code.

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
S=$D/sec-audit/scripts ; DIR=./audit-out
node $S/resolve-target.mjs "<repo|pr|path>" --out $DIR/target.json                 # lock target + SHA
#   layer 1 (code): drive workflows/{sfp-deep-read,expansion-sweep}.js + find-findings.sh
AZURE_CONFIG_DIR=<ctx> node $S/probe-azure.mjs --rg-prefix <p> --out $DIR/azure-findings.json   # layer 2
AZURE_CONFIG_DIR=<ctx> node $S/probe-entra.mjs --filter <p1,p2> --out $DIR/entra-findings.json  # layer 3
AZURE_CONFIG_DIR=<ctx> node $S/probe-ado.mjs --org <o> --project <p> --out $DIR/ado-findings.json
node $S/collect-findings.mjs --merge-results <run>.json... --out $DIR/source-findings.json      # normalize
node $S/aggregate.mjs --dir $DIR --known <prior.csv> [--map <map.json>] --out $DIR/coverage.json
node $S/report.mjs --dir $DIR --title "<Target>" --out $DIR/report.html                          # one report
```
</details>

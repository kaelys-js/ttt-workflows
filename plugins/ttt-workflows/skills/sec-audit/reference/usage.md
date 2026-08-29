# sec-audit

Security audit of any target across three layers — source code, live Azure, and identity/CI —
reconciled into one report. Read-only until you approve a change.

**Invoke:** name a TARGET and a MODE. e.g. `sweep https://github.com/org/repo` · `review PR #28`

## Targets — what to point it at

| target | example | scope |
|---|---|---|
| repo URL | `github.com/org/repo` · `dev.azure.com/org/proj/_git/repo` | read-only clone at HEAD |
| PR URL | `github.com/…/pull/N` · `dev.azure.com/…/pullrequest/N` | the PR diff |
| local path | `./my-repo` · `./src/controllers` · `./config.ts` | a repo, folder, or one file |

## Modes — what to do

| mode | does | invoke | output |
|---|---|---|---|
| `sweep` | full audit across all three layers | `sweep <target>` | findings report (+ coverage grid if you pass a prior list) |
| `review` | score one finding — CVSS 4.0 + CWE | `review "<finding>" in <target>` | private GHSA-shaped advisory |
| `poc` | prove a finding with a throwaway PoC | `poc for SEC-nn` | `run-poc.sh` that tears itself down |
| `remediate` | write the fix as a PR (never merged) | `remediate SEC-nn` | fix branch + open PR |

## What a `sweep` checks — the three layers

Most scanners read only code. Half the real problems live in the running cloud, not git.

| layer | source | catches |
|---|---|---|
| **code** | git | auth logic, injection, mass-assignment, upload limits, IaC network/TLS, dependency CVEs |
| **azure** | live ARM | public DBs, weak TLS, open Key Vaults, ACR admin, Defender off, missing diagnostics, PG params |
| **entra** | live Graph | app-registration reply-URLs, implicit/hybrid flow, long-lived / shared credentials |
| **ado** | live pipeline | cleartext secrets in variable groups + build definitions |

## Coverage against a prior audit — optional

Hand `sweep` a prior finding list and it returns a grid: each prior finding marked **found**,
**remediated**, or **gap**. All three inputs are your files — no client detail lives in the skill.

| flag | is |
|---|---|
| `--known <list.csv\|json>` | the prior findings (columns `id,title,severity`) |
| `--map <map.json>` | `{ "<your-id>": "<regex>" }` — attributes a finding to your ID by matching its evidence |
| `--remediated <id,id>` | IDs you've verified fixed in the live estate |

## Auth — checked on start; preflight names anything missing and where to put it

| | needs |
|---|---|
| required | `node`, `git` |
| live layers | `az login` — Reader on the subscription + Directory app-read (Graph) + ADO bearer. Pick a context with `AZURE_CONFIG_DIR=<path>`. |
| full code layer | `semgrep` `gitleaks` `checkov` `osv-scanner` `trivy` — a missing one is reported as *not covered*, never silently skipped |

## Guarantees

Read-only until you approve. Live probes are GET-only (statically enforced). Multi-agent sweeps
run only on your explicit per-run opt-in. No AI attribution. Always states what it did **not**
cover — never a silent all-clear.

## Examples

```
sweep https://dev.azure.com/org/proj/_git/repo
sweep ./oms-be --known prior-audit.csv --map map.json --remediated SEC-37,SEC-54
review "the /users PATCH lets a USER set role=ADMIN" in ./oms-be
poc for SEC-01
```

<details>
<summary>Run the pipeline yourself (scripting)</summary>

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
S=$D/sec-audit/scripts ; DIR=./audit-out
node $S/resolve-target.mjs "<repo|pr|path>" --out $DIR/target.json
#   code layer: drive workflows/{sfp-deep-read,expansion-sweep}.js + find-findings.sh
AZURE_CONFIG_DIR=<ctx> node $S/probe-azure.mjs --rg-prefix <p> --out $DIR/azure-findings.json
AZURE_CONFIG_DIR=<ctx> node $S/probe-entra.mjs --filter <p1,p2> --out $DIR/entra-findings.json
AZURE_CONFIG_DIR=<ctx> node $S/probe-ado.mjs --org <o> --project <p> --out $DIR/ado-findings.json
node $S/collect-findings.mjs --merge-results <run>.json... --out $DIR/source-findings.json
node $S/aggregate.mjs --dir $DIR --known <prior.csv> [--map <map.json>] [--remediated <ids>] --out $DIR/coverage.json
node $S/report.mjs --dir $DIR --title "<Target>" --out $DIR/report.html
```
</details>

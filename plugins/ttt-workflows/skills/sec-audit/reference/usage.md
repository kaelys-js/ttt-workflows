# sec-audit — how to use it

**TL;DR** — Point it at a repo, a PR, or your live Azure, and it hunts security bugs three
ways at once: in the code, in what's actually deployed, and in your identity + CI setup. You
get one report back. It never changes anything until you say so.

**You give it:** a target + a mode.
**You get back:** a scored findings report — plus, if you hand it a prior finding list, a grid
showing which of those are still open, already fixed, or newly found.

> **On start it runs a quick auth check.** If anything's missing it tells you exactly what to provide and where to put it (a file path + env var, or a `gh`/`az` login) before it does anything.

---

## Why three layers

Most scanners only read your code. But half the real problems never appear in git — a
database left open to the internet, an app-registration with a login flaw, a secret sitting
in plaintext in your pipeline. Those live only in the running cloud. This checks all three:

- 🧩 **Your code** — auth logic, injection, mass-assignment, upload limits, IaC network/TLS, old dependencies.
- ☁️ **Your live Azure** — public databases, weak TLS, open Key Vaults, admin registries, missing monitoring.
- 🔑 **Your identity + CI** — app-registration login flaws, long-lived secrets, plaintext pipeline tokens.

## Point it at anything

- a **GitHub or Azure DevOps repo** URL
- a specific **pull request** URL
- a **local repo** on disk
- a single **file or folder**

## Pick what you want it to do

- **`sweep`** — the full audit. Find everything.
- **`review`** — take one suspicious thing, score it properly (CVSS + CWE).
- **`poc`** — prove a finding is real with a throwaway test that cleans up after itself.
- **`remediate`** — write the fix, on its own branch, as a PR it opens but never merges.

## What it will never do without you

It's read-only until you say otherwise. It won't stand up test infrastructure, write to your
repo, open a PR, or touch a ticket without your go-ahead. It won't put an AI credit on
anything. And it always tells you what it did *not* cover, so "all clear" never hides a gap.

## To start

Just name a **target** and a **mode** — e.g. *"sweep this repo"* with a URL, or *"review PR
#28"*. It confirms scope, then runs.

<details>
<summary>The exact commands (for scripting a run yourself)</summary>

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # works as plugin OR ~/.claude/skills symlink
S=$D/sec-audit/scripts ; DIR=./audit-out
node $S/resolve-target.mjs "<repo|pr|path>" --out $DIR/target.json   # 1. lock the target + SHA
#   layer 1 (code): drive workflows/{sfp-deep-read,expansion-sweep}.js + find-findings.sh
AZURE_CONFIG_DIR=<ctx> node $S/probe-azure.mjs --rg-prefix <p> --out $DIR/azure-findings.json   # layer 2
AZURE_CONFIG_DIR=<ctx> node $S/probe-entra.mjs --filter <p1,p2> --out $DIR/entra-findings.json  # layer 3
AZURE_CONFIG_DIR=<ctx> node $S/probe-ado.mjs --org <o> --project <p> --out $DIR/ado-findings.json
node $S/collect-findings.mjs --merge-results <run>.json... --out $DIR/source-findings.json      # normalize
node $S/aggregate.mjs --dir $DIR --known <prior.csv> [--map <map.json>] --out $DIR/coverage.json
node $S/report.mjs --dir $DIR --title "<Target>" --out $DIR/report.html                          # one report
```

Every probe is read-only (GET-only, statically enforced). Findings carry neutral class
names; matching them to a client's prior finding IDs happens only in the passed-in
`--known` + `--map` files, never in the skill's code.
</details>

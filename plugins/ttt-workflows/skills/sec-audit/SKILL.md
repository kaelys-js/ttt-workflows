---
name: sec-audit
description: Runs a professional security audit end to end against any target — a GitHub or Azure DevOps repo, a specific GH/ADO pull request, a local repo, or a single file/folder. Routes to four modes (sweep, review, poc, remediate) that sequence the Security Review, Security POC, Systematic Finding, and Systematic Remediation protocols, drive the security-pocs workflows, and produce scored findings, private advisories, reproducible PoCs, GAP-LIST/executive-brief reports, and client fix-PRs. Grounded in PTES, OWASP WSTG, NIST SP 800-115, CVSS 4.0, and coordinated disclosure. Use when the user says "security audit", "SFP", "SRP", "security review", "find vulnerabilities", "build a PoC", "remediate SEC-nn", or points at a repo/PR/path to audit.
---

# sec-audit

Run a professional security audit end to end against any target. `security-pocs/AGENTS.md`
(at `~/work/personal/.todo/trp-srp-sfp/security-pocs/`) is THE LAW — read it in FULL before
any mode; this skill sequences it and never overrides it. Six hard human-gates are never
crossed autonomously (below).

## When to invoke

The user says "security audit", "SFP", "SRP", "security review", "find vulnerabilities",
"build a PoC", "remediate SEC-nn" — or points at a target to audit. Invoked without a
target or a mode, ask for both; do not guess.

## On invocation: open the picker

If the operator already named a target + intent, skip the picker and proceed. Otherwise open
the **Ask** picker: call AskUserQuestion with the four paths defined in `reference/usage.md`
(Run a full check-up · Look into one thing · Show me how this works · Options), then route:

- **Run a full check-up** → `sweep`. **Look into one thing** → `review` (then offer `poc` /
  `remediate`). For either, run `scripts/preflight.mjs`; if it exits non-zero, relay its lines
  verbatim (what's missing + where) and WAIT. Then confirm target + mode and run.
- **Show me how this works** → present the "How it works" section of `reference/usage.md`.
- **Options** → present the "Options" section of `reference/usage.md`.

Never start a run until preflight is clean.

## Targets (any of four)

Resolve first, always, with `scripts/resolve-target.mjs`:

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/sec-audit/scripts/resolve-target.mjs "<TARGET>" --out target.json
```

| Target | Resolves to |
|---|---|
| GitHub / ADO **repo URL** | read-only shallow clone at HEAD (SHA recorded) |
| GH / ADO **PR URL** | pr-review's `fetch-pr.mjs`; scope = the PR diff |
| **local repo** path | read in place at HEAD |
| **file / folder** path | scoped scan root |

Everything normalizes to `{kind, root, sha, platform, scope, provenance}`. Findings anchor
at the recorded `sha`; `file:line` cites are true at that SHA (SR3).

## The three discovery layers (a complete audit runs all three)

A real audit finding lives in one of three places, and only one layer reaches each:

1. **Source / IaC** (git) — code + declared infra. The `sweep` mode's `sfp-deep-read.js`
   workflow + the scanners (`find-findings.sh`: gitleaks/osv/checkov/trivy/semgrep) find
   these (auth logic, mass-assignment, CORS, multer, bicep network/TLS, dep debt).
2. **Live Azure running-state** (ARM) — firewall rules, TLS floors, KV network/purge,
   ACR admin, Defender tier, diagnostics, PG params. `scripts/probe-azure.mjs` (read-only).
3. **Live Entra + ADO** (Graph / pipeline) — app-registration reply-URLs, implicit/hybrid
   flow, long-lived/shared creds (`scripts/probe-entra.mjs`); cleartext pipeline secrets in
   variable groups + build definitions (`scripts/probe-ado.mjs`). Both read-only.

Point-at-anything full run (any operator, any repos/tenant):

```bash
# layer 1 — source/IaC (per app + IaC module; multi-agent opt-in)
node scripts/resolve-target.mjs <repo|path> --out target.json
#   → drive workflows/sfp-deep-read.js with the app/iac inventory (reference/sweep.md)
#   → scripts/find-findings.sh --evidence=<repo>   (deps/secrets/IaC-static)
# expansion — hunt NET-NEW beyond a known list (multi-agent opt-in) → workflows/expansion-sweep.js
# layer 2 — live Azure (read-only ARM)
AZURE_CONFIG_DIR=<ctx> node scripts/probe-azure.mjs --rg-prefix <p> --out DIR/azure-findings.json
# layer 3 — live Entra + ADO (read-only Graph / pipeline)
AZURE_CONFIG_DIR=<ctx> node scripts/probe-entra.mjs --filter <p1,p2> --out DIR/entra-findings.json
AZURE_CONFIG_DIR=<ctx> node scripts/probe-ado.mjs --org <org> --project <proj> --out DIR/ado-findings.json
# reconcile + render
node scripts/aggregate.mjs --dir DIR --known <known.csv|json> [--map <map.json>] [--remediated <ids>] --out DIR/coverage.json
node scripts/report.mjs   --dir DIR --title "<Target> — Security Audit" --out DIR/report.html
```

Probes emit **neutral finding classes** (PUBLIC-DB, IMPLICIT-FLOW, CLEARTEXT-PIPELINE-SECRET,
…); any client-specific cross-reference to a prior finding list lives entirely in the
passed-in `--known` + `--map` files, never in skill code. This is the "audit firm in a box":
source + running-state + identity, reconciled into one disclosure-standard report.

## Modes (name one)

Read the matching reference in full, then run its sequence.

- **`sweep`** — find new `SEC-nn` (SFP1-12). `reference/sweep.md`. Drives
  `find-findings.sh` + `workflows/sfp-triage.js` + `sfp-deep-read.js` (multi-agent — needs
  your explicit opt-in per run) + the two live probes above. Output: candidates, coverage
  claim, POC stubs, rules.
- **`review`** — assess → scored private finding (SR1-12). `reference/review.md`. Output:
  CVSS 4.0 + CWE finding record, private GHSA-shaped advisory.
- **`poc`** — prove a finding (SP1-9). `reference/poc.md`. Stamps `templates/security-poc`,
  drives `workflows/sfp-build-poc.js`. Output: `run-poc.sh` PoC, disclosure-standard README.
- **`remediate`** — fix on the client repo (SRP1-32). `reference/remediate.md`. Drives
  `workflows/srp-fix-finding.js`. Output: client-style fix PR (opened, never merged).

Every mode is framed against professional methodology (PTES / OWASP WSTG / NIST SP 800-115
/ MITRE, threat modeling, DAST, CWE + compliance reporting) — `reference/methodology.md`.

## Workflow

```
- [ ] 0. Read security-pocs/AGENTS.md fully + reference/gates.md + the mode's reference
- [ ] 1. Resolve the target → target.json (read-only, provenance stamped)
- [ ] 2. Threat-model the Tier-1 surfaces (methodology.md) before deep analysis
- [ ] 3. Run the mode sequence; drive the repo's scripts/workflows, don't reimplement
- [ ] 4. Produce the deliverables to the disclosure standard; advisory-lint.mjs must pass
- [ ] 5. Stop at every hard human-gate; nothing public/throwaway/client-writing without approval
- [ ] 6. Honest coverage claim (coverage-claim.mjs); state what was NOT covered (SFP8)
```

## Hard rules

- **The six hard human-gates (gates.md), never crossed autonomously:** private-first (SR1),
  throwaway-only PoCs (SP5), mandatory teardown (SP2), never push to a client default
  (SRP1), never auto-merge (SRP10), provenance verified before any run (SP1).
- **Read-only until approval.** Resolve + review + sweep-analysis are read-only. Anything
  that stands up infra, writes a client repo, opens a PR, or touches ClickUp is gated.
- **Evidence tiers explicit (SR3-5).** Confirmed-in-source outranks deployment-dependent;
  never present the second as the first. A visible stand-down beats a confident bug.
- **No AI attribution** in any advisory / PR / commit / ClickUp comment;
  `advisory-lint.mjs` refuses a contaminated body.
- **Honest coverage (SFP8).** Every sweep states what was NOT covered; un-triaged carries
  a reason. `coverage-claim.mjs` validates the shape.
- **Multi-agent opt-in.** `sweep`/`poc`/`remediate` drive Workflow-tool fan-outs — only on
  the operator's explicit per-run opt-in.

## Files in this skill

- `scripts/resolve-target.mjs` · `scripts/advisory-lint.mjs` · `scripts/coverage-claim.mjs`
  · `scripts/probe-azure.mjs` · `scripts/probe-entra.mjs` · `scripts/probe-ado.mjs`
  · `scripts/report.mjs` · `scripts/aggregate.mjs` · `scripts/collect-findings.mjs` · `scripts/preflight.mjs` · `scripts/selftest.mjs`
- `reference/{usage,review,poc,sweep,remediate,methodology,gates}.md`
- `workflows/expansion-sweep.js` — multi-agent net-new hunt (surfaces + known-list via args)

## Constraints

- Depends on `node`, `git`, `gh`/`az`, the SFP/SRP toolchain (semgrep, gitleaks, checkov,
  osv-scanner, trivy — sweep.md), and the ClickUp token file (same as pr-review/trp).
- `target.json` and working drafts live in a scratch dir, never in the audited repo.
- The repo already has `check-chains.sh` + `bundle-schema-check.py` — use them; this skill
  only adds the advisory-lint and coverage-claim gates it lacked.


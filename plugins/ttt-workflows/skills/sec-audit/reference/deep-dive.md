# sec-audit — deep dive

Everything the skill does, end to end. Read top-to-bottom or jump in. For the security
protocols in full see the security-pocs `AGENTS.md`; for methodology framing see
`methodology.md`; for the six hard gates see `gates.md`.

**Contents**
1. [Why three layers](#1-why-three-layers)
2. [Resolving the target](#2-resolving-the-target)
3. [Layer 1 — code & IaC](#3-layer-1--code--iac)
4. [Layer 2 — live Azure (ARM)](#4-layer-2--live-azure-arm)
5. [Layer 3 — live Entra + CI](#5-layer-3--live-entra--ci)
6. [Reconciling into one report](#6-reconciling-into-one-report)
7. [Coverage against a prior audit](#7-coverage-against-a-prior-audit)
8. [The four modes](#8-the-four-modes)
9. [Scoring: CVSS, CWE, evidence tiers](#9-scoring-cvss-cwe-evidence-tiers)
10. [The six hard gates](#10-the-six-hard-gates)
11. [Files & data](#11-files--data)

---

## 1. Why three layers

A real finding lives in one of three places, and only one kind of check reaches each. Source
scanners see the code and stop there — but a database open to the internet, an app-registration
with a login flaw, or a token sitting in a pipeline variable never appear in git. A complete
audit runs all three layers and reconciles them. That's the whole design.

## 2. Resolving the target

`resolve-target.mjs <target>` normalizes any of four inputs into one record with a pinned SHA,
so every `file:line` citation is true at a known commit:

| input | becomes |
|---|---|
| GitHub / ADO repo URL | a read-only shallow clone at HEAD |
| PR URL | the PR diff (scope = changed files), via pr-review's fetcher |
| local repo | read in place at HEAD |
| file / folder | a scoped scan root |

It also stamps provenance (source, SHA, scope, time) — the SP1 gate: you confirm you're pointed
at the right, authorized target before anything runs.

## 3. Layer 1 — code & IaC

Two passes over the source:

- **Scanners** (`find-findings.sh`) — `gitleaks` (secrets), `osv-scanner` (dependency CVEs),
  `checkov`/`trivy` (IaC + container static), `semgrep` (SAST). These find *shapes*.
- **Semantic deep-read** (`workflows/sfp-deep-read.js`, multi-agent, opt-in) — reads the actual
  code and traces attacker-controlled input to a sink. This is what catches logic flaws a
  pattern can't: a self-elevation via mass-assignment, a rate-limiter guarded on a string that
  never matches, a sanitiser applied at the wrong layer. `workflows/expansion-sweep.js` hunts
  *net-new* findings beyond any known list.

Findings are normalized by `collect-findings.mjs` into `source-findings.json`.

## 4. Layer 2 — live Azure (ARM)

`probe-azure.mjs` makes **read-only** ARM calls (`list`/`show` only — statically enforced, no
create/update/delete/set verb exists in the file) and flags running-state problems:

| check | flags |
|---|---|
| Postgres flexible servers | public network access, AllowAllAzure firewall, personal-IP rules, EOL engine version, md5 password auth, connection-exhaustion headroom, no diagnostics |
| Key Vaults | public network + default-allow, no purge protection, broad legacy access policies |
| Container registries | admin user enabled (shared static credential) |
| Storage accounts | weak TLS floor, public network + default-allow, shared-key access |
| Defender | the OpenSourceRelationalDatabases plan on the free tier |

`--rg-prefix` scopes to matching resource groups; omit to scan all.

## 5. Layer 3 — live Entra + CI

- **`probe-entra.mjs`** — read-only Graph (`az ad app list/show`). Flags app-registration
  reply-URLs pointing at localhost / external hosts, implicit or hybrid grant flow, long-lived
  or shared client credentials, and one identity spanning several environments.
- **`probe-ado.mjs`** — read-only pipeline reads. Flags secrets held in cleartext (not marked
  `isSecret`) in variable groups **and** build-definition variables — the place a SonarQube or
  registry token usually hides.

## 6. Reconciling into one report

`aggregate.mjs` merges every layer's findings, then `report.mjs` renders a single self-contained,
theme-aware HTML report: an executive brief, a severity distribution, per-finding cards
(evidence, CVSS, CWE), and — when you supply a prior list — the coverage grid. The report is
handed to you locally; nothing is published.

## 7. Coverage against a prior audit

Hand `aggregate.mjs` your previous findings and it accounts for every one:

- `--known <list.csv|json>` — the prior findings (`id,title,severity`).
- `--map <map.json>` — `{ "<your-id>": "<regex>" }`. Probes emit **neutral class names**
  (`PUBLIC-DB`, `IMPLICIT-FLOW`, …); the map attributes a finding to *your* ID by matching its
  evidence text. All client-specific naming lives here, never in the skill's code.
- `--remediated <id,id>` — IDs you've verified fixed live.

Each prior finding comes back **found** (which layer), **remediated** (verified absent), or
**gap**. The grid is the honest scorecard: it never silently drops one.

## 8. The four modes

| mode | sequences | output |
|---|---|---|
| `sweep` | the Systematic Finding protocol (SFP) across all three layers | findings + coverage + report |
| `review` | the Security Review protocol (SR) on one candidate | a scored, private GHSA-shaped advisory (CVSS 4.0 + CWE) |
| `poc` | the Security POC protocol (SP) | a throwaway `run-poc.sh` that stands up, proves, and tears itself down |
| `remediate` | the Systematic Remediation protocol (SRP) | a fix on its own branch, PR opened — never merged |

## 9. Scoring: CVSS, CWE, evidence tiers

Findings are graded with **CVSS 4.0** vectors and mapped to **CWE**. Evidence tiers are always
explicit: a live-probe result (an ARM/Graph GET) or a source-traced `file:line` outranks a
deployment-dependent inference — and the report says which. A visible stand-down ("looked, not
exploitable, here's why") beats a confident false positive.

## 10. The six hard gates

Never crossed without you (`gates.md`): private-first (findings stay private until you approve
disclosure) · throwaway-only PoCs · mandatory teardown · never push to a client default branch ·
never auto-merge a fix · provenance verified before any run. Plus: read-only until you approve,
no AI attribution, and an honest coverage claim that names what was *not* covered.

## 11. Files & data

| file | role |
|---|---|
| `scripts/resolve-target.mjs` | any target → a pinned, provenance-stamped record |
| `scripts/probe-azure.mjs` · `probe-entra.mjs` · `probe-ado.mjs` | the three read-only live probes |
| `scripts/collect-findings.mjs` | normalize deep-read output → findings JSON |
| `scripts/aggregate.mjs` | reconcile all layers + build the coverage grid |
| `scripts/report.mjs` | one self-contained HTML report |
| `scripts/advisory-lint.mjs` · `coverage-claim.mjs` | gate advisory bodies + the honest-coverage shape |
| `scripts/preflight.mjs` | checks `az` + the five scanners, says what's missing |
| `workflows/expansion-sweep.js` | multi-agent net-new hunt (opt-in) |

Working files live in a scratch dir, never in the audited repo. The live probes only ever read.

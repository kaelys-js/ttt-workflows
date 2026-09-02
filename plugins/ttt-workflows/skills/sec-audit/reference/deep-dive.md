# sec-audit — deep dive

Everything the skill does, end to end, in depth. Read top-to-bottom or jump in. For the security
protocols in full see the mode reference files (sweep/review/poc/remediate.md); for methodology framing see
`methodology.md`; for the six hard gates see `gates.md`.

## Contents

1. [Why three layers](#1-why-three-layers)
2. [Preflight — tools & access](#2-preflight--tools--access)
3. [Resolving the target](#3-resolving-the-target)
4. [Layer 1 — code & IaC (in detail)](#4-layer-1--code--iac-in-detail)
5. [Layer 2 — live Azure, check by check](#5-layer-2--live-azure-check-by-check)
6. [Layer 3 — live Entra + CI, check by check](#6-layer-3--live-entra--ci-check-by-check)
7. [Read-only, proven](#7-read-only-proven)
8. [Collecting & normalizing findings](#8-collecting--normalizing-findings)
9. [Reconciling into one report](#9-reconciling-into-one-report)
10. [Coverage against a prior audit](#10-coverage-against-a-prior-audit)
11. [The four modes & their protocols](#11-the-four-modes--their-protocols)
12. [Scoring: CVSS, CWE, evidence tiers, chains](#12-scoring-cvss-cwe-evidence-tiers-chains)
13. [The six hard gates](#13-the-six-hard-gates)
14. [Honest coverage (never a silent all-clear)](#14-honest-coverage-never-a-silent-all-clear)
15. [Files, data, and where things live](#15-files-data-and-where-things-live)
16. [Failure modes & troubleshooting](#16-failure-modes--troubleshooting)

---

## 1. Why three layers

A real security finding lives in one of three places, and only one *kind* of check reaches each:

- **In the code** — a logic flaw, a missing authorization check, a fragile sanitiser.
- **In the running cloud** — a database reachable from the internet, a vault with no network
  restriction, a registry with a shared admin credential. None of this appears in git; it's
  the *state* of what's deployed.
- **In identity and CI** — an app-registration with a login-flow flaw, a token sitting in a
  pipeline variable in cleartext. This lives in the tenant and the build system, not the repo.

Source scanners see the first and call it "the audit." That misses roughly half of real
findings. sec-audit runs all three layers and reconciles them into one report. Everything below
is how each layer works and how they come together.

## 2. Preflight — tools & access

`preflight.mjs [--layers code,azure,entra,ado]` runs first. It checks `node` and `git` (hard). Then, for whichever layers you're running, it checks an `az`
login for the live probes and the five source scanners (`semgrep`, `gitleaks`, `checkov`,
`osv-scanner`, `trivy`). A missing scanner is reported and that check is later marked *not
covered* (SFP8) rather than silently skipped. A missing `az` login for a live layer is a hard
stop with the exact `az login` command. Nothing
runs until the required pieces are present.

## 3. Resolving the target

`resolve-target.mjs <target> --out target.json` normalizes any of four inputs and pins a commit,
so every `file:line` in a finding is true at a known SHA:

| input | becomes | how |
| --- | --- | --- |
| GitHub / ADO **repo URL** | a read-only shallow clone at HEAD | `gh repo clone` / a bearer-authed `git clone --depth 1` |
| **PR URL** | the PR diff (scope = changed files) | delegates to pr-review's `fetch-pr.mjs` |
| **local repo** | read in place at HEAD | reads `git rev-parse HEAD` |
| **file / folder** | a scoped scan root | records the path + containing-repo SHA if any |

It also stamps **provenance** — source, SHA, scope, timestamp, and for a single file a content
checksum. That provenance is the SP1 gate: before anything runs, you've confirmed you're pointed
at the right, authorized target. An audit of the wrong tenant is an incident, so this is not
optional.

## 4. Layer 1 — code & IaC (in detail)

Two passes over the source, because pattern-matching and semantic reading catch different things.

**Scanners (`find-findings.sh`)** — find *shapes*:

- `gitleaks` — committed secrets (keys, tokens, connection strings).
- `osv-scanner` — known-vulnerable dependencies (CVEs) against the lockfile.
- `checkov` / `trivy` — IaC and container static issues (open network rules, missing encryption, unpinned base images).
- `semgrep` — SAST patterns (dangerous sinks, injection shapes).

These are fast and exhaustive over their pattern set, but they can't reason about whether a
shape actually *bites*.

**Semantic deep-read (`workflows/expansion-sweep.js`, multi-agent, opt-in)** — decides whether it
bites. It reads the actual code and traces attacker-controlled input from an entry point to a
sink. This is what catches the findings a pattern can't:

- a `PATCH /users/:id` that lets a non-admin set their own `role` field (mass-assignment self-elevation);
- a rate-limiter mounted only when `env === 'production'` while the config can only ever be `'prod'` (a dead guard that never fires);
- a sanitiser that HTML-encodes the JSON envelope and corrupts stored data.

Each
finding is adversarially self-reviewed (try to prove it's *closed* before reporting it), so a
"the route is intended" caveat doesn't get laundered into a stand-down.

**Expansion sweep (`workflows/expansion-sweep.js`, opt-in)** — hunts *net-new* findings beyond
any known list: you give it surfaces + focus lenses, it reads each, flags what's novel, and
adversarially verifies each before reporting. This is how the audit finds things the prior
audit never listed.

Everything from this layer is normalized by `collect-findings.mjs` into `source-findings.json`.

## 5. Layer 2 — live Azure, check by check

`probe-azure.mjs [--rg-prefix <substr>]` makes **read-only** ARM calls (`list` / `show` only)
and flags running-state problems that no code read can see:

| resource | what it checks | why it matters |
| --- | --- | --- |
| Postgres flexible server | `publicNetworkAccess = Enabled` | the database is reachable from any Azure customer VM |
| | `0.0.0.0` firewall rule | "AllowAllAzure" — the whole cloud can connect |
| | single-IP firewall rules | usually a personal/home IP allow-listed into prod |
| | engine version < 13 | past community end-of-life — no security patches |
| | `password_encryption = md5` | downgradeable protocol-level auth (SCRAM is available) |
| | `max_connections` high + public | connection-exhaustion denial-of-service headroom |
| | zero diagnostic settings | failed-auth events are ephemeral and ship nowhere |
| Key Vault | public network + default-allow | the vault holding every secret is internet-reachable |
| | purge protection off | a deleted secret can be permanently destroyed |
| | legacy access policies, many principals | broad offline read of secrets like a JWT signing key |
| Container registry | `adminUserEnabled = true` | a shared, non-attributable static push credential |
| Storage account | no `minimumTlsVersion` (defaults TLS1_0) | weak-TLS floor accepted |
| | public network + default-allow | blob/file data reachable from any network |
| | `allowSharedKeyAccess` not disabled | a leaked account key = full data-plane access |
| Defender | OpenSourceRelationalDatabases on the free tier | no brute-force / anomaly detection on the DBs |

`--rg-prefix` scopes to matching resource groups; omit to scan the whole subscription. Each
finding carries a neutral class name (e.g. `PUBLIC-DB`), a severity, a CVSS 4.0 vector, the exact
resource, and the evidence.

## 6. Layer 3 — live Entra + CI, check by check

**`probe-entra.mjs [--filter <substr,substr>]`** — read-only Graph (`az ad app list/show`):

| check | flags |
| --- | --- |
| reply URLs | `localhost` / `http://` / postman / ngrok entries left on a real app-reg |
| implicit / hybrid grant | access or id tokens issued into the URL fragment (leakable) |
| client credentials | secrets/certs valid for more than five years |
| external reply hosts | reply URLs on non-Azure hosts — verify the domain is still owned (orphaned = takeover) |
| SPA redirect URIs | auth code returned to the browser — confirm PKCE + a tight origin list |
| multi-environment reply hosts | one app-reg spanning prod + non-prod — a non-prod compromise mints prod tokens |

**`probe-ado.mjs --org <org> --project <proj>`** — read-only pipeline reads. It scans both
**variable groups** and **build-definition variables** for values that are *not* marked
`isSecret` but look like tokens (by name or by shape). This is where a SonarQube or registry
token usually hides in cleartext — and the build-definition endpoint is the one a naive
variable-group-only check misses.

## 7. Read-only, proven

The live probes only ever read. This isn't a promise in prose — it's enforced. Each probe's
`az()` wrapper refuses any call that isn't a `list` / `show` (or `account show`), and the
selftest statically asserts that no mutating verb (`create` / `update` / `delete` / `set` /
`add` / `remove` / `purge`) appears in the probe source at all. `probe-ado.mjs` is likewise
GET-only (no `-X POST/PUT/PATCH/DELETE`). You can point them at production with confidence.

## 8. Collecting & normalizing findings

`collect-findings.mjs` turns the deep-read/expansion workflow output into the flat JSON the
report and aggregator read. Two modes. `--merge-results <run>.json…` merges several workflow results into one
`source-findings.json` (deduping by title, capturing each finding's referenced IDs and a
bounded evidence corpus for keyword matching). `--result <file>` passes a single workflow
result through. This is the seam that keeps the semantic layer and the reconciliation
layer decoupled.

## 9. Reconciling into one report

`aggregate.mjs` merges every layer's findings and computes the severity rollup; `report.mjs`
renders a single **self-contained, theme-aware HTML** report — an executive brief, a severity
distribution bar, a per-finding card set (evidence, resource/`file:line`, CVSS, CWE), and, when
you supply a prior list, the coverage grid. It's handed to you locally (rendered inline / saved
to disk); nothing is published anywhere. The report footer names which layers loaded and which
were absent, so the report can never imply coverage it didn't run.

## 10. Coverage against a prior audit

Hand `aggregate.mjs` your previous findings and it accounts for **every** one:

- `--known <list.csv|json>` — the prior findings, columns `id,title,severity` (CSV is parsed
  quote-aware, so multi-line evidence fields don't break it).
- `--map <map.json>` — `{ "<your-id>": "<regex>" }`. The probes emit **neutral class names**;
  the map attributes a finding to *your* ID by matching the regex against the finding's
  evidence/corpus. **All** client-specific naming lives in this file, never in the skill's code —
  which is what keeps the skill agnostic across clients.
- `--remediated <id,id>` — IDs you've verified fixed in the live estate; marked remediated
  rather than gap.

Each prior finding comes back **found** (and which layer found it), **remediated** (verified
absent), or **gap** (nothing matched — a real hole in coverage). The grid is the honest
scorecard: 62 known findings in, 62 accounted for, or it tells you which ones aren't.

## 11. The four modes & their protocols

Each mode sequences one of the four security protocols end to end:

| mode | protocol | what happens | output |
| --- | --- | --- | --- |
| `sweep` | Systematic Finding (SFP1–12) | scanners → semantic deep-read → live probes → reconcile | findings + coverage + HTML report |
| `review` | Security Review (SR1–12) | assess one candidate, score it, write it up privately | a GHSA-shaped advisory, CVSS 4.0 + CWE |
| `poc` | Security POC (SP1–9) | stamp a throwaway PoC that stands up, proves, and tears itself down | a `run-poc.sh` + disclosure-standard README |
| `remediate` | Systematic Remediation (SRP1–32) | write the fix on a non-default branch | a client-style PR, opened, never merged |

`sweep` is the full audit; the other three act on a single finding. Every mode is framed against
professional methodology — PTES phases, OWASP WSTG test categories, NIST SP 800-115, MITRE
ATT&CK, threat modeling, and CWE/CVSS + compliance reporting (`methodology.md`).

## 12. Scoring: CVSS, CWE, evidence tiers, chains

Findings are graded with **CVSS 4.0** vectors and mapped to **CWE**. Two disciplines make the
scores trustworthy:

- **Evidence tiers are explicit.** A live-probe result (an ARM/Graph GET) or a source-traced
  `file:line` outranks a deployment-dependent inference, and the report says which tier a
  finding sits in. A visible stand-down ("looked, here's why it's not exploitable") beats a
  confident false positive every time.
- **Chains are modeled.** Two medium findings can compose into a high — e.g. a plaintext storage
  key in an app setting (entry) plus a storage account left internet-reachable over weak TLS
  (sink) yields unauthenticated data access from the internet. The report records the chain and
  its effective severity, not just the parts.

## 13. The six hard gates

Never crossed without you (`gates.md`):

1. **Private-first** — findings stay private until you approve disclosure.
2. **Throwaway-only PoCs** — a PoC never touches shared or persistent infrastructure.
3. **Mandatory teardown** — every PoC removes whatever it stood up.
4. **Never push to a client default branch** — fixes land on their own branch.
5. **Never auto-merge** a fix PR.
6. **Provenance verified before any run** — right target, authorized, read-only.

Plus: read-only until you approve, no AI attribution anywhere (`advisory-lint.mjs` refuses a
contaminated body), and an honest coverage claim.

## 14. Honest coverage (never a silent all-clear)

Every sweep states what it did **not** cover, and un-triaged items carry a reason.
`coverage-claim.mjs` validates the shape and the arithmetic (triaged = confirmed + stood-down;
triaged + un-triaged ≤ hits). "All clear" is never allowed to hide a scanner that didn't run or
a surface that wasn't reached. A missing tool downgrades a check to *not covered* and says so;
it never silently drops it.

## 15. Files, data, and where things live

| file | role |
| --- | --- |
| `scripts/preflight.mjs` | checks `node`/`git`/`az` + the five scanners; names what's missing |
| `scripts/resolve-target.mjs` | any target → a pinned, provenance-stamped record |
| `scripts/probe-azure.mjs` · `probe-entra.mjs` · `probe-ado.mjs` | the three read-only live probes |
| `scripts/collect-findings.mjs` | normalize deep-read / workflow output → findings JSON |
| `scripts/aggregate.mjs` | reconcile all layers + build the coverage grid |
| `scripts/report.mjs` | one self-contained, theme-aware HTML report |
| `scripts/advisory-lint.mjs` | gate an advisory body (attribution, private-first, required sections) |
| `scripts/coverage-claim.mjs` | validate the SFP8 honest-coverage shape + arithmetic |
| `workflows/expansion-sweep.js` | multi-agent net-new hunt (opt-in) |
| `reference/{methodology,gates,sweep,review,poc,remediate}.md` | protocol + methodology detail |

Working files (`target.json`, the `*-findings.json`, `coverage.json`, `report.html`) live in a
scratch dir, never in the audited repo. The live probes only ever read.

## 16. Failure modes & troubleshooting

- **A live probe warns and returns nothing for a resource** → usually an access boundary (the signed-in identity lacks Reader / Directory app-read). That's reported honestly as not-covered, not a clean result.
- **`aggregate` shows gaps you expected to be found** → either the `--map` regex for those IDs didn't match the evidence text (tighten the map — it's a client file, not skill code), or the deep-read didn't sweep that surface (run an expansion over it).
- **Entra probe can't list app-regs** → the identity lacks Graph `Application.Read.All`; that's an access boundary to grant, not a clean tenant.
- **ADO probe returns 0 groups** → the token lacks Library/build read, or the secret lives in a build-definition variable (which the probe also scans) — check both.
- **A scanner is missing** → preflight said so; install it (`pipx install <tool>` / `brew install <tool>`). Until then that check is marked not-covered.

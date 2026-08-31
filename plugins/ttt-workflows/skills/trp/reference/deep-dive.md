# trp — deep dive

Everything the skill does, end to end, in depth. Read top-to-bottom or jump in. For the full
phase machine see `phases.md`; for every gate and the failure catalogue see `gates.md`; for the
client specifics see `clients.md`; for the plan/PR/comment templates see `templates.md`.

**Contents**
1. [The shape of a delivery](#1-the-shape-of-a-delivery)
2. [Preflight — access before anything](#2-preflight--access-before-anything)
3. [Phase 0 — ground it in the code](#3-phase-0--ground-it-in-the-code)
4. [Phase 1 — the plan, and the approval gate](#4-phase-1--the-plan-and-the-approval-gate)
5. [Phase 1.5 — breaking up bigger work](#5-phase-15--breaking-up-bigger-work)
6. [Phase 2–3 — build & verify](#6-phase-23--build--verify)
7. [The pre-push gates](#7-the-pre-push-gates)
8. [Phase 3.5 — review its own work](#8-phase-35--review-its-own-work)
9. [Phase 4 — open the PR (the done-bar)](#9-phase-4--open-the-pr-the-done-bar)
10. [Phase 5 — update the ticket](#10-phase-5--update-the-ticket)
11. [Response modes](#11-response-modes)
12. [Client routing, in detail](#12-client-routing-in-detail)
13. [The gates that never bend](#13-the-gates-that-never-bend)
14. [Keeping claims true](#14-keeping-claims-true)
15. [Files, data, and where things live](#15-files-data-and-where-things-live)
16. [Failure modes & troubleshooting](#16-failure-modes--troubleshooting)

---

## 1. The shape of a delivery

```
preflight → fetch → ground → PLAN → [STOP for approval] → build → verify
          → self-review → open PR → update ticket
```

The approval gate at Phase 1 splits the run in two: everything before it is read-only —
nothing is built, branched, or written; everything after it happens only once you've said go.
`fetch-ticket.mjs` and `clickup-update.mjs` are the deterministic bookends; the work between is
run to the phase machine in `phases.md`. The whole point of the protocol is that you see a real
plan grounded in real code *before* any change exists, so a mid-implementation course-correction
is cheap (edit the plan) instead of expensive (throw away code).

## 2. Preflight — access before anything

`preflight.mjs [--client wheaton|itc]` runs first: `node`, a ClickUp token (hard — the workflow
reads and updates a ticket), and the git host for the client (`gh` for ITC, `az` for Wheaton).
Anything missing is named with the exact fix — the login command, or the token file path + the
`CLICKUP_TOKEN_FILE` env var — and the run stops until it's clean.

## 3. Phase 0 — ground it in the code

`fetch-ticket.mjs <url> --out ticket.json` pulls the ticket, **all** of its comments, and its
status. Then the ask is grounded in the actual repo: the real files, functions, and lines it
touches, each cited `file:line`. The discipline here is **discover, don't punt** — every
question that the code, config, or telemetry can answer is answered here, not handed back to
you. Only a decision that genuinely needs your judgment surfaces — a business rule, a priority
call, an access grant, a stakeholder-facing wording choice — and it surfaces as options with a
recommended default, never as an open-ended question. The output of Phase 0 is a scoping read:
enough context to plan, with every gap either closed or explicitly flagged.

## 4. Phase 1 — the plan, and the approval gate

The **Full TRP Package** is assembled (`templates.md`): what changes and why, the file-level
detail, the tests that will prove it, the risks, and — where relevant — cost. It restates the
ticket's acceptance criteria against their original source so nothing is silently narrowed.

**Then it stops.** This gate is absolute: no branch, no subagent, no write — not even "obvious"
work — happens before your explicit approval. You always see the plan first. Approval is
per-package; it doesn't carry to later, separate work.

## 5. Phase 1.5 — breaking up bigger work

A single-PR ticket skips this. When the change is larger, it's broken into small,
independently-mergeable PRs, each safe to merge to the trunk on its own. Where there are no
feature flags (Wheaton), that means each PR must be correct on merge, not gated behind a switch —
so the breakdown is planned so nothing half-built ever lands.

## 6. Phase 2–3 — build & verify

Implementation runs as **task/verify pairs**: each change is checked against a defined success
criterion as it's made, not against a fixed step list. Strong success criteria are what let the
work loop to done independently. The change matches the codebase's own conventions (naming,
structure, test style) even where the skill might have a different taste — conformance beats
taste inside someone else's repo.

## 7. The pre-push gates

Before **any** push, the client's real local gates must be actually green — not "CI went
green," because these repos often run tests as continue-on-error, so a green CI can hide a
failing test. The gates: the pinned formatter (`prettier --check`), the linter, and the
affected test suites *passing*, plus the build and typecheck where the client runs them. A
failing test is a **hard block**; nothing is pushed red. The only exception is a failure proven
pre-existing on the trunk baseline and unrelated to the change (stash-diff to prove it). And an
attribution scan runs on every commit message before it's pushed.

## 8. Phase 3.5 — review its own work

Before a human sees the diff, it reviews itself, to make the human reviewer's first pass
*confirm* rather than *discover*:

1. An adversarial self-read of the diff cold, hunting newly-introduced defects against the
   known-defect patterns (read-modify-write races, concurrency, error-mapping siblings,
   empty/boundary input, bundle shape).
2. Where available, the automated reviewer (CodeRabbit) locally to zero actionable findings.
3. The **pr-review skill** run against the PR, read-only, with every finding fixed here.

A defect discovered by the reviewer's first pass on the visible PR means this gate didn't run
adequately — it's treated as a gate failure to strengthen, never as "the process working."

## 9. Phase 4 — open the PR (the done-bar)

A PR is not done until, confirmed by command output: the assignee is set and reviewers
requested; `gh pr checks` (or the ADO pipeline) is green with no new failures vs the baseline;
there are zero unresolved review comments; and the affected tests actually pass locally. For
IaC PRs that means the CI checks pass, not just local `fmt`/`validate`. The PR body follows the
client's template and carries real detail — endpoint contracts, per-item changes, screenshots
where relevant.

## 10. Phase 5 — update the ticket

Two mechanical actions, both required, via `clickup-update.mjs`:

1. **Status transition** — e.g. `todo → in progress → in review → complete`, matching where the
   work actually is.
2. **A two-layer comment** — a plain-language business/PM summary (what this does for users and
   why it matters, current status, what's left) **and** the technical detail (PR link,
   changelog, verification, cost). The ticket has to be readable by a non-engineer *and* an
   engineer.

`clickup-update.mjs` is **dry-run by default**; `--live` executes. It refuses a body carrying AI
attribution, and refuses if either layer is missing. After posting, the landing is verified by
re-reading the ticket's latest comment — if it's a system event and not the two-layer write, the
phase is incomplete.

## 11. Response modes

Not every ticket is code. The mode is inferred from the ticket, and the package states which
phases apply:

| mode | when | phases |
|---|---|---|
| **implement** | a code change (default) | 0 → 5 |
| **spike-writeup** | options / investigation, no code yet | 0 → 1, then a written recommendation with options + trade-offs + acceptance criteria |
| **support** | a question or triage | 0, then a grounded answer |

## 12. Client routing, in detail

Wheaton and ITC are genuinely different stacks (`clients.md`) — the skill routes automatically
and never mixes them:

| | Wheaton (OMS) | ITC |
|---|---|---|
| host | Azure DevOps | GitHub |
| default branch | `develop` (BE) / `main` (FE) | trunk |
| PR flow | ADO REST API (bearer) | `gh` |
| review bot | — | CodeRabbit |
| feature flags | none — code must be correct on merge | yes — ship behind a default-off flag |
| CI | ADO pipelines (dockerized tests, SonarQube) | Nx affected + checks |
| ticket | ClickUp | ClickUp |

The consequence that matters most: with no feature flags on Wheaton, nothing half-built can land
safely, so the plan and the breakdown are shaped accordingly.

## 13. The gates that never bend

- **The approval gate is absolute** — everything before Phase 1 approval is read-only.
- **Discover, don't punt** — a question the repo/config/telemetry can answer is never asked of you.
- **Evidence first** — every root-cause claim carries `file:line` and a verified failure in the real artifact; "suspected/likely" doesn't ship.
- **Every approved item ships** — no `defer`, `out of scope`, `for now`, `follow-up`, or quiet drop. When you hit friction on approved work, the response is to investigate until it's done, not to downgrade scope.
- **No AI attribution** — scanned mechanically before every push and every post; the scripts refuse a contaminated body.
- **FAIL closes internally** — when verification fails, the fix and re-verification run immediately and repeat until it passes; only a PASS, a genuine external blocker, or a truly-exhausted stop-and-report ever surfaces to you.

Full catalogue and the learned-the-hard-way failure notes are in `gates.md`.

## 14. Keeping claims true

The PR body, the commit message, and the ClickUp ticket are part of the deliverable, not
decoration. Every factual claim in them is diffed against the actual code before "done": a
dimension described as captured that the code leaves at zero, a test count that moved after an
amend, a criterion marked "met" after it was quietly narrowed — each is a defect, fixed like a
code bug. After any amend or force-push, every number is stale until re-measured against the new
head and re-derived from the real merge-base.

## 15. Files, data, and where things live

| file | role |
|---|---|
| `scripts/preflight.mjs` | checks the ClickUp token + `gh`/`az`; names what's missing and where |
| `scripts/fetch-ticket.mjs` | ticket + all comments + status → `ticket.json` (read-only) |
| `scripts/clickup-update.mjs` | Phase 5 status + two-layer comment; dry-run by default, `--live` to execute; attribution + two-layer + landed gates built in |
| `reference/phases.md` | the phase machine (0 → 5, incl. 3.5) with exit criteria |
| `reference/gates.md` | operational gates, pre-push gates, the failure catalogue |
| `reference/clients.md` | Wheaton (ADO) vs ITC (GitHub) routing |
| `reference/templates.md` | the Full TRP Package, PR body, two-layer comment |

Working files (`ticket.json`, the plan draft, `phase5.md`) live in a scratch dir, never in the
target repo. The pr-review skill is a sibling, invoked read-only in Phase 3.5.

## 16. Failure modes & troubleshooting

- **Preflight flags the ClickUp token** → put your `pk_` token at `~/.config/ttt/clickup.token` or set `CLICKUP_TOKEN_FILE`; it's required because Phase 5 writes to the ticket.
- **A verifier returns FAIL** → it's not handed to you as a question; the fix + re-verify run internally until PASS. You only hear about it if it's a genuine external blocker.
- **The ClickUp comment didn't land** → `clickup-update.mjs` re-reads the latest comment to confirm; if it shows a system event instead of the two-layer write, Phase 5 re-runs.
- **A pre-existing test is red on the baseline** → proven pre-existing (stash-diff), it doesn't block the push; anything the change touched must be green.
- **Wrong client tooling invoked** → routing is explicit in `clients.md`; Wheaton is ADO + `az`, ITC is GitHub + `gh` — they're never interchangeable.

# trp — deep dive

Everything the skill does, end to end. Read top-to-bottom or jump in. For the full phase machine
see `phases.md`; for every gate and the failure catalogue see `gates.md`; for the client
specifics see `clients.md`; for the plan/PR/comment templates see `templates.md`.

**Contents**
1. [The shape of a delivery](#1-the-shape-of-a-delivery)
2. [Phase 0 — ground it in the code](#2-phase-0--ground-it-in-the-code)
3. [Phase 1 — the plan, and the approval gate](#3-phase-1--the-plan-and-the-approval-gate)
4. [Phase 2–3 — build & verify](#4-phase-23--build--verify)
5. [Phase 3.5 — review its own work](#5-phase-35--review-its-own-work)
6. [Phase 4 — open the PR](#6-phase-4--open-the-pr)
7. [Phase 5 — update the ticket](#7-phase-5--update-the-ticket)
8. [Response modes](#8-response-modes)
9. [Client routing](#9-client-routing)
10. [The gates that never bend](#10-the-gates-that-never-bend)
11. [Files & data](#11-files--data)

---

## 1. The shape of a delivery

`fetch → ground → plan → STOP for approval → build → verify → self-review → PR → update ticket`.
The approval gate at Phase 1 splits it in two: everything before it is read-only; nothing is
built, branched, or written until you say go. `fetch-ticket.mjs` and `clickup-update.mjs` are
the deterministic bookends; the work between is done to the phase machine in `phases.md`.

## 2. Phase 0 — ground it in the code

`fetch-ticket.mjs <url>` pulls the ticket, **all** its comments, and its status into
`ticket.json`. Then the ticket's ask is grounded in the actual repo: the real files and lines it
touches, cited `file:line`. Every question that the code, config, or telemetry can answer is
answered here — not handed back to you. Only a decision that genuinely needs your judgment
(a business call, a priority, an access grant) surfaces, and it surfaces as options with a
default, not an open question.

## 3. Phase 1 — the plan, and the approval gate

The Full TRP Package is assembled (`templates.md`): what changes, why, the file-level detail, the
tests, the risks. **Then it stops.** This gate is absolute — no branch, no subagent, no write,
not even "obvious" work, happens before your explicit approval. You always see the plan first.

## 4. Phase 2–3 — build & verify

Implementation runs as task/verify pairs — each change is checked as it's made, against a defined
success criterion, not a fixed script. Before any push, the client's real local gates must be
green: the pinned formatter, the linter, and the affected tests actually passing — not "CI went
green." A failing test is a hard block; nothing is pushed red.

## 5. Phase 3.5 — review its own work

Before a human sees the diff, it reviews itself: CodeRabbit locally (where available) to zero
actionable findings, then the **pr-review skill** is run against the PR, and every finding is
fixed. The goal is confirm-not-discover — the human reviewer's first pass should confirm the work
is clean, not discover defects.

## 6. Phase 4 — open the PR

The PR-done bar, confirmed by command output: assignee set, reviewers requested, checks green
(no new failures vs the baseline), zero unresolved review comments, and the affected tests
actually passing locally. The PR body follows the client's template.

## 7. Phase 5 — update the ticket

Two mechanical actions, both required, via `clickup-update.mjs`:

1. **Status transition** — e.g. `in progress → in review → complete`.
2. **A two-layer comment** — a plain-language summary for a project manager, then the technical
   detail. It's attribution-scanned before posting and verified as landed by re-reading the
   ticket's latest comment.

`clickup-update.mjs` is dry-run by default; `--live` executes. It refuses a body carrying AI
attribution or missing either layer.

## 8. Response modes

Not every ticket is code. The mode is inferred from the ticket:

| mode | when | what runs |
|---|---|---|
| implement | a code change (default) | phases 0 → 5 |
| spike-writeup | options / investigation, no code | phase 0 → 1, then a written-up recommendation |
| support | a question or triage | phase 0, then an answer |

## 9. Client routing

Wheaton and ITC are not interchangeable (`clients.md`):

| | Wheaton | ITC |
|---|---|---|
| host | Azure DevOps | GitHub |
| default branch | `develop` / `main` | trunk |
| review bot | — | CodeRabbit |
| feature flags | none — must ship correct | yes — can ship behind a flag |
| ticket | ClickUp | ClickUp |

## 10. The gates that never bend

The approval gate is absolute. Discover, don't punt — a question the repo can answer is never
asked of you. Evidence first — every root-cause claim carries `file:line` and a verified failure
in the real artifact; "suspected" doesn't ship. Every approved item ships — no defer, no
"for now", no quiet drop. No AI attribution anywhere — scanned before every push and post. A FAIL
in verification is fixed and re-verified internally; only a real external blocker ever comes back
to you. Full catalogue in `gates.md`.

## 11. Files & data

| file | role |
|---|---|
| `scripts/preflight.mjs` | checks the ClickUp token + `gh`/`az`, says what's missing |
| `scripts/fetch-ticket.mjs` | ticket + all comments + status → `ticket.json` (read-only) |
| `scripts/clickup-update.mjs` | Phase 5 status + two-layer comment; dry-run by default, `--live` to execute |
| `reference/phases.md` | the phase machine (0 → 5, incl. 3.5) with exit criteria |
| `reference/gates.md` | operational gates, pre-push gates, the failure catalogue |
| `reference/clients.md` | Wheaton (ADO) vs ITC (GitHub) routing |
| `reference/templates.md` | the plan package, PR body, two-layer comment |

Working files (`ticket.json`, the plan draft, `phase5.md`) live in a scratch dir, never in the
target repo. The pr-review skill is a sibling, invoked read-only in Phase 3.5.

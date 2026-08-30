# pr-review — deep dive

Everything the skill does, end to end. Written to be read top-to-bottom, but each section
stands alone. For the exhaustive rule text see `rubric.md`; for the output schema see
`output-format.md`; for platform auth quirks see `platforms.md`.

**Contents**
1. [The shape of a run](#1-the-shape-of-a-run)
2. [Fetching the PR (read-only)](#2-fetching-the-pr-read-only)
3. [First review vs re-review](#3-first-review-vs-re-review)
4. [Ticket-linked review](#4-ticket-linked-review)
5. [How the review is done — the rubric](#5-how-the-review-is-done--the-rubric)
6. [Anchoring: why a line number is never stale](#6-anchoring-why-a-line-number-is-never-stale)
7. [The verdict rule](#7-the-verdict-rule)
8. [Rendering the comment](#8-rendering-the-comment)
9. [The refusal gate](#9-the-refusal-gate)
10. [What it never does](#10-what-it-never-does)
11. [Files & data](#11-files--data)

---

## 1. The shape of a run

`preflight → fetch → read → review → self-verify → render → hand over`. Only the last step
produces something you act on; everything before it is read-only. The two scripts
(`fetch-pr.mjs`, `render-review.mjs`) are deterministic; the judgment in between is the model's.

## 2. Fetching the PR (read-only)

`fetch-pr.mjs <url>` normalizes any PR into one `pr.json`:

- **GitHub** — via `gh` (`gh auth status` must be green). Pulls title, body, the unified diff,
  the changed-file list, and existing review threads.
- **Azure DevOps** — via an `az` bearer for the PR's tenant. Same fields, different API shape.
- **Ticket resolution** — if the PR body or branch names a ClickUp task, the ticket's name,
  status, and description are attached as `pr.json.ticket` (needs `CLICKUP_TOKEN_FILE`).

Nothing is written to the PR at any point — only GETs.

## 3. First review vs re-review

Decided from `pr.json.threads`. If your earlier review comments are already there, it's a
**re-review**: only the changes since your last pass are examined, what the author fixed is
acknowledged, and settled points are not reopened. Each round is saved as
`findings-<platform>-<repo>-<pr>.json`; the next round diffs against it so resolved items
become acknowledgements, not repeats.

## 4. Ticket-linked review

When `pr.json.ticket` is present, the review adds one question before judging the code: **does
this change do what the ticket actually asked?** The change is diffed against the ticket's
description / acceptance criteria, not just the PR body — a PR can be clean code that solves the
wrong problem.

## 5. How the review is done — the rubric

Every changed line is read (only lockfiles, generated code, and bulk data are skimmed), in
priority order: **design → correctness → security → tests → API → readability → performance →
docs**. The full rules are `rubric.md` (R1–R15); the load-bearing ones:

- **Verify before commenting (R1)** — every finding traces to lines actually read, cited `file:line`.
- **Refute before keeping (R2, R12)** — each finding is attacked first; if it doesn't hold up it's dropped. One verified blocker beats ten nitpicks.
- **Security (R5)** — secrets, injection, authN + object-level authZ, input validation, supply chain, PII, fail-closed.
- **Tests by intent (R6)** — a test that can't fail when the logic changes is worthless.
- **Behaviour + currency (R11)** — state what the code *actually* does and diff it against what the PR claims; judge against today's best practice, checking the vendor's live docs rather than memory.
- **AI-authored lens (R14)** — if the diff looks AI-written, scrutiny goes up: intent-alignment, that called APIs exist in the pinned version, dependency provenance, over-engineering.

## 6. Anchoring: why a line number is never stale

Every finding names a `file:line` and an `anchor_snippet` — a substring of that exact line.
Before rendering, `render-review.mjs` re-checks each snippet against the fetched diff. If the
line moved or the snippet doesn't match, it **refuses to render**. That's the mechanism that
makes a stale or hallucinated line number impossible to ship — the reviewer can't point at a
line that isn't there.

## 7. The verdict rule

Deterministic, not vibes: any blocking finding → **request-changes**; otherwise, non-blocking
findings that matter → **comment**; otherwise → **approve**.

## 8. Rendering the comment

`render-review.mjs findings.json --pr pr.json` produces the paste-ready block, tailored to the
platform:

- **GitHub** — collapsible `<details>` per finding, deep links to the file at the head SHA.
- **Azure DevOps** — flat numbered sections (ADO markdown doesn't collapse), deep links in ADO's `?path=&version=GC<sha>&line=` form.
- A **scope chip** (files · ±lines) and, when present, the **ticket line** are added from `pr.json`.

The layout is scan-first: a one-line verdict, a severity tally, a one-row-per-finding table,
then each finding's full detail below.

## 9. The refusal gate

`render-review.mjs` exits non-zero (refuses to emit) on any of: AI attribution anywhere, a
decorative emoji, a blocking finding with no fix, a finding on a file not in the PR, or an
`anchor_snippet` that doesn't match its line. You never hand-edit around the gate — you fix
`findings.json` and re-render. This is what guarantees the output's integrity.

## 10. What it never does

No `gh pr review` / `comment` / `edit` / `merge` / `ready`; no Azure DevOps thread or vote
writes; no write API calls of any kind. No AI attribution. No blocking on lint (a formatter's
job) or on problems that pre-date the PR (flagged separately, non-blocking). It reads like a
person wrote it — rationed em-dashes, no filler, functional emojis only.

## 11. Files & data

| file | role |
|---|---|
| `scripts/preflight.mjs` | checks `gh`/`az` (and optional ClickUp), says what's missing |
| `scripts/fetch-pr.mjs` | URL → `pr.json` (read-only) |
| `scripts/render-review.mjs` | `findings.json` → the paste-ready block; enforces the refusal gate |
| `scripts/selftest.mjs` | regression battery for the deterministic layer |
| `reference/rubric.md` | R1–R15 in full |
| `reference/output-format.md` | the `findings.json` schema + templates |
| `reference/platforms.md` | GitHub/ADO auth, URL shapes, troubleshooting |

Working files (`pr.json`, `findings.json`) live in a scratch dir, never in the reviewed repo.

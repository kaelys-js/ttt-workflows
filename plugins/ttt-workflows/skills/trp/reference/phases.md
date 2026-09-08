# The TRP phase machine

Phases 0 → 1 → 1.5 → 2 → 3 → 3.5 → 4 → 5, with one hard stop: after the Full TRP
Package is presented, NOTHING executes until the operator types approval. Everything
before that stop is read-only. Phase 0 through 1.5 run in a read-only grounding subagent
that returns the package; Phases 2 through 4 run in a delivery subagent; the approval
gate, the pr-review loop, and Phase 5 run in the main conversation (SKILL.md "Execution
model").

## Contents

- Phase 0 — Ground & scope
- Phase 1 — Spike (when needed)
- Phase 1.5 — Breakdown
- The approval gate
- Phase 2 — Implement
- Phase 3 — Verify
- Phase 3.5 — Pre-review-visibility quality loop (CodeRabbit + pr-review)
- Phase 4 — PR
- Phase 5 — ClickUp update
- Response modes

## Phase 0 — Ground & scope

Fetch the ticket AND its full comment thread (`scripts/fetch-ticket.mjs`). Read every
comment — clarifications and scope changes live there, not in the description. When
the invocation names a GAP-LIST or other evidence file, read it before scoping.

Ground the ticket in the ACTUAL repo: read the code it touches, cite `file:line` for
every claim, verify the described behaviour in the deployed artifact where feasible.
"Suspected" / "likely" / "probably" root causes are defects — evidence or nothing.

Answer every gap yourself (Rule 8 — discover, don't punt). Queryable answers (code,
config, telemetry, pipelines, registry) are never questions to the operator. This phase
runs in a read-only subagent that cannot ask at all, so its output is the package itself. Only a
decision that genuinely lives in the owner's head (priority call, business taxonomy,
consent for a destructive step) surfaces. It surfaces as a decision with options
and a default, stated in the package, not as an open question blocking the work.
When the ticket's wording conflicts with traced reality, decide and say so:
"Decision (mine, not yours): …" with the evidence.

### Timeline check (mandatory before Phase 0 exit)

For every candidate fix or prior related commit discovered while grounding,
enumerate: `{SHA, subject, branches present on, merge date per env}`. If the
ticket reports the bug on env X on date D1, and a candidate lands on env X on
date D2 ≤ D1, that candidate is already deployed and CANNOT be the answer. Say
so explicitly. This one check would have killed several real Phase 0 false-fix
packages (see gates.md failure catalogue).

### Evidence-sufficiency check (mandatory before Phase 0 exit)

If the ticket describes runtime behaviour the repo alone cannot explain — an
error class thrown at runtime, an HTTP response body, browser/localStorage
state at a failure moment, environment-only reproduction, "works in dev, breaks
in QA" with the same code — static analysis is insufficient. The Phase 0
deliverable is a runtime repro plan naming specific evidence to capture, NOT a
fix proposal wrapped in caveats. Emit a `spike-solve` package (templates.md)
in that case.

### Exit

EITHER (a) an EVIDENCED root cause — file:line for the code path AND a captured
failure artifact (curl output, log excerpt, screenshot, reproducing test) — in
which case the package is `solve` mode; OR (b) a runtime repro plan naming the
specific evidence to capture and how, in which case the package is `spike-solve`
(or `spike-writeup` if no fix will follow). A ranked hypothesis list with a
"recommended default" is NEVER a valid Phase 0 exit — that content belongs in a
`spike-solve` package's Hypotheses-to-test section, not a `solve` package's Root
cause. Every AC is mapped to code reality; every gap answered or surfaced as a
decision with options and a default.

## Phase 1 — Spike (when needed)

Only when the ticket is a spike or the solution space is genuinely open: options,
tradeoffs, ACs — still read-only, still evidence-first. Most tickets skip to 1.5.

## Phase 1.5 — Breakdown

Single-PR tickets: a commit × file table (see templates.md). Multi-PR tickets: one PR
per subtask, each independently safe to merge to trunk in dependency order — no
long-lived stacked branches (clients.md has each client's default branch and merge
strategy). State whether a feature flag exists on that client. Where the platform has
none, the code must be correct on merge, and the package says so.

## The approval gate

Assemble the **Full TRP Package** (templates.md) and present it. Then STOP.

- No writes, no branch, no implementation subagent, nothing — until the operator
  approves. The read-only grounding subagent that produced the package is the only one
  allowed before this point.
- The package must contain EVERY mandatory section — env-var handling, end-to-end
  verification, what-cannot-be-verified, PR creation, ClickUp plan. A package missing
  one of these is a process violation, not a draft.
- Never present an option menu containing a Rule-13 downgrade (defer / follow-up /
  for now / separate ticket). Offering the wrong option is itself the violation.

## Phase 2 — Implement

Execute the approved package with interleaved task/verify pairs: every task is
followed by a verification of that task against the approved changelog item.

- Branch and commit per the client conventions (clients.md).
- Any subagent prompt carries the gates VERBATIM (gates.md) — subagents follow only
  their prompt, never this file. Include "Do not delegate" so no sub-subagents spawn.
- Every approved changelog item is mandatory. No silent drops, no scope downgrades.
- Checkpoint after every significant step; if a verifier returns FAIL, fix and
  re-verify internally — a FAIL is never surfaced as a question (gates.md #8).

## Phase 3 — Verify

Run the client's full local gate (clients.md) and require green — actually green,
not "CI went green". Then the change-specific battery:

- exercise the REAL surface (never a stub of it);
- prove flag-off inertness where a flag exists;
- enumerate every entrypoint/call-site of the changed behaviour across the WHOLE repo (scripts, tooling, migrations — not just src/);
- state the search you ran.

Anything unprovable is
reported as unproven, never silently passed.

An independent verification pass re-runs the same battery. Its FAIL loops close in
Phase 2/3, internally.

## Phase 3.5 — Pre-review-visibility quality loop

The goal: when a human (or CI reviewer) first sees the PR, they confirm rather than
discover (gates.md #4). Two mechanical passes, in order:

1. **Local CodeRabbit** (when the CLI is installed — check `command -v coderabbit`):
   `coderabbit review --plain` (or `--agent`) from the repo against the base branch,
   BEFORE the first push. Fix every actionable finding to zero on the branch. If the
   CLI is missing or the run is rate-limited, say so in the package's verification
   report — never silently skip. (During long multi-phase workflows the operator may
   defer CodeRabbit to the end — that override is theirs to give, not yours to assume.)
2. **pr-review skill against the fresh PR** (right after Phase 4 opens it):
   run the `pr-review` skill on the PR URL end to end. Fix EVERY finding — blocking
   and non-blocking; `question` findings get answered in the PR body or a comment the
   operator can post. Push the fixes, re-run pr-review at the new head, repeat until
   it returns ✅ Approve or 💬 Comment with nothing left to fix. The review outputs are
   evidence in the final report.

## Phase 4 — PR

Create the PR per client (clients.md): branch pushed, title/body per the client
template (templates.md), reviewers requested, assignee set, work-item/ticket linked.
The PR-done bar (gates.md): checks green with no new failures vs baseline, zero
unresolved review threads, affected tests pass locally, body claims re-measured
against the actual head.

## Phase 5 — ClickUp update

TWO mechanical actions, both required, every round (`scripts/clickup-update.mjs`):

1. Status transition (`in progress` on Phase 2 start → `in review` on PR open →
   `complete` only after merge + verified).
2. Two-layer comment: PM/business summary first, then technical detail (PR link,
   changelog, verification evidence). Attribution-scanned before post.

The script verifies the comment landed by re-fetching the latest comment; a system
event instead of the posted comment = the phase is INCOMPLETE. Dry-run is the
default; `--live` only after the phase is actually reached.

## Response modes

From the TRP product taxonomy — name the mode in the package header:
`solve` (implement the fix), `spike-writeup` (research + document, no code),
`spike-solve` (research then implement), `spike-full` (research, document, implement),
`reproduce` (prove the defect exists), `support` (operational assistance, no PR).
Modes without code skip phases 1.5–4 and their package says which phases apply.

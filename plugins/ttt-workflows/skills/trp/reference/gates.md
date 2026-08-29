# TRP gates

AGENTS.md in the operator's workspace is THE LAW — this file indexes and sequences
it; wherever wording differs, AGENTS.md wins. Read AGENTS.md in FULL before Phase 0.

## Contents
- The eight operational gates (index)
- Pre-push gates
- Subagent prompt rules
- Forbidden vocabulary
- Attribution scan
- The PR-done bar
- Failure catalogue (learned from real rebukes)

## The eight operational gates (AGENTS.md "Operational gate" — index)

1. Adversarial self-review of your OWN diff before "done" — tests-pass is not this.
2. A fix must clear the class it fixes — no sibling bugs of the same class.
3. Verification may not stub the surface under test — a stubbed pass is unproven.
4. Catch defects BEFORE the diff is review-visible — Phase 3.5 exists for this;
   the visible reviewer's first pass confirms, never discovers.
5. The implementer runs the verifier's ENTIRE battery itself, first — real gates,
   real surface, every entrypoint enumerated repo-wide (scripts/tooling/migrations,
   not just src/), search stated so the scope is reviewable.
6. Claims must match code — PR body, commit message, ticket, all re-measured against
   the current head after ANY amend/push; restated ACs diffed against the original.
7. A verifier/reviewer discovery = the pre-declare gate FAILED — say so, strengthen
   it; never narrate discover→fix→re-verify as "the process working".
8. A FAIL verdict is NEVER handed upward as a question — fix and re-verify until
   PASS; only PASS, a genuine external blocker, or exhausted stop-and-report surface.

## Pre-push gates

Per client — clients.md routes to the law's exact command lists (AGENTS.md
W-LocalGate for Wheaton; the repo's own scripts for ITC). Universal, regardless of client:

- HARD RULE: never push with any failing test or red check the CI runs — CI
  continue-on-error is NOT permission (the only exception: provably pre-existing on
  trunk, stash-diff proven, reported).
- Green check ≠ proof. Gate on the REAL verdict (test output, verdict artifacts),
  not the check color.
- Attribution scan (below) before every push.
- Local CodeRabbit (Phase 3.5) before the first push when the CLI is installed.

## Subagent prompt rules

Subagents follow ONLY their prompt. Therefore every implementation-subagent prompt
carries, verbatim: the pre-push gates, the PR-done bar, the attribution scan, every
approved requirement (no "optional"), the real access paths (so "access blocked, so
I verified the rest" is unavailable), and "Do not delegate". A gate left out of the
prompt gets skipped — that is a prompt defect, not a subagent defect.

## Forbidden vocabulary (Rule 13 — on approved work)

`MVP`, `defer`, `out of scope`, `won't fit`, `future PR`, `future work`,
`separate ticket`, `separate PR`, `follow-up`, `simplify to`, `for now`, `punt`,
`leave for now`. Never in the package, the PR, the ticket, or an option menu.

## Attribution scan (before every commit/push/post — mechanical, not recalled)

```bash
git log -1 --format=%B | grep -iE 'co-authored|generated with|claude|anthropic|opus|sonnet|haiku|🤖' && echo FAIL || echo OK
```

Same grep over the PR body and every ClickUp comment body before it is sent.
`clickup-update.mjs` refuses contaminated bodies on its own.

## The PR-done bar

Confirmed by command output, never assumed: assignee set + reviewers requested;
checks green with no NEW failures vs the trunk baseline; zero unresolved review
threads (CodeRabbit's included, on the current head); affected tests pass locally;
every number/claim in the body re-measured at the current head.

## Failure catalogue (each item is a real, named rebuke — do not repeat them)

- **Questions the code can answer, asked to the operator.** Query the repo,
  telemetry, config, pipelines first. Ask only for owner-only decisions, as options
  with a default.
- **Changelog missing env-var handling, end-to-end verification, or PR creation.**
  Those sections are mandatory in every package; their absence is a violation.
- **No detailed changelog before acting.** Nothing executes without the presented
  package and explicit approval — including "obvious" work and read-only subagents.
- **"Suspected/likely/probably" root causes.** Evidence with file:line and a
  verified failure in the real artifact, or the claim doesn't ship.
- **Ignoring a named evidence file (GAP-LIST).** When the invocation names one,
  reading it is part of Phase 0.
- **Phase 5 as status-flip only.** Both actions, every round; verify the comment
  landed by re-fetch.
- **Treating clients as interchangeable.** Wheaton (ADO, no flags, ADO REST quirks)
  and ITC (GitHub, CodeRabbit CI, deploy scripts) diverge — route via clients.md.
- **New branch/PR without approval.** Work lands where the approved package says;
  never open a new branch or PR the operator did not approve.
- **Stale numbers after a push.** Every count in body/ticket/report is re-measured
  against the new head, baselines re-derived from the real merge-base.

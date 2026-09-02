# Review rubric

The checklist the reviewer works through. Condensed from the PR Review Protocol
(R1–R11). Read it in full before writing findings.

## Contents

- Evidence discipline (how sure must you be)
- Step 0 — intent first
- Inspection order (what to look at, in priority)
- AI-authored code checklist
- Security checklist
- Tests
- Behavioural + currency check
- Comment craft
- Re-review
- What NOT to do

## Evidence discipline

- **Trace every finding to real lines you read.** Cite `file:line` and the failure
  path. If you cannot, drop it. A finding you cannot anchor is a hallucination.
- **Try to disprove each finding before you keep it.** Assume false-positive until
  you fail to refute it. When still unsure, downgrade to a `question`.
- **Confirm each cited line against the fetched diff.** The line number must point at
  the code you describe. Never carry a line number from another file or an old version.
- **State your evidence tier.** "Verified by tracing X" outranks "this looks like it
  may". Never present a hunch as a confirmed bug.

## Signal over noise (R12)

- Comment only findings you verified and hold high confidence in. A speculative nit is
  worse than silence: it trains the author to skim past the review, so the real bug
  drowns with it.
- If you could not confirm it against the diff, drop it, or mark it low-confidence and
  keep it separate — never flat alongside real findings, and never as a blocker.
- Prefer one well-anchored blocking finding over ten nitpicks. Five nits and no design
  comment on a substantive diff is a failed review, not a thorough one.

## Order by altitude (R13)

- Lead with what matters. Design / correctness / security findings sort before
  readability / nits, and blocking sorts before non-blocking, so the first thing the
  reader scans is the most important thing.
- The output is scan-first (verdict + tally + a one-row-per-finding table), with full
  depth one glance deeper. Give each finding a ≤ ~8-word `headline` for the scan table,
  distinct from its full `problem` text.

## Step 0 — intent first

Before judging HOW, understand what the change is SUPPOSED to do. Read the PR body
and the ticket it references — if `pr.json` carries a `ticket` object, diff the diff
against its description and acceptance criteria, not just against the PR body. A
change can be flawless code that solves the wrong problem; correctness has no meaning
without a target. Claims in the body/ticket are hypotheses to verify (see the
behavioural check below), never facts to repeat.

## Inspection order (priority)

1. **Design / architecture** — does this change belong here, integrate cleanly, and
   land at the right time? The most valuable comments are here.
2. **Correctness** — edge cases, null / error paths, off-by-one, concurrency, races,
   resource leaks, read-modify-write with no concurrency token, check-then-act (TOCTOU).
3. **Security** — see the checklist below.
4. **Tests** — present, and meaningful (see below).
5. **API / interface** — names, contracts, backward compatibility.
6. **Readability / complexity** — complex code invites future bugs; flag it.
7. **Performance** — only where it is demonstrably load-bearing. No speculative asks.
8. **Docs / comments** — match behaviour; explain WHY, not WHAT.

Look at every changed line. Only generated code, lockfiles, and bulk data may be
skimmed; never skim a written class, function, or block and assume it is fine.

## AI-authored code checklist

When the diff is AI-authored (attribution trailer, the author says so, or it is
obvious), the failure profile changes: AI code fails plausible, not sloppy — clean
surface over hidden misalignment. On top of the normal review:

- **Intent-alignment.** Does it do what the ticket/AC asked, or merely something
  coherent nearby? Step 0 with the skepticism dialed up.
- **Dependency existence + provenance.** Registry-check every NEW package before
  trusting it. Hallucinated names recur deterministically and attackers pre-register
  them (slopsquatting). Concretely:
  `npm view <pkg> time.created dist-tags.latest repository.url` — a package that
  appeared last month with no repo is a finding, not a dep. Age alone is not the
  verdict: `@pinojs/redact` (created 2025-10) clears because it lives under the
  official `pinojs` org — judge creation date AND provenance together. (PyPI: check
  `https://pypi.org/pypi/<pkg>/json` release history.) When deps were added, name
  the check you ran in the review.
- **API reality.** Called methods/options must exist in the PINNED version of the
  library — not a blend of versions the model trained on. Spot-check unfamiliar ones
  against that version's docs.
- **Over-engineering.** Speculative generality is the signature AI defect:
  abstractions for single-use code, config nobody asked for, handlers for impossible
  states. Flag it.
- **No polish credit.** A well-written-looking block earns MORE scrutiny, not less —
  polish is what hides the misalignment.

## Security checklist (OWASP-aligned)

- Secrets committed: keys, tokens, connection strings, default creds.
- Injection across every input vector: params, headers, bodies, file uploads.
- AuthN and object-level authZ on new endpoints. Hunt IDOR and privilege escalation.
- Server-side input validation. Reject invalid input rather than sanitizing it. Empty strings that bypass filters.
- Supply chain: every NEW or bumped dep gets the existence + provenance check above;
  lockfile and CI / build-script edits; CI trigger safety (`pull_request` vs
  `pull_request_target`).
- PII in logs or errors.
- Failures fail closed, not open.

## Tests

- Judge by intent, not coverage %. A test that cannot fail when business logic changes
  is worthless.
- Demand meaningful assertions. Reject "asserts no error" and snapshot noise.
- Demand edge and negative cases: null, empty, boundary, error paths.
- Flag flakiness sources: real time, network, ordering, shared mutable state.
- A verification that mocks the surface the change lives on proves nothing about it.

## Behavioural + currency check (do this on every review)

1. **What does it ACTUALLY do?** Trace the real behaviour and state it in your own
   words, then diff that against what the PR body, commit message, ticket, and code
   comments CLAIM. A claim the code does not deliver — a dimension left unset, a
   "fixes X" that half-fixes X, a doc line that overstates what ships, a metric or
   alert that never fires — is a defect, flagged like any bug. The description is a
   hypothesis you verify, never a fact you repeat.
2. **Is it CURRENT?** Judge against best practice as of this review's month and year.
   Verify against the vendor's or library's current docs, not memory: APIs, library
   idioms, security defaults, CI / action patterns, dependency versions, model IDs.
   Call out anything deprecated or superseded, and state the date and source when
   currency is load-bearing. The rule cuts both ways: do not fault code for missing a
   "best practice" you have not confirmed is current.

## Comment craft

How a finding is said decides whether it lands in one round or spawns a thread.

- **Comment on the code, never the author.** No "you did / you should". Name the
  code's property: not "why did you use threads here?" but "the concurrency model
  adds complexity without a measured benefit; single-threaded is simpler."
- **Carry the why.** Every comment states the principle or consequence, not just the
  observation. That is what makes it teach, and what makes the fix land first try.
- **Clarity belongs in the code.** If something needs explaining, ask for clearer
  code or a code comment in the repo — never an explanation that lives only in the
  review thread, invisible to future readers.
- **Real questions only.** Genuine uncertainty is a `question`; a demand dressed as
  a question is neither.
- **Unblock.** Better after merge + only minor tweaks left → recommend
  approve-with-comments and trust the author. Correctness/security still blocks, and
  deferral scrutiny (below) still applies. Minor means minor.
- **Honest coverage.** Past roughly 400–500 changed lines, review rigor degrades.
  On an oversized diff, say where the review focused and what got lighter treatment
  instead of implying uniform depth.

## Re-review (when the PR already has your earlier comments)

- Review only what changed since the last pass. Use the incremental diff.
- Acknowledge feedback the author addressed. Do not silently move on.
- Do not reopen settled points or inject new unrelated asks late.
- Scrutinize deferrals ("separate ticket", "follow-up"): confirm the punt is legitimate
  and non-blocking before letting it stand.

## What NOT to do

- No bikeshedding style a linter or formatter already governs.
- No nit-flooding to look thorough.
- No vague comments ("feels off") without a line, a reason, and a fix.
- Do not block on preference dressed as a defect. Distinguish "different" from "wrong".
- Do not gate a PR on pre-existing problems. Flag them separately, non-blocking.
- No "LGTM" on a substantive diff.

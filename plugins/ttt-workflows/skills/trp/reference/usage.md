# trp

Takes a ClickUp ticket to merge-ready. Writes the plan first and waits for your OK before building.

**→ Paste a ticket URL to start.**

Type **`options`** for modifiers, client routing, and the phases.

<details>
<summary><code>options</code></summary>

```
trp — deliver a ClickUp ticket to merge-ready (plan → approve → build → PR → ticket)

USAGE
  trp <ticket-url> [— <modifier>]

ARGUMENTS
  <ticket-url>         app.clickup.com/t/…

MODIFIERS            append after an em-dash
  — no ClickUp, this PR    deliver against a PR only, skip the ticket write
  — Read GAP-LIST          ground the plan in the linked GAP-LIST
  — <env note>             e.g. "against staging"

RESPONSE MODES       inferred from the ticket
  implement            code change (default) — phases 0→5
  spike-writeup        options / investigation, no code
  support              a question or triage, no code

CLIENTS              auto-routed, not interchangeable
  Wheaton              Azure DevOps · develop/main · no feature flags
  ITC                  GitHub · CodeRabbit · feature flags

PHASES
  0 ground · 1 PLAN→approve · 2–3 build+gates · 3.5 review-to-zero · 4 PR · 5 ticket

AUTH
  CLICKUP_TOKEN_FILE   required — read + update the ticket
  gh (ITC) | az (Wheaton)   push the branch, open the PR

EXAMPLES
  TRP Process for: https://app.clickup.com/t/abc123
  TRP Process for: https://app.clickup.com/t/abc123 — no ClickUp, this PR
  TRP Process for: https://app.clickup.com/t/abc123 — Read GAP-LIST, against staging

NEVER  builds before you approve · a "suspected" cause · AI attribution · a failing push
```
</details>

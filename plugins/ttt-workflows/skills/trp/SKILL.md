---
name: trp
description: Runs the Task Resolution Protocol (TRP) end to end for a ClickUp ticket — grounds the ticket in the actual repo with evidence, assembles the Full TRP Package changelog (phases 0-5), STOPS for explicit approval, then implements, verifies through the local gates plus CodeRabbit and the pr-review skill, opens the PR, and posts the two-layer ClickUp update. Works for Wheaton OMS (Azure DevOps) and ITC (GitHub) tickets. Use when the user says "TRP Process for", "TRP", "Task Resolution Protocol", or pastes an app.clickup.com task URL asking for delivery of that ticket.
---

# trp

Deliver a ClickUp ticket end to end under the Task Resolution Protocol: ground it in
the real repo with evidence, present the Full TRP Package, stop for approval, then
implement → verify → quality-loop (CodeRabbit + pr-review) → PR → two-layer ClickUp
update. AGENTS.md in the operator's workspace is THE LAW — read it in FULL before
anything else; this skill sequences it and never overrides it.

## When to invoke

The user says "TRP Process for: <ClickUp URL>" (or names TRP / Task Resolution
Protocol) — optionally with modifiers: "no ClickUp, this PR", "Read GAP-LIST",
client or environment notes. Invoked without a ticket URL, ask for it; do not guess.

## On invocation: open the picker

If the operator already pasted a ticket link with clear intent, skip the picker and proceed.
Otherwise open the **Ask** picker: call AskUserQuestion with the four paths defined in
`reference/usage.md` (Deliver this ticket · Just the code, skip the ticket · Show me how this
works · Options), then route:

- **Deliver this ticket** → full run. **Just the code** → the "no ClickUp" path. For either,
  run `scripts/preflight.mjs`; if it exits non-zero, relay its lines verbatim (what's missing +
  where) and WAIT. Then fetch the ticket and start Phase 0.
- **Show me how this works** → present the "How it works" section of `reference/usage.md`.
- **Options** → present the "Options" section of `reference/usage.md`.

Never start delivery until preflight is clean and the plan is approved (Phase 1).

**Then check auth.** Run this skill's `scripts/preflight.mjs`. If it exits non-zero, it prints exactly which credential/tool is missing and where to put it (a file path + the env var, or the `gh`/`az` login command) — relay those `✗` lines to the operator verbatim and WAIT for them to provide it. Do not run the skill until preflight is clean.

## Files in this skill

- `scripts/preflight.mjs` — checks required auth (ClickUp token + gh/az) and says where to put it. Run it first.
- `scripts/fetch-ticket.mjs` — ticket + ALL comments + status → ticket.json (read-only). Run it.
- `scripts/clickup-update.mjs` — Phase 5 status + two-layer comment, dry-run by
  default, `--live` to execute, attribution + two-layer + landed gates built in. Run it.
- `scripts/selftest.mjs` — regression battery for the deterministic layer. Run after
  any script edit; every check must be OK.
- `reference/usage.md` — the on-invocation end-to-end guide (present this first).
- `reference/phases.md` — the phase machine (0 → 5, incl. 3.5) with exit criteria. Read in full.
- `reference/gates.md` — operational gates, pre-push gates, forbidden vocabulary,
  attribution scan, PR-done bar, failure catalogue. Read in full.
- `reference/clients.md` — Wheaton (ADO) vs ITC (GitHub) routing; pointers into AGENTS.md.
- `reference/templates.md` — the Full TRP Package, PR bodies, two-layer comment.

## Workflow

Copy this checklist and work through it:

```
- [ ] 0. Read AGENTS.md fully + reference/gates.md + reference/phases.md
- [ ] 1. Fetch ticket + comments (+ GAP-LIST if named) → ticket.json
- [ ] 2. Phase 0: ground in the repo — file:line evidence, every gap answered yourself
- [ ] 3. Assemble the Full TRP Package (templates.md) — every mandatory section
- [ ] 4. PRESENT IT AND STOP. Wait for explicit approval. Nothing executes before it.
- [ ] 5. Phase 2-3: implement with task/verify pairs; client local gates green
- [ ] 6. Phase 3.5: coderabbit to zero actionable (if installed) → push → open PR →
        run the pr-review skill on the PR → fix EVERY finding → re-run to clean
- [ ] 7. Phase 4: PR-done bar confirmed by command output
- [ ] 8. Phase 5: clickup-update.mjs dry-run → review → --live; both actions verified
- [ ] 9. Final report: evidence per changelog item; nothing "done" with a gate unmet
```

Commands:

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/trp/scripts/fetch-ticket.mjs "<TICKET_URL>" --out ticket.json
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md          # dry-run
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md --live   # execute
```

## Hard rules

- **The approval gate is absolute.** Everything before the operator's approval is
  read-only. No branch, no subagent, no write — including "obvious" work.
- **Discover, don't punt.** A question the repo/config/telemetry can answer is never
  asked to the operator. Owner-only decisions surface as options with a default.
- **Evidence first.** Every root-cause claim carries file:line and a verified failure
  in the real artifact. "Suspected/likely" does not ship.
- **Every approved item is mandatory.** Rule-13 vocabulary (gates.md) never appears
  in a package, PR, ticket, or option menu.
- **Confirm, don't discover (Phase 3.5).** CodeRabbit locally before the diff is
  review-visible; the pr-review skill against the PR after; every finding fixed
  before a human reads it.
- **No AI attribution** in any commit, PR body, or ClickUp comment — mechanically
  scanned before every push and post; the scripts refuse contaminated bodies.
- **FAIL loops close internally** (gates.md #8). Only PASS, a genuine external
  blocker, or an exhausted stop-and-report ever surfaces.
- **Client routing is real** (clients.md). Wheaton and ITC are not interchangeable.

## Constraints

- Depends on `node`, `git`, plus per-client tooling (`gh` / `az`, `coderabbit` when
  installed) and the ClickUp token file (see pr-review's platforms doc — same token).
- `ticket.json` / package drafts / phase5.md are working files; keep them in a
  scratch dir, never in the target repo.
- Response modes without code (`spike-writeup`, `support`) skip phases 1.5-4; the
  package states which phases apply (phases.md "Response modes").
- The pr-review skill is a sibling skill; Phase 3.5 invokes
  it as documented there — read-only against the PR, findings fixed here.


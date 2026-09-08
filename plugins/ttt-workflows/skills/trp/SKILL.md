---
name: trp
model: claude-opus-4-7
description: Deliver a ClickUp ticket end-to-end with the Task Resolution Protocol (TRP). It grounds the ticket in the actual repo with evidence, assembles the full TRP change plan (phases 0–5), then pauses for your explicit approval before making any change. After you approve, it implements the change, verifies it through the local gates plus CodeRabbit and the pr-review skill, opens the pull request, and posts a two-layer ClickUp update. Works with GitHub or Azure DevOps repos. Use when you say "TRP", "TRP Process for", or "Task Resolution Protocol", or paste an app.clickup.com task URL and ask to deliver that ticket.
license: MIT. See LICENSE.
compatibility: Requires node, git, a ClickUp token (CLICKUP_TOKEN_FILE), and gh (GitHub) or az (Azure DevOps). Works with any GitHub or Azure DevOps repo; the platform is detected from the repo remote.
metadata:
  author: ttt-studios
  version: "1.5.2"
---

# trp

Deliver a ClickUp ticket end to end under the Task Resolution Protocol: ground it in
the real repo with evidence, present the Full TRP Package, stop for approval, then
implement → verify → quality-loop (CodeRabbit + pr-review) → PR → two-layer ClickUp
update. This skill is self-contained: the protocol lives in its own `reference/` files
(phases, gates, clients, templates) — no external rulebook needed.

## When to invoke

The user says "TRP Process for: <ClickUp URL>" (or names TRP / Task Resolution
Protocol) — optionally with modifiers: "no ClickUp, this PR", "Read GAP-LIST",
client or environment notes. Invoked without a ticket URL, ask for it; do not guess.

## On invocation: open the picker

If the operator already pasted a ticket link with clear intent, skip the picker and proceed.
Otherwise open the **Ask** picker: call AskUserQuestion with the four paths defined in
`reference/usage.md` (Deliver this ticket · Look into it first (a spike) · Show me how this
works · Options), then route:

- **Deliver this ticket** → full run (or the "no ClickUp" path if they say just the code).
  **Look into it first** → the `spike-writeup` response mode. For either, run
  `scripts/preflight.mjs`; if it exits non-zero, relay its lines verbatim (what's missing +
  where) and WAIT. Then fetch the ticket and launch the Phase 0 grounding subagent
  (Execution model below).
- **Show me how this works** → present the "How it works" section of `reference/usage.md`.
- **Options** → open a second **Ask** picker of the topics defined in the `reference/usage.md` "Options — drill-down" section; present the chosen subsection, then offer the topic picker again so they can read another.
- **deep dive** (asked any time) → present `reference/deep-dive.md` — the full technical walkthrough.

Never start delivery until preflight is clean and the plan is approved (Phase 1).

## Execution model: heavy phases in subagents, gates in this conversation

The picker, preflight, the approval gate, every owner decision, the Phase 5 dry-run review
and `--live` call, and the final report stay in the main conversation — they need
AskUserQuestion or the operator's eyes, and a subagent has neither. Everything that reads
whole files, runs gates, or iterates on findings runs in an Agent-tool subagent so it never
shares the operator's context. Every subagent: `subagent_type: general-purpose`,
`model: claude-opus-4-7`, a self-contained prompt (it sees nothing of this conversation),
and "Do not delegate" — no nested subagents.

1. **Phase 0 grounding subagent (read-only)** — `description: TRP Phase 0: <TICKET-ID>`.
   The prompt carries the ticket URL, the path to `ticket.json` (+ any GAP-LIST the operator
   named), the target repo path, the skill dir, the response mode, and an instruction to read
   `reference/gates.md`, `reference/phases.md`, `reference/clients.md`, and
   `reference/templates.md` in full before touching the repo. It restates the read-only rule
   verbatim: no branch, no write, no commit, no ClickUp call, no subagent. It cannot ask, so
   every gap is answered from the repo and every owner-only decision goes INTO the package as
   options with a default. Its final message MUST be the Full TRP Package (templates.md),
   verbatim, nothing else.
2. **Approval gate (inline)** — present the package to the operator unmodified and STOP.
   Nothing else executes until they approve. On a change request, re-run step 1 with the
   feedback in the prompt.
3. **Delivery subagent (Phases 2 → 4)** — `description: TRP deliver: <TICKET-ID>`. The prompt
   carries the approved package verbatim plus, verbatim, the gates.md pre-push gates, the
   PR-done bar, the attribution scan, every approved requirement (none optional), the real
   access paths, and "Do not delegate" (gates.md "Subagent prompt rules"). It branches,
   implements with task/verify pairs, runs the client's full local gate, runs local
   CodeRabbit to zero actionable findings, pushes, opens the PR per clients.md, and returns
   the PR URL, head SHA, gate output, and per-changelog-item evidence. A FAIL never comes
   back as a question (gates.md #8).
4. **pr-review loop (inline orchestration)** — invoke the `pr-review` skill on the PR URL
   (it runs its own subagent). If it returns findings, resume the delivery subagent with the
   review verbatim: fix every finding, re-run the gates, push, report the new head. Re-run
   pr-review at that head. Repeat until it returns ✅ Approve or 💬 Comment with nothing left
   to fix.
5. **Phase 5 (inline)** — `clickup-update.mjs` dry-run, read it, then `--live`; both verified.
6. **Final report (inline)** — the delivery subagent's evidence list plus the review outputs.

## Files in this skill

- `scripts/preflight.mjs` — checks required auth (ClickUp token + gh/az) and says where to put it. Run it first.
- `scripts/fetch-ticket.mjs` — ticket + ALL comments + status → ticket.json (read-only). Run it.
- `scripts/clickup-update.mjs` — Phase 5 status + two-layer comment, dry-run by
  default, `--live` to execute, attribution + two-layer + landed gates built in. Run it.
- `scripts/selftest.mjs` — regression battery for the deterministic layer. Run after
  any script edit; every check must be OK.
- `reference/usage.md` — the on-invocation picker + How-it-works + Options.
- `reference/deep-dive.md` — the full technical walkthrough (on "deep dive").
- `reference/phases.md` — the phase machine (0 → 5, incl. 3.5) with exit criteria. Read in full.
- `reference/gates.md` — operational gates, pre-push gates, forbidden vocabulary,
  attribution scan, PR-done bar, failure catalogue. Read in full.
- `reference/clients.md` — Azure DevOps vs GitHub full delivery protocol, self-contained.
- `reference/templates.md` — the Full TRP Package, PR bodies, two-layer comment.

## Workflow

Copy this checklist and work through it:

```text
- [ ] 0. Inline: preflight clean → fetch ticket + comments (+ GAP-LIST if named) → ticket.json
- [ ] 1. Subagent (read-only): read gates/phases/clients/templates → Phase 0 grounding —
        file:line evidence, every gap answered → returns the Full TRP Package
- [ ] 2. Inline: PRESENT THE PACKAGE AND STOP. Wait for explicit approval.
- [ ] 3. Subagent: Phase 2-3 implement with task/verify pairs; client local gates green
- [ ] 4. Same subagent: Phase 3.5 coderabbit to zero actionable (if installed) → push → open PR
- [ ] 5. Inline: run the pr-review skill on the PR → resume the subagent to fix EVERY finding
        → re-run to clean
- [ ] 6. Subagent report: Phase 4 PR-done bar confirmed by command output
- [ ] 7. Inline: Phase 5 clickup-update.mjs dry-run → review → --live; both actions verified
- [ ] 8. Inline: final report — evidence per changelog item; nothing "done" with a gate unmet
```

Commands:

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/trp/scripts/fetch-ticket.mjs "<TICKET_URL>" --out ticket.json
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md          # dry-run
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md --live   # execute
```

## Hard rules

- **Model pin (config-driven).** This skill runs on `claude-opus-4-7` (SKILL.md frontmatter). Every subagent and workflow it launches uses the same model: pass `model: 'claude-opus-4-7'` on each `agent()` call and Agent-tool subagent, so delegated work never silently drops to another model.

- **The approval gate is absolute.** Everything before the operator's approval is
  read-only. No branch, no write, no implementation subagent — including "obvious" work.
  The only subagent before approval is the read-only Phase 0 grounding subagent that
  produces the package.
- **Gates stay in the main conversation.** AskUserQuestion is not available to a subagent,
  so the picker, the preflight WAIT, the approval gate, and every owner decision run inline.
  Subagents receive decisions in their prompt and return reports, never questions.
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
- **Platform routing is real** (clients.md). GitHub and Azure DevOps are detected from the repo remote and never mixed.

## Constraints

- Depends on `node`, `git`, plus per-client tooling (`gh` / `az`, `coderabbit` when
  installed) and the ClickUp token file (see pr-review's platforms doc — same token).
- `ticket.json` / package drafts / phase5.md are working files; keep them in a
  scratch dir, never in the target repo.
- Response modes without code (`spike-writeup`, `support`) skip phases 1.5-4; the
  package states which phases apply (phases.md "Response modes").
- The pr-review skill is a sibling skill; Phase 3.5 invokes
  it as documented there — read-only against the PR, findings fixed here.

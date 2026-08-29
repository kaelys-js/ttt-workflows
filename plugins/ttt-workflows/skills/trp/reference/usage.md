# trp

Takes a ClickUp ticket to merge-ready: writes you a plan, **stops for your OK**, then builds,
reviews its own work, opens the PR, and updates the ticket. Nothing is built before you approve.

**Paste a ticket URL to start:**

```
TRP Process for: https://app.clickup.com/t/abc123
```

**Add a modifier if you want:**

```
…abc123  — no ClickUp, this PR      # deliver against a PR only, no ticket write
…abc123  — Read GAP-LIST            # ground the plan in the linked GAP-LIST
```

You'll see the plan and approve it before anything runs. Needs a ClickUp token plus `gh` (ITC) or
`az` (Wheaton); it checks on start and tells you if anything's missing.

_Say **"options"** for response modes, client routing, and the phases._

<details>
<summary>Options — full reference</summary>

**Response modes** (inferred from the ticket):
- **implement** (default) — a code change: plan → approve → build → PR → ClickUp update.
- **spike-writeup** — options/investigation, no code.
- **support** — a question or triage, no code.

**Clients** (routed automatically, not interchangeable):
- **Wheaton** — Azure DevOps, branches `develop`/`main`, no feature flags.
- **ITC** — GitHub, CodeRabbit, feature flags.

**Phases:** 0 ground in the repo → 1 **present the plan and STOP for approval** → 2–3 implement +
local gates green → 3.5 CodeRabbit + the pr-review skill to zero findings → 4 open the PR → 5 update
the ticket (status + PM/technical comment).

**Auth:** `node` + a ClickUp token (`~/.config/ttt/clickup.token` or `CLICKUP_TOKEN_FILE`), plus
`gh` (ITC) or `az` (Wheaton) to push and open the PR.

**Guarantees:** the approval gate is absolute (everything before Phase 1 is read-only) · discover,
don't punt · evidence first, no "suspected" cause · every approved item ships · no AI attribution ·
real gates green before every push.

**Scripting:**
```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"
node $D/trp/scripts/fetch-ticket.mjs "<TICKET_URL>" --out ticket.json
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md --live
```
</details>

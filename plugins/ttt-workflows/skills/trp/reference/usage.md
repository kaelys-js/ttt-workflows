# trp

Takes a ClickUp ticket to merge-ready. Writes the plan first and waits for your OK before building.

**→ Paste a ticket URL to start.**

Type **`options`** for modifiers, client routing, and the phases.

<details>
<summary><code>options</code></summary>

**Modifiers** (append to the URL): `no ClickUp, this PR` (deliver to a PR only) · `Read GAP-LIST` (ground the plan in it) · env notes like "against staging".

**Response modes** (from the ticket): implement a code change (default) · spike-writeup (options, no code) · support (a question, no code).

**Clients** (auto-routed): Wheaton — Azure DevOps, `develop`/`main`, no flags. ITC — GitHub, CodeRabbit, feature flags.

**Phases:** 0 ground in the repo → 1 **present the plan, STOP for approval** → 2–3 build + gates green → 3.5 CodeRabbit + pr-review to zero → 4 open the PR → 5 update the ticket.

**Auth:** a ClickUp token (`CLICKUP_TOKEN_FILE`) + `gh` (ITC) or `az` (Wheaton).

**Never:** builds before you approve · ships a "suspected" cause · drops an approved item · adds AI attribution · pushes a failing test.

**Scripting:**
```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"
node $D/trp/scripts/fetch-ticket.mjs "<TICKET_URL>" --out ticket.json
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md --live
```
</details>

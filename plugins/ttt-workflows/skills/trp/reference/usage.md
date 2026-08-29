# trp

Takes a ClickUp ticket from open to merge-ready under the Task Resolution Protocol: grounds it
in the real code, writes a plan, **stops for your approval**, then builds, self-reviews, opens
the PR, and updates the ticket. Nothing is built or written before you approve.

**Invoke:** paste a ClickUp ticket URL. e.g. `TRP Process for: https://app.clickup.com/t/abc123`

## Modifiers — append to change what it does

| modifier | effect |
|---|---|
| _(none)_ | full delivery: plan → approve → implement → PR → ClickUp update |
| `no ClickUp, this PR` | skip the ClickUp write; deliver against a PR only |
| `Read GAP-LIST` | pull the linked GAP-LIST and ground the plan in it |
| client / env notes | e.g. "against staging", "Wheaton" — steers routing + gates |

## Response modes — inferred from the ticket

| mode | when | phases |
|---|---|---|
| implement | ticket asks for a code change (default) | 0 → 5 (full) |
| `spike-writeup` | ticket asks for options / investigation, no code | 0 → 1, then write-up |
| `support` | question / triage, no code | 0, then answer |

## Clients — routed automatically, not interchangeable

| | Wheaton | ITC |
|---|---|---|
| host | Azure DevOps | GitHub |
| branches | `develop` / `main` | trunk + feature flags |
| review bot | — | CodeRabbit |
| flags | none (must ship correct) | feature flags |

## The phases

| # | phase | gate |
|---|---|---|
| 0 | ground the ticket in the repo — file:line evidence, answer your own questions | |
| 1 | assemble the Full TRP Package (the plan) | **STOP — wait for your approval** |
| 2–3 | implement with verify pairs; client local gates green before any push | |
| 3.5 | CodeRabbit + the pr-review skill to zero findings before a human sees it | |
| 4 | open the PR — assignee, reviewers, checks green | |
| 5 | update the ticket — status + two-layer comment (PM summary + technical) | |

## Auth — checked on start; preflight names anything missing and where to put it

| | needs |
|---|---|
| required | `node` · a ClickUp token — put your `pk_` token at `~/.config/ttt/clickup.token` or set `CLICKUP_TOKEN_FILE=<path>` |
| required | `gh` (ITC) **or** `az` (Wheaton) — to push the branch and open the PR |

## Guarantees

**The approval gate is absolute** — everything before Phase 1 approval is read-only. Discover,
don't punt (answers what the repo/config/telemetry can answer). Evidence first — no "suspected"
root cause. Every approved item ships (no defer/for-now). No AI attribution. Real gates green
before every push.

## Examples

```
TRP Process for: https://app.clickup.com/t/abc123
TRP Process for: https://app.clickup.com/t/abc123  — no ClickUp, this PR
TRP Process for: https://app.clickup.com/t/abc123  — Read GAP-LIST, against staging
```

<details>
<summary>Run the scripts yourself (scripting)</summary>

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/trp/scripts/fetch-ticket.mjs "<TICKET_URL>" --out ticket.json
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md          # dry-run
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md --live   # execute
```
</details>

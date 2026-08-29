# trp — how to use it

**TL;DR** — Hand it a ClickUp ticket and it takes the whole thing off your plate: reads the
ticket, figures out the fix from the real code, writes you a plan, and **stops for your OK**.
Only after you approve does it build, test, review its own work, open the PR, and update the
ticket. Nothing happens before you say go.

**You give it:** a ClickUp ticket URL.
**You get back:** a plan to approve — then a merged-ready PR and a written-up ticket.

> **On start it runs a quick auth check.** If anything's missing it tells you exactly what to provide and where to put it (a file path + env var, or a `gh`/`az` login) before it does anything.

---

## How it goes, start to finish

1. **Reads the ticket** — the ask, every comment, the current status.
2. **Grounds it in the code** — finds the real files and lines, answers its own questions instead of asking you.
3. **Writes you a plan** — a detailed changelog of exactly what it'll change.
4. 🛑 **Stops and waits.** Nothing is built, branched, or written until you approve.
5. **Builds + tests** — with the client's real local gates green before anything is pushed.
6. **Reviews its own work** — runs CodeRabbit and the pr-review skill, fixes every finding, *then* a human sees it.
7. **Opens the PR** — assignee set, reviewers requested, checks green.
8. **Updates the ticket** — a plain-English summary for the PM plus the technical detail.

## The one rule that never bends

**Step 4 is absolute.** Everything before your approval is read-only — no branch, no code, no
writes, not even "obvious" work. You always see the plan first.

## What it won't do

Ask you things it could look up itself. Ship a "suspected" root cause without proof. Quietly
drop an approved item or defer it to "later." Put an AI credit on a commit, PR, or comment.
Push with a failing test.

## Knows your two clients

**Wheaton** (Azure DevOps, `develop`/`main`, no feature flags) and **ITC** (GitHub,
CodeRabbit, feature flags) use different tooling and gates — it routes to the right one
automatically.

## To start

Paste a ClickUp ticket URL, e.g. *"TRP Process for: <url>"*. Add modifiers if you want —
*"no ClickUp, just the PR"*, or point it at a GAP-LIST.

<details>
<summary>The scripts it runs</summary>

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # works as plugin OR ~/.claude/skills symlink
node $D/trp/scripts/fetch-ticket.mjs "<TICKET_URL>" --out ticket.json
# → ground in repo → present plan → STOP for approval → build+test → CodeRabbit+pr-review → PR
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md          # dry-run
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md --live   # execute
```
</details>

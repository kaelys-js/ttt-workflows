# 🎫 trp

**Takes a ClickUp ticket from open to merge-ready.** Reads the ticket, works out the fix from
the real code, writes you a plan, and **stops for your OK.** Only after you approve does it
build, test, review its own work, open the PR, and update the ticket.

**Bring →**  a ClickUp ticket URL
**Get →**  a plan to approve · then a merge-ready PR and a written-up ticket

### Ready check
_Runs on start. If something's missing it names it and says where to put it._

| | needs | for |
|---|---|---|
| **required** | `node` · a ClickUp token (`CLICKUP_TOKEN_FILE`) | read + update the ticket |
| **required** | `gh` (ITC) **or** `az` (Wheaton) | push the branch, open the PR |

### ▶ Start
**Paste the ticket URL** — e.g. *"TRP Process for: `<url>`"*. Add modifiers if you want:
*"no ClickUp, just the PR"*, or point it at a GAP-LIST.

> 🛑 **The approval gate is absolute.** Nothing is built, branched, or written until you
> approve the plan. You always see it first.

---

<details>
<summary><b>How delivery works</b> — the phases</summary>

1. **Reads the ticket** — the ask, every comment, the current status.
2. **Grounds it in the code** — real files and lines; answers its own questions instead of asking you.
3. **Writes you a plan** — a detailed changelog of exactly what changes.
4. 🛑 **Stops and waits** for your approval. Everything before this is read-only.
5. **Builds + tests** — the client's real local gates green before anything is pushed.
6. **Reviews its own work** — CodeRabbit + the pr-review skill, fixes every finding, *then* a human sees it.
7. **Opens the PR** — assignee set, reviewers requested, checks green.
8. **Updates the ticket** — a plain-English summary for the PM plus the technical detail.

**Won't:** ask what it could look up · ship a "suspected" cause without proof · quietly drop
an approved item · put an AI credit anywhere · push with a failing test.

**Knows your clients:** Wheaton (Azure DevOps, `develop`/`main`, no flags) and ITC (GitHub,
CodeRabbit, flags) route automatically.

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/trp/scripts/fetch-ticket.mjs "<TICKET_URL>" --out ticket.json
# → ground → present plan → STOP for approval → build+test → CodeRabbit+pr-review → PR
node $D/trp/scripts/clickup-update.mjs "<TICKET_URL>" --status "in review" --comment-file phase5.md --live
```
</details>

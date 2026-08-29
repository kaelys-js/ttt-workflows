# 🔍 pr-review

**Reviews a pull request end to end and hands you a paste-ready comment.** Reads the diff,
finds the real bugs, writes them up scan-first with blockers on top. Never touches the PR —
you post it.

**Bring →**  a PR link · `github.com/…/pull/N` or `dev.azure.com/…/pullrequest/N`
**Get →**  one review · a verdict, a severity table, then each finding with a concrete fix

### Ready check
_Runs on start. If something's missing it names it and says where to put it._

| | needs | for |
|---|---|---|
| **required** | `node` + `gh` (GitHub) **or** `az` (Azure DevOps) | fetch the diff |
| optional | ClickUp token (`CLICKUP_TOKEN_FILE`) | check ticket-linked PRs against their AC |

### ▶ Start
**Paste the PR URL.** Re-reviewing after a push? Say so — I cover only what changed and
acknowledge what got fixed.

---

<details>
<summary><b>How the review works</b> — 7 steps + the rubric</summary>

**The run:** fetch (read-only) → decide first-review vs re-review → review against the rubric
in priority order → write anchored findings → self-verify every anchor → render → hand over.

**Priority order:** design → correctness → security → tests → API → readability → perf → docs.
Every changed line gets read; only lockfiles/generated/bulk data are skimmed.

**Two questions most tools skip (R11):**
- Does the code do what the PR *says* it does? I state the real behaviour and flag any gap.
- Is it current? I judge against today's best practice and check the vendor's live docs when it matters.

**Signal over noise (R12):** one verified blocker beats ten nitpicks; anything I can't confirm
is dropped, never smuggled in as fact.

**Guarantees:** never mutates the PR (R9) · no AI attribution (renderer enforces) · functional
emojis only · reads like a person wrote it · won't block on lint or pre-existing issues.

**The renderer refuses to emit** if a line anchor doesn't match the real diff, a blocker has no
fix, or any AI attribution slipped in — so stale or sloppy reviews can't ship.

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/pr-review/scripts/fetch-pr.mjs "<PR_URL>" --out pr.json          # fetch (read-only)
node $D/pr-review/scripts/render-review.mjs findings.json --pr pr.json    # render paste-ready block
```
</details>

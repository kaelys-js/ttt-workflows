# pr-review

Reviews a pull request and hands you a paste-ready comment. Never touches the PR — you post it.

**Paste a PR URL to start:**

```
https://github.com/org/repo/pull/128
https://dev.azure.com/org/proj/_git/repo/pullrequest/2189
```

It fetches the diff read-only, reviews design → correctness → security → tests, and returns a
verdict plus findings with fixes. Re-reviewing after a push? Say so — it covers only what changed.

Needs `gh` (GitHub) or `az` (Azure DevOps); it checks on start and tells you if anything's missing.

_Say **"options"** for platforms, ticket-linked PRs, and the full rubric._

<details>
<summary>Options — full reference</summary>

**Cases** (inferred, no flag):
- **first review** — full pass over the whole diff.
- **re-review** — same PR after a push: only what changed, acknowledges fixes, no reopening settled points.
- **ticket-linked** — PR references a ClickUp ticket: also checks the change against the ticket's acceptance criteria.

**Reviews, in priority order:** design → correctness → security → tests → API → readability →
performance → docs. Every changed line read; lockfiles/generated skimmed. Also: does the code do
what the PR *says*, and is it current (vs the vendor's live docs).

**Output:** verdict (approve/comment/request-changes) · severity tally + one-row-per-finding
table · each finding labelled + `(blocking)`/`(non-blocking)`, anchored to `file:line`, with a fix.

**Auth:** `node` + `gh` **or** `az` (required). ClickUp token optional, ticket-linked PRs only —
`~/.config/ttt/clickup.token` or `CLICKUP_TOKEN_FILE=<path>`.

**Guarantees:** never mutates the PR · no AI attribution · one verified blocker beats ten nitpicks ·
won't block on lint or pre-existing issues · renderer refuses stale anchors, fix-less blockers, or attribution.

**Scripting:**
```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"
node $D/pr-review/scripts/fetch-pr.mjs "<PR_URL>" --out pr.json
node $D/pr-review/scripts/render-review.mjs findings.json --pr pr.json
```
</details>

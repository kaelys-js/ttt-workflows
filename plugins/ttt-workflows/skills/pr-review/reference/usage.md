# pr-review

Reviews a pull request and hands you a paste-ready comment. Never posts anything itself.

**→ Drop a PR link to start** — GitHub or Azure DevOps.

Type **`options`** for re-reviews, ticket checks, and the full rubric.

<details>
<summary><code>options</code></summary>

**Cases** (auto-detected): first review · re-review after a push (only what changed) · ticket-linked (also checks the ticket's acceptance criteria).

**Reviews:** design → correctness → security → tests → API → readability → perf → docs. Plus: does the code do what the PR *says*, and is it current (vs the vendor's live docs).

**Output:** verdict · severity tally · one row per finding, anchored to `file:line`, each with a fix.

**Auth:** `gh` (GitHub) or `az` (Azure DevOps). ClickUp token optional, ticket-linked PRs only (`CLICKUP_TOKEN_FILE`).

**Never:** posts, comments, approves, or resolves. No AI attribution. Won't block on lint or pre-existing issues.

**Scripting:**
```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"
node $D/pr-review/scripts/fetch-pr.mjs "<PR_URL>" --out pr.json
node $D/pr-review/scripts/render-review.mjs findings.json --pr pr.json
```
</details>

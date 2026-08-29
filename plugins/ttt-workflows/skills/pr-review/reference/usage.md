# pr-review

Reviews a pull request end to end and returns a paste-ready comment — verdict, severity table,
then each finding with a concrete fix. Read-only: it never posts, comments, approves, or
resolves anything. You paste it.

**Invoke:** paste a PR URL. `github.com/…/pull/N` · `dev.azure.com/…/pullrequest/N`

## Cases — inferred, no flag needed

| case | trigger | behaviour |
|---|---|---|
| first review | a PR URL you haven't reviewed | full pass over the whole diff |
| re-review | same PR after the author pushed | only what changed; acknowledges what got fixed; no reopening settled points |
| ticket-linked | PR references a ClickUp ticket | also diffs the change against the ticket's acceptance criteria |

## What it reviews — priority order

design → correctness → security → tests → API → readability → performance → docs.
Every changed line is read; only lockfiles / generated / bulk data are skimmed. On a diff over
~400–500 lines it says where the review focused and what got lighter treatment.

Two checks most tools skip: **does the code do what the PR says** (real behaviour vs the
description), and **is it current** (judged against today's best practice, verified against the
vendor's live docs).

## Output — the review comment

- one-line **verdict**: approve · comment · request-changes
- a **severity tally** + one-row-per-finding table
- each finding: labelled (`issue`/`suggestion`/`question`/…) + `(blocking)`/`(non-blocking)`,
  anchored to `file:line`, with a concrete fix

## Auth — checked on start; preflight names anything missing and where to put it

| | needs |
|---|---|
| required | `node` + `gh` (GitHub) **or** `az` (Azure DevOps) — to fetch the diff |
| optional | ClickUp token — only for ticket-linked PRs. Put your `pk_` token at `~/.config/ttt/clickup.token` or set `CLICKUP_TOKEN_FILE=<path>` |

## Guarantees

Never mutates the PR (no `gh pr review`/`comment`/`merge`, no ADO writes). No AI attribution.
Functional emojis only. One verified blocker beats ten nitpicks — unconfirmed hunches are
dropped, not smuggled in. Won't block on lint or pre-existing problems (flagged separately).
The renderer refuses to emit on a stale anchor, a fix-less blocker, or any attribution.

## Examples

```
https://github.com/org/repo/pull/128
https://dev.azure.com/org/proj/_git/repo/pullrequest/2189
review PR #128 again — I pushed fixes
```

<details>
<summary>Run the scripts yourself (scripting)</summary>

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/pr-review/scripts/fetch-pr.mjs "<PR_URL>" --out pr.json           # fetch (read-only)
node $D/pr-review/scripts/render-review.mjs findings.json --pr pr.json     # render paste-ready block
```
</details>

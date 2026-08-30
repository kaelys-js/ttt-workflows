# pr-review

Paste-ready PR reviews that never touch the PR.

**❯ Paste a GitHub or Azure DevOps PR link.**
You'll get a verdict, the issues that actually matter, and a fix for each.

`options` — re-reviews, ticket checks & the rubric

<details>
<summary><code>options</code></summary>

```
pr-review — review a PR, output a paste-ready comment (never posts it)

USAGE
  pr-review <pr-url>

ARGUMENTS
  <pr-url>              github.com/…/pull/N   or   dev.azure.com/…/pullrequest/N

BEHAVIOR              auto-detected, no flag
  first review         full pass over the whole diff
  re-review            same PR after a push — only what changed, acknowledges fixes
  ticket-linked        PR names a ClickUp ticket — also checks it against the AC

REVIEWS              in priority order
  design · correctness · security · tests · API · readability · perf · docs
  + does the code do what the PR says, and is it current (vs live vendor docs)

OUTPUT
  verdict · severity tally · one row per finding (file:line + a concrete fix)

AUTH
  gh                   GitHub         — gh auth login
  az                   Azure DevOps   — az login
  CLICKUP_TOKEN_FILE   ticket-linked PRs only (optional)

EXAMPLES
  https://github.com/org/repo/pull/128
  https://dev.azure.com/org/proj/_git/repo/pullrequest/2189
  review PR #128 again — I pushed fixes

NEVER  posts/comments/approves · AI attribution · blocks on lint or pre-existing issues
```
</details>

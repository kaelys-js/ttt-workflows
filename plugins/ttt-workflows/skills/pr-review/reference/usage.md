# pr-review — how to use it

**TL;DR** — Paste a PR link and it reviews the whole thing, then hands you a finished review
comment to paste yourself. It reads the diff, checks it for real bugs (not lint noise), and
writes up what it finds — shortest-path first, blockers on top. It never touches the PR.

**You give it:** a GitHub or Azure DevOps PR URL.
**You get back:** one paste-ready review comment — a verdict, a quick table, then the detail.

> **On start it runs a quick auth check.** If anything's missing it tells you exactly what to provide and where to put it (a file path + env var, or a `gh`/`az` login) before it does anything.

---

## What you get

A review built to read in ten seconds and still hold all the depth:

- a **one-line verdict** — approve, comment, or request-changes
- a **severity tally** and a **one-row-per-finding table** (what, where, how bad)
- then each finding in full: the problem, why it matters, and a concrete fix

## What it actually checks

Real problems, in priority order — design, then correctness, security, tests, API, and only
then style. It reads every changed line. For each finding it asks two extra questions most
tools skip:

- **Does the code do what the PR says it does?** It states what the change really does and flags any gap from the description.
- **Is this still current?** It judges against today's best practice, not habits from years ago, and checks the vendor's live docs when it matters.

It's built for signal over noise: one verified blocker beats ten nitpicks, and anything it
couldn't confirm gets dropped or flagged as low-confidence — never smuggled in as fact.

## What it will never do

**Touch the PR.** No posting, commenting, approving, or resolving — you paste the result. No
AI credit anywhere. No blocking on things a linter already handles or on pre-existing
problems (those get flagged separately). It reads like a person wrote it, not a model.

## To start

Paste a `github.com/.../pull/<n>` or `dev.azure.com/.../pullrequest/<n>` link. Reviewing the
same PR again after the author pushed? It picks up as a re-review — only what changed,
acknowledging what got fixed.

<details>
<summary>The scripts it runs</summary>

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # works as plugin OR ~/.claude/skills symlink
node $D/pr-review/scripts/fetch-pr.mjs "<PR_URL>" --out pr.json          # fetch (read-only)
# → review against the rubric → write findings.json → self-verify every anchor
node $D/pr-review/scripts/render-review.mjs findings.json --pr pr.json    # render paste-ready block
```

The renderer refuses to emit if a finding's line anchor doesn't match the real diff, if a
blocker has no fix, or if any AI attribution slipped in — so stale or sloppy reviews can't ship.
</details>

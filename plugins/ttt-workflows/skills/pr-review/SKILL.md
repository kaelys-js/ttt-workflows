---
name: pr-review
model: claude-opus-4-7
description: Review a GitHub or Azure DevOps pull request and get back a paste-ready comment. It is read-only: it never posts, comments on, or otherwise changes the PR. It reads the diff, metadata, and existing threads, reviews them against a design, correctness, security, tests, and behavior rubric, checks every finding against the real diff, and returns a compact, plain-language review with severity-labeled findings. Use when you want to review a pull request, paste a github.com or dev.azure.com pull-request link, or say "PR review", "review this PR", or "code review".
license: MIT. See LICENSE.
compatibility: Requires node and git, plus gh (GitHub) or az (Azure DevOps); network access to the PR host. Optional: a ClickUp token for ticket-linked PRs.
metadata:
  author: ttt-studios
  version: "1.5.0"
---

# pr-review

Review a pull request end to end from its URL and hand the operator a single
paste-ready review comment. Works on GitHub and Azure DevOps. Read-only: it fetches,
reviews, and renders, but never posts, comments on, approves, or otherwise changes the
PR — the operator pastes the result themselves.

## When to invoke

The user gives a `github.com/.../pull/<n>` or `dev.azure.com/.../pullrequest/<n>` URL
and wants it reviewed, or says "PR review", "review this PR", or "code review". Also on
a re-review — the same PR after the author pushed changes. Invoked without a URL, ask
for the PR link first; do not guess one.

## On invocation: open the picker

If the operator already gave a clear request (a PR URL), skip the picker — run
`scripts/preflight.mjs`, then follow the Workflow below. Otherwise open the **Ask** picker:
call AskUserQuestion with the four paths defined in `reference/usage.md` (Review a pull request ·
Re-check after changes · Show me how this works · Options), then route on the answer:

- **Review a pull request / Re-check after changes** → run `scripts/preflight.mjs`; if it exits
  non-zero, relay its `✗` lines verbatim (what's missing + where to put it) and WAIT. Then ask
  for the PR link if not supplied, and run the Workflow.
- **Show me how this works** → present the "How it works" section of `reference/usage.md`.
- **Options** → open a second **Ask** picker of the topics defined in the `reference/usage.md` "Options — drill-down" section; present the chosen subsection, then offer the topic picker again so they can read another.
- **deep dive** (asked any time) → present `reference/deep-dive.md` — the full technical walkthrough.

Never run the review until preflight is clean.

## Files in this skill

- `scripts/preflight.mjs` — checks required auth (gh/az; ClickUp optional) and says where to put it. Run it first.
- `scripts/fetch-pr.mjs` — URL → normalized `pr.json` (read-only). Run it.
- `scripts/render-review.mjs` — `findings.json` → the paste-ready block. Run it.
- `scripts/selftest.mjs` — regression battery for the deterministic layer. Run it after
  any edit to the scripts; every check must be OK.
- `reference/usage.md` — the on-invocation picker + How-it-works + Options.
- `reference/deep-dive.md` — the full technical walkthrough (on "deep dive").
- `reference/rubric.md` — the review checklist (R1–R15). Read before writing findings.
- `reference/output-format.md` — the output template, emoji legend, `findings.json`
  schema, and plain-language rules. Read before writing findings.
- `reference/platforms.md` — auth, URL shapes, and troubleshooting per platform. Read
  when a fetch fails or the platform is unfamiliar.

## Workflow

Copy this checklist and work through it:

```text
- [ ] 1. Fetch the PR (read-only) → pr.json
- [ ] 2. Read pr.json; decide first-review vs re-review
- [ ] 3. Review the diff against reference/rubric.md, in priority order
- [ ] 4. Write findings.json (reference/output-format.md schema)
- [ ] 5. Self-verify: every anchor confirmed, every finding refuted, currency checked
- [ ] 6. Render → paste-ready block
- [ ] 7. Return the block to the operator. Do NOT post it.
```

**1. Fetch (read-only).**

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/pr-review/scripts/fetch-pr.mjs "<PR_URL>" --out pr.json
```

GitHub needs `gh auth status` green. Azure DevOps needs an `az` login for the PR's
tenant — for a non-default tenant, prefix `AZURE_CONFIG_DIR=<path>`. See
`reference/platforms.md` if the fetch errors.

**2. Read `pr.json`.** Title, body, unified `diff`, `files`, existing `threads`, and —
when the PR references a ClickUp ticket — a `ticket` object with the ticket's name,
status, and description. If `ticket` is present, Step 0 diffs the change against the
ticket's description/AC, not just the PR body (see `reference/platforms.md` for how
resolution works). If `threads` already carries your earlier comments, this is a
re-review: follow the re-review rules in the rubric — review only what changed,
acknowledge what was addressed, do not reopen settled points. Keep each round's
`findings-<platform>-<repo>-<pr>.json` in the scratch dir; on a re-review, read the
prior round's file and diff against it so resolved findings become acknowledgments,
not repeats.

**3. Review.** Read `reference/rubric.md` in full, then walk the diff in priority
order (design → correctness → security → tests → API → readability → perf → docs). Run
the behavioural + currency check (R11) on every review: state what the code actually
does and diff it against what the PR body claims, and judge the change against best
practice as of today's date, verifying against current vendor/library docs rather than
memory.

**4. Write `findings.json`** to the schema in `reference/output-format.md`. One concern
per finding, each anchored to an exact `file:line` from the diff, each with a concrete
fix. For every finding anchored inside a diff hunk, set `anchor_snippet` to a substring
of that exact line — the renderer verifies it against the fetched diff and refuses the
render on a mismatch (this is what makes stale line numbers impossible). Keep prose
plain and short. On a diff over ~2000 lines, work file by file: extract each file's
hunks from `pr.json` in turn instead of holding the whole diff at once, and say so in
`coverage`.

**5. Self-verify (mandatory validate loop).** The renderer mechanically enforces part
of this: anchored files must be changed files of the PR, and `anchor_snippet` must
match the diff line. Before rendering, confirm the rest:

- Every anchor OUTSIDE the diff hunks (context lines of changed files) points at the
  code you describe — the renderer can only warn there; confirm those against head.
- You tried to refute each finding and it survived. Unsure → downgrade to `question`.
- Every blocking finding states a fix.
- The verdict follows the rule: any blocking → `request-changes`; else non-blocking
  that matter → `comment`; else `approve`.
Fix `findings.json` and repeat until all four hold.

**6. Render.**

```bash
D="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills}"; D="${D:-$HOME/.claude/skills}"   # plugin OR ~/.claude/skills symlink
node $D/pr-review/scripts/render-review.mjs findings.json --pr pr.json
```

`--pr pr.json` supplies the platform (GitHub gets collapsible `<details>`, Azure DevOps
gets flat numbered sections), the scope chip (files / ±lines), and the ticket line. It
refuses to emit (non-zero exit) on a hard-band violation — AI attribution, a
decorative emoji, a blocking finding with no fix, or an anchor that fails the gate
(file not in the PR, or `anchor_snippet` not on the cited line). If it refuses, fix `findings.json`
and re-run. Never hand-edit the block to get around the gate.

**7. Return** the rendered block to the operator as the deliverable, in one fenced code
block so it copies cleanly. Do not post it anywhere.

## Hard rules

- **Model pin (config-driven).** This skill runs on `claude-opus-4-7` (SKILL.md frontmatter). Every subagent and workflow it launches uses the same model: pass `model: 'claude-opus-4-7'` on each `agent()` call and Agent-tool subagent, so delegated work never silently drops to another model.

- **Read-only. Never mutate the PR (R9).** No `gh pr review` / `comment` / `edit` /
  `merge` / `ready`, no Azure DevOps thread or vote writes, no write API calls. The
  only outputs are `pr.json`, `findings.json`, and the rendered block. The operator
  posts.
- **No AI attribution** anywhere in the review: no `Co-Authored-By`, `Generated with`,
  `noreply@anthropic.com`, or 🤖. The renderer enforces this.
- **Functional emojis only** — the four in the legend (✅ 💬 🔴 🟡), in the verdict line
  and finding markers. No decorative emoji.
- **Every finding is anchored and refuted.** No finding without a `file:line` you
  confirmed and a failure path you could not disprove.
- **Judge currency as of today.** Best practice moves; verify against current docs, and
  state the date and source when currency is load-bearing.

## Constraints

- Portable: depends only on `node`, `git`, `gh` (GitHub), and `az` (Azure DevOps). No
  repo checkout required — the diff is fetched.
- `pr.json` and `findings.json` are working files; write them to a scratch dir, not the
  target repo.
- Match the reviewed repo's conventions, not this skill's opinions (Rule 11). Do not
  gate a PR on pre-existing problems; flag them separately, non-blocking.
- Keep the review compact. Density over length. End when the content ends.

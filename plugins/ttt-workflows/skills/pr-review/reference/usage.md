# pr-review — on-invocation picker

When invoked without a clear request, open the **Ask** picker (AskUserQuestion) with these four
paths. If the user already pasted a PR link, skip the picker and go straight to preflight + review.

**Question:** What would you like to do?  · **header:** PR review · single-select

| label | description |
|---|---|
| **Review a pull request** | Paste a GitHub or Azure DevOps link. I read every change and write a paste-ready review — and if the PR is linked to a ClickUp ticket, I check it does what the ticket asked. I never touch the PR. |
| **Re-check after changes** | I reviewed this PR before and the author pushed updates — I'll look at only what's new and note what they fixed. |
| **Show me how this works** | A full walkthrough: everything I check, how I decide what's a blocker vs a nitpick, what you get back, and what I'll never do. |
| **Options** | The full reference — every way to use me, in one screen. |

**Routing:** Review / Re-check → run preflight, ask for the PR link if not given, then the review
workflow. · Show me how this works → present **How it works** below. · Options → present **Options** below.

---

## How it works

1. **You paste a PR link.** I fetch the changes read-only — I never modify the PR.
2. **I read every changed line,** most important first: does the design fit, is it correct, is it secure, is it tested, then the smaller things.
3. **Two checks most tools skip:** does the code actually do what the PR description claims, and is it using today's best practice (I check the vendor's current docs, not memory).
4. **For everything I flag,** I note exactly where it is and a concrete fix. I try to disprove each one first — if it doesn't hold up, I drop it. One real blocker beats ten nitpicks.
5. **I settle on a verdict:** good to go · a couple of things to fix · not yet.
6. **You get a finished comment** — the verdict, a short table of what I found, and each item with its fix — and you paste it into the PR yourself.

I'll never post, comment, approve, or change the PR · add an AI credit · or hold it up over lint or problems that were already there.

**Want every detail?** Say **deep dive** for the full technical walkthrough — every check, the anchoring gate, rendering, and the refusal rules (`reference/deep-dive.md`).

---

## Options

```
pr-review — review a PR, output a paste-ready comment (never posts it)

WHAT I CAN DO
  Review a pull request    read the whole change, write the review
  Re-check after changes   same PR after a push — only what's new
  (ticket check)           automatic when the PR is linked to a ClickUp task

WHAT I LOOK AT              most important first
  design · correctness · security · tests · then the smaller stuff
  + does the code do what the PR says, and is it current best practice

WHAT YOU GET
  a verdict · a short list of what I found · a concrete fix for each

WHAT I NEED
  a link to a GitHub or Azure DevOps pull request
  (a ClickUp connection is optional — only to check against a linked ticket)

I NEVER  post/comment/approve · add an AI credit · block on lint or pre-existing issues

EXAMPLES
  https://github.com/org/repo/pull/128
  https://dev.azure.com/org/proj/_git/repo/pullrequest/2189
  "review PR #128 again — I pushed fixes"
```

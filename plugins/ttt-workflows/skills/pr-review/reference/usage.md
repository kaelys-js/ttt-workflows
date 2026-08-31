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

## Options — drill-down

When the operator picks **Options**, open a second **Ask** picker (AskUserQuestion) with these
topics, present the matching subsection, then offer the picker again so they can read another.

**Question:** What would you like to see? · **header:** pr-review · single-select

| topic | show |
|---|---|
| **What I check** | `check` below |
| **What you get** | `output` below |
| **What I need** | `need` below |
| **Examples** | `examples` below |

### check
In order of what matters: **design, correctness, security, tests,** then the smaller stuff. I
read every changed line — only generated files get skimmed. Two checks most tools skip: does the
code actually do what the PR says, and is it current best practice (I check the vendor's live
docs, not memory). One verified blocker beats ten nitpicks — I drop what I can't confirm, and I
never block on lint or problems that were already there.

### output
A **verdict** — good to go, a few fixes, or not yet. A **short table** of what I found. And a
**specific fix** for each, ready to apply. Short enough to skim, detailed enough to act on.

### need
A **GitHub or Azure DevOps pull-request link.** You'll need to be signed in — `gh` for GitHub,
`az` for Azure DevOps; I check on start and say if anything's missing. A **ClickUp** connection
is optional, only for checking a PR against its linked ticket.

### examples
- "review https://github.com/org/repo/pull/128"
- a `dev.azure.com/…/pullrequest/N` link
- "review PR #128 again — I pushed fixes"

Prefer the whole technical picture at once? Say **deep dive**.

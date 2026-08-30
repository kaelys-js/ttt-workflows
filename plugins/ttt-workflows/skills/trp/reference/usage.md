# trp — on-invocation picker

When invoked without a clear request, open the **Ask** picker (AskUserQuestion) with these four
paths. If the user already pasted a ticket link with clear intent, skip the picker and proceed.

**Question:** How should I handle this ticket?  · **header:** ClickUp ticket · single-select

| label | description |
|---|---|
| **Deliver this ticket** | Paste a ClickUp ticket link. I read it and the code, write you a plan, and wait for your OK — then I build it, test it, review my own work, open the pull request, and update the ticket. |
| **Just the code, skip the ticket** | Same delivery, but I leave the ClickUp ticket untouched and hand you the pull request only. |
| **Show me how this works** | A full walkthrough: how I plan, where you approve, and what you get back. |
| **Options** | The full reference — every way to run it, in one screen. |

**Routing:** Deliver this ticket → full run. · Just the code → the "no ClickUp" path. · Show me
how this works → present **How it works**. · Options → present **Options**.

---

## How it works

1. **I read the ticket** — the request, the comments, the status — and the code it touches.
2. **I work out exactly what needs to change,** answering my own questions from the code instead of asking you.
3. **I write you a plain-language plan:** what I'll change and why.
4. **I stop and wait.** Nothing gets built until you approve the plan.
5. **Once you're in:** I build it, run the tests and checks, review my own work (and fix what that turns up) before anyone else sees it, open the pull request, and update the ticket with a summary for your team and your manager.

I'll never build anything before you approve · ship a guess as the cause · quietly drop
something you approved · add an AI credit · or push with a failing test.

---

## Options

```
trp — take a ClickUp ticket to a merge-ready pull request (plan first, always your call)

WHAT I CAN DO
  Deliver this ticket      plan → your OK → build → pull request → update the ticket
  Just the code            same, but leave the ticket alone — hand you the PR only
  From a spec              point me at a linked GAP-LIST and I plan around it
  Look into it only        if the ticket is really a question, I investigate + write up options

HOW IT GOES
  1 read the ticket + code   2 write a plan   3 STOP for your OK
  4 build + test   5 review my own work to clean   6 open the PR + update the ticket

WHAT YOU GET
  a plan to approve, then a pull request that's ready to merge and a written-up ticket

WHAT I NEED
  a ClickUp connection (to read + update the ticket)
  access to the code — GitHub or Azure DevOps, depending on the project
  (I'll tell you if anything's missing)

I NEVER  build before you approve · ship a guessed cause · add an AI credit · push a failing test

EXAMPLES
  "TRP Process for: https://app.clickup.com/t/abc123"
  "TRP Process for: https://app.clickup.com/t/abc123 — just the code"
  "TRP Process for: https://app.clickup.com/t/abc123 — use the linked GAP-LIST"
```

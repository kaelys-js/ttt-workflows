# trp — on-invocation picker

When invoked without a clear request, open the **Ask** picker (AskUserQuestion) with these four
paths. If the user already pasted a ticket link with clear intent, skip the picker and proceed.

**Question:** How should I handle this ticket?  · **header:** ClickUp ticket · single-select

| label | description |
| --- | --- |
| **Deliver this ticket** | Paste a ClickUp ticket link. I read it and the code, write you a plan, and wait for your OK. Then I build it, test it, review my own work, open the pull request, and update the ticket. (Say "just the code" and I'll skip the ticket update and hand you the PR only.) |
| **Look into it first (a spike)** | If the ticket is really a question, or needs options weighed before anyone commits, I investigate and write it up — no code yet. |
| **Show me how this works** | A full walkthrough: how I plan, where you approve, and what you get back. |
| **Options** | The full reference — every way to run it, in one screen. |

**Routing:** Deliver this ticket → full run (or the "no ClickUp" path if they say just the code).
· Look into it first → the `spike-writeup` response mode. · Show me how this works → present
**How it works**. · Options → present **Options**.

---

## How it works

1. **I read the ticket** — the request, the comments, the status — and the code it touches.
2. **I work out exactly what needs to change,** answering my own questions from the code instead of asking you.
3. **I write you a plain-language plan:** what I'll change and why.
4. **I stop and wait.** Nothing gets built until you approve the plan.
5. **Once you're in:** I build it, run the tests and checks, and review my own work (fixing what that turns up) before anyone else sees it. Then I open the pull request and update the ticket with a summary for your team and your manager.

I'll never build anything before you approve · ship a guess as the cause · quietly drop
something you approved · add an AI credit · or push with a failing test.

**Want every detail?** Say **deep dive** for the full technical walkthrough — every phase, the approval gate, the local gates, the self-review loop, and client routing (`reference/deep-dive.md`).

---

## Options — drill-down

When the operator picks **Options**, open a second **Ask** picker (AskUserQuestion) with these
topics, present the matching subsection, then offer the picker again so they can read another.

**Question:** What would you like to see? · **header:** trp · single-select

| topic | show |
| --- | --- |
| **Ways to run it** | `ways` below |
| **How it goes** | `flow` below |
| **What you get** | `output` below |
| **What I need** | `need` below |

### ways

- **Deliver this ticket** — plan → your OK → build → pull request → update the ticket.
- **Just the code** — same, but I leave the ticket alone and hand you the PR only.
- **From a spec** — point me at a linked GAP-LIST and I'll plan around it.
- **Look into it only** — if the ticket is really a question, I investigate and write up options, no code.

### flow

1. Read the ticket and the code. 2. Write you a plan. 3. **Stop for your OK.**
2. Build and test. 5. Review my own work until it's clean. 6. Open the PR and update the ticket.

### output

A **plan to approve,** then a **pull request that's ready to merge** and a **written-up ticket** —
a plain-language summary for your team and manager, plus the technical detail.

### need

- A **ClickUp** connection, to read and update the ticket.
- **Access to the code** — GitHub or Azure DevOps, depending on the project.
- I'll tell you if anything's missing.

Prefer the whole technical picture at once? Say **deep dive**.

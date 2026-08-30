# sec-audit — on-invocation picker

When invoked without a clear request, open the **Ask** picker (AskUserQuestion) with these four
paths. If the user already named a target + intent, skip the picker and proceed.

**Question:** How can I help with security?  · **header:** Security audit · single-select

| label | description |
|---|---|
| **Run a full check-up** | Point me at a project, a pull request, or a folder. I look in three places at once — your code, your live Azure, and your accounts and pipelines — and hand you one report of what's exposed and how to fix it. |
| **Look into one thing** | You name a specific worry or finding. I dig in, rate how serious it really is, and — on your say-so — prove it's real or write the fix (opened for your review, never merged). |
| **Show me how this works** | A full walkthrough: the three places I look, how I rate severity, and what you get back. |
| **Options** | The full reference — every mode and setting, in one screen. |

**Routing:** Run a full check-up → `sweep`. · Look into one thing → `review` (then offer `poc`
/ `remediate`). · Show me how this works → present **How it works**. · Options → present **Options**.

---

## How it works

Most tools only read your code. Half of real security problems live somewhere else, so I check
three places at once:

- **Your code** — mistakes in how the app handles logins, input, and files.
- **Your live cloud** — Azure settings that leave things open, like a database anyone can reach.
- **Your accounts and pipelines** — sign-in setups and build systems that leak access or secrets.

1. **You point me at what to check** and, if you like, how deep to go.
2. **I run all three checks, read-only** — I don't change anything.
3. **I rate each finding** by how serious it really is and how someone could exploit it.
4. **Comparing to a past audit?** Hand me your previous list and I'll show you what's fixed, what's still open, and what's new.
5. **You get one report:** what's exposed, how bad, and how to fix it — plus an honest note on anything I couldn't reach.

Going further, on your say-so: I can prove a finding is real with a safe demo that cleans up
after itself, or write the fix and open it for your review — I never merge it myself.

**Want every detail?** Say **deep dive** for the full technical walkthrough — each of the three layers, the live probes, coverage matching, scoring, and the six gates (`reference/deep-dive.md`).

---

## Options

```
sec-audit — check code + live cloud + accounts/pipelines → one report (look-only)

WHAT I CAN DO
  Full check-up            look everywhere, report everything
  Look into one finding    rate how serious a specific worry is
  Prove it's real          a safe demo that cleans up after itself
  Write the fix            prepare it, open it for your review — never merged

WHERE I LOOK               a full check-up covers all three
  your code                logins, input handling, file handling, out-of-date parts
  your live cloud          public databases, weak encryption, open vaults, missing alerts
  your accounts/pipelines  sign-in flaws, long-lived secrets, secrets left in plain sight

COMPARE TO A PAST AUDIT    hand me your previous list of issues, get back:
  what's fixed · what's still open · what's new

WHAT YOU GET
  one report — what's exposed, how bad, how to fix it, and what I couldn't reach

WHAT I NEED
  to read code: point me at a project, pull request, or folder
  to check your live cloud: you signed in to Azure   (I'll say if anything's missing)

I NEVER  change anything without your OK · only look at your live cloud, never touch it

EXAMPLES
  "check this repo:  https://github.com/org/repo"
  "audit ./oms-be and compare to last quarter's findings"
  "is the /users update endpoint a real problem?"
```

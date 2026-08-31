# TRP templates

The Full TRP Package (the approval-gate deliverable), the PR bodies, and the
two-layer ClickUp comment. Shapes are from real delivered TRPs (a generic specimen is the
reference specimen); fill with real evidence, never placeholders.

## Contents
- The Full TRP Package
- PR body — Azure DevOps
- PR body — GitHub
- Two-layer ClickUp comment

## The Full TRP Package

````markdown
# <TICKET-ID> — Full TRP Package (Phases 0 → 5)

**Class:** <security|feature|bug|infra|chore> · **Mode:** <solve|spike-…|reproduce|support>
· **Waves:** <n> · **Branch:** `<branch-name>` off `<trunk>`

## Phase 0 — Scoping (resolved)

- <every gap, answered, with file:line evidence>
- **Decision (mine, not yours):** <where ticket wording conflicts with traced reality,
  the call made and why>
- <env-var / config implications named HERE if any exist — never discovered later>

## Phase 1.5 — Breakdown

| # | Commit | File | Loc |
|---|--------|------|-----|
| 1 | `<message>` | `<file>` | <what changes> |

<single PR vs multi-PR, flag availability, merge-order note>

## Phase 2 — Detailed changelog (actual code)

### File 1 — `<path>`
<what changes and why, with real ```diff blocks for the load-bearing edits>

## Phase 3 — Verification plan

**Local pre-push gate (<client> — commands verbatim):**
```bash
<the client's full gate command list, from clients.md>
```

**Pre-review quality loop (Phase 3.5):** local CodeRabbit (if installed) to zero
actionable findings before push; pr-review skill against the PR after creation,
every finding fixed, re-run to clean.

**Empirical verification:** <how the change is proven on the REAL surface — which
env, which probe/POC/test, expected observable result. Load-test/harness-driven,
never "operator flips a switch">

**What can't be verified locally:** <named explicitly, with what stands in as proof
and what remains unproven>

## Phase 4 — PR creation

<branch/commit/push commands verbatim; PR creation command (REST or gh) verbatim;
reviewers; the full drafted PR body>

## Phase 5 — ClickUp update

<status transitions planned; the drafted two-layer comment>
````

## PR body — Azure DevOps (4000-char cap — `wc -c` before the REST call)

```markdown
# Ticket Link
https://app.clickup.com/t/<team>/<TICKET-ID>

# Changelog
- `<file>` — <change>

# What testing was done
- Local: <gates run + actual results; each new test fails against trunk (proves intent)>
- CI: <pipeline status>
- Empirical: <real-surface proof + result>

# Screenshots
<if applicable>

# Additional Notes
<trim first when over the cap>
```

## PR body — GitHub

Match the repo's PR template if one exists; otherwise the same section shape as
above. Link the ClickUp ticket; note CodeRabbit is the CI reviewer and its threads
must reach zero unresolved before done.

## Two-layer ClickUp comment (Phase 5 — both layers, one comment)

```markdown
**Summary (non-technical):**
<2-5 sentences a PM reads: what this does for users/the business, why it matters,
current status, what's left. No file paths, no jargon.>

---

**Technical detail:**
- PR: <link> (<state>)
- Changelog: <per-file bullets>
- Verification: <gates + empirical evidence, incl. CodeRabbit / pr-review results>
- Follow-ups: <only if genuinely out of the approved scope — no Rule-13 language>
```

Attribution-scan every body before posting: no Co-Authored-By / "Generated with" /
model or vendor names / robot emoji, anywhere.

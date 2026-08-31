# Delivery targets — platform-agnostic

trp delivers a ticket to whatever repo the ticket names, on whatever platform that repo lives
on. Nothing here is client-specific — the platform, branch, checks, and review bot are all
**detected at run time** from the repo and its config, or confirmed with the operator. This
file is the routing logic; it works for any repo.

## Contents
- [Figuring out the target](#figuring-out-the-target)
- [Platform: GitHub](#platform-github)
- [Platform: Azure DevOps](#platform-azure-devops)
- [Pre-push gates — from the repo, not assumed](#pre-push-gates--from-the-repo-not-assumed)
- [Automated review bot](#automated-review-bot)
- [ClickUp](#clickup)

## Figuring out the target

1. **Which repo?** The ticket links or names it, or the operator says. If genuinely ambiguous,
   that's a legitimate operator question.
2. **Which platform?** Read the repo's `origin` remote:
   - `github.com` (or a GitHub Enterprise host) → **GitHub**, tool `gh`.
   - `dev.azure.com` / `*.visualstudio.com` → **Azure DevOps**, tool `az` + ADO REST.
3. **Default branch?** Read it, don't assume: `git symbolic-ref refs/remotes/origin/HEAD` (or the
   remote's default). Feature branches: `<type>/<ticket-id>-slug` off the default branch, matching
   the repo's existing branch-naming if it has one.
4. **Feature flags?** If the repo has a flag system, incomplete work can land behind a default-off
   flag; if it doesn't, each PR must be correct on merge. Detect from the codebase.

## Platform: GitHub

Tool: `gh` (needs `gh auth status` green). PRs, checks, reviews, merges all via `gh`.

```bash
gh pr create --base <default-branch> --title "<id> <desc>" --body-file pr.md
gh pr checks <n>          # gate on the real result, not just the check color
gh pr view <n> --json reviewDecision,statusCheckRollup,reviewThreads
```

## Platform: Azure DevOps

Tool: `az` + the ADO REST API (the `az repos` extension is often broken; prefer REST). Mint a
bearer and call REST with org/project/repo as variables — nothing hardcoded:

```bash
TOKEN=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --query accessToken -o tsv)          # 499b84ac… is the universal ADO resource GUID
BASE="https://dev.azure.com/<ORG>/<PROJECT>/_apis/git/repositories/<REPO-ID>"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/pullrequests?api-version=7.1"          # list/create
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/pullrequests/<id>/threads?api-version=7.1"  # threads
# merge: PATCH $BASE/pullrequests/<id> {"status":"completed","lastMergeSourceCommit":{"commitId":"…"},
#        "completionOptions":{"mergeStrategy":"squash","deleteSourceBranch":true,"bypassPolicy":false}}
```

Get `<ORG>/<PROJECT>/<REPO-ID>` from the repo's remote URL + a `git/repositories` list call.
Some org uses a non-default `az` tenant — select it with `AZURE_CONFIG_DIR=<path>` if the default
tenant 403s. Description bodies have a **4000-char cap** — `wc -c` and trim before the REST call.

**Merge blocked?** Query the actual policies first
(`policy/configurations?repositoryId=<id>&refName=refs/heads/<b>`); only `isBlocking:true` blocks.
`Required reviewers` is usually advisory; the real gate is often `Minimum number of reviewers`.
Don't force-push after a reviewer voted (it stales the vote) — add a follow-up commit and
re-request instead.

## Pre-push gates — from the repo, not assumed

Run the project's **own** configured checks, discovered from the repo (don't assume commands):
- formatter (e.g. `prettier --check`, `gofmt`, `black`), linter, the affected tests, the build,
  and typecheck — whatever the repo's `package.json` scripts / Makefile / CI config define.
- All must be **actually green** before any push — not "CI went green" (CI may run tests as
  continue-on-error). A failing test is a hard block; the only exception is a failure proven
  pre-existing on the trunk baseline (stash-diff to prove it).
- Attribution scan on every commit message (see `gates.md`).

## Automated review bot

If the repo has an automated reviewer configured (CodeRabbit, or similar), Phase 3.5 waits for it
and resolves every thread on the head commit before "done"; if it has none, Phase 3.5 relies on
the pr-review skill + the adversarial self-read. Detect what the repo uses at run time.

CodeRabbit CLI, when installed (`command -v coderabbit`), runs locally before the first push:
```bash
coderabbit review --plain --base <default-branch>
```
Fix every actionable finding to zero before pushing; if rate-limited or absent, report it.

## ClickUp

Team ID and token come from config (`CLICKUP_TOKEN_FILE`, a bare `pk_` value). Every call carries
`?custom_task_ids=true&team_id=<TEAM_ID>`. Phase 5 is two actions — a status transition **and** a
two-layer comment (PM summary + technical) — both verified landed. See `phases.md`.

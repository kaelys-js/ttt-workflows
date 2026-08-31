# Client routing

Two delivery targets, materially different. Everything needed to deliver to each is **here** —
this file is self-contained. Facts that move (repo IDs, lint baselines, exact commands) are
marked "re-check at run time" and confirmed from the repo/config, not memory.

## Contents
- [Which client is this ticket?](#which-client-is-this-ticket)
- [Wheaton OMS — Azure DevOps](#wheaton-oms--azure-devops)
- [ITC — GitHub](#itc--github)
- [CodeRabbit CLI (both)](#coderabbit-cli-both)

## Which client is this ticket?

- Custom id `WPMP3-…` → **Wheaton OMS**.
- Custom id `HAND_ITC-…` / `ITC-…` → **ITC** (handled / wt-eng monorepos).
- Otherwise the ticket's list/space names it; if genuinely ambiguous, that's a legitimate
  operator question.

---

# Wheaton OMS — Azure DevOps

## Repos, tooling, secrets

| | OMS-BE | OMS-FE |
|---|---|---|
| ADO remote | `dev.azure.com/wheatonpreciousmetals/OMS/_git/OMS-BE` | `…/OMS/_git/OMS-FE` |
| Default branch | `develop` | `main` |
| Package manager | `yarn` 1.22.22 | `npm` |
| Node | 22.15.0 | ≥ 20.18.1 |
| Tests | Jest 29 (dockerized `yarn test`, or inline `yarn test:run`) | Vitest 3 (`npm t`), Cypress 13 e2e |
| Prettier | 2.8 — `yarn prettier` / `:fix` | 3.1 — `npm run format:check` / `:write` |
| Lint | ESLint 8 — `yarn lint` / `:fix` | ESLint 8 — `npm run lint` |
| Build | `yarn build` (tsc) | `npm run build` (Vite) |
| Pre-commit | Husky + lint-staged — **commented out** | Husky + lint-staged — **active** |

- **az extension `az repos` is broken** under the mise az CLI — use the ADO REST API directly.
- **Repo IDs:** OMS-BE `ed34c9c9-a182-4520-adb3-460d715d31fa`, OMS-FE `b15ac4c7-ed37-4461-bde4-820fd853569f`, OMS-DevOps `910f2e30-8bef-46af-bb20-8afac00ca4a5`.
- **Wheaton az tenant** — run every ADO/az command with `AZURE_CONFIG_DIR=$HOME/.azure-wpm` (a
  separate az state from the default). A 403 with the default tenant is not proof of missing access.

## Branches & deploy map

Feature branches: `feature/WPMP3-NNN-slug` or `bug/WPMP3-NNN-slug` off `develop`. Commit style
`WPMP3-NNN description` (no Conventional Commits). **No feature-flag system** — code goes live on
merge to `develop`; branches must be correct when they merge (no "inert behind a flag").

| Branch | Env | On merge |
|---|---|---|
| `develop` | dev | auto (Docker build → ACR → App Service → Prisma migrate) |
| `qa` | qa | auto |
| `staging` | staging | auto |
| `main` | prod | auto |

## CI (what the PR pipeline runs)

- **BE:** `yarn test` (dockerized Postgres + Jest coverage) → SonarQube (`sonar.projectKey=oms-be`).
- **FE:** `npm ci` → `npm run format:check` → `npm run test:unit:ci -- --coverage` → SonarQube.
- Stages are `isSkippable: true`; branch policies (ADO UI) decide what's actually required.

## Pre-push gate (run and require green before every push)

**BE:** `yarn prettier --check "**/*.ts"` · `yarn lint` · `TEST_FILE=<file> yarn test:run` (or
full `yarn test` if Docker up) · `yarn build` · attribution scan.
**FE:** `npm run format:check` · `npm run lint` · `npm t` · `npm run build` · attribution scan.
Attribution scan (mandatory): `git log -1 --format=%B | grep -iE 'co-authored|generated with|claude|anthropic|🤖'` must return nothing.

For dep-pinning tickets: pin to the **lockfile-resolved** version (never the caret minimum), and
re-baseline lint on a clean `origin/develop` before claiming "matches baseline" (the count drifts).

## PR mechanics (ADO REST)

- PRs target `develop` (BE) / `main` (FE). Title `WPMP3-NNN description`.
- **Description cap is 4000 chars** — `wc -c` the body and trim (cut Additional Notes / Follow-up
  first) before the REST call, or it returns `Invalid argument value`.
- **Reviewers:** Rosa Rezaei (primary — merges everything); Justin Kuan + Shay Aryan (watchers on
  security tickets — request all three there).
- **Do NOT force-push after a reviewer has voted** — ADO resets vote-freshness on force-push even
  with `resetOnSourcePush: false`, forcing a bypass. Add a follow-up commit + re-request instead.
- **Pipeline variable values** come from ADO variable groups, never from a local scratch file.

## ClickUp — Phase 5 is TWO actions

- Team ID `8593845`; token = bare `pk_` value (see `CLICKUP_TOKEN_FILE`); every call carries
  `?custom_task_ids=true&team_id=8593845`.
- (1) **Status transition** `PUT /task/{id}`: `todo → in progress → in review → complete`.
- (2) **Two-layer comment** `POST /task/{id}/comment`: a PM/business summary **and** the technical
  detail. Attribution-scan before posting; verify it landed by re-fetching the latest comment.
  Doing only the status flip is an incomplete Phase 5.

## Schema / deploy

- Prisma 5 + PostgreSQL; migrations `prisma/migrations/YYYYMMDDHHMMSS_description`. CI runs
  `prisma generate && prisma migrate deploy`; locally `yarn db:push:local`.
- Deploy is automatic on merge (Docker → ACR → App Service flip → migrate). No manual deploy step.

## ADO command reference

**Never `az rest` for ADO** (it falls back unauthenticated and returns the sign-in HTML). Use
`curl` with an explicit bearer:
```bash
TOKEN=$(AZURE_CONFIG_DIR=~/.azure-wpm az account get-access-token \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)
curl -s -H "Authorization: Bearer $TOKEN" "https://dev.azure.com/wheatonpreciousmetals/OMS/_apis/…"
```
| Need | Endpoint (…/_apis/…) |
|---|---|
| List / create / get PR | `git/repositories/{repoId}/pullrequests?api-version=7.1` |
| Branch policies | `policy/configurations?repositoryId={id}&refName=refs/heads/{b}&api-version=7.1` |
| PR threads / resolve | `…/pullrequests/{prId}/threads[/{threadId}]?api-version=7.1` (PATCH `{"status":"fixed"}`) |
| Merge PR | PATCH `…/pullrequests/{prId}` `{"status":"completed","lastMergeSourceCommit":{"commitId":"…"},"completionOptions":{"mergeStrategy":"squash","deleteSourceBranch":true,"bypassPolicy":false}}` |

## Merge diagnosis (when merge is blocked)

Query the actual policies before guessing — don't assert a required reviewer from a vague error.
1. Enumerate `policy/configurations` on the target branch; only `isBlocking:true` policies block.
   `Required reviewers` is usually advisory (auto-adds, doesn't require a vote); the real gate is
   often `Minimum number of reviewers` (`minCount:1, creatorVoteCounts:false` — any one non-creator
   approval satisfies).
2. Check unresolved active comment threads (they can block on their own).
3. Check reviewer votes on the current iteration (a force-push stales them).
4. Check `mergeStatus`: `conflicts` → rebase on `origin/{branch}` and force-push (keep BOTH module
   blocks; never delete one already on main); `queued`/`succeeded` → wait and re-check.
`bypassPolicy:true` only for a stale-vote artifact from your own post-approval force-push, no
unresolved threads, with a short honest `bypassReason`. Try `false` first.

---

# ITC — GitHub

Repos: the handled / wt-eng monorepos (`wt-eng-mono`, `handled-monorepo-poc`, `wt-eng-iac`) —
confirm the ticket's target from its content + recent branch history; do NOT assume. `gh` is the tool.

- **CI reviewer: CodeRabbit** (`coderabbitai[bot]`) — every review thread on the head sha must
  reach resolved before done; read threads via the GraphQL `reviewThreads` API (not the top-level
  review body).
- **Branching:** trunk-based, feature flags where the repo has them. On an existing feature-stack
  branch, work lands **there** — no new branches/PRs without explicit approval.
- **Deploys:** `pnpm deploy:app` (env: `DEPLOY_APP`/`DEPLOY_ENV`/`DEPLOY_TAG`) or
  `gh workflow run cd.yml -f client=itc` — never raw `buildImage.ts`/`deploy.ts`/`az webapp
  config container set` (buildImage only pushes, doesn't flip the app). FE-only batches skip the
  dev redeploy. Any deploy proposal carries the crash-loop evidence-before-remediation note
  (`az webapp log tail` BEFORE any container reset).
- **Local gates:** the repo's pinned prettier (`--check .`, CI-wide glob), lint, affected tests,
  production build, typecheck — from the repo's own package.json scripts; confirm exact commands at
  run time.

---

# CodeRabbit CLI (both)

Installed as `coderabbit` (check `command -v coderabbit`; the short `cr` alias may not exist).
Phase 3.5, from the repo root on the feature branch:
```bash
coderabbit review --plain --base <trunk>
```
Fix every actionable finding to zero BEFORE the first push. Rate-limited or absent → report it in
the package/verification notes, never silently skip.

# Platform notes — GitHub and Azure DevOps

How `fetch-pr.mjs` reads each platform, the URL shapes it accepts, the auth it needs,
and what to do when a fetch fails. All access is read-only.

## Contents
- GitHub
- Azure DevOps
- ClickUp ticket resolution
- Troubleshooting

## GitHub

- **URL shape:** `https://github.com/<owner>/<repo>/pull/<number>`.
- **Auth:** the `gh` CLI must be logged in — check with `gh auth status`. No token
  handling in the skill; `gh` holds the credential.
- **Reads used:** `gh pr view` (metadata, files, commits), `gh pr diff` (unified diff),
  `gh api graphql` (review threads with resolved/outdated state). All GET.
- **>100 changed files:** `gh --json files` caps at 100; `pr.json` sets `filesTruncated`
  and the renderer's scope chip uses the true `changedFiles` count. The anchor gate
  unions the diff's own paths, so anchors beyond the cap still verify.
- Private repos work as long as `gh` is authorized for them.

## Azure DevOps

- **URL shapes:**
  - `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<number>`
  - `https://<org>.visualstudio.com/<project>/_git/<repo>/pullrequest/<number>` (legacy)
- **Auth:** an `az` login for the PR's tenant. The script mints a bearer with
  `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798` (the
  stable Azure DevOps AAD resource GUID). It never uses `az rest` — that drops the
  resource and returns the sign-in HTML page.
- **Tenant selection:** if the org lives in a non-default tenant, point `az` at the
  right config dir. For Wheaton: `AZURE_CONFIG_DIR=$HOME/.azure-wpm node …/fetch-pr.mjs …`.
- **How the diff is built:** ADO REST has no unified-diff endpoint. The script resolves
  the PR org-level (`/_apis/git/pullrequests/<id>`), which returns project + repo +
  the source and target merge commits. For each changed file it fetches the blob at
  each commit and runs `git diff --no-index` to produce hunks. Line numbers reflect
  full-file content, so `file:line` anchors are true.
- **Reads used:** PR-by-id, iterations, iteration changes, item content, threads. All GET.
- **Pacing:** blobs fetch sequentially (two per changed file); a very large ADO PR
  takes roughly a second per five files. Transient blob failures retry once, then the
  fetch dies loudly rather than fabricating an empty-file diff.
- **±line counts:** ADO's REST has no additions/deletions counters, so `fetch-pr.mjs`
  derives them from the reconstructed diff — the scope chip and the oversize coverage
  gate work the same on both platforms.

## ClickUp ticket resolution

If the PR title, body, or branch references a ClickUp ticket — an
`app.clickup.com/t/...` URL, a custom id like `WPMP3-261`, or a raw id like
`868kwybyx` — `fetch-pr.mjs` resolves it read-only and adds a `ticket` object (plus `tickets[]` with every distinct ticket that resolves, so multi-ticket PRs lose nothing)
(`id`, `custom_id`, `name`, `status`, `url`, `description`) to `pr.json`, so Step 0
can diff the change against the ticket's real description/AC instead of trusting the
PR body.

- **Token:** `$CLICKUP_TOKEN`, else the file at `$CLICKUP_TOKEN_FILE`, else
  `~/work/ttt/pr-reviews/.env.clickup` (a bare `pk_` value, no `KEY=` prefix). Sent
  in the Authorization header only; never printed, never written to `pr.json`.
- **Team id** (for custom ids): `$CLICKUP_TEAM_ID`, default `8593845`.
- All failures are non-fatal: no token, a 404, or a foreign ref just leaves
  `ticket: null` with the refs listed in `ticketRefs`, and the review proceeds on
  the PR body alone.

## Troubleshooting

- **`gh` not logged in** → `gh auth status`; log in and retry.
- **ADO returns HTML / 203** → the bearer is for the wrong tenant. Set `AZURE_CONFIG_DIR`
  to the tenant's config dir (or `az login --tenant <id>`), then retry. A 403 with a
  default-tenant token is not proof of missing access; it usually means the wrong tenant.
- **Empty diff on ADO** → the PR may have no merge commits computed yet, or every change
  is a rename/binary. Check `pr.json.files` for the change types.
- **`git` missing** → the ADO path needs `git` on PATH for diff reconstruction.

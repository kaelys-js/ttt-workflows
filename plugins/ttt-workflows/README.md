# ttt-workflows

Three end-to-end engineering workflows, each a Claude Code skill:

- **`/ttt-workflows:sec-audit`** — three-layer security audit (code + live Azure + identity/CI) of a repo, PR, or tenant. Read-only.
- **`/ttt-workflows:trp`** — deliver a ClickUp ticket end to end, with an absolute approval gate before anything is built.
- **`/ttt-workflows:pr-review`** — a paste-ready PR review that never touches the PR.

Invoke any of them and it opens with a short scan-first guide, then asks for the one input it needs.

## Install

```
/plugin marketplace add <your-org>/ttt-skills
/plugin install ttt-workflows@ttt-skills
```

## Updates

The author bumps `version` in `.claude-plugin/plugin.json` and pushes. To pull it:

```
/plugin marketplace update ttt-skills
/reload-plugins
```

Updates arrive only when the version is bumped (stable by default). Background auto-update can be enabled per marketplace; disable entirely with `DISABLE_AUTOUPDATER=1`.

## Team auto-install

Put this in a project's `.claude/settings.json` so teammates get it on trust, no prompts:

```json
{
  "extraKnownMarketplaces": {
    "ttt-skills": { "source": { "source": "github", "repo": "<your-org>/ttt-skills" } }
  },
  "enabledPlugins": ["ttt-workflows@ttt-skills"]
}
```

## Prerequisites (be honest with your team)

Portability varies by skill — the machinery is bundled, but two skills assume a toolchain:

| Skill | Needs |
|---|---|
| **pr-review** | `node`, `gh` (GitHub) / `az` (Azure DevOps). Fully portable. For ticket-linked PRs, a ClickUp token via `CLICKUP_TOKEN_FILE`. |
| **sec-audit** | `node`, `az` (Reader + Graph app-read + ADO bearer for live probes), the SFP scanners (`semgrep`, `gitleaks`, `checkov`, `osv-scanner`, `trivy`), and the **security-pocs** repo it treats as its rulebook. The three live probes and the report/aggregate scripts are self-contained; the source deep-read drives security-pocs workflows. |
| **trp** | `node`, `gh`/`az`, a ClickUp token via `CLICKUP_TOKEN_FILE`, the workspace `AGENTS.md` it sequences, and the client repos it delivers into. |

Environment overrides (set these instead of relying on default paths):

- `CLICKUP_TOKEN_FILE` — path to the file holding the ClickUp `pk_` token (pr-review, trp).
- `AZURE_CONFIG_DIR` — select a non-default `az` context for the live probes.

Every script is read-only by default and refuses to emit AI attribution.

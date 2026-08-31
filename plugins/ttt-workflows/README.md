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

## Who can use what (read before sharing)

Portability differs by skill. Be straight with your team about it:

| Skill | Shareable? | What a colleague needs |
|---|---|---|
| **pr-review** | ✅ **Fully portable.** Works on any GitHub / Azure DevOps PR. | `node`, and `gh` (GitHub) or `az` (Azure DevOps). ClickUp token optional (`CLICKUP_TOKEN_FILE`), only for ticket-linked PRs. |
| **sec-audit** | ✅ **Fully self-contained & agnostic.** Point it at any repo/PR/tenant. | `node`, `git`, and `az` for the live-cloud probes; the scanners `semgrep`/`gitleaks`/`checkov`/`osv-scanner`/`trivy` for the code layer (a missing one is reported, never silently skipped). No external repo, no client data — coverage against a prior audit is a file *you* pass in (`--known`). |
| **trp** | ✅ **Self-contained & agnostic.** Works with any GitHub or Azure DevOps repo. | `node`, a ClickUp token (`CLICKUP_TOKEN_FILE`), and `gh` (GitHub) or `az` (Azure DevOps). The platform is detected from the repo's remote; the full delivery protocol is bundled in `reference/`. No external rulebook, no client-specific config baked in. |

**Bottom line:** all three are self-contained and portable — share them with anyone. pr-review works on any PR, sec-audit on any repo/Azure tenant, trp on any GitHub/Azure DevOps repo.
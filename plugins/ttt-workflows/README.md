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
| **sec-audit** | ⚠️ **Partly.** The live-cloud half works standalone; the code-audit half needs an external toolkit. | **Works out of the box:** the live Azure/Entra/ADO probes + report + coverage (needs `node`, `git`, `az`). **Also needs, for the source deep-read and the `poc`/`remediate` modes:** the SFP scanners (`semgrep`, `gitleaks`, `checkov`, `osv-scanner`, `trivy`) **and** the `security-pocs` toolkit, with its path in `$SECURITY_POCS_DIR`. That toolkit is **not bundled** (it holds client audit data) — a colleague must have their own copy. |
| **trp** | 👥 **Team-scoped.** Not a general-purpose skill. | Built for two specific clients (Wheaton = Azure DevOps, ITC = GitHub), the team's workspace `AGENTS.md`, and a ClickUp token. Teammates on those clients can use it; it won't apply to arbitrary projects. |

**Bottom line:** share **pr-review** with anyone. Share **sec-audit** for cloud/identity audits anywhere, but note the code-audit + PoC/remediate modes need the `security-pocs` toolkit. Share **trp** with teammates who work the same clients.

Environment overrides (set these instead of relying on default paths):

- `CLICKUP_TOKEN_FILE` — the file holding the ClickUp `pk_` token (pr-review, trp).
- `AZURE_CONFIG_DIR` — select a non-default `az` context for the live probes.
- `SECURITY_POCS_DIR` — path to the security-pocs toolkit (sec-audit's code-audit + poc/remediate modes).

Every script is read-only by default and refuses to emit AI attribution. Each skill checks its
own prerequisites on start (`preflight.mjs`) and tells the operator exactly what's missing.

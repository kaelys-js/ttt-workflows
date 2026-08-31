# AGENTS.md

Engineering notes for anyone (human or AI) working in this repository.

## What this is

A Claude Code **plugin marketplace** that hosts one plugin, `ttt-workflows`, bundling three
self-contained engineering skills:

- **`pr-review`** — reviews a GitHub or Azure DevOps pull request and returns a paste-ready
  comment; never mutates the PR.
- **`sec-audit`** — a three-layer security audit (code + live Azure + identity/CI) of any
  repo, PR, or tenant; read-only until you approve a change.
- **`trp`** — delivers a ClickUp ticket to a merge-ready PR under an approval-gated protocol;
  detects the platform (GitHub / Azure DevOps) from the repo.

Every skill is **fully self-contained and agnostic** — no external repo, no client data, no
hardcoded projects. Each carries its own operating law in its `reference/` files and its own
deterministic scripts. See [plugins/ttt-workflows/README.md](plugins/ttt-workflows/README.md).

## Layout

| Path | What it is |
| --- | --- |
| `.claude-plugin/marketplace.json` | The marketplace manifest (lists the plugin). |
| `plugins/ttt-workflows/.claude-plugin/plugin.json` | The plugin manifest (name, version). |
| `plugins/ttt-workflows/skills/<name>/SKILL.md` | Each skill's entry point (frontmatter + instructions). |
| `plugins/ttt-workflows/skills/<name>/scripts/` | Deterministic scripts (`.mjs`/`.sh`) the skill drives. |
| `plugins/ttt-workflows/skills/<name>/workflows/` | Multi-agent Workflow-tool scripts (opt-in fan-outs). |
| `plugins/ttt-workflows/skills/<name>/reference/` | The protocol, usage guide, deep dive, eval triggers. |
| `plugins/ttt-workflows/skills/<name>/scripts/selftest.mjs` | Per-skill regression battery + spec/trigger validation. |
| `plugins/ttt-workflows/README.md` · `LICENSE` | Plugin docs + license. |

## Test & run

There is no build step — skills are files. Before any push, every skill's selftest must be green:

```bash
for s in pr-review sec-audit trp; do
  node plugins/ttt-workflows/skills/$s/scripts/selftest.mjs
done
```

Each selftest covers the deterministic layer **plus** spec conformance (name/description/
compatibility/line limits, per agentskills.io) and a trigger eval (positive prompts covered by
the description). Every check must print `OK`.

Test a skill interactively before releasing:

```bash
claude --plugin-dir plugins/ttt-workflows
/ttt-workflows:pr-review
```

## Releasing

Bump `version` in `plugins/ttt-workflows/.claude-plugin/plugin.json`, commit, and push. Users
pull the update with `/plugin marketplace update ttt-skills` + `/reload-plugins`. The version
field gates updates — a stable version stays put until you bump it. Use semver.

## Conventions

- **No AI attribution — ever, anywhere.** No `Co-Authored-By: Claude`, "Generated with", model
  names, `noreply@anthropic.com`, or 🤖 in any commit message, PR, comment, doc, or code. Scan
  before every push: `git log -1 --format=%B | grep -iE 'co-authored|generated with|claude|anthropic|🤖'` must return nothing.
- **Self-contained + agnostic.** No client data, no hardcoded projects/tenants/IDs, no reference
  to an external repo. A skill must run for anyone who installs the plugin.
- **Spec-compliant frontmatter.** `name` (lowercase-hyphen, ≤64, matches dir) and `description`
  (≤1024, what + when) are required; keep `SKILL.md` under 500 lines and push detail into
  `reference/` (progressive disclosure).
- **Selftests green before push.** A red check is a hard block.
- **Surgical changes.** Match the surrounding style; touch only what you must.
- **Never commit secrets.** Tokens live in files named by env vars (`CLICKUP_TOKEN_FILE`), never
  in the repo; verify with `git ls-files` before pushing.

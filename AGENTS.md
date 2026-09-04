# AGENTS.md

Engineering notes for anyone (human or AI) working in this repository.

## What this is

A Claude Code **plugin marketplace** that hosts one plugin, `ttt-workflows`, bundling four
self-contained engineering skills:

- **`pr-review`** — reviews a GitHub or Azure DevOps pull request and returns a paste-ready
  comment; never mutates the PR.
- **`sec-audit`** — a three-layer security audit (code + live Azure + identity/CI) of any
  repo, PR, or tenant; read-only until you approve a change.
- **`trp`** — delivers a ClickUp ticket to a merge-ready PR under an approval-gated protocol;
  detects the platform (GitHub / Azure DevOps) from the repo.
- **`copy-audit`** — audits product copy, UI microcopy, and (in comment mode) code comments
  across a repo or diff via AST-based extraction; approval-gated, and a rewrite changes text
  but never code structure. Subsumes the former comment-audit skill.

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
for s in pr-review sec-audit trp copy-audit; do
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

Cut a release in one flow: fix commits → release commit → annotated tag → push both. CI's
`release.yml` gates that the tag matches `VERSION`, `plugin.json`, and a released `CHANGELOG.md`
section, then publishes the matching section as the GitHub Release body. Users pull the update
with `/plugin marketplace update ttt-skills` + `/reload-plugins`. The version field gates
updates — a stable version stays put until you bump it. Use semver.

**Step by step:**

1. Land your fix/feat commits on `main`. Commitlint enforces one scope per header
   (`fix(pr-review): …`), sentence-case subject 10–72 chars, body lines ≤100 chars — wrap
   with a HEREDOC. See `.commitlintrc.json` for the full scope enum.
2. Bump the plugin version — everything else syncs from it:

   ```bash
   sed -i '' 's/"version": "1.5.1"/"version": "1.5.2"/' plugins/ttt-workflows/.claude-plugin/plugin.json
   ./bin/mise exec -- node scripts/sync-version.mjs
   ```

   That propagates the bump into `.claude-plugin/marketplace.json`, `VERSION`, and every
   `plugins/ttt-workflows/skills/*/SKILL.md`. `sync-version` also refuses the release until
   `CHANGELOG.md`'s top released heading matches — so add a `## [x.y.z] - YYYY-MM-DD` section
   above the previous one, moving anything under `## [Unreleased]` into it.

3. Verify the release notes render:

   ```bash
   ./bin/mise exec -- node scripts/release-notes.mjs vX.Y.Z
   ```

4. Commit as `chore(release): Cut vX.Y.Z` and stage exactly the sync'd files:

   ```bash
   git add .claude-plugin/marketplace.json VERSION plugins/ttt-workflows/.claude-plugin/plugin.json \
           plugins/ttt-workflows/skills/*/SKILL.md CHANGELOG.md
   git commit -m 'chore(release): Cut vX.Y.Z' -m '…one-paragraph summary…'
   ```

5. Run the full pre-push gate locally so a red CI never eats the release window:

   ```bash
   ./bin/mise exec -- lefthook run pre-push
   ```

6. Push `main`, then the annotated tag (the tag message is not the release body — CHANGELOG.md
   is — but keep them consistent):

   ```bash
   git push origin main
   NOTES="$(./bin/mise exec -- node scripts/release-notes.mjs vX.Y.Z)"
   git tag -a vX.Y.Z -m "$NOTES"
   git push origin vX.Y.Z
   ```

7. Confirm CI + release: `gh run list -L 6` and `gh release view vX.Y.Z`. Every `Checks`,
   `Build`, `Pages`, and `Release` run for the release commit + tag must be `success`.

**Landmines the `pre-commit` hook creates:**

- `version-sync` unconditionally `git add`s every `SKILL.md` on each commit. If you edited
  a SKILL.md but want it in a different commit than the one you're making, `git stash push`
  the SKILL.md out of the working tree before running `git commit`, then pop it after — or
  the version-sync add re-stages it into whichever commit you're on.
- `format-js` re-stages any `.js/.mjs/.ts/.tsx/.json` it rewrites. If you meant an atomic
  commit, verify with `git show --stat HEAD` right after; a soft `git reset --soft HEAD~1`
  plus `git reset HEAD .` gets you back if it pulled in extra files.

**Symlinked skills-dir gotcha (for `scripts/*.mjs` entrypoints).** Users install the plugin
under `~/.claude/skills`, which is a symlink to the plugin dir. If a script guards its main
with `fileURLToPath(import.meta.url) === process.argv[1]`, that comparison FAILS through the
symlink (import.meta.url resolves; argv[1] doesn't), so `main()` silently no-ops and the
script exits 0 with no output. Use `realpathSync(process.argv[1])` on the argv[1] side, and
add a regression case to the skill's `scripts/selftest.mjs`.

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

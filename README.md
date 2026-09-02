# ttt-workflows

**Four senior-engineer skills for [Claude Code](https://claude.com/claude-code): review a pull request, run a security audit, deliver a ticket, audit the copy.** One plugin, installed from a git-backed marketplace. Read-only and approval-gated by default, so you can point it at any repo or tenant without worrying what it will touch.

```text
/plugin marketplace add kaelys-js/ttt-workflows
/plugin install ttt-workflows
```

Then just ask. Paste a pull-request URL and ask for a review, point `/sec-audit` at a repo, hand `/trp` a ticket, or run `/copy-audit` over a repo's copy.

[Website](https://kaelys-js.github.io/ttt-workflows/) · [Changelog](CHANGELOG.md) · each skill ships an operator's-playbook PDF, attached to every [release](https://github.com/kaelys-js/ttt-workflows/releases)

[![Checks](https://github.com/kaelys-js/ttt-workflows/actions/workflows/lint.yml/badge.svg)](https://github.com/kaelys-js/ttt-workflows/actions/workflows/lint.yml)
[![Build](https://github.com/kaelys-js/ttt-workflows/actions/workflows/build.yml/badge.svg)](https://github.com/kaelys-js/ttt-workflows/actions/workflows/build.yml)
![License](https://img.shields.io/badge/license-MIT-blue)

## What you get

Four skills, each self-contained and portable, no client data baked in.

### `/pr-review` — a review you can paste

Give it a GitHub or Azure DevOps pull-request URL. It reads the diff, the ticket, and the existing threads, reviews against a design / correctness / security / tests rubric, proves every finding against the real lines, and hands you one paste-ready review. It **never** posts, comments, approves, or merges, the review is yours to send.

### `/sec-audit` — a security audit end to end

Point it at a repo, a PR, a path, or live Azure/Entra/ADO. It works across three layers, source and IaC, running cloud state, identity and CI, in four modes: **sweep** (find new findings), **review** (score one), **poc** (prove it), **remediate** (fix it). Read-only until you approve; a fix is a PR opened, never merged.

### `/trp` — a ticket delivered

Hand it a ClickUp ticket. It grounds the ticket in the real repo with evidence, plans the work, **stops for your approval**, then implements, runs the real gates, opens the PR, and posts the two-layer ticket update. Nothing hard to undo happens before you say go.

### `/copy-audit` — the copy, reviewed

Point it at a repo or a diff. It parses the actual copy out of 40+ languages with real ASTs, markdown prose and headings, JSON/YAML values, UI microcopy in HTML/Astro/Svelte/Vue/JSX, and judges each phrase against four content pillars (plain language, inclusive, UX microcopy, voice/grammar). With `--mode=comments` it also audits code comments and test-runner names (Rule 9). You approve the rewrites before anything is written, and every change is a **char-offset splice that touches text, never code structure**.

## Safe by default

Every skill is read-only until you approve an action, and the two that can write (sec-audit, trp) open a PR rather than merging one. You can run any of them against a client repo or a production tenant and know the boundary is enforced, not just documented. That is the whole point: the judgment of a careful senior engineer, without the risk of handing an agent your `main` branch.

---

## Development

The rest of this document is for working on the plugin itself.

```shell
git clone https://github.com/kaelys-js/ttt-workflows
cd ttt-workflows
./bin/mise install                                  # pinned toolchain (mise-managed)
./bin/mise exec -- pnpm install
./bin/mise exec -- lefthook install
./bin/mise exec -- lefthook run pre-push --all-files # the full gate, exactly as CI runs it
```

### Layout

| Path | What it is |
| --- | --- |
| `.claude-plugin/marketplace.json` | The marketplace manifest (`name: ttt-workflows`). |
| `plugins/ttt-workflows/` | The plugin: `plugin.json` + the four `skills/<name>/`. |
| `plugins/ttt-workflows/skills/<name>/scripts/` | Deterministic `.mjs`/`.sh` the skill drives, each with a `selftest.mjs`. |
| `plugins/ttt-workflows/skills/<name>/reference/` | The protocol, usage guide, deep dive, eval triggers. |
| `docs/*.typ` · `docs/*.pdf` | The operator playbooks, typst source and the built PDF (kept in sync by `docs:check`). |
| `packages/products/website/` | The Astro marketing site deployed to GitHub Pages. |
| `VERSION` · `CHANGELOG.md` | The release version + curated changelog, kept in lockstep with the tag. |
| `bin/mise` · `bin/git` | The pinned mise wrapper and the unbypassable git wrapper. |
| `turbo.json` · `lefthook.yml` · `mise.toml` | The task graph, git hooks, and toolchain, one gate, run locally and in CI. |

Everything is pinned and provisioned by [mise](https://mise.jdx.dev/), you do not install tools by hand. `./bin/mise install` sets up node, pnpm, turbo, the format/lint tools, typst, and lefthook into a workspace-local `.mise/`. Docker is needed only for the website's visual-regression suite; without it, that check defers to CI.

### Testing and gates

One gate runs everywhere: the `pre-push` lefthook hook is exactly what the CI **Checks** job runs (`lefthook run pre-push --all-files`), and `bin/preflight.sh` asserts that parity on every push. Every stage runs through turbo, so an unchanged surface is a cache hit locally and in CI.

- **Format + lint** — oxfmt, oxlint, shfmt, shellcheck, taplo, yamllint, actionlint, markdownlint, prettier (astro), stylelint (css).
- **Skill scripts** — the four selftest batteries under c8, with a coverage floor.
- **Website** — Vitest unit + Playwright E2E and visual regression, byte-identical light/dark baselines for every section.
- **Docs** — the playbook PDFs must match their typst sources.

The gate is unbypassable: `bin/git` refuses `git push --no-verify` and the `LEFTHOOK=0` / `LEFTHOOK_EXCLUDE` env bypasses. If a check fails, fix it, there is no escape hatch.

### Releasing

`plugins/ttt-workflows/.claude-plugin/plugin.json`'s `version` is the **single source of truth**. To release: bump it, add the matching `## [x.y.z] - date` section to [`CHANGELOG.md`](CHANGELOG.md) (move what accumulated under `## [Unreleased]` into it), then commit. The pre-commit hook runs `scripts/sync-version.mjs`, which propagates that version into `marketplace.json`, every `SKILL.md`, and `VERSION`, and verifies the CHANGELOG's top released heading matches, so nothing can drift (a `qa:version-sync` gate in pre-push and CI fails the build on any mismatch). Then push the matching annotated tag:

```shell
git commit -am "…"            # marketplace/SKILL/VERSION sync automatically; CHANGELOG is checked
git tag -a v1.2.2 -m "v1.2.2" # the tag message is not the notes — the CHANGELOG section is
git push origin main --tags
```

Two things are separate, on purpose:

- **The plugin is served from `main`.** `/plugin marketplace add kaelys-js/ttt-workflows` clones the default branch and `/plugin marketplace update ttt-workflows` re-pulls it, so a push to `main` with the `version` bumped is what reaches installed plugins. No tag needed.
- **The `v*` tag is the release.** `release.yml` re-checks the tag against `VERSION` and `CHANGELOG.md` (via `scripts/release-notes.mjs`), refuses to publish on any mismatch, then cuts a GitHub Release whose notes are the matching CHANGELOG section, with the four playbook PDFs attached. The tag is also the only trigger that deploys the marketing site, keeping the live site in lockstep with the released plugin.

### Contributing

Work on a branch, keep changes surgical, and match the surrounding style. Commits are Conventional Commits (enforced by commitlint); the full gate must be green before a push. No AI attribution anywhere: no `Co-Authored-By`, "Generated with", or model names in commits, PRs, or code.

## License

[MIT](LICENSE).

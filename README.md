# ttt-workflows

Three engineering workflows as [Claude Code](https://claude.com/claude-code) skills —
review a pull request, run a security audit, deliver a ticket — bundled as one plugin,
installed from a git-backed marketplace. Read-only and approval-gated by default; any repo,
any tenant; no client data baked in.

[![Checks](https://github.com/kaelys-js/ttt-workflows/actions/workflows/lint.yml/badge.svg)](https://github.com/kaelys-js/ttt-workflows/actions/workflows/lint.yml)
[![Build](https://github.com/kaelys-js/ttt-workflows/actions/workflows/build.yml/badge.svg)](https://github.com/kaelys-js/ttt-workflows/actions/workflows/build.yml)
[![Web E2E](https://github.com/kaelys-js/ttt-workflows/actions/workflows/web-e2e.yml/badge.svg)](https://github.com/kaelys-js/ttt-workflows/actions/workflows/web-e2e.yml)
[![Pages](https://github.com/kaelys-js/ttt-workflows/actions/workflows/pages.yml/badge.svg)](https://github.com/kaelys-js/ttt-workflows/actions/workflows/pages.yml)
![Node](https://img.shields.io/badge/node-26.8.1-339933?logo=node.js)
![pnpm](https://img.shields.io/badge/pnpm-11.24.0-F69220?logo=pnpm)
![License](https://img.shields.io/badge/license-Proprietary-red)

Site: [kaelys-js.github.io/ttt-workflows](https://kaelys-js.github.io/ttt-workflows/)

## TL;DR

In Claude Code:

```text
/plugin marketplace add kaelys-js/ttt-workflows
/plugin install ttt-workflows
```

Then invoke a skill — paste a pull-request URL and ask for a review, point `/sec-audit` at a
target, or hand `/trp` a ticket. To hack on the repo itself:

```bash
# 1. Install the workspace toolchain (mise-managed, pinned in mise.lock)
./bin/mise install

# 2. Install deps + wire the git hooks
./bin/mise exec -- pnpm install
./bin/mise exec -- lefthook install

# 3. Run the full gate exactly as CI does
./bin/mise exec -- lefthook run pre-push --all-files
```

## Contents

- [The three skills](#the-three-skills)
- [Layout](#layout)
- [Prerequisites](#prerequisites)
- [Local development](#local-development)
- [Testing and gates](#testing-and-gates)
- [The website](#the-website)
- [Releasing](#releasing)
- [Contributing](#contributing)
- [License](#license)

## The three skills

Each is self-contained and portable — any repo, any tenant, no client data baked in — and
each ships a companion operator's-playbook PDF (the what/how/why of doing that work by hand).

| Skill | Command | What it does | Boundary |
| --- | --- | --- | --- |
| **pr-review** | `/pr-review` | Reviews a GitHub or Azure DevOps PR from its URL and returns one paste-ready review, every finding proven against the real diff. | Read-only — never posts, comments, approves, or merges. |
| **sec-audit** | `/sec-audit` | Audits a repo, PR, path, or live Azure/Entra/ADO across three layers (source + IaC, running cloud state, identity + CI). Four modes: sweep, review, poc, remediate. | Approval-gated — read-only until you approve; a fix is a PR opened, never merged. |
| **trp** | `/trp` | Delivers a ticket end to end through a phase machine: ground in the repo, plan, stop for approval, implement, run the real gates, open the PR. | Approval-gated — nothing hard to undo before you say go. |

## Layout

| Path | What it is |
| --- | --- |
| `.claude-plugin/marketplace.json` | The marketplace manifest (`name: ttt-workflows`). |
| `plugins/ttt-workflows/` | The plugin: `plugin.json` + the three `skills/<name>/`. |
| `plugins/ttt-workflows/skills/<name>/scripts/` | Deterministic `.mjs`/`.sh` the skill drives, each with a `selftest.mjs`. |
| `plugins/ttt-workflows/skills/<name>/reference/` | The protocol, usage guide, deep dive, eval triggers. |
| `docs/*.typ` · `docs/*.pdf` | The operator playbooks — typst source and the built PDF (kept in sync by `docs:check`). |
| `packages/products/website/` | The Astro marketing site deployed to GitHub Pages. |
| `bin/mise` · `bin/git` | The pinned mise wrapper and the unbypassable git wrapper. |
| `turbo.json` · `lefthook.yml` · `mise.toml` | The task graph, git hooks, and toolchain — one gate, run locally and in CI. |

## Prerequisites

Everything is pinned and provisioned by [mise](https://mise.jdx.dev/) — you do not install
tools by hand. `./bin/mise install` sets up node 26.8.1, pnpm 11.24.0, turbo, oxfmt/oxlint,
shfmt/shellcheck, taplo, yamllint, actionlint, markdownlint, commitlint, typst, and lefthook
into a workspace-local `.mise/`. Docker (or OrbStack) is needed only to run the website's
visual-regression suite locally; without it that check defers to CI.

## Local development

`bin/` is first on `PATH` (via `mise.toml`), so a bare `git` resolves to `bin/git` and a bare
`mise` to the pinned `bin/mise`. Skill scripts run under node; the website is a pnpm project
under `packages/products/website`.

```bash
# run one gate stage through turbo (cached on its inputs)
./bin/mise exec -- ./node_modules/.bin/turbo run qa:web-lint

# the website
./bin/mise exec -- bash -c 'cd packages/products/website && pnpm dev'
```

## Testing and gates

One gate runs everywhere — the `pre-push` lefthook hook is exactly what the CI **Checks** job
runs (`lefthook run pre-push --all-files`), and `bin/preflight.sh` asserts that parity on every
push. Every stage runs through turbo, so an unchanged surface is a cache hit locally and in CI.

- **Format + lint** — oxfmt, oxlint, shfmt, shellcheck, taplo, yamllint, actionlint, markdownlint, prettier (astro), stylelint (css).
- **Types** — `tsc --noEmit` on the website (TypeScript 7).
- **Skill scripts** — the three selftest batteries under c8, with a 75% coverage floor.
- **Website unit** — Vitest + Testing Library, 75% floor.
- **Website E2E + visual** — Playwright in the pinned container, byte-identical light/dark
  baselines for every page section.
- **Docs** — the playbook PDFs must match their typst sources.

The gate is unbypassable: `bin/git` refuses `git push --no-verify` and the `LEFTHOOK=0` /
`LEFTHOOK_EXCLUDE` env bypasses. If a check fails, fix it — there is no escape hatch.

## The website

An Astro 5 + React + Tailwind site in `packages/products/website`, deployed to GitHub Pages by
the `pages` workflow. Every data constant and the structured-data graph are validated with
[valibot](https://valibot.dev/) at build, so a bad edit fails the build rather than shipping
broken markup. The displayed version is injected from the release tag, in lockstep with the
plugin.

## Releasing

Bump `version` in `plugins/ttt-workflows/.claude-plugin/plugin.json`, then push an annotated
tag:

```bash
git tag -a v1.2.0 -m "## Changes…"
git push origin v1.2.0
```

The `release` workflow cuts a GitHub Release from the tag message and attaches the three
playbook PDFs; the site rebuilds showing that version. Installed plugins update when you run
`/plugin marketplace update ttt-workflows` (or enable auto-update for the marketplace).

## Contributing

Work on a branch, keep changes surgical, and match the surrounding style. Commits are
Conventional Commits (enforced by commitlint); the full gate must be green before a push (it
will be — the hook runs it). No AI attribution anywhere: no `Co-Authored-By`, "Generated
with", or model names in commits, PRs, or code.

## License

Proprietary. See [LICENSE](LICENSE).

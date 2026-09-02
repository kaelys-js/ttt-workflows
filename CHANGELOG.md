# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`VERSION`, `plugin.json`, and the topmost released heading below move in lockstep with the
`v*` release tag: bump the version, move the entries below out of `[Unreleased]` under a new
`## [x.y.z] - date` heading, commit, then tag `vx.y.z`. A release gate rejects any tag whose
version does not match `VERSION` and this file, and `release.yml` publishes the matching
section here as the GitHub Release notes.

## [Unreleased]

## [1.3.1] - 2026-09-02

### Fixed

- copy-audit's per-unit reviewer was too lenient — a blanket keep-bias suppressed flagging as
  well as rewriting, so it passed almost every unit. It now flags every defensible content-pillar
  violation while keeping auto-applied rewrites conservative, which surfaced roughly three times
  as many issues on the same corpus (including a corrupted sentence in a reference doc).
- The copy-review workflow crashed at the workflow runtime's 4,096-item return cap on a
  whole-repo sweep; it now returns verdicts in chunks, with the per-agent journal as the fallback.
- markdownlint only checked root `*.md`, so every skill and reference doc went unlinted. The gate
  now lints all authored markdown (vendored, build, and toolchain trees excluded), and 173 latent
  violations across 22 docs were fixed.

### Changed

- Repo-wide copy pass: tightened 114 spans across the operator playbooks, skill reference docs,
  the READMEs, and the website — splitting run-ons, cutting empty intensifiers, fixing comma
  splices, and repairing a mis-described token fallback and other defects.

## [1.3.0] - 2026-09-02

### Added

- **copy-audit skill** — audit product copy, UI microcopy, and (with `--mode=comments`)
  code-comment slop and test-runner names across a git repo or diff. AST-based extraction
  (tree-sitter for 40+ languages plus babel/Astro/remark/yaml) reaches markdown prose,
  headings, and alt-text, JSON/YAML copy values, and UI microcopy in HTML/Astro/Svelte/Vue/
  JSX/TSX; parallel subagents judge each unit with full-file context against four cited
  content pillars (plain language, inclusive, UX microcopy, voice/grammar) or, in comment
  mode, comment-quality plus Rule 9. Verdicts are keep/rewrite/flag/delete and every rewrite
  is a SHA-guarded char-offset splice that changes text but never code structure, with a
  verify phase asserting zero code-line changes. Read-only until you approve the rewrites.
  Subsumes the standalone comment-audit skill. Runs against a git repo/diff, against pasted
  text or a standalone file with no git (`--input` / `--stdin --as`, verified by exact
  pre-image reconstruction), and against **PDFs** (text pulled with Node's built-in zlib and
  reviewed read-only — never spliced back into the binary).
- Marketing site: a fourth skill card, a copy-audit mockup, FAQ entries, and an Operator's
  Playbook PDF for copy-audit.

### Changed

- The plugin now bundles four skills; the plugin and marketplace manifests, the READMEs, and
  the marketing site update from "three" to "four".

## [1.2.3] - 2026-09-01

### Features

- Generate release notes from commits with git-cliff (release)

### Documentation

- Rewrite the README to lead with the product

## [1.2.2] - 2026-09-01

- Added a curated CHANGELOG.md and a VERSION file, kept in lockstep with plugin.json and the release tag: a gate rejects any tag or version bump that does not match, and release notes now come from the matching CHANGELOG section instead of the tag message.
- The site's Resources "Changelog" now links to CHANGELOG.md.
- Hardened the accessibility test to settle animations and fonts before scanning, removing an intermittent contrast flake.

## [1.2.1] - 2026-09-01

- Fixed horizontal overflow on phones; a gated e2e test now asserts the page never scrolls sideways at any width.
- Added an axe-core accessibility gate (WCAG 2.0/2.1/2.2 A+AA + best-practice, light and dark, desktop and mobile) to CI, and fixed every finding: contrast raised to AA across the palette, and the scrollable command row made keyboard-reachable.
- Animated the FAQ open/close and the copy-button state; the truncated command now shows a scroll-fade cue.
- Compressed the static assets 55% (111 KB to 50 KB); the stylesheet ships no animation library.
- Adopted current CSS defaults: `color-scheme`, Safari `-webkit-backdrop-filter`, forced-colors focus, `text-wrap` balance/pretty, no iOS tap-flash, and `prefers-reduced-transparency`.
- Added Releases, Changelog, and Licence links to the site Resources; footer now credits © 2026 TTT Studios.
- Relicensed to MIT (Copyright © 2026 TTT Studios).
- Pinned all three skills and the workflows they launch to `claude-opus-4-7`.

## [1.2.0] - 2026-09-01

- Bundled the three engineering workflows — **pr-review**, **sec-audit**, **trp** — as one Claude Code plugin installed from a git-backed marketplace, read-only and approval-gated by default.
- Shipped a framework-free marketing site (Astro-only, ~12 KB JS, Lighthouse 100), mobile-safe, with the FAQ and copy interactions animated and every asset compressed.
- Added full unit/behavioural test coverage of the skills' deterministic layer, enforced in CI.
- Introduced single-source-of-truth versioning across plugin, marketplace, and skills, with a release-gated site deploy that moves in lockstep with the tag.
- Attached each skill's operator-playbook PDF to the release.

[Unreleased]: https://github.com/kaelys-js/ttt-workflows/compare/v1.2.3...HEAD
[1.2.3]: https://github.com/kaelys-js/ttt-workflows/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/kaelys-js/ttt-workflows/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/kaelys-js/ttt-workflows/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/kaelys-js/ttt-workflows/releases/tag/v1.2.0

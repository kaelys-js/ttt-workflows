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

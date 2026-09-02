# copy-audit — modes

`--mode` is set on `extract` and threads through the sweep. It decides which extractor runs,
which files are in scope, which rubric the reviewer applies, and which verdicts are legal.
Everything after extract (bundle-emit, review, apply, verify) is mode-agnostic — it processes
whatever units the mode produced.

```bash
node scripts/extract.mjs --phase=extract --mode=<copy|comments|all> --repo <r> --full --head HEAD --db <db>
```

## The three modes

| | `copy` (default) | `comments` | `all` |
| --- | --- | --- | --- |
| **extractor** | `extractUnits` (prose, microcopy, copy values, code-string labels) | `extractComments` (comment nodes + `it`/`describe`/`test` first-arg names) | both |
| **unit `syntax`** | `md-*`, `json-copy`, `yaml-copy`, `jsx-text`, `attr-copy`, `js-string`, `code-string`, `text-line`, `frontmatter`, `config-*`, `env-value`, `tsv-cell`, `typ-copy` | `comment`, `testname` | all of the above |
| **test / spec files** | **skipped** (`*.test.*`, `*.spec.*`, `test/`, `spec/`, `__tests__/`, `e2e/`) | **kept** — test-runner names live there | kept |
| **rubric** | four content pillars (plain-language, inclusive, microcopy, voice-grammar) | comment-quality (WHY-not-WHAT) + Rule 9 (test names encode intent) | both, per unit's syntax |
| **valid verdicts** | `keep` / `rewrite` / `flag` | `keep` / `rewrite` / `flag` / `delete` (never `delete` a `testname`) | union |

See [rubric.md](rubric.md) for the checks each rubric enforces and [formats.md](formats.md)
for which file type yields which units.

## `copy` — product copy & UI microcopy

The default. Audits what users read: markdown prose and headings, JSON/YAML/TOML copy values,
UI microcopy in HTML/Astro/Svelte/Vue/JSX/TSX, string labels in copy modules, config/template/
data copy. Test and config files are filtered out at extract (their strings are code, not
copy), and any code string that slips through the classifier gets a `keep`. Judged against the
four content pillars. Nothing is auto-deleted — `delete` is not a legal verdict here.

**Pick it for:** a content/UX-writing review, a plain-language or inclusive-language pass, a
readability sweep of docs or a marketing site, tightening wording or CTAs.

## `comments` — comment slop & test-runner names

Subsumes the old comment-audit skill, now AST-based: comment nodes come from babel (JS/TS),
`<!-- -->` + `<script>` blocks (markup/markdown), and every tree-sitter grammar (~40 languages),
so it is far more robust than a regex parser. Pragma/lint-directive comments and shebangs are
never captured. Test files are **audited** in this mode (skipped in `copy`) because
`it`/`describe`/`test` names are the point. Judged against comment-quality rules and Rule 9.
Adds the `delete` verdict for pure-slop comments; a `delete` on a `testname` is refused (it would
break the runner call).

**Pick it for:** "comment cleanup", "AI comment slop", a "test name audit", a "Rule 9 sweep".

## `all` — both

Runs both extractors over every file and applies both rubrics, each unit judged by its own
syntax. Pick it for a single end-to-end pass over a repo when you want copy and comments/test
names cleaned in one sweep. It is the widest scope and the largest bundle set, so expect a longer
review.

## Notes

- The mode is fixed at `extract` — it determines what lands in the `units` table. To change mode,
  re-extract (extract wipes this repo's rows first).
- Skips beyond the mode's defaults are additive: `--skip-path <substr>` (comma-separated /
  repeatable) drops repo-specific generated trees in any mode.

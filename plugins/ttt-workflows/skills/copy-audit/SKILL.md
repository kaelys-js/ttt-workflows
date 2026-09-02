---
name: copy-audit
model: claude-opus-4-7
description: Review product copy and UI microcopy against cited writing standards — plain language, inclusive language, UX microcopy, and voice and grammar — then apply the edits you approve, changing only the text and never the surrounding code or markup. It reads markdown prose, headings, and alt text, JSON, YAML, and TOML values, and UI strings in HTML, Astro, Svelte, Vue, and JSX/TSX across a repo or a diff. With --mode=comments it also reviews code comments and test names (it/describe/test) for low-value or misleading comments and vague names — this replaces the earlier comment-audit skill. Parallel subagents judge each item in full-file context, and nothing is written until you approve. Use for /copy-audit, a copy, content, or microcopy review, a readability, plain-language, or inclusive-language pass, a docs or markdown polish, or a comment and test-name audit — "comment cleanup", "AI comment slop", "test name audit", "Rule 9 sweep".
license: MIT. See LICENSE.
compatibility: Requires node and git. Ships vendored parsers (tree-sitter grammar wasms via git-lfs, @babel/parser, @astrojs/compiler, remark, better-sqlite3), so there is no install step and it runs offline; the reviewer runs as in-session subagents (no API key).
metadata:
  author: ttt-studios
  version: "1.3.2"
---

# copy-audit

UX copy, marketing prose, docs, and microcopy drift from best practice on long-running
branches faster than any one reviewer can keep up with. This skill sweeps a repo (or a
diff range) end to end: it parses every **copy unit** — markdown prose and headings,
UI microcopy, JSON/YAML copy-key values, string phrases in copy modules — lets AI
subagents judge each one against the four content-standard pillars in
[reference/standards.md](reference/standards.md), then applies the verdicts to disk with
a **char-offset exact-match splice** that only ever rewrites the human-readable text (the
surrounding quotes, tags, markdown markers, and JSON structure are byte-identical) and a
**per-file SHA guard** that refuses to touch a file that changed since extract.

Every phase is idempotent and inspectable — the sqlite DB is the source of truth for
verdicts, so an orchestrator can review the tables before committing to disk, defer files,
or resume mid-sweep. Copy is subjective and high-stakes, so **nothing is auto-deleted and
nothing writes without your go-ahead**: the flow stops after review for approval.

## When to invoke

- User asks for a copy / content / writing / microcopy review of a repo, PR, branch, or
  folder ("review the copy", "UX writing pass", "tighten the wording").
- User wants a plain-language, readability, inclusive-language, or brand-voice sweep of
  markdown docs, a marketing site, or UI strings.
- User says "do the copy sweep" (recurring cadence on a long branch) — see
  **Incremental / delta sweeps**.

## What it is not

- Not a translator, not an SEO keyword tool, not a grammar-only linter. It reviews copy
  against the four pillars and preserves meaning, product names, numbers, and URLs.
- Not a code reviewer. Code strings, identifiers, and config values are filtered out at
  extract; any that slip through get a `keep` verdict.

## Modes (`--mode` on every phase)

- **`copy`** (default) — product copy & UI microcopy, judged against the four content
  pillars.
- **`comments`** — code-comment slop and test-runner names (`it`/`describe`/`test` first
  args), judged against comment-quality rules (WHY-not-WHAT, delete restate/scar/dead
  comments) and Rule 9 (a test name must encode intent, not shape). This is the subsumed
  **comment-audit** behaviour, now AST-based: comment nodes come from every tree-sitter
  grammar (40+ languages) and babel (JS/TS), so it is far more robust than the old regex
  parser. Test files are audited in this mode (skipped in `copy`). Verdicts add `delete`;
  a `delete` on a test name is refused (it would break the runner call).
- **`all`** — both.

`node scripts/extract.mjs --phase=extract --mode=comments --repo <r> --full --head HEAD --db <db>`

## Anatomy

```text
copy-audit/
  SKILL.md                -- this file
  reference/
    standards.md          -- the four pillars, as cited checklists + evidence (Aug 2026)
    usage.md              -- worked end-to-end run + the review workflow shape
  reference/
    extraction-research.md        -- cited best-practice for the web-stack parsers (Aug 2026)
    extraction-multilang-research.md -- cited best-practice for tree-sitter multi-language (Aug 2026)
  scripts/
    extract.mjs           -- the engine: phases + JSON/text + wiring
    ast-extract.mjs       -- AST extraction (babel / @astrojs/compiler / remark / yaml)
    ts-extract.mjs        -- tree-sitter extraction for the broad language set
    grammars/             -- vendored modern-ABI tree-sitter grammar .wasm files
    schema.sql            -- sqlite table definition
    package.json          -- vendored deps pin
    node_modules/         -- vendored (better-sqlite3, @babel/parser, @astrojs/compiler,
                          --   web-tree-sitter, tree-sitter-wasms, yaml, mdast) — no install step
    selftest.mjs          -- regression battery + spec/trigger validation
  workflows/
    copy-review.js         -- per-unit reviewer fan-out (keep/rewrite/flag)
    copy-holistic.js       -- whole-page holistic reviewer (cross-cutting findings)
```

Extraction is **AST-based** (real parsers, not regex): `@babel/parser` for JS/TS/JSX/TSX,
`@astrojs/compiler` for Astro, `remark`/mdast for markdown, the `yaml` CST for YAML, an
offset-tracking scanner for JSON, and **tree-sitter** (web-tree-sitter WASM + prebuilt
grammars) for the broad language set. One classifier (`isCopyPhrase`) decides copy vs code.

Invoke every phase as `node scripts/extract.mjs --phase=<phase> ...`. All phases share
one sqlite DB (`--db <path>`) and act on rows in specific verdict states, so re-runs are
safe and the DB alone tells you where a sweep is in its lifecycle.

## Phases

### 1. `extract` — parse copy units

```text
# Git mode — a diff range or the whole working tree:
node scripts/extract.mjs --phase=extract \
  --repo <repo>            # absolute path to a git worktree
  --base <sha>             # baseline ref (exclusive); omit when --full is set
  --head <sha>             # head ref (inclusive)
  --db <path>              # sqlite DB path (created if missing)
  [--full]                 # whole-repo sweep: base = empty tree, so EVERY copy unit is
                           #   audited, not just those added in a range (two-dot diff)
  [--files-list <path>]    # optional newline-separated file allowlist
  [--skip-path <substr>]   # optional extra path-substring skips (comma-sep / repeatable)

# Direct mode — audit one pasted string / standalone file, no git needed:
node scripts/extract.mjs --phase=extract --db <path> --input <file> [--as <.ext>]
printf '%s' "$PASTED" | node scripts/extract.mjs --phase=extract --db <path> --stdin --as <.ext>
```

Walks `git diff --name-only ${base}...${head}` (or the whole tree with `--full`), filters
by extension + skip rules, and for each survivor parses every **copy unit** into the
`units` table, recording exact `char_start`/`char_end` offsets of the editable payload.
Wipes rows for this `repo` first so re-runs are clean.

**Direct input (`--input` / `--stdin`).** To audit pasted text or a single file that is not
in a git repo, pass `--input <file>` (or pipe the text with `--stdin`), and `--as <.ext>` to
declare the format (`.md`, `.json`, `.html`, …) so the right extractor runs. The rest of the
pipeline is unchanged — `apply` still splices by SHA-guarded char offset, and `verify` proves
the copy-only invariant by reconstructing the file from its pre-image + the applied rewrites
(an exact match means nothing outside a recorded span moved). With `--stdin`, the text is
written to a real file (use `--input` to choose where) so apply/verify have something on disk.

**File types → unit kinds:**

| Extensions                                                                                                                                                                                                                                                                                                                                                                                                                       | Copy units captured                                                                                                                                                                                                                                                         | `syntax`                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `.md` / `.mdx` / `.markdown` / `.mdc`                                                                                                                                                                                                                                                                                                                                                                                            | headings, prose paragraphs, list items, blockquotes, standalone-image alt text; YAML frontmatter values                                                                                                                                                                     | `md-heading`, `md-prose`, `md-listitem`, `md-blockquote`, `md-alt`, `frontmatter` |
| `.json` / `.jsonc` / `.json5` / `.webmanifest`                                                                                                                                                                                                                                                                                                                                                                                   | string values (and arrays of strings) under copy-carrier keys, walked with an offset-tracking JSON scanner (tolerates `//` + `/* */` for jsonc)                                                                                                                             | `json-copy`                                                                       |
| `.yml` / `.yaml`                                                                                                                                                                                                                                                                                                                                                                                                                 | scalar values under copy-carrier keys                                                                                                                                                                                                                                       | `yaml-copy`                                                                       |
| `.html` / `.htm` / `.vue` / `.svelte` / `.astro`                                                                                                                                                                                                                                                                                                                                                                                 | visible text nodes + `alt` / `title` / `placeholder` / `label` / `aria-label` / `aria-description` attributes (with `<script>` / `<style>` / comments / Astro fence masked out)                                                                                             | `jsx-text`, `attr-copy`                                                           |
| `.jsx` / `.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                  | the template units above **plus** copy-key string values                                                                                                                                                                                                                    | `jsx-text`, `attr-copy`, `js-string`                                              |
| `.js` / `.ts` / `.mjs` / `.cjs` / `.mts` / `.cts`                                                                                                                                                                                                                                                                                                                                                                                | string values by AST context (object value, assignment, array element, call arg); copy-key values and phrase-shaped values                                                                                                                                                  | `js-string`                                                                       |
| `.toml`                                                                                                                                                                                                                                                                                                                                                                                                                          | string values (tree-sitter TOML)                                                                                                                                                                                                                                            | `code-string`                                                                     |
| `.html` / `.htm` / `.xml` / `.svg` / `.hbs` / `.handlebars` / `.mustache`                                                                                                                                                                                                                                                                                                                                                        | element text nodes + copy attributes (covers Android `strings.xml`, SVG `<text>`, Handlebars/Mustache, HTML)                                                                                                                                                                | `jsx-text`, `attr-copy`                                                           |
| **~40 languages via tree-sitter** — Swift, Rust, Go, Java, Kotlin, C/C++/Obj-C, PHP, Python, Ruby, Dart, Shell, Lua, Scala, C#, Elixir, Solidity, Zig, HCL/Terraform, Bicep, CSS/SCSS/Sass/Less/PostCSS, SQL, Nix, OCaml, Haskell, Perl, R, PowerShell, Fish, Nim, GDScript, V, Crystal, F#, Starlark/Bazel, CMake, Groovy/Gradle, Make, Prisma, Protobuf, Jsonnet, CUE, Erlang (+ Makefile/CMakeLists/Gemfile/Rakefile by name) | string literals (interpolation-skipped, quote-stripped, bare docstring statements excluded); a string that is the first arg to a UI/copy marker (`Text(` / `Button(` / `NSLocalizedString(` / `getString(` / `@description(` / `t(` / `_(` …) is kept even as a terse label | `code-string`                                                                     |
| HTML-embedded templates — ERB, EJS, Jinja, Liquid, Twig, Blade, HEEx, XSLT                                                                                                                                                                                                                                                                                                                                                       | element text + copy attrs, with `<%…%>`/`{%…%}`/`{{…}}`/`{#…#}` directive blocks masked; Pug/Jade → prose lines                                                                                                                                                             | `jsx-text`, `attr-copy`, `text-line`                                              |
| `.ini` / `.cfg` / `.properties` / `Dockerfile` / `.csv`                                                                                                                                                                                                                                                                                                                                                                          | comment prose + `key=value` phrase values; CSV/TSV phrase cells                                                                                                                                                                                                             | `config-comment`, `config-value`, `tsv-cell`                                      |
| `.txt` / `.text` / `.tpl`                                                                                                                                                                                                                                                                                                                                                                                                        | prose paragraphs                                                                                                                                                                                                                                                            | `text-line`                                                                       |
| `.env` / `.env.*`                                                                                                                                                                                                                                                                                                                                                                                                                | `#` comment prose + `KEY=value` values that read like copy (keyed on NAME/TITLE/MESSAGE… keys)                                                                                                                                                                              | `config-comment`, `env-value`                                                     |
| config / ignore files (`.editorconfig`, `.gitignore`, `.gitattributes`, `.npmrc`, `.dockerignore`, `.oxfmtignore`, `.yamllint`, `.nvmrc`, `CODEOWNERS`, `.shellcheckrc`, …)                                                                                                                                                                                                                                                      | `#`/`;` comment prose + `key=value` phrase values (patterns/paths/rules dropped)                                                                                                                                                                                            | `config-comment`, `config-value`                                                  |
| `.tsv` (tab/pipe-delimited)                                                                                                                                                                                                                                                                                                                                                                                                      | phrase-shaped cells                                                                                                                                                                                                                                                         | `tsv-cell`                                                                        |
| `LICENSE` / `NOTICE` / `VERSION` / `AUTHORS` and other extension-less prose                                                                                                                                                                                                                                                                                                                                                      | paragraphs                                                                                                                                                                                                                                                                  | `text-line`                                                                       |
| `.typ` (Typst)                                                                                                                                                                                                                                                                                                                                                                                                                   | `#show/.with(…)` string metadata, `=` headings, body prose                                                                                                                                                                                                                  | `typ-copy`, `md-heading`, `md-prose`                                              |
| `.pdf` (**read-only**)                                                                                                                                                                                                                                                                                                                                                                                                           | visible text pulled with Node's built-in `zlib` (FlateDecode + uncompressed streams; `Tj`/`TJ`/hex strings) into prose paragraphs — reviewed and reported, never spliced back into the binary; `apply` skips them                                                           | `pdf-text`                                                                        |

Tree-sitter runs on **web-tree-sitter (WASM)** against modern-ABI grammar wasms vendored
in `scripts/grammars/` (most collected prebuilt from their npm packages; Swift and Dart
built from source with the tree-sitter CLI + WASI SDK). A grammar that fails to load is
caught and simply yields no units for that file — it never crashes the sweep. Formats
without a vendored grammar yet (KQL, Typst) are not covered.

**Copy-carrier keys** (case-insensitive) include `title` / `subtitle` / `heading` /
`label` / `description` / `summary` / `tagline` / `cta` / `button` / `placeholder` /
`message` / `error` / `alt` / `aria-label` / `tooltip` / `caption` / `question` /
`answer` / `body` / `content` / … (full set in `extract.mjs`).

**Correctness guards baked into the parser:**

- **Phrase filter.** A raw string becomes a unit only when it reads like human copy —
  has a letter, and either whitespace, sentence punctuation, or a copy-carrier key. URLs,
  file paths, identifiers, class lists, `CONSTANT_CASE`, hex colors, numbers/dates, and
  code-shaped strings are dropped. Bias is conservative: when unsure, skip it.
- **Offset masking.** Template extraction runs against a copy of the file with
  `<script>` / `<style>` bodies, HTML comments, and the Astro/Svelte frontmatter fence
  replaced by equal-length spaces, so structure is scanned without ever capturing code —
  and recorded offsets still point at the real file.
- **De-overlap.** Per file, units are sorted and any overlapping span is dropped, so the
  bottom-up splice at apply time can never corrupt a nested unit.
- **Template-literal safety.** JS/TS template literals (`` `...${x}...` ``) are never
  captured — interpolation makes them unsafe to rewrite.

**Default skips:** `AGENTS.md` / `CLAUDE.md` / `MEMORY.md` / `SKILL.md`, `CHANGELOG*`,
lockfiles, `LICENSE`, `tsconfig`/`jsconfig`/`.eslintrc`/`.prettierrc` JSON, `*.min.*`,
`*.d.ts`, and generated trees (`/node_modules/`, `/dist/`, `/build/`, `/coverage/`,
`/.next/`, `/.astro/`, `/.svelte-kit/`, `/.turbo/`, `/vendor/`, snapshots). `README*` and
other docs are **kept** — they are prime copy. Append repo-specific skips with
`--skip-path`.

### 2. `bundle-emit` — pack for the reviewer

```text
node scripts/extract.mjs --phase=bundle-emit --db <path> --out-dir <dir>
```

Packs all `pending` units by file into token-budgeted bundles (~40,000 chars). Each
bundle carries multiple files with their **full line-numbered text** (`=== FILE: … ===`)
plus every unit's id, syntax, line range, and exact text. Files bigger than the budget go
solo. Writes `bundle-NNNN.json` (each `{system, user}` — the exact prompt for a subagent)
plus `manifest.json`. There is **no auto-KEEP and no auto-DELETE** — every unit gets full
human-context judgment, because a wrong copy edit is visible harm.

### 3. Review (out of skill — run from the Workflow)

The reviewer runs through the Workflow tool with `parallel()` fanning out one Agent per
bundle; each agent Reads its bundle and returns structured JSON verdicts. No HTTP API key
— the reviewers are in-session subagents. The ready-to-run workflow shape and the verdict
schema live in [reference/usage.md](reference/usage.md) and
[workflows/copy-review.js](workflows/copy-review.js). Each verdict is
`{id, verdict: keep|rewrite|flag, rewrite: string|null, category, severity, note}`.

The workflow VM caps any single returned array at 4,096 items, so `copy-review.js` returns
verdicts pre-chunked as `result.verdictChunks` (each sub-array < the cap) plus
`result.verdictCount` — flatten the chunks to rebuild the full list:

```text
jq '[.result.verdictChunks[][]]' workflow-result.json > verdicts.json
```

For a very large sweep, or if you ever hit the boundary another way, the per-agent journal
is the canonical fallback (it always holds every verdict):

```text
JOURNAL=<transcriptDir>/journal.jsonl
jq -sc '[.[] | select(.type=="result") | .result.verdicts[]?]' "$JOURNAL" > verdicts.json
```

### 4. `apply-verdicts` — write reviewer JSON into sqlite

```text
node scripts/extract.mjs --phase=apply-verdicts --db <path> --verdicts <path>
```

Updates each `pending` row in place with `verdict` / `rewrite` / `category` / `severity`
/ `note`. Only `keep` / `rewrite` / `flag` are accepted; unknown verdicts are skipped.
Reports `updated`, `skipped`, `still_pending`. **This is the review-before-apply gate** —
inspect the tables (or a rendered report) before running `apply`.

### 5. `apply` — splice rewrites into files

```text
node scripts/extract.mjs --phase=apply --db <path> --repo <path>
```

For every row with `verdict='rewrite' AND applied=0`:

- **SHA guard.** Reads the on-disk file; if its sha256 differs from the `file_sha` at
  extract time ⇒ FATAL, refusing to write. Recovery: defer that file (leave its rows, or
  set them to `keep`) and re-extract on the next sweep — never force it.
- **Span guard.** Confirms the bytes at `char_start..char_end` still equal the recorded
  `block_text` before replacing — a second belt against drift.
- **Structure-preserving splice.** Replaces only the payload span, escaped for its
  context: `json-copy` re-escaped as a JSON string, `js-string` for its quote style,
  `attr-copy`/`jsx-text` HTML-escaped, quoted YAML for its quote, markdown/text as plain
  text. Quotes, tags, `#`/`-` markers, and JSON commas are never touched. Applied
  bottom-up by offset so earlier spans stay valid.

`keep` and `flag` **never write** — `flag` is surfaced in the report only. `pdf-text`
units are review-only and are **never applied** (a rewrite can't be spliced into a binary
PDF); a note reports how many were skipped. Sets `applied=1` per applied row; prints
`{files, rewritten}`.

### 6. `verify` — assert only copy spans changed

```text
node scripts/extract.mjs --phase=verify --db <path> --repo <path>
  [--post-verify-cmd '<shell>']   # optional repo formatter/linter; non-zero is reported, not fatal
```

For a git target, every pre-image diff hunk must be covered by recorded copy line-ranges
(1-line slack per edge); any uncovered hunk ⇒ FATAL. For a direct target (`--input` /
`--stdin`, no git worktree), verify instead reconstructs each file from its stored
pre-image plus the applied rewrites and asserts it matches disk byte-for-byte — an exact
match proves nothing outside a recorded copy span changed. Files not in this DB are skipped
with a warning. Reports `mode`, `kept / rewritten / flagged`, and a per-file stat.

### 7. `holistic-emit` — pack the whole corpus for a cross-cutting review

```text
node scripts/extract.mjs --phase=holistic-emit --db <path> --out-dir <dir>
```

Per-unit review is blind to problems that only exist across units — terminology drift
(`workflows` vs `skills`), repetition across sections, inconsistent voice. This phase packs
all copy (grouped by file, in reading order) into as few bundles as possible so ONE
reviewer sees a whole page/route at once, then `workflows/copy-holistic.js` audits it
against the full standards.md and returns ranked findings
(`{severity, category, file, quote, problem, fix}`) covering per-line **and** cross-cutting
issues. This is the primary way to surface bad copy; per-unit `apply` is for safe mechanical
rewrites. Findings are advisory (a report), never auto-applied.

## Incremental / delta sweeps

For a long branch on a cadence, store the last-audited HEAD in a per-user state file
(convention: `/Users/<you>/.claude/state/copy-audit-<repo-slug>-last-head.txt`). Each
run: read `LAST_HEAD`, `git fetch && git rev-parse HEAD` for `NEW_HEAD`; if unchanged do
nothing; else run the sweep with `--base $LAST_HEAD --head $NEW_HEAD`, and update the
state file with `NEW_HEAD` only after apply + verify pass.

## Guardrails

- **Never changes non-copy characters.** Only the payload span of a `rewrite` unit
  changes; structure around it is byte-identical.
- **Meaning is preserved.** The reviewer is told never to change meaning, product names,
  numbers, URLs, or code tokens, and to keep the reader's language.
- **No auto-delete, no auto-keep.** Every unit is judged; nothing writes without review.
- **Concurrent-write safety.** The per-file SHA guard refuses a file that changed since
  extract; defer it to the next sweep rather than forcing.
- **No pushes.** The skill runs only local operations; the orchestrator commits (if
  asked) and stops.

## Test & run

No build step. Before any change ships, the selftest must be green:

```bash
node scripts/selftest.mjs
```

It builds a synthetic repo covering every unit family, runs all phases, and asserts
extraction counts, structure-preserving splices (JSON stays valid, quotes/markers/tags
intact), that `keep`/`flag` never write, that the SHA guard fires, that the copy-only
invariant holds, and that this SKILL.md is spec-conformant. Try it interactively with
`claude --plugin-dir plugins/ttt-workflows` then `/copy-audit`.

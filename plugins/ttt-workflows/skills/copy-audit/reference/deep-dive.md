# copy-audit — deep dive

Everything the skill does, end to end, in depth. Read top-to-bottom or jump in. For the
scoring rules in full see `rubric.md`; for the three audit modes see `modes.md`; for which
file type routes to which parser see `formats.md`; for the cited rationale behind every check
see `standards.md`.

## Contents

1. [The shape of a sweep](#1-the-shape-of-a-sweep)
2. [The unit, and why it is a char span](#2-the-unit-and-why-it-is-a-char-span)
3. [Why AST, not regex](#3-why-ast-not-regex)
4. [Extract — parsers, routing, and the one classifier](#4-extract--parsers-routing-and-the-one-classifier)
5. [The correctness guards baked into extract](#5-the-correctness-guards-baked-into-extract)
6. [sqlite as the source of truth](#6-sqlite-as-the-source-of-truth)
7. [bundle-emit — full-file context, no auto-verdict](#7-bundle-emit--full-file-context-no-auto-verdict)
8. [Review — parallel subagents through the Workflow](#8-review--parallel-subagents-through-the-workflow)
9. [apply-verdicts — the review-before-apply gate](#9-apply-verdicts--the-review-before-apply-gate)
10. [apply — the SHA-guarded char-offset splice](#10-apply--the-sha-guarded-char-offset-splice)
11. [verify — the copy-only invariant](#11-verify--the-copy-only-invariant)
12. [holistic-emit — the cross-cutting pass](#12-holistic-emit--the-cross-cutting-pass)
13. [How `--mode` changes everything downstream](#13-how---mode-changes-everything-downstream)
14. [Files, data, and where things live](#14-files-data-and-where-things-live)
15. [Failure modes & troubleshooting](#15-failure-modes--troubleshooting)

---

## 1. The shape of a sweep

```text
extract → bundle-emit → REVIEW (Workflow) → apply-verdicts → [inspect] → apply → verify
                                                                    ↳ holistic-emit (advisory)
```

Two things run outside the deterministic scripts: the review (parallel subagents) and your
inspection of the tables before apply. Everything else is a phase of `extract.mjs`, and every
phase acts only on rows in a specific verdict state, so the sqlite DB alone tells you where a
sweep is in its lifecycle and a re-run is always safe. The pipeline is fenced on both ends by
mechanical checks: extract records exact char offsets and a per-file SHA, and apply refuses to
write unless both the file and the span still match — so a language model's judgment in the
middle can never corrupt structure on disk.

## 2. The unit, and why it is a char span

The atom of the whole skill is a **copy unit**: a `char_start`/`char_end` offset pair into a
file marking exactly the human-readable payload, plus its `syntax` (`md-heading`, `json-copy`,
`jsx-text`, `code-string`, `comment`, `testname`, …), the exact `block_text` those offsets
span, the file's full text (base64) for reviewer context, and the file's sha256 at extract
time. The offsets point at the payload *inside* its delimiters — the text between the quotes,
after the `#` marker, within the `alt=""` — never the delimiters themselves. That is the
property the entire apply step rests on: rewriting a unit means replacing one exact substring
with another, and nothing else in the file moves.

## 3. Why AST, not regex

A regex over source finds strings; it cannot tell a heading from a CSS class, a button label
from an event name, or an interpolated template literal (unsafe to rewrite) from a plain one.
copy-audit parses instead. Real parsers give three things a pattern cannot: **structural
context** (this string is a JSX attribute named `alt`, that one is the first argument to
`NSLocalizedString`), **exact byte spans** for the payload, and **safety signals** (this string
contains an interpolation node, so skip it). The extraction research in
`extraction-research.md` and `extraction-multilang-research.md` cites the parser choice for each
stack. The result is that capture is both far more complete (it reaches copy a heuristic misses)
and far safer (it never captures a code token as copy, so a rewrite can't mangle logic).

## 4. Extract — parsers, routing, and the one classifier

`extractUnits(text, file)` dispatches on extension/basename to a purpose-built extractor
(`formats.md` has the full matrix):

- **`@babel/parser`** — `.js` `.ts` `.jsx` `.tsx` `.mjs` `.cjs` `.mts` `.cts`. Walks the AST and
  captures string literals by context (object value, assignment, array element, call arg), JSX
  text nodes, and copy-carrying JSX attributes. Template literals with interpolation are never
  captured.
- **`@astrojs/compiler`** — `.astro`. The `---` frontmatter is parsed as JS; the template is
  walked for text nodes and copy attributes.
- **markup scanner** — `.html` `.htm` `.vue` `.svelte` `.xml` `.svg` `.hbs`/`.handlebars`
  `.mustache` `.plist` `.xsl`/`.xslt` and the HTML-embedded template family (`.erb` `.ejs`
  `.jinja*` `.j2` `.liquid` `.twig` `.heex`, `*.blade.php`). Element text nodes and copy
  attributes are taken with `<script>`/`<style>` bodies, comments, and `<%…%>`/`{%…%}`/`{{…}}`/
  `{#…#}` directive blocks masked to equal-length spaces first.
- **`remark`/mdast** — `.md` `.mdx` `.markdown` `.mdc`. Headings, prose paragraphs, list items,
  blockquotes, standalone-image alt text, and YAML frontmatter values.
- **`yaml` CST** — `.yml` `.yaml`. Scalar values under copy-carrier keys.
- **offset-tracking JSON scanner** — `.json` `.jsonc` `.json5` `.webmanifest`. String values
  (and arrays of strings) under copy-carrier keys; tolerates `//` and `/* */` for jsonc.
- **tree-sitter (web-tree-sitter WASM)** — ~40 languages (`ts-extract.mjs`), one code path over
  a vendored grammar `.wasm` per language. Takes the outermost string literal, skips interpolated
  ones, strips quote delimiters. A string that is the first argument to a UI/copy marker call
  (`Text(`, `Button(`, `NSLocalizedString(`, `t(`, `_(`, …) is kept even as a terse label.
- **plain-text / config extractors** — `.txt` `.text` `.tpl` `.pug` `.jade` and extension-less
  prose (`LICENSE`, `NOTICE`, …) → paragraphs; `.env`/`.env.*` → `#` comments + copy-keyed
  `KEY=value`; `.ini`/`.cfg`/`.properties`/rc + ignore files → `#`/`;` comments + phrase-shaped
  `key=value`; `.tsv`/`.csv` → phrase cells; `.typ` → Typst headings/prose/metadata.

Whatever the extractor, every candidate string passes through **one** classifier —
`isCopyPhrase` — before it becomes a unit. It is the single place that decides copy vs code: a
string qualifies only if it has a letter and reads like human writing (whitespace, sentence
punctuation, or a copy-carrier key/attribute). URLs, file paths, slash tokens, selectors,
`camelCase`/`snake_case`/dotted identifiers, `CONSTANT_CASE`, numbers/dates, `key=value` config,
and CSS/Tailwind class lists are all rejected. The `keyed` flag relaxes the single-word rule so
a terse label in a real copy slot (`"OK"`, `"Save"`) survives while a bare identifier does not.
The bias is deliberately conservative — when unsure, skip — because a false capture risks a
rewrite that changes code.

## 5. The correctness guards baked into extract

Four guards make the recorded spans safe to splice later:

- **Phrase filter** (above) — nothing code-shaped becomes a unit.
- **Offset masking** — template extraction runs against a copy of the file with `<script>`/
  `<style>` bodies, comments, and the Astro/Svelte fence blanked to spaces, so structure is
  scanned without ever capturing code, and the recorded offsets still point at the real file.
- **De-overlap** — per file, units are sorted and any span nested in or overlapping another is
  dropped, so the bottom-up splice at apply time can never corrupt an enclosing unit.
- **Template-literal safety** — a JS/TS template literal with `${…}` is never captured;
  interpolation makes it unsafe to rewrite.

## 6. sqlite as the source of truth

Every unit lands in one `units` table (`schema.sql`): identity + offsets + `syntax` +
`block_text` + `file_full_text_b64` + `file_sha`, and the mutable review columns `verdict`
(default `pending`), `rewrite`, `category`, `severity`, `note`, `applied`. Extract wipes this
repo's rows first, so a re-run is clean. Because each later phase filters on verdict state
(`pending` for bundle-emit and apply-verdicts; `rewrite`/`delete` with `applied=0` for apply),
the table is both the work queue and the audit log — you can inspect, defer, or resume from it
at any point without re-running the reviewer.

## 7. bundle-emit — full-file context, no auto-verdict

`bundle-emit` packs all `pending` units by file into token-budgeted bundles (~40,000 chars).
Each bundle carries every file's **full line-numbered text** plus, per unit, its id, syntax,
line range, and exact text — so the reviewer judges each unit *with the whole file visible*, not
as a naked string. A file larger than the budget goes solo. Each `bundle-NNNN.json` is a ready
`{system, user}` prompt: the system prompt is the operative rubric (the four pillars, the
mandatory flags, the fragment-reassembly rule, and the syntax-specific comment/testname rules),
distilled from `standards.md`. There is **no auto-keep and no auto-delete** — every unit gets
full human-context judgment, because a wrong copy edit is visible harm.

## 8. Review — parallel subagents through the Workflow

The reviewer runs from the Workflow tool: `parallel()` fans out one Agent per bundle, each Reads
its bundle and returns structured JSON verdicts. There is no HTTP API key — the reviewers are
in-session subagents. Each verdict is `{id, verdict, rewrite, category, severity, note}`, where
`verdict` is `keep | rewrite | flag` (copy mode) plus `delete` (comment units only). The
ready-to-run script is `workflows/copy-review.js`; the whole-corpus variant is
`workflows/copy-holistic.js`. If the workflow return trips the 4,096-item cap, verdicts are read
from the per-agent journal (`usage.md` has the `jq`).

## 9. apply-verdicts — the review-before-apply gate

`apply-verdicts` writes the reviewer JSON into the `pending` rows in place: `verdict` / `rewrite`
/ `category` / `severity` / `note`. Only `keep` / `rewrite` / `flag` / `delete` are accepted;
anything else is skipped and counted. It touches only rows still `pending`, and it reports
`updated` / `skipped` / `still_pending`. **This is the gate** — the DB now holds every proposed
change, and you inspect the tables (or a rendered report) before any byte is written to disk.
Copy is subjective and high-stakes, so nothing after this point runs without your go-ahead.

## 10. apply — the SHA-guarded char-offset splice

`apply` acts only on rows with `verdict IN ('rewrite','delete') AND applied=0`, grouped by file.
Three guards fire per file, in order:

1. **Per-file SHA guard.** The on-disk file is read and sha256'd; if it differs from the
   `file_sha` recorded at extract ⇒ **FATAL**, refusing to write the whole file. A file that
   changed since extract is deferred to the next sweep, never forced.
2. **Span guard.** For each unit, the bytes at `char_start..char_end` must still equal the
   recorded `block_text`; a drift ⇒ **FATAL**. This is a second belt in case offsets moved.
3. **Structure-preserving splice.** Only the payload span is replaced, escaped for its context by
   `escapeForSyntax`: `json-copy` re-escaped as a JSON string; `js-string`/`code-string`/
   `testname` escaped for the surrounding quote (backtick, `"`, or `'`); `attr-copy`/`jsx-text`
   HTML-escaped; quoted `yaml-copy`/`frontmatter` escaped for its quote; markdown/text spliced as
   plain text. A `comment` rewrite is unwrapped to prose and re-wrapped in the *original* marker
   style (`//`, `#`, `--`, `;`, `/* */`, `<!-- -->`) detected at the span. Edits are applied
   **bottom-up by offset** so earlier spans stay valid.

`delete` (comment mode) removes the span, and if the comment stood alone on its line(s) removes
the whole line. A `delete` on a `testname` is **refused** — it would break the runner call.
`keep` and `flag` never write. Writes go through a temp file + rename. It reports `files` /
`rewritten` / `deleted`.

## 11. verify — the copy-only invariant

`verify` is the proof that apply kept its promise. For every currently-modified file that this
DB knows, it reads `git diff --unified=0` and checks that **every** pre-image hunk line falls
inside a recorded copy line-range (1-line slack per edge, to absorb a re-wrapped line). Any
uncovered hunk ⇒ **FATAL** — that would mean a non-copy line changed. Files not in the DB are
skipped with a warning. The report carries `kept` / `rewritten` / `flagged`, a per-file diff
stat, and `code_line_changes: 0` — the machine-checkable statement that the sweep changed text
and nothing else. An optional `--post-verify-cmd` runs the repo's formatter/linter; its non-zero
exit is reported, never fatal.

## 12. holistic-emit — the cross-cutting pass

Per-unit review is blind to problems that live *across* units: terminology drift (`workflows`
vs `skills`), a claim repeated across sections, sentence-case vs title-case drift, tonal
inconsistency. `holistic-emit` packs the whole corpus (grouped by file, in reading order) into as
few bundles as possible so ONE reviewer sees a whole page/route at once, then
`workflows/copy-holistic.js` audits it against the full `standards.md` and returns ranked
findings (`{severity, category, file, quote, problem, fix}`) covering per-line **and**
cross-cutting issues. This is the primary way to surface bad copy; per-unit `apply` is for safe
mechanical rewrites. Holistic findings are advisory — a report, never auto-applied.

## 13. How `--mode` changes everything downstream

`--mode` is set on `extract` and threads through the sweep (`modes.md` has the operator view):

- **`copy`** (default) — `extractUnits` runs; test/spec files and `test/`-style directories are
  skipped; units are judged against the four content pillars; valid verdicts are
  `keep`/`rewrite`/`flag`.
- **`comments`** — `extractComments` runs instead (babel for JS/TS, `<!-- -->` + `<script>` JS
  comments for markup/markdown, tree-sitter comment nodes for the broad language set); test files
  are **kept** (test-runner names live there); units are `comment` and `testname`, judged against
  comment-quality rules and Rule 9; the `delete` verdict is added (and refused on a `testname`).
- **`all`** — both extractors run and both rubrics apply.

Extraction, the skip rules, the rubric in the bundle prompt, and the legal verdict set all pivot
on this one flag. Everything after extract (bundle-emit, review, apply, verify) is mode-agnostic
— it just processes whatever units and verdicts the mode produced.

## 14. Files, data, and where things live

| file | role |
| --- | --- |
| `scripts/extract.mjs` | the engine: every phase (`extract`/`bundle-emit`/`apply-verdicts`/`apply`/`verify`/`holistic-emit`), the reviewer prompts, the splice |
| `scripts/ast-extract.mjs` | babel / @astrojs/compiler / remark / yaml / JSON / env / config / text extraction + `isCopyPhrase` |
| `scripts/ts-extract.mjs` | tree-sitter (web-tree-sitter WASM) string + comment extraction for ~40 languages |
| `scripts/grammars/*.wasm` | vendored modern-ABI tree-sitter grammars (one per language) |
| `scripts/schema.sql` | the `units` table |
| `scripts/selftest.mjs` | synthetic-repo regression battery + spec/trigger validation |
| `workflows/copy-review.js` | per-unit reviewer fan-out (keep/rewrite/flag/delete) |
| `workflows/copy-holistic.js` | whole-page holistic reviewer (cross-cutting findings) |
| `reference/standards.md` | the four pillars as cited checklists + the verdict mapping |
| `reference/rubric.md` | the operator-facing distilled rubric (pillars + comment-quality + Rule 9) |
| `reference/modes.md` · `formats.md` | the three modes; the file-type → extractor matrix |

Working files (`audit.db`, the bundle dir, `verdicts.json`) live in a scratch dir, never in the
reviewed repo. The DB persists across runs so verdicts can be re-applied without re-reviewing.

## 15. Failure modes & troubleshooting

- **`apply` fatals with a sha mismatch** → the file changed since extract. Set its rows to `keep`
  (or leave them) and re-extract on the next sweep — never force it.
- **`apply` fatals with a span drift** → the recorded offsets no longer hold `block_text` (a
  concurrent edit that kept the same sha length, or a re-extract mismatch). Re-extract that file.
- **`verify` fatals on a non-copy hunk** → a changed line fell outside every recorded span. This
  means a splice touched structure — inspect the file; do not commit. Usually an escaping edge
  case for that `syntax`; capture it in the selftest.
- **A file produced no units** → its extension has no extractor, its grammar isn't vendored (KQL,
  and other formats without a `.wasm`), or every candidate string was filtered as code. A grammar
  that fails to load is caught and simply yields nothing — it never crashes the sweep.
- **The workflow return is truncated** → the 4,096-item cap tripped; read verdicts from the
  per-agent journal (`usage.md`).
- **Too much captured as copy in one repo** → append `--skip-path <substr>` (comma-separated /
  repeatable) at extract for repo-specific generated trees.
</content>

</invoke>

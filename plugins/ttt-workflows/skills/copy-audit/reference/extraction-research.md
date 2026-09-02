# copy-audit — Copy Extraction Research

> **Research current as of August 2026.** All tools/packages/docs below are real and were
> verified against their npm / GitHub / official-docs pages. Versions move fast — re-pin before
> vendoring. URLs are collected as numbered `[Rn]` sources at the end. Where an exact deep-link
> was uncertain, the tool/doc is named precisely rather than guessed.

Purpose: ground the extraction layer of an **automated copy-quality audit** — how to pull _every_
user-facing string out of an arbitrary codebase, with a real AST and source-position spans, across
the frameworks copy-audit targets. The spans let us splice rewrites back by char offset. This is the
"how do we find the copy" companion to `standards.md` (the "what makes copy good").

Design constraints that drive every recommendation:

- **Node ESM, vendorable, stable.** The skill ships deterministic scripts; a parser must install
  cleanly, have a stable JS API, and not require a native toolchain at author time.
- **Positions are non-negotiable.** We rewrite by `[start,end]` char offsets under a SHA guard, so
  every parser must expose byte/char spans for the exact literal, not just line/col of a node.
- **Recall over precision at extraction; precision at classification.** Pull generously, then
  classify copy-vs-code (§3). Better to over-extract and filter than to miss a label.

---

## 1. Parsers / AST per source type

### 1.1 JS / TS / JSX / TSX

Four credible parsers. All produce a real AST with positions; they differ on API stability,
install footprint, and TS/JSX fidelity.

| Parser                      | Package (latest seen)                      | AST flavor             | Positions                                                                                 | Native?                | Notes                                                                                    |
| --------------------------- | ------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| **Babel**                   | `@babel/parser` + `@babel/traverse` (v7.x) | ESTree-ish Babel AST   | `node.start`/`node.end` (char offsets) + `loc` when `ranges`/default                      | Pure JS                | Most forgiving; parses TS/JSX/experimental syntax via plugins; huge ecosystem `[R1][R2]` |
| **TypeScript compiler API** | `typescript` (5.x)                         | TS AST (SyntaxKind)    | `node.getStart()`, `node.getEnd()`, `pos`/`end`                                           | Pure JS                | Canonical for TS/TSX; verbose API; needs `SourceFile`; type-aware if you want it `[R3]`  |
| **oxc-parser**              | `oxc-parser` (napi)                        | ESTree-compatible JSON | spans via `range` (opt-in, defaults off) / `start`+`end`                                  | **Native (Rust/NAPI)** | Fastest; prebuilt binaries per-platform; span offsets are `u32` `[R4][R5]`               |
| **swc**                     | `@swc/core`                                | swc AST (`span`)       | `span.start`/`span.end` — but **offsets are global/relative to a shared bytepos**, gotcha | **Native (Rust)**      | Fast; span base-offset quirk makes exact slicing error-prone `[R6]`                      |

**Recommendation: `@babel/parser` + `@babel/traverse`.** For a vendorable Node ESM script that must
be stable across environments, Babel wins:

- **Pure JS, zero native binaries** — no per-platform prebuilds to vendor or fail on CI/arm/musl.
  oxc and swc are native (NAPI); they're faster but add install/portability risk for a skill that
  must "run for anyone who installs the plugin."
- **One parser for JS/TS/JSX/TSX** — enable `plugins: ['typescript','jsx']` (or `estree`) and it
  handles all four. No separate code path per dialect.
- **Trivial, well-documented positions** — every node carries `start`/`end` char offsets that map
  directly to our char-offset splicer. `@babel/traverse` gives ergonomic visitors.
- **Battle-tested tolerance** — handles decorators, stage-3 syntax, and messy real-world code that
  strict parsers reject; `errorRecovery: true` keeps going past a bad node.

Use the TypeScript compiler API only if the audit ever needs _type_ information (e.g. resolving an
enum's string members). For pure syntactic string extraction it's more code for no benefit. Keep
oxc-parser in mind as a drop-in speed upgrade if extraction ever becomes the bottleneck — its AST
is ESTree-compatible, so a Babel-shaped visitor ports with little change `[R4]`.

**Node types that carry copy** (Babel/ESTree names):

- `StringLiteral` — `'Save changes'`. The bulk of attribute values and non-template strings.
- `TemplateLiteral` — `` `Hello ${name}` ``. Copy lives in `.quasis[i].value.cooked`; the
  `${...}` holes are `.expressions` (code — skip, see §3). Reassemble prose from the quasis.
- `JSXText` — raw text between JSX tags: `<p>Welcome back</p>`. The richest source of UI copy.
  Trim/normalize whitespace; ignore whitespace-only nodes.
- `JSXAttribute` — attribute name + value; gate on an **attribute allowlist** (§2/§3):
  `alt`, `aria-label`, `aria-description`, `placeholder`, `title`, `label`, `alt`, `summary`.
- `JSXExpressionContainer` — `{...}` inside JSX. Descend into it: a `StringLiteral` or
  `TemplateLiteral` inside is often copy (`{loading ? 'Saving…' : 'Save'}`); an identifier/call is
  code. This is where recall-then-classify matters.

### 1.2 Astro

Use **`@astrojs/compiler`** (`parse`), the official compiler (written in Go, distributed as
WASM) `[R7][R8]`.

- `parse(source, { position: true })` returns `{ ast, diagnostics }`. `position` **defaults to
  true** — keep it on.
- **Frontmatter vs template:** the frontmatter fence (`---…---`) surfaces as a **`frontmatter`
  node** whose content is TS/JS — feed that string back through the **JS/TS parser (§1.1)** to find
  string literals. The template body is an HTML-like tree.
- **Node shapes:** tag nodes are typed `element`, `custom-element`, or `component`; text is a
  `text` node (`TextNode` can hold HTML text _or_ embedded JS/TS). Traverse with the
  `@astrojs/compiler/utils` `walk`/`walkAsync` helpers and the `is` type-guards `[R7]`.
- **Caveat (verify per version):** position data on some node kinds has historically been
  incomplete/off-by-a-bit; the maintainers track this. **Validate spans** against the source
  substring before splicing, and fall back to a text search within the node's line range if a span
  looks wrong `[R7][R8]`.
- Attribute copy (e.g. `alt`, `aria-label`) lives on element `attributes[]`, each with its own
  name/value + position.

### 1.3 Svelte

Use **`svelte/compiler`** `parse` (Svelte 5) `[R9]`.

- `parse(source, { modern: true })` returns the **modern AST** (`modern` defaults to `false` in
  Svelte 5 for back-compat — pass `true`). Root has `fragment`, plus `instance`/`module` script
  nodes and `css` `[R9]`.
- Every node is a `BaseNode` with `type`, `start`, `end` (char offsets) — exactly what the splicer
  needs.
- Copy sources: `Text` nodes inside the template `Fragment`; attribute values on element nodes
  (allowlist as in §3). `<script>` blocks (`instance`/`module`) contain JS/TS — re-parse their
  `content` with §1.1. Mustache `{expr}` tags are `ExpressionTag` — treat as code.

### 1.4 Vue

Use **`@vue/compiler-sfc`** to split the SFC, then **`@vue/compiler-dom`** (a thin wrapper over
`@vue/compiler-core`'s `baseParse`) for the template AST `[R10][R11]`.

- `@vue/compiler-sfc` `parse()` → `SFCDescriptor` with `template`, `script`, `scriptSetup`,
  `styles`, each an `SFCBlock` carrying a `loc` (`SourceLocation`) `[R10]`.
- Template AST node types: `ROOT`, `ELEMENT`, `TEXT`, `COMMENT`, `INTERPOLATION`,
  `SIMPLE_EXPRESSION`, `ATTRIBUTE`, `DIRECTIVE`, plus containers. Every node carries `loc` with
  `start.offset`/`end.offset` char offsets `[R11]`.
- Copy sources: `TEXT` nodes (static text), `ATTRIBUTE` values (allowlist). `INTERPOLATION`
  (`{{ expr }}`) and `DIRECTIVE` (`:prop`, `@event`) are code. `<script setup>` → re-parse with
  §1.1.

### 1.5 Markdown / MDX

Use **`unified` + `remark-parse`** (and **`remark-mdx`** for MDX) to get an **mdast** tree
`[R12][R13]`. mdast extends unist, so every node has a `position` (`{start,end}` with `line`,
`column`, **`offset`**) — use `.position.start.offset`/`.position.end.offset` for slicing.

mdast node types relevant to copy `[R12]`:

- **`text`** — literal prose (a unist _Literal_; `.value` is the string). Primary prose source.
- **`heading`** — parent with `depth` (1–6); prose lives in child `text` nodes.
- **`paragraph`**, **`listItem`**, **`list`**, **`blockquote`**, **`tableCell`** — parents holding
  phrasing children.
- **`link`** / **`linkReference`** — the visible **link text** is copy (child `text`); the `url` is
  not (§3). **`image`** — the **`alt`** field _is_ copy; `url`/`title` mostly not (title can be).
- **`emphasis`**/**`strong`**/**`inlineCode`** — inline; `inlineCode` is usually code, not prose.
- **`html`** — raw embedded HTML; if present, parse with an HTML parser to reach text/attributes.
- **`yaml`** — the frontmatter block (with `remark-frontmatter`); parse its value as YAML (§1.6).

For MDX, `remark-mdx` adds `mdxJsxFlowElement`/`mdxJsxTextElement` (JSX in Markdown) and
`mdxjsEsm`/`mdxFlowExpression` (embedded JS) — descend into JSX children/attributes like §1.1, and
route embedded expressions to the JS parser.

### 1.6 YAML and JSON / JSONC

**YAML — use the `yaml` package (eemeli/yaml, v2.x)** `[R14][R15]`. Three API layers; for
positions use **Documents** or the **CST**:

- `parseDocument(src)` → a `Document`; nodes expose a **`range`** = `[start, value-end, node-end]`
  as **char offsets** into the source. Scalar (string) values are what we extract; slice with the
  range.
- For byte-perfect round-trips (comments/whitespace preserved), drop to the **CST** layer, or set
  `{ keepSourceTokens: true }` to attach the `srcToken` to each node. Pair with a `LineCounter`
  passed to the parser to convert offsets → `{line,col}` `[R15]`.
- Prefer this over `js-yaml`, which does not expose per-scalar source ranges.

**JSON / JSONC — parse with an offset-preserving parser, not `JSON.parse`** (which discards
positions):

- **`jsonc-parser`** (microsoft/node-jsonc-parser) — `parseTree()` returns a node tree where each
  node has `offset` and `length`; tolerates comments and trailing commas (VS Code's own parser).
  Best default for config-file copy `[R16]`.
- Alternatively the **`yaml` package itself parses JSON** (JSON is a YAML subset) giving the same
  `range` offsets — one dependency for both. For strict positioned JSON in an AST/ESTree shape,
  `@babel/parser` with `{ tokens:true }` or `acorn` also work, but `jsonc-parser` is lightest.

Only **string-valued** nodes are copy candidates; then classify by key (§3): a value under a key
like `label`/`title`/`description`/`message`/`placeholder` is likely copy; under `id`/`type`/`url`/
`className` it is not.

---

## 2. Prior art in string extraction (i18n/l10n)

Established localization extractors have already solved "which strings are user-facing" for their
own marker-based world. We borrow their **heuristics**, not their requirement that developers
pre-mark strings (our audit must find _unmarked_ copy too).

- **i18next-parser** `[R17][R18]` — ships four **lexers**: `JavascriptLexer`, `JsxLexer`,
  `HTMLLexer`, `HandlebarsLexer`. Config-driven marker detection: `functions` (default `t`),
  `namespaceFunctions`, and an **`attr` allowlist** for attributes; `JsxLexer` adds
  `componentFunctions` (default `Trans`) and `i18nKey`. Key borrow: **attribute allowlists** and
  **component/function marker lists** as first-class config.
- **FormatJS / react-intl — `@formatjs/cli extract`** `[R19]` — **AST-based** (not regex).
  Recognizes `defineMessages()`/`defineMessage()`, `<FormattedMessage>`, and
  `intl.formatMessage()`; extensible via `--additionalFunctionNames` /
  `--additionalComponentNames`. Key borrow: AST marker detection + a configurable marker registry;
  proof that AST beats regex for this.
- **Lingui — `@lingui/cli extract`** `[R20]` — matches the `t` tagged-template macro and `<Trans>`
  JSX macro; `msg` yields a `MessageDescriptor`. Outputs PO (gettext) / JSON. Key borrow: treating
  **tagged templates** and **JSX macro children** as extraction units, and merge-on-extract so
  re-runs are incremental (useful for our sqlite re-run model).
- **GNU gettext `xgettext`** `[R21]` — the original. Scans for **keyword** calls (`gettext`, `_`,
  `ngettext`, …) per language; `--keyword` configures markers; emits `.pot` with `#: file:line`
  source references. Key borrow: the keyword-list model and always recording a **source reference
  (file+position)** for every extracted string — exactly our span requirement.
- **Mozilla Fluent (`@fluent/*`) / L10n** `[R22]` — messages live in `.ftl` files, parsed by
  `@fluent/syntax` into an AST with spans. Less about _extraction from code_, more a model for
  storing/structuring copy with positions; borrow its clean AST-with-spans discipline.

**What they teach us (the transferable heuristics):**

1. **Prefer AST over regex** — every serious modern extractor is AST-based (FormatJS, Lingui,
   i18next's lexers). Regex over-matches and loses positions.
2. **Marker registries are config, not hardcode** — function names and component names that denote
   copy are a configurable allowlist. We invert this: absence of a marker ≠ not-copy, but presence
   of one (`t(...)`, `<Trans>`) is a strong _positive_ signal to always include.
3. **Attribute allowlists** — none of them extract every attribute; they extract a curated set
   (`alt`, `title`, `placeholder`, `aria-*`, `label`). Adopt the same allowlist (§3).
4. **JSX text is copy by default** — all JSX-aware extractors treat element text children as
   translatable, while skipping expression containers unless they hold a literal.
5. **Always record a source reference** — gettext's `#: file:line` and every tool's file/pos map is
   the same discipline our char-offset splicer depends on.

---

## 3. Copy vs. not-copy classification

After recall-first extraction, classify each candidate string. No single signal is sufficient;
combine them. Ordered from most to least reliable.

### Strong "this IS copy" signals

- **Wrapped in a known marker** — `t('…')`, `i18n.t`, `<Trans>`, `<FormattedMessage>`,
  `defineMessages`, `gettext`/`_`. Near-certain copy (borrowed from §2).
- **JSX/HTML/Svelte/Vue element text node** with letters and a word boundary (contains a space or
  is a multi-letter word), not inside `<script>/<style>/<code>/<pre>`.
- **Value under a copy-ish key** in JSON/YAML: key ∈ {`label`,`title`,`description`,`message`,
  `placeholder`,`heading`,`subtitle`,`body`,`text`,`content`,`error`,`hint`,`tooltip`,`cta`,
  `caption`,`summary`,`alt`,`aria-label`}.
- **Value of an allowlisted attribute:** `alt`, `title`, `placeholder`, `aria-label`,
  `aria-description`, `aria-roledescription`, `label`, `summary`, `value` (on buttons/submit).
- **Prose shape:** contains a space and multiple words, sentence punctuation, or mixed case
  natural-language capitalization; passes a dictionary/word-likeness check.

#### Strong "this is NOT copy" signals (exclude/skip)

- **Identifiers & member expressions** — the string is a computed key/property, event name,
  action type (`'USER_LOGGED_IN'`, `'onClick'`, `'click'`), or matches `SCREAMING_SNAKE`/
  `camelCase`/`kebab-case` with no spaces.
- **Class names / CSS** — value of `className`/`class`/`style`, or matches Tailwind-ish token
  patterns (`flex items-center gap-2`), CSS units, hex colors.
- **Paths, URLs, and files** — starts with `/`, `./`, `../`, `http(s)://`, `mailto:`, `data:`,
  or matches a file-extension / route-pattern; also import specifiers.
- **Config keys / enums / MIME / locales** — `application/json`, `en-US`, `UTF-8`, enum member
  strings, GraphQL field names.
- **Code-y templates** — a `TemplateLiteral` that is mostly `${…}` with no prose quasis, or whose
  quasis are punctuation/format glue (SQL, URLs, class strings).
- **Format/glue strings** — `%s`, `{0}`, printf specifiers with no surrounding prose; date/number
  format patterns (`yyyy-MM-dd`, `#,##0.00`).
- **No letters** — pure numbers, symbols, whitespace, single chars, emoji-only.
- **Test/dev noise** — string literals inside test files, `console.*`, `throw new Error(` internal
  messages (configurable — some teams _do_ audit error copy shown to users).

#### Reliable composite heuristics (what actually works)

- **Word/space test:** ≥ 2 words _or_ (1 word ≥ 3 letters _and_ dictionary-like) → candidate;
  else skip. High-value, low-cost first filter.
- **Casing test:** all-caps-with-underscores or no-space-camelCase/kebab → identifier, skip.
- **Context beats content:** the _same_ string `"Delete"` is copy as JSX text or a button label,
  but code as `case 'Delete':` or `obj['Delete']`. Use the AST parent (JSXText / allowlisted attr /
  copy-key value) as the deciding vote — this is why AST + positions matter more than any regex.
- **Template literals:** extract the concatenated **quasis** as the prose unit, replace each
  `${…}` hole with a neutral placeholder token (e.g. `{}`), and judge the reconstructed sentence;
  never treat the expressions themselves as copy.
- **Allowlist ∪ marker ∪ prose-shape, minus denylist** — final decision is: include if (marker OR
  allowlisted-attr OR copy-key OR element-text) AND passes prose-shape AND not in denylist.

Tune for **recall at extraction, precision at the reviewer**: when unsure, extract and let the
reviewer subagent `flag` rather than silently drop (mirrors `standards.md`'s flag-don't-guess).

---

## 4. Holistic content review (whole-page vs line-by-line)

Line-by-line checks (readability, inclusive language) catch local defects; **cross-cutting** copy
problems only appear when you review a whole screen/page together. Best practice supports doing
both.

### Why whole-page review is a distinct pass (evidence)

- **NN/g:** users **scan, don't read**. Concise, scannable, front-loaded copy raised measured
  usability ~58% in NN/g's classic studies, and unclear interface wording drives a large share of
  user errors. These are _page-level_ properties (information scent, ordering, scannability), not
  per-string ones `[R23][R24]`.
- **Terminology consistency** is inherently cross-string: the same concept must use the same word
  everywhere ("Sign in" vs "Log in" vs "Authenticate" on one flow is a defect only visible across
  strings). NN/g and content-design literature (e.g. Torrey Podmajersky, _Strategic Writing for
  UX_) treat consistent terminology and a single voice as page/product-level standards `[R24]`.
- **Voice & tone** (NN/g's four tone dimensions: humor, formality, respectfulness, enthusiasm)
  must be assessed across a page, not per sentence `[R24]`.

**Cross-cutting checks to run per page/screen (not per line):**

- **Terminology consistency** — build a term map across all strings in the file/page; flag the same
  referent named differently, or one term used for two referents.
- **Repetition / redundancy** — near-duplicate labels, headings that restate the paragraph below,
  repeated CTAs.
- **Voice & tone uniformity** — formality/person/tense drift between adjacent strings.
- **Information ordering / BLUF** — is the most important message first on the screen.
- **Parallelism** — headings, list items, and button labels grammatically parallel.

**Readability scoring tools (compute a number, report it):**

- **`textstat`** (Python) `[R25][R26]` — Flesch Reading Ease, Flesch–Kincaid Grade, Gunning Fog,
  SMOG, ARI, Coleman–Liau, Dale–Chall. The de-facto reference implementation.
- **`text-readability`** (npm) `[R27]` and its TS rewrite `text-readability-ts` — same family of
  indices in JS; best fit for a Node ESM skill (no Python dependency).
- **`retext-readability`** (unified/retext) `[R28]` — applies Dale–Chall, ARI, Coleman–Liau,
  Flesch, Gunning-Fog, SMOG, Spache and flags sentences above a target age; integrates natively
  with the mdast/remark pipeline via `remark-retext`.
- Companion retext plugins for the line-by-line pillars: **`retext-equality`** (insensitive/
  inconsiderate language) and **`retext-simplify`** (wordy phrases → simpler alternatives) `[R28]`
  — useful cross-checks against the inclusive-language and plain-language pillars in `standards.md`.

**Recommendation:** run a **two-tier review**. (1) Per-string checks (readability score, inclusive
language, plain-language rules) during extraction/judging. (2) A **whole-file/page synthesis
pass** that receives all extracted strings of a page together and checks terminology consistency,
repetition, voice, and ordering. For scoring inside a Node skill, prefer `text-readability`(-ts) to
avoid a Python runtime; reserve `textstat` for a Python context. Report the numeric grade level
alongside every flagged unit so rewrites can be measured, not asserted.

---

## Recommendation summary (per source type)

| Source type            | Recommended tool                                                                                  | Why (one line)                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| JS / TS / JSX / TSX    | **`@babel/parser` + `@babel/traverse`**                                                           | Pure JS, one parser for all 4 dialects, char-offset `start`/`end`, most tolerant + vendorable |
| Astro                  | **`@astrojs/compiler`** (`parse`, `position:true`) + re-parse frontmatter via Babel               | Official compiler; frontmatter=JS→Babel, template=HTML-like tree; validate spans              |
| Svelte                 | **`svelte/compiler` `parse({ modern:true })`** + Babel for `<script>`                             | Official; modern AST with `start`/`end` on every node                                         |
| Vue                    | **`@vue/compiler-sfc`** (split) + **`@vue/compiler-dom`** (template) + Babel for `<script setup>` | Official; nodes carry `loc.start/end.offset`                                                  |
| Markdown / MDX         | **`unified` + `remark-parse`** (+ `remark-mdx`, `remark-frontmatter`) → mdast                     | unist `position.offset` spans; rich prose node taxonomy                                       |
| YAML                   | **`yaml`** (eemeli, v2) `parseDocument` / CST + `LineCounter`                                     | Per-scalar `range` char offsets; only lib that exposes them cleanly                           |
| JSON / JSONC           | **`jsonc-parser`** `parseTree` (or reuse `yaml`)                                                  | `offset`/`length` per node; tolerates comments/trailing commas                                |
| Readability scoring    | **`text-readability`(-ts)** in Node (`textstat` in Python)                                        | Standard indices without a Python runtime for a Node skill                                    |
| Copy-vs-code + markers | Heuristics borrowed from **i18next-parser / FormatJS / Lingui / xgettext**                        | AST + marker allowlists + attribute allowlists + prose-shape filter                           |

**One-liner:** parse everything with the **official/most-tolerant AST parser per language** (Babel
as the JS/TS backbone that all the framework compilers hand their script blocks back to), keep
**char-offset spans** everywhere for the SHA-guarded splicer, extract **recall-first**, then
**classify precision-first** with the i18n community's marker + allowlist + prose-shape heuristics,
and add a **whole-page synthesis pass** for the cross-cutting problems line-by-line review can't
see.

---

## Sources

- `[R1]` **@babel/parser** — npm `<https://www.npmjs.com/package/@babel/parser`;> docs
  `<https://babeljs.io/docs/babel-parser`> (AST spec + options `plugins`, `ranges`, `errorRecovery`).
- `[R2]` **@babel/traverse** — npm `<https://www.npmjs.com/package/@babel/traverse`;> docs
  `<https://babeljs.io/docs/babel-traverse`.>
- `[R3]` **TypeScript Compiler API** — `<https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API`;>
  `typescript` npm `<https://www.npmjs.com/package/typescript`.>
- `[R4]` **oxc-parser** — npm `<https://www.npmjs.com/package/oxc-parser`;> project docs
  `<https://oxc.rs`.> AST is ESTree-compatible; `range` opt-in (defaults false).
- `[R5]` **oxc_parser (Rust)** — `<https://docs.rs/oxc_parser`> / `<https://crates.io/crates/oxc_parser`>
  (span offsets `u32`).
- `[R6]` **@swc/core** — npm `<https://www.npmjs.com/package/@swc/core`;> docs `<https://swc.rs/docs`>
  (note: `span` offsets are relative to a shared bytepos base).
- `[R7]` **@astrojs/compiler** — npm `<https://www.npmjs.com/package/@astrojs/compiler`;> source
  `<https://github.com/withastro/compiler`> (`parse` with `position`, `@astrojs/compiler/utils`
  `walk`/`is`).
- `[R8]` **withastro/compiler CHANGELOG / releases** —
  `<https://github.com/withastro/compiler/blob/main/packages/compiler/CHANGELOG.md`.>
- `[R9]` **svelte/compiler** — docs `<https://svelte.dev/docs/svelte/svelte-compiler`> (Svelte 5
  `parse({ modern:true })`, `BaseNode` `start`/`end`).
- `[R10]` **@vue/compiler-sfc** — npm `<https://www.npmjs.com/package/@vue/compiler-sfc`;> docs
  `<https://vuejs.org`> (SFC parse → `SFCDescriptor`, `SFCBlock.loc`).
- `[R11]` **@vue/compiler-core / -dom** — npm `<https://www.npmjs.com/package/@vue/compiler-core`;>
  source `<https://github.com/vuejs/core`> (`baseParse`, node types, `loc.start/end.offset`).
- `[R12]` **mdast specification** — `<https://github.com/syntax-tree/mdast`> (node types: text,
  heading, paragraph, list/listItem, link, image[alt], etc.; unist `position.offset`).
- `[R13]` **unified / remark** — `<https://unifiedjs.com`;> `remark-parse`
  `<https://www.npmjs.com/package/remark-parse`;> `remark-mdx` `<https://mdxjs.com/packages/remark-mdx/`;>
  `remark-frontmatter` `<https://github.com/remarkjs/remark-frontmatter`.>
- `[R14]` **yaml (eemeli/yaml)** — site `<https://eemeli.org/yaml/`;> npm
  `<https://www.npmjs.com/package/yaml`> (Documents `Node.range = [start, value-end, node-end]`, CST).
- `[R15]` **yaml options / LineCounter** —
  `<https://github.com/eemeli/yaml/blob/main/docs/03_options.md`> (`keepSourceTokens`,
  `lineCounter.linePos(offset)`).
- `[R16]` **jsonc-parser** — npm `<https://www.npmjs.com/package/jsonc-parser`;> source
  `<https://github.com/microsoft/node-jsonc-parser`> (`parseTree` nodes with `offset`/`length`).
- `[R17]` **i18next-parser** — repo `<https://github.com/i18next/i18next-parser`;> npm
  `<https://www.npmjs.com/package/i18next-parser`> (JavascriptLexer/JsxLexer/HTMLLexer/Handlebars;
  `functions`, `attr`, `componentFunctions`).
- `[R18]` **i18next-parser README** —
  `<https://github.com/i18next/i18next-parser/blob/master/README.md`.>
- `[R19]` **@formatjs/cli extract** — docs `<https://formatjs.github.io/docs/tooling/cli/`> and
  message declaration `<https://formatjs.github.io/docs/getting-started/message-declaration/`>
  (AST-based; `defineMessages`/`<FormattedMessage>`/`intl.formatMessage`;
  `--additionalFunctionNames`/`--additionalComponentNames`).
- `[R20]` **@lingui/cli extract** — `<https://lingui.dev/ref/cli`> and message extraction
  `<https://lingui.dev/guides/message-extraction`;> macros `<https://lingui.dev/ref/macro`>
  (`t`, `<Trans>`, `msg`; PO/JSON output; merge-on-extract).
- `[R21]` **GNU gettext `xgettext`** — `<https://www.gnu.org/software/gettext/manual/html_node/xgettext-Invocation.html`>
  (`--keyword`, `.pot` with `#: file:line` source references).
- `[R22]` **Mozilla Fluent** — `<https://projectfluent.org`;> `@fluent/syntax`
  `<https://github.com/projectfluent/fluent.js`> (AST with spans for `.ftl`).
- `[R23]` **NN/g — "How Little Do Users Read?" / scanning & concise web content** —
  `<https://www.nngroup.com/articles/how-little-do-users-read/`> and
  `<https://www.nngroup.com/articles/concise-scannable-objective-how-to-write-for-the-web/`.>
- `[R24]` **NN/g — UX Writing / microcopy & tone-of-voice** —
  `<https://www.nngroup.com/articles/ux-writing-faqs/`> and
  `<https://www.nngroup.com/articles/tone-of-voice-dimensions/`;> content-design ref: Torrey
  Podmajersky, _Strategic Writing for UX_ (O'Reilly, 2019).
- `[R25]` **textstat** — repo `<https://github.com/textstat/textstat`;> npm/PyPI `textstat`
  (Flesch, FK grade, Gunning Fog, SMOG, ARI, Coleman–Liau, Dale–Chall).
- `[R26]` **textstat usage** — `<https://www.statology.org/calculate-and-interpret-readability-metrics-with-textstat/`.>
- `[R27]` **text-readability (npm)** — `<https://www.npmjs.com/package/text-readability`;> TS rewrite
  `text-readability-ts` `<https://github.com/boss4848/text-readability-ts`.>
- `[R28]` **retext plugins** — `retext-readability`
  `<https://github.com/retextjs/retext-readability`;> `retext-equality`
  `<https://github.com/retextjs/retext-equality`;> `retext-simplify`
  `<https://github.com/retextjs/retext-simplify`;> bridge `remark-retext`
  `<https://www.npmjs.com/package/remark-retext`.>

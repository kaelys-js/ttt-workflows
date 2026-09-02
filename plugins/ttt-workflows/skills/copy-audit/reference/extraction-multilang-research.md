# copy-audit — Multi-language String Extraction Research

> **Research current as of August 2026.** Every tool/package/doc below is real and was checked
> against its npm / GitHub / official-docs page during this pass. Versions move fast — re-pin
> before vendoring. URLs are collected as numbered `[Rn]` sources at the end. Where an exact
> deep-link or a maintainer name was uncertain, the package is named precisely and flagged rather
> than guessed.

Purpose: extend copy-audit's extraction layer (see `extraction-research.md`, the web/markdown/YAML
stack) to the **long tail of non-web source languages** — Swift, Rust, Go, Java, Kotlin,
C/C++/Obj-C, PHP, Python, Ruby, Shell, HCL/Terraform, TOML, KQL, Typst, CSS/SCSS/Sass/Less,
HTML/XML/SVG, Handlebars/Mustache, Vue, Svelte. The goal is to pull **every user-facing string
literal** out of an arbitrary polyglot repo with a real parser and exact source spans, so rewrites
can be spliced back by char offset under a SHA guard.

Design constraints (unchanged from the web stack, and they drive every call below):

- **Node ESM, vendorable, no native build.** The skill ships deterministic scripts installed with
  pnpm. A parser must install cleanly, expose a stable JS API, and **not** need a C/C++/Rust
  toolchain or Emscripten at author or install time.
- **Positions are non-negotiable.** We splice by `[start,end]` offsets, so a parser is only useful
  if it hands back the byte/char span of the exact literal (ideally the text _inside_ the quotes).
- **Recall over precision at extraction; precision at classification.** Over-extract, then filter
  copy-vs-code (§4). Missing a label is worse than capturing a path we later drop.

---

## 1. Tree-sitter as the universal backend

For the web stack we use one specialized parser per source type (`@babel/parser`,
`@astrojs/compiler`, `remark`, `yaml`). That does not scale to ~20 more languages — we would vendor
twenty bespoke parsers of wildly varying quality. **Tree-sitter is the right universal backend for
the long tail**: one runtime, one query language, one `{startIndex, endIndex, startPosition}` shape
for every grammar `[R1][R2]`.

### 1.1 web-tree-sitter (WASM) vs node-tree-sitter (native) — pick WASM

|                | **web-tree-sitter**                                              | **node-tree-sitter** (`tree-sitter`)                     |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| Package        | `web-tree-sitter` (0.25.x) `[R1]`                                | `tree-sitter` (0.25.x) `[R3]`                            |
| Runtime        | WASM (Emscripten build of the C lib)                             | Native N-API addon (C++)                                 |
| Install        | Pure `.wasm` + JS glue; **no compile, no prebuild per platform** | `node-gyp` / prebuilt binary per OS+arch+ABI             |
| Grammars       | Any `.wasm` grammar, loaded at runtime                           | Native grammar addon per language, each its own build    |
| Speed          | Slower than native (WASM overhead) `[R4]`                        | Faster `[R4]`                                            |
| Vendoring risk | Low — one wasm blob is portable across mac/linux/arm/musl/CI     | High — native addon must match the runner's platform/ABI |

**Recommendation: `web-tree-sitter`.** It matches the same reasoning that chose pure-JS Babel over
native oxc/swc in the web stack: for a skill that "must run for anyone who installs the plugin," a
self-contained `.wasm` beats a per-platform native addon that can fail on arm/musl/CI or a mismatched
Node ABI. node-tree-sitter is faster, but extraction is not our bottleneck (subagent judging is), and
each grammar would be a separate native build to vendor. Note the ecosystems are converging: the
native bindings can now also _consume_ `.wasm` grammars, so the grammar artifacts below are reusable
if we ever add a native fast-path `[R4]`.

### 1.2 Obtaining prebuilt grammar `.wasm` files

The runtime is grammar-agnostic; the hard part is sourcing **prebuilt** `.wasm` grammars so we never
run the `tree-sitter` CLI (`tree-sitter build --wasm` needs Emscripten or Docker — exactly the native
toolchain we are avoiding). Options, current 2026:

| Source                                             | What it is                                                                      | Coverage                                                                                                                      | Verdict                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **`tree-sitter-wasms`** (Gregoor) `[R5]`           | The de-facto prebuilt bundle; `.wasm` files under `out/tree-sitter-<lang>.wasm` | ~40 langs incl. swift, rust, go, java, kotlin, c, cpp, objc, php, python, ruby, bash, toml, css, html, embedded_template, vue | **Primary source.** 347+ dependents; stable naming         |
| **`@sourcegraph/tree-sitter-wasms`** `[R6]`        | Sourcegraph's fork/bundle                                                       | Broad, curated for code-intel                                                                                                 | Good secondary/gap filler                                  |
| **`@vscode/tree-sitter-wasm`** `[R7]`              | The exact grammars VS Code ships                                                | Smaller, very well-maintained                                                                                                 | Use for the langs it covers                                |
| **`@cursorless/tree-sitter-wasms`** `[R8]`         | Cursorless's actively-versioned bundle                                          | Broad                                                                                                                         | Good secondary                                             |
| **`@repomix/tree-sitter-wasms`** `[R9]`            | Repomix's trimmed fork                                                          | Only Repomix's langs                                                                                                          | Narrow; skip unless it happens to fit                      |
| Individual `@tree-sitter-grammars/*` repos `[R10]` | Canonical per-grammar homes (hcl, scss, xml, svelte, kusto, typst…)             | Per-language                                                                                                                  | Source of truth for **gap** langs; may need one build step |

**`tree-sitter-wasms` covers most of the target set but NOT: HCL/Terraform, SCSS/Sass/Less, XML/SVG,
Svelte, KQL/Kusto, Typst.** Fill those gaps from the canonical `tree-sitter-grammars/*` repos `[R10]`
(hcl, scss, xml, svelte) or the language's own grammar repo (typst, kusto), and vendor the one-time
built `.wasm` into the skill's assets. The other curated bundles (`@sourcegraph`, `@vscode`,
`@cursorless`) are worth checking first for a gap lang before building anything yourself.

Vendoring tactic: copy the specific `out/tree-sitter-<lang>.wasm` files we actually target into a
`skills/copy-audit/scripts/grammars/` dir (do **not** ship all 40). Each grammar is ~0.1–2 MB.

### 1.3 Loading a grammar and querying for strings (web-tree-sitter 0.25 API)

```js
import { Parser, Language, Query } from "web-tree-sitter";
import { readFile } from "node:fs/promises";

await Parser.init(); // one-time WASM runtime init
const parser = new Parser();
const wasm = await readFile(new URL("./grammars/tree-sitter-swift.wasm", import.meta.url));
const Swift = await Language.load(wasm); // accepts a path or bytes
parser.setLanguage(Swift);

const src = await readFile("Login.swift", "utf8");
const tree = parser.parse(src);

// S-expression query: match the node type, capture it as @s
const q = new Query(Swift, "(line_string_literal) @s");
for (const { node } of q.captures(tree.rootNode)) {
  // node.startIndex / node.endIndex are CHAR offsets into `src` (splice targets)
  // node.startPosition / node.endPosition are {row, column}
  const text = src.slice(node.startIndex, node.endIndex);
}
```

Every node exposes `startIndex`, `endIndex`, `startPosition`, `endPosition` — the same shape across
all grammars `[R1][R11]`. To exclude the quotes, capture the **content child** instead of the literal
(see §2). Query syntax is tree-sitter's S-expression pattern language with `@name` captures and
optional `#predicates` `[R2]`. Reuse one `Parser.init()` and one compiled `Query` per grammar across
files.

---

## 2. Per-language string node type mapping

Node names verified against each grammar's `grammar.js` / `node-types.json` where cited; the rest
are the well-established names for the canonical grammar and should be re-checked against the exact
`.wasm` you vendor (grammars drift — always confirm via the grammar's `node-types.json` `[R11]`).

**Key nuance — capture the content child, not the literal, to drop quotes.** Modern grammars split a
string into an opening delimiter, a **text-content child**, and a closing delimiter. Splicing the
literal node includes the quotes; splicing the content child gives just the copy.

| Language                | String literal node(s)                                                                           | Text-content child (quote-excluding)                                                      | Source                    |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------- |
| **Swift**               | `line_string_literal`, `multi_line_string_literal`, `raw_string_literal`                         | `line_str_text`, `multi_line_str_text` (interp = `_interpolation`)                        | verified `[R12]`          |
| **Rust**                | `string_literal`, `raw_string_literal`                                                           | `string_content`                                                                          | verified `[R13]`          |
| **Go**                  | `interpreted_string_literal`, `raw_string_literal`                                               | `interpreted_string_literal_content`, `raw_string_literal_content`                        | verified `[R14]`          |
| **Java**                | `string_literal`, (`multiline_string_literal` via `string_literal`)                              | `string_fragment`, `multiline_string_fragment`                                            | verified `[R15]`          |
| **Kotlin**              | `line_string_literal`, `multi_line_string_literal` (wrapper `string_literal` in some grammars)   | `_string_content` / `string_content` (interp = `interpolation`)                           | grammar-dependent `[R16]` |
| **C / C++ / Obj-C**     | `string_literal`, `raw_string_literal` (C++), `char_literal`; Obj-C `@"…"` also `string_literal` | `string_content` (recent grammars)                                                        | canonical `[R10]`         |
| **PHP**                 | `string`, `encapsed_string`, `heredoc`, `nowdoc`                                                 | `string_content`                                                                          | verified `[R17]`          |
| **Python**              | `string` (f-strings included)                                                                    | `string_content` (delimiters `string_start`/`string_end`; interp = `interpolation`)       | verified `[R18]`          |
| **Ruby**                | `string`, `bare_string`, `heredoc_body`                                                          | `string_content`                                                                          | canonical `[R10]`         |
| **Shell/Bash**          | `string` (double-quoted), `raw_string` (single-quoted)                                           | `string_content` (in `string`); `raw_string` is the whole single-quoted text incl. quotes | canonical `[R5]`          |
| **HCL/Terraform**       | `quoted_template` → `template_literal`; also `string_lit`; `heredoc_template`                    | `template_literal` is the text; `${…}` = `template_interpolation`                         | grammar `[R10]`           |
| **TOML**                | `string` (tree-sitter-toml)                                                                      | text is the node itself (types: `basic_string`, `literal_string`, multiline variants)     | see §3                    |
| **KQL/Kusto**           | `string_literal` / `string` (grammar-dependent)                                                  | grammar-dependent — **verify against the exact `.wasm`**                                  | uncertain `[R10]`         |
| **Typst**               | `string` (code strings); markup body is `text`                                                   | node itself                                                                               | grammar-dependent `[R10]` |
| **CSS**                 | `string_value`                                                                                   | node itself (incl. quotes)                                                                | canonical `[R5]`          |
| **SCSS/Sass/Less**      | `string_value` (tree-sitter-scss); **Less has no maintained grammar**                            | node itself                                                                               | scss `[R10]`; Less → §5   |
| **HTML**                | text = `text`; attrs = `quoted_attribute_value` → `attribute_value`                              | `attribute_value` (quote-excluding); `text` is raw node                                   | canonical `[R5]`          |
| **XML/SVG**             | `CharData` (text), `AttValue` (attr value)                                                       | node itself; strip delimiters                                                             | tree-sitter-xml `[R10]`   |
| **Handlebars/Mustache** | `content` (literal HTML text) in glimmer/embedded grammars                                       | node itself                                                                               | see §5                    |
| **Vue**                 | template text via tree-sitter-vue → embedded HTML `text`                                         | as HTML                                                                                   | prefer dedicated, §5      |
| **Svelte**              | tree-sitter-svelte text nodes                                                                    | as HTML                                                                                   | prefer dedicated, §5      |

Practical rule: write one query per grammar that captures **both** the content child (preferred) and
the whole literal as a fallback for grammars that don't split out a content node
(`(string_content) @s` `(string) @lit`), then prefer the tighter span when present.

---

## 3. TOML specifically — parser with offsets

Three candidates; the deciding factor is **whether it exposes source offsets for string values**,
because we splice by offset.

| Parser                           | Version    | Offsets for values?                                                                                        | Spec           | Notes                                                                        |
| -------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| **`smol-toml`**                  | 1.7.x      | **No.** `parse()` returns plain JS values; no position metadata on values (only errors carry `line`/`col`) | TOML 1.1.0     | Fast, correct, Prettier's choice — but value positions are lost `[R19][R20]` |
| **`@iarna/toml`**                | 2.2.5      | **No** for values; errors expose `pos`/`line`/`col` only                                                   | TOML 0.5/1.0   | Older, effectively unmaintained; same fundamental problem `[R21]`            |
| **`tree-sitter-toml`** (`.wasm`) | via bundle | **Yes** — every `string`/`basic_string`/`literal_string` node has `startIndex`/`endIndex`                  | tracks grammar | Fits the offset-splice model exactly `[R5][R11]`                             |

**Recommendation: use tree-sitter-toml (via web-tree-sitter) for extraction.** Neither `smol-toml`
nor `@iarna/toml` returns byte offsets for the _values_ — they return a decoded JS object, so you
cannot map a string back to its span for splicing. tree-sitter-toml gives node ranges natively and
keeps TOML on the same code path as every other tree-sitter language. Keep `smol-toml` in mind only
if the skill ever needs a _decoded_ value (dotted-key resolution, typed reads) rather than a span —
it is the best pure-decoder — but for copy extraction it cannot place the edit.

> Note: `tree-sitter-toml` is **not** in the `tree-sitter-wasms` gap list — it IS bundled `[R5]`.

---

## 4. Copy vs non-copy per language — signals and prior art

Extraction is high-recall by design; the classifier decides copy-vs-code. Below is the marker/
heuristic prior art per ecosystem, plus the anti-patterns to suppress.

### 4.1 Positive markers (string is almost certainly user-facing copy)

| Ecosystem                                                                                                      | Marker                                                                                                                   | Meaning                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **iOS/macOS**                                                                                                  | `NSLocalizedString("key", comment:)`, `String(localized:)`, SwiftGen `L10n.*`, SwiftUI `Text("…")`, `LocalizedStringKey` | Explicit localization / on-screen text `[R22][R23]`                                       |
| **Android**                                                                                                    | `strings.xml` `<string name="…">…</string>`, `getString(R.string.…)`, `@string/…` in layouts                             | The canonical Android copy store `[R24]`                                                  |
| **GNU gettext** (C, C++, Obj-C, Python, PHP, Ruby, Rust, Go, Shell, Lua, Perl, Vala, C#, Java, Scheme, awk, …) | `_()`, `gettext()`, `ngettext()`, `pgettext()`, `dgettext()`                                                             | The single most portable "this is translatable copy" signal across languages `[R25][R26]` |
| **Rust**                                                                                                       | `format!`, `println!`/`eprintln!`, `write!`, `panic!`/`anyhow!` message args; `t!()` (rust-i18n / fluent)                | Format-string macros carry human text (but see log caveat) `[R27]`                        |
| **Python**                                                                                                     | f-strings, `_(...)`, `gettext.gettext`, `.format()` templates                                                            | User-facing when not logging/SQL `[R25]`                                                  |
| **Go**                                                                                                         | `golang.org/x/text/message` `p.Sprintf`, go-i18n `T(...)`, `fmt.Errorf` user messages                                    | i18n libs are strong signals                                                              |

**xgettext's own language support list is the authoritative "what has an extractable-copy convention"
reference**: C, C++, ObjectiveC, Python, Java, JavaScript, TypeScript, Scheme, Lisp, EmacsLisp,
librep, **Rust, Go**, Ruby, Shell, awk, Lua, Modula-2, D, OCaml, Smalltalk, Vala, Tcl, Perl, PHP,
YCP, GCC-source, Glade, GSettings, Desktop, RST, and more `[R25][R26]`. Mirroring xgettext's keyword
defaults (`gettext`, `_`, `N_`, `ngettext:1,2`, …) is the best-tested cross-language copy heuristic
that exists.

### 4.2 Negative signals (extract, then suppress — string is code, not copy)

Prefer _structural_ suppression (from the parse tree) over regex where possible:

- **SQL** — string is (or is concatenated into) an argument to `query`/`exec`/`raw`; contains
  `SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN`. Suppress.
- **Regex** — string passed to `RegExp`/`regexp.MustCompile`/`Pattern.compile`/`re.compile`, or the
  node is a regex-literal type. Suppress.
- **Paths / URLs / identifiers** — matches a path (`/`, `./`, `../`, drive letters), a bare URL, a
  MIME type, a dotted module path, or is `snake/kebab/CONSTANT_CASE` with no spaces. Suppress.
- **Format specifiers only** — string is just `"%s"`, `"%d"`, `"{}"`, `"{0}"`, `"$1"` etc. with no
  prose. Suppress (but keep format strings that also contain words).
- **Log strings** — argument to `log.*`/`logger.*`/`console.*`/`slog`/`tracing::`/`println!` used for
  diagnostics. **Judgment call**: log text is human-readable but usually not _product_ copy — flag
  as low-priority rather than rewrite, and make it configurable.
- **Enum/constant/map keys, test names, annotations** — string is a case label, a struct-tag value
  (Go `json:"…"`), an attribute/annotation argument, or a `describe/it/test` name. Suppress (test
  names are handled by the separate comment-audit skill).
- **Empty / whitespace / single-char / numeric-only** — suppress.

Reliable rule of thumb, in priority order: **(1)** an explicit i18n/localization marker → almost
certainly copy; **(2)** presence of natural-language structure (≥2 words, spaces, sentence
punctuation, capitalization) → probably copy; **(3)** structural context says code (SQL/regex/path/
key/log) → suppress even if it reads like prose. When (1) fires, trust it over (3).

---

## 5. Recommended architecture and vendoring footprint

**Two-lane parser strategy — keep specialized parsers where they already earn their place; route the
long tail through tree-sitter.**

| Source type                                                                                                    | Parser                                                                    | Rationale                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| JS/TS/JSX/TSX                                                                                                  | `@babel/parser` (existing)                                                | Best-in-class positions, TS+JSX in one, pure JS `[R-web]`                                             |
| Astro                                                                                                          | `@astrojs/compiler` (existing)                                            | Official; frontmatter + template                                                                      |
| Markdown                                                                                                       | `remark`/mdast (existing)                                                 | Rich node model, prose-aware                                                                          |
| YAML                                                                                                           | `yaml` (existing)                                                         | CST with ranges for key/value splicing                                                                |
| **Vue**                                                                                                        | **`@vue/compiler-sfc`** (dedicated) — tree-sitter-vue as fallback         | Official SFC parser gives precise template + `<i18n>` block spans; better than the grammar `[R28]`    |
| **Svelte**                                                                                                     | **`svelte/compiler` `parse()`** (dedicated) — tree-sitter-svelte fallback | Official AST with positions; tree-sitter-svelte is not in the wasms bundle anyway `[R29]`             |
| **Handlebars/Mustache**                                                                                        | **`@handlebars/parser`** (dedicated)                                      | `embedded_template.wasm` is ERB/EJS, **not** Handlebars — the dedicated parser is correct `[R5][R30]` |
| **TOML**                                                                                                       | **tree-sitter-toml** (via web-tree-sitter)                                | Only option with value offsets (§3)                                                                   |
| Swift, Rust, Go, Java, Kotlin, C/C++/Obj-C, PHP, Python, Ruby, Shell, HTML, XML/SVG, CSS/SCSS, KQL, Typst, HCL | **web-tree-sitter + prebuilt `.wasm`**                                    | One runtime, uniform spans, no native build (§1)                                                      |
| **Less**                                                                                                       | PostCSS (`postcss-less`) or regex fallback                                | No maintained tree-sitter-less grammar `[R10]`                                                        |

Why not push the web stack onto tree-sitter too: the existing parsers are prose-aware (mdast
distinguishes heading/list/blockquote; Babel splits template quasis from `${expr}` holes; the SFC
compilers understand framework-specific blocks). Tree-sitter would flatten those distinctions and
regress the web lane. Reserve tree-sitter for languages that have **no** good pure-JS parser.

### Vendoring footprint to expect

- **Runtime:** `web-tree-sitter` (one package, ships its own `.wasm` runtime) — a few hundred KB.
- **Grammars:** vendor only the ~16 `.wasm` files you target into
  `scripts/grammars/`, sourced mostly from `tree-sitter-wasms` `[R5]`, plus a handful built once from
  `tree-sitter-grammars/*` for the gap langs (**HCL, SCSS, XML/SVG, KQL, Typst**; Svelte/Vue/HBS use
  dedicated parsers instead). Budget ~0.1–2 MB each, ~10–20 MB total — commit them as assets so
  install never compiles.
- **Dedicated add-ons:** `@vue/compiler-sfc`, `svelte`, `@handlebars/parser`, optionally
  `postcss`/`postcss-less` — all pure JS, pnpm-vendorable.
- **Not vendored:** the `tree-sitter` CLI, Emscripten, Docker, any native addon. If a gap grammar
  must be built to `.wasm`, do it **once** on a dev machine and commit the artifact; never at install.

---

## Recommendation summary

- **Tree-sitter runtime:** **`web-tree-sitter`** (WASM, 0.25.x) — pure-`.wasm`, no per-platform
  native build, portable across mac/linux/arm/musl/CI. Prefer it over native `tree-sitter`
  (node-tree-sitter) for a vendorable Node ESM skill `[R1][R3][R4]`.
- **Grammar source:** **`tree-sitter-wasms`** (Gregoor) as the primary prebuilt bundle — covers most
  targets `[R5]`; fill the gaps (HCL, SCSS, XML/SVG, KQL/Kusto, Typst) from the canonical
  **`tree-sitter-grammars/*`** repos `[R10]` (or `@sourcegraph`/`@vscode`/`@cursorless` bundles
  `[R6][R7][R8]`), building any missing `.wasm` once and committing it.
- **TOML parser:** **`tree-sitter-toml`** (via web-tree-sitter) — the only option that yields value
  offsets for splicing; `smol-toml` (1.7.x) is the best pure _decoder_ but exposes no value positions
  `[R19]`, and `@iarna/toml` (2.2.5) is unmaintained with the same limitation `[R21]`.
- **Keep specialized parsers** for JS/TS (Babel), Astro, Markdown, YAML, **Vue** (`@vue/compiler-sfc`),
  **Svelte** (`svelte/compiler`), and **Handlebars** (`@handlebars/parser`); route everything else
  through tree-sitter.
- **Classification:** mirror xgettext keyword conventions + explicit localization markers
  (`NSLocalizedString`/`String(localized:)`/SwiftUI `Text`, Android `strings.xml`/`getString`,
  gettext `_()`) as high-confidence copy signals; suppress SQL/regex/paths/format-only/keys/logs
  structurally `[R22][R24][R25]`.

---

## Sources

- `[R1]` web-tree-sitter — npm & `lib/binding_web` README (0.25.x; `Parser.init`, `Language.load`,
  node `startIndex`/`endIndex`/`startPosition`): <https://www.npmjs.com/package/web-tree-sitter> ·
  <https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md>
- `[R2]` Tree-sitter — Queries (S-expression patterns, `@captures`, predicates):
  <https://tree-sitter.github.io/tree-sitter/using-parsers/queries/>
- `[R3]` node-tree-sitter (`tree-sitter`) — npm & API (v0.25.x):
  <https://www.npmjs.com/package/tree-sitter> · <https://tree-sitter.github.io/node-tree-sitter/>
- `[R4]` Tree-sitter `binding_web` notes / "Modern Tree-sitter" series (WASM slower than native;
  native bindings can now consume `.wasm`):
  <https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web> ·
  <https://blog.pulsar-edit.dev/posts/20240902-savetheclocktower-modern-tree-sitter-part-7/>
- `[R5]` tree-sitter-wasms (Gregoor) — prebuilt `.wasm` grammars, `out/tree-sitter-<lang>.wasm`
  (v0.1.13): <https://github.com/Gregoor/tree-sitter-wasms> · <https://www.npmjs.com/package/tree-sitter-wasms>
- `[R6]` @sourcegraph/tree-sitter-wasms: <https://www.npmjs.com/package/@sourcegraph/tree-sitter-wasms>
- `[R7]` @vscode/tree-sitter-wasm: <https://www.npmjs.com/package/@vscode/tree-sitter-wasm> ·
  <https://github.com/microsoft/vscode-tree-sitter-wasm>
- `[R8]` @cursorless/tree-sitter-wasms: <https://www.npmjs.com/package/@cursorless/tree-sitter-wasms>
- `[R9]` @repomix/tree-sitter-wasms: <https://www.npmjs.com/package/@repomix/tree-sitter-wasms>
- `[R10]` tree-sitter-grammars org (canonical per-language grammars incl. hcl, scss, xml, svelte;
  build with `tree-sitter build --wasm`): <https://github.com/tree-sitter-grammars>
- `[R11]` Tree-sitter — Static Node Types (`node-types.json`, `named` flag):
  <https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types.html>
- `[R12]` tree-sitter-swift grammar (`line_string_literal`, `multi_line_string_literal`,
  `raw_string_literal`, `line_str_text`): <https://github.com/alex-pinkus/tree-sitter-swift>
- `[R13]` tree-sitter-rust `node-types.json` (`string_literal`, `raw_string_literal`,
  `string_content`): <https://github.com/tree-sitter/tree-sitter-rust>
- `[R14]` tree-sitter-go `node-types.json` (`interpreted_string_literal`, `raw_string_literal`,
  `interpreted_string_literal_content`): <https://github.com/tree-sitter/tree-sitter-go>
- `[R15]` tree-sitter-java `node-types.json` (`string_literal`, `string_fragment`,
  `multiline_string_fragment`): <https://github.com/tree-sitter/tree-sitter-java>
- `[R16]` tree-sitter-kotlin (`line_string_literal`, `multi_line_string_literal`; content nodes):
  <https://github.com/fwcd/tree-sitter-kotlin> · <https://docs.rs/tree-sitter-kotlin>
- `[R17]` tree-sitter-php `node-types.json` (`string`, `encapsed_string`, `heredoc`, `nowdoc`,
  `string_content`): <https://github.com/tree-sitter/tree-sitter-php>
- `[R18]` tree-sitter-python `node-types.json` (`string`, `string_content`, `string_start`,
  `string_end`, `interpolation`): <https://github.com/tree-sitter/tree-sitter-python>
- `[R19]` smol-toml — README & npm (v1.7.x, TOML 1.1.0; `parse()` returns plain values, no value
  offsets): <https://github.com/squirrelchat/smol-toml> · <https://www.npmjs.com/package/smol-toml>
- `[R20]` Prettier switching `@iarna/toml` → `smol-toml`:
  <https://github.com/prettier/prettier/pull/16497>
- `[R21]` @iarna/toml — npm (v2.2.5; error `pos`/`line`/`col` only):
  <https://www.npmjs.com/package/@iarna/toml> · <https://github.com/iarna/iarna-toml>
- `[R22]` Apple — `NSLocalizedString` / `String(localized:)` / `LocalizedStringKey`:
  <https://developer.apple.com/documentation/foundation/nslocalizedstring> ·
  <https://developer.apple.com/documentation/swiftui/text>
- `[R23]` SwiftGen (`L10n` strings codegen): <https://github.com/SwiftGen/SwiftGen>
- `[R24]` Android — string resources (`strings.xml`, `getString`):
  <https://developer.android.com/guide/topics/resources/string-resource>
- `[R25]` GNU gettext — xgettext Invocation (supported languages, keyword defaults):
  <https://www.gnu.org/software/gettext/manual/html_node/xgettext-Invocation.html>
- `[R26]` GNU gettext — Language Implementors:
  <https://www.gnu.org/software/gettext/manual/html_node/Language-Implementors.html>
- `[R27]` Rust — `std::fmt` / `format!` macros: <https://doc.rust-lang.org/std/macro.format.html>
- `[R28]` Vue — `@vue/compiler-sfc` (SFC parse with positions):
  <https://www.npmjs.com/package/@vue/compiler-sfc>
- `[R29]` Svelte — compiler `parse()` API: <https://svelte.dev/docs/svelte-compiler>
- `[R30]` Handlebars — `@handlebars/parser`: <https://www.npmjs.com/package/@handlebars/parser>
- `[R-web]` copy-audit `reference/extraction-research.md` (the web/markdown/YAML parser stack this
  document extends).

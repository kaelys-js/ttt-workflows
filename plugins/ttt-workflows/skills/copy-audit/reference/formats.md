# copy-audit — supported formats

Which file type routes to which extractor, and what copy units come out. Derived from the
dispatch in `scripts/ast-extract.mjs` (`extractUnits` / `extractComments`), the tree-sitter
extension map in `scripts/ts-extract.mjs`, and the vendored grammars in `scripts/grammars/`.
Every captured string still passes the one `isCopyPhrase` classifier before it becomes a unit
(see [deep-dive.md](deep-dive.md) §4).

## Copy mode — extractor matrix

| extensions | extractor | copy units captured | `syntax` |
| --- | --- | --- | --- |
| `.md` `.mdx` `.markdown` `.mdc` | remark / mdast | headings, prose paragraphs, list items, blockquotes, standalone-image alt text; YAML frontmatter values | `md-heading` `md-prose` `md-listitem` `md-blockquote` `md-alt` `frontmatter` |
| `.astro` | @astrojs/compiler | frontmatter string metadata (parsed as JS) + template text nodes and copy attributes | `jsx-text` `attr-copy` `js-string` |
| `.html` `.htm` `.vue` `.svelte` `.xml` `.svg` `.hbs` `.handlebars` `.mustache` `.plist` `.xsl` `.xslt` `.erb` `.ejs` `.jinja` `.jinja2` `.j2` `.liquid` `.twig` `.heex` · `*.blade.php` | markup scanner (directive/script/style/comment blocks masked) | element text nodes + copy attributes (`alt`/`title`/`placeholder`/`label`/`aria-*`/`content`) | `jsx-text` `attr-copy` |
| `.js` `.ts` `.jsx` `.tsx` `.mjs` `.cjs` `.mts` `.cts` | @babel/parser | string values by AST context (object value, assignment, array element, call arg), plus JSX text and copy JSX attributes; interpolated template literals skipped | `js-string` `jsx-text` `attr-copy` |
| `.json` `.jsonc` `.json5` `.webmanifest` | offset-tracking JSON scanner | string values (and arrays of strings) under copy-carrier keys | `json-copy` |
| `.yml` `.yaml` | `yaml` CST | scalar values under copy-carrier keys | `yaml-copy` |
| `.typ` | Typst scanner | `#show`/`.with(…)` string metadata, `=` headings, body prose | `typ-copy` `md-heading` `md-prose` |
| `.tsv` (tab/pipe) · `.csv` | delimited-cell scanner | phrase-shaped cells | `tsv-cell` |
| `.env` `.env.*` | env scanner | `#` comment prose + `KEY=value` values that read like copy (NAME/TITLE/MESSAGE… keys) | `config-comment` `env-value` |
| `.ini` `.cfg` `.conf` `.properties` `.editorconfig` · rc + ignore files (`.gitignore`, `.npmrc`, `CODEOWNERS`, …) | hash-config scanner | `#`/`;` comment prose + phrase-shaped `key=value` (patterns/paths/rules dropped) | `config-comment` `config-value` |
| `.txt` `.text` `.tpl` `.pug` `.jade` · extension-less prose (`LICENSE`, `NOTICE`, `AUTHORS`, `VERSION`, …) | paragraph scanner | prose paragraphs | `text-line` |
| **tree-sitter languages** (below) | web-tree-sitter (WASM) | string literals (interpolation-skipped, quote-stripped, bare docstrings excluded); a string that is the first arg to a UI/copy marker call is kept even as a terse label | `code-string` |

### Tree-sitter languages (vendored grammars)

One grammar `.wasm` per language in `scripts/grammars/`, mapped by extension/basename in
`ts-extract.mjs`. `.toml` also routes here (`code-string`).

| grammar | extensions / names |
| --- | --- |
| swift | `.swift` |
| rust | `.rs` |
| go | `.go` |
| java | `.java` |
| kotlin | `.kt` `.kts` |
| c | `.c` `.h` |
| cpp | `.cpp` `.cc` `.cxx` `.hpp` `.hh` |
| objc | `.m` `.mm` |
| php | `.php` |
| python | `.py` `.pyi` |
| ruby | `.rb` `.gemspec` `.rake` `.rbi` · `Gemfile` `Rakefile` `Podfile` `Guardfile` |
| bash | `.sh` `.bash` `.zsh` |
| toml | `.toml` |
| lua | `.lua` |
| scala | `.scala` `.sbt` |
| c_sharp | `.cs` |
| elixir | `.ex` `.exs` |
| dart | `.dart` |
| zig | `.zig` |
| solidity | `.sol` |
| terraform | `.tf` `.tfvars` |
| hcl | `.hcl` |
| bicep | `.bicep` |
| css | `.css` `.scss` `.sass` `.less` `.pcss` `.postcss` |
| sql | `.sql` |
| nix | `.nix` |
| ocaml | `.ml` `.mli` |
| haskell | `.hs` `.lhs` |
| perl | `.pl` `.pm` `.pod` |
| r | `.r` |
| powershell | `.ps1` `.psd1` `.psm1` |
| fish | `.fish` |
| nim | `.nim` `.nims` |
| gdscript | `.gd` |
| v | `.v` |
| crystal | `.cr` |
| fsharp | `.fs` `.fsi` `.fsx` |
| starlark | `.bzl` `.star` `.sky` |
| cmake | `.cmake` · `CMakeLists.txt` |
| groovy | `.gradle` `.groovy` `.gvy` |
| make | `.mk` · `Makefile` `GNUmakefile` |
| prisma | `.prisma` |
| proto | `.proto` |
| jsonnet | `.jsonnet` `.libsonnet` |
| cue | `.cue` |
| erlang | `.erl` `.hrl` |
| handlebars · html · json · javascript · typescript · tsx | grammars also present, used by the AST extractors above / comment mode |

A grammar that fails to load is caught and yields no units for that file — it never crashes the
sweep. Formats without a vendored grammar (e.g. KQL) are simply not covered.

## Comments mode — where comment + testname units come from

| extensions | extractor | units |
| --- | --- | --- |
| `.js` `.ts` `.jsx` `.tsx` `.mjs` `.cjs` `.mts` `.cts` | @babel/parser | line/block `comment` nodes + `testname` (first-arg string of `it`/`test`/`describe`/…) |
| `.astro` | frontmatter JS comments + `<!-- -->` scan | `comment` |
| `.md` `.mdx` `.markdown` `.mdc` `.html` `.htm` `.xml` `.svg` `.vue` `.svelte` | `<!-- -->` scan + `<script>` JS comments (and testnames) | `comment` `testname` |
| **tree-sitter languages** (above) | web-tree-sitter comment nodes | `comment` |

Pragma/lint-directive comments (`eslint-`, `ts-ignore`, `noqa`, `rubocop:`, `swiftlint:`, …) and
shebang lines are dropped — they are load-bearing, not prose.

## Copy-carrier keys / attributes

JSON/YAML values and template attributes are captured when their key/attribute is a copy carrier
(case-insensitive), including `title` `subtitle` `heading` `label` `description` `summary`
`tagline` `cta` `button` `placeholder` `message` `error` `hint` `tooltip` `alt` `caption`
`headline` `content` `question` `answer` `body` … plus the copy attributes `alt` `title`
`placeholder` `label` `aria-label` `aria-description` `content`. Structural keys/attributes
(`class` `id` `href` `src` `slug` `name` `type` `style` `d` `viewbox` `data-testid` …) are
always treated as non-copy. The full sets live in `ast-extract.mjs`.

## Default skips

`AGENTS.md` / `CLAUDE.md` / `MEMORY.md` / `SKILL.md`, `CHANGELOG*`, lockfiles, `LICENSE`/
`NOTICE`, `tsconfig`/`jsconfig`/`.eslintrc`/`.prettierrc` JSON, `*.config.*`, rc configs,
`robots.txt`/`sitemap.xml`/`*.map`, `*.min.*`, `*.d.ts`, and generated trees (`/node_modules/`,
`/dist/`, `/build/`, `/coverage/`, `/.next/`, `/.astro/`, `/.svelte-kit/`, `/.turbo/`,
`/vendor/`, snapshots). `README*` and other docs are **kept** — they are prime copy. Test/spec
paths are skipped in copy mode and kept in comments mode. Append repo-specific skips with
`--skip-path`.
</content>

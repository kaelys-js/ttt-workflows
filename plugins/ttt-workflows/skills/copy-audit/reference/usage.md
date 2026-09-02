# copy-audit — usage

A worked end-to-end run, plus the review-workflow shape and recovery notes. Every phase
shares one sqlite DB; the DB alone tells you where a sweep is.

## Whole-repo sweep (most common)

```bash
SKILL=~/.claude/skills/copy-audit/scripts/extract.mjs
REPO=/abs/path/to/repo
DB=/tmp/copy-audit/audit.db
BUNDLES=/tmp/copy-audit/bundles

# 1. extract every copy unit in the working tree's HEAD
node "$SKILL" --phase=extract --repo "$REPO" --full --head HEAD --db "$DB"

# 2. pack for the reviewer
node "$SKILL" --phase=bundle-emit --db "$DB" --out-dir "$BUNDLES"
```

For a diff range instead of the whole repo, swap `--full` for `--base <sha> --head <sha>`.

## 3. Review (Workflow tool)

The reviewer fans out one subagent per bundle. The ready-to-run script is
[../workflows/copy-review.js](../workflows/copy-review.js) — call the Workflow tool with
that script and:

```json
{ "bundleCount": <manifest.bundle_count>, "bundleDir": "<BUNDLES abs path>" }
```

Then collect verdicts from the workflow result, or — if the 4,096-item return cap trips —
from the per-agent journal:

```bash
JOURNAL=<transcriptDir>/journal.jsonl
jq -sc '[.[] | select(.type=="result") | .result.verdicts[]?]' "$JOURNAL" > /tmp/copy-audit/verdicts.json
```

Each verdict:

```json
{
  "id": 12,
  "verdict": "rewrite",
  "rewrite": "Save changes",
  "category": "microcopy",
  "severity": "medium",
  "note": "CTA should name the action"
}
```

`verdict` is `keep` | `rewrite` | `flag`. `rewrite` is a string only for `rewrite`
(plain text, no markers/tags/quotes). `category` ∈ {plain-language, inclusive, microcopy,
voice-grammar}; `severity` ∈ {blocker, high, medium, low}. See
[standards.md](standards.md) for the rubric and verdict mapping.

## 4. Review the tables BEFORE applying (the approval gate)

```bash
node "$SKILL" --phase=apply-verdicts --db "$DB" --verdicts /tmp/copy-audit/verdicts.json

# eyeball what will change / what was flagged
sqlite3 "$DB" -header -column \
  "SELECT file, line_start, syntax, severity, category, substr(block_text,1,40) AS was, substr(rewrite,1,40) AS now FROM units WHERE verdict='rewrite' ORDER BY file, line_start;"
sqlite3 "$DB" -header -column \
  "SELECT file, line_start, severity, category, substr(note,1,70) AS issue FROM units WHERE verdict='flag' ORDER BY severity;"
```

## 5. Apply + verify

```bash
node "$SKILL" --phase=apply  --db "$DB" --repo "$REPO"
node "$SKILL" --phase=verify --db "$DB" --repo "$REPO"
```

`apply` writes only `rewrite` rows (never `keep`/`flag`), with the SHA + span guards.
`verify` asserts every changed hunk lies inside a recorded copy span. Optionally pass
`--post-verify-cmd 'npx prettier -w $(git diff --name-only)'` (or the repo's formatter) —
its non-zero exit is reported, not fatal.

## Pasted text or a single file (direct mode)

No git repo needed — point `extract` at a file, or pipe the text in:

```bash
# a standalone file (--as overrides the format if the extension is misleading)
node "$SKILL" --phase=extract --db "$DB" --input /abs/landing-copy.md

# pasted text over stdin
pbpaste | node "$SKILL" --phase=extract --db "$DB" --stdin --as .md
```

Then bundle-emit → review → apply-verdicts → `apply --repo <dir>` → `verify --repo <dir>`
exactly as above, where `<dir>` is the directory the extract output reported (`repo`). Apply
is SHA-guarded; verify reconstructs the file from its pre-image plus the applied rewrites and
asserts a byte-for-byte match, so the copy-only invariant holds without git.

## PDF (read-only)

```bash
node "$SKILL" --phase=extract --db "$DB" --input /abs/brochure.pdf
```

Text is pulled from the PDF's content streams into `pdf-text` units and reviewed like any
other copy — but a PDF is **never rewritten in place** (`apply` skips `pdf-text`, reporting how
many it skipped). The deliverable is the verdict/flag report; use it to fix the copy in the
source document. Complex PDFs (CID/Type0 fonts, encryption) may extract only partially.

## Resuming / deferring

- Re-running any phase is safe. `apply-verdicts` only touches `pending` rows; `apply`
  only touches `rewrite AND applied=0`.
- **A file changed since extract?** `apply` fatals with a sha mismatch. Set that file's
  rows to `keep` (`UPDATE units SET verdict='keep' WHERE file=? AND verdict='rewrite'`)
  and pick it up on the next sweep — never force it.
- **Reviewer output looked wrong?** The DB persists, so fix the verdicts JSON and re-run
  `apply-verdicts` (it re-updates only rows still `pending`; to re-open rows, reset them
  to `pending` first).

## Rollback

Every sweep is an ordinary working-tree change: `git checkout -- .` before commit, or
`git revert <sha>` after. The DB persists so verdicts can be re-applied without re-running
the reviewer.

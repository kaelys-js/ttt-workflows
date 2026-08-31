# Output format

The review is a single paste-ready block the operator posts by hand. It is
**scan-first**: the reader gets the verdict and what matters in under ten seconds, and
the full depth of every finding is one glance deeper (R13). The reviewer fills a
`findings.json`; `scripts/render-review.mjs` turns it into the block, so the layout is
fixed — do not hand-write it, and do not vary the structure.

## Contents
- Emoji legend
- The layout (scan layer → depth layer)
- Platform-aware rendering
- Plain-language rules
- findings.json schema
- Hard band

## Emoji legend (closed set — the ONLY emojis allowed)

Functional status markers, never decoration. Exactly these four, only where named. No
other emoji anywhere (no 🚀 🎉 👍 ✨).

| Emoji | Meaning | Where |
|---|---|---|
| ✅ | Approve | verdict line |
| 💬 | Comment (no blocking issues) | verdict line |
| 🔴 | Blocking | verdict line, tally, table, finding |
| 🟡 | Non-blocking | tally, table, finding |

## The layout

Two layers. The scan layer is always visible; the depth layer holds the detail.

**Scan layer (read in <10s):**
1. **Verdict + tally + scope:** `**<emoji> <VERDICT>** · 🔴 <n> blocking · 🟡 <n>` plus,
   when `--pr pr.json` is passed, a scope chip: `` `14 files · +512 −24` ``.
2. **TL;DR:** a one-sentence blockquote, labeled: `> **TL;DR:** …` — what matters and
   whether it is mergeable.
3. **Does:** the behavioural trace, right after the TL;DR — orientation lives in the
   scan layer, not the footer.
4. **Ticket line** (when the PR resolves one): `**Ticket:** [PROJ-261](url) · status`,
   appending ` — "name"` only when the ticket name differs from the PR title.
5. **Mergeable after** (request-changes only): the numbered blocking headlines, so the exact
   path to merge is one line: `**Mergeable after:** #1 … · #2 …`.
6. **Findings-at-a-glance table:** `| # | <emoji> | <label> | <headline> | <where> |` —
   numbered rows whose numbers repeat in the depth layer, with the Conventional-Comment
   type visible at scan level. Sorted blocking-first, then label weight, then file/line.
   `where` deep-links to the file at the reviewed head (GitHub `blob/<sha>#L<n>`, ADO
   `?version=GC<sha>&line=<n>`) when `--pr` was given; — for global findings. The same
   links appear in the depth-layer summaries.

**Depth layer (full detail, one per finding):** problem + why + concrete fix +
optional `suggestion` block. Rendered collapsed or flat depending on platform (below).

**Footer:**
- `**Praise:**` — at most two specific things done well. Skip rather than pad.
(`Does:` lives in the scan layer, item 3 above — not in the footer.)

## Platform-aware rendering

`render-review.mjs` reads `platform` and renders the depth layer accordingly:

- **GitHub** — each finding is a collapsed `<details>`; the `<summary>` repeats
  `emoji **label (severity)** — headline · \`file:line\``, the body holds the detail.
  Scan the table, expand only what you care about.
- **Azure DevOps** — PR comments do not render `<details>`, so the depth layer is flat
  numbered sections under a `### Details` heading; the table above still gives the scan.
  Markdown tables and `suggestion`-style fenced blocks render fine there.

Same findings, same depth, both platforms — only the disclosure mechanism differs.

## Plain-language rules (plainlanguage.gov / ISO 24495-1)

- Short sentences. One idea each.
- Common words over jargon. Verbs over nominalizations.
- Active voice. Lead with the problem, then the fix.
- Comment on the code, never the author: no "you did / you should" — name the code's
  property instead ("the handler swallows the error", not "you swallow the error").
- `problem` must state the consequence (the why), not just the observation: "X, so Y
  breaks when Z" — an observation with no stated consequence is not a finding.
- Genuine uncertainty is a `question` label phrased as an actual question.
- No filler intensifiers: `genuinely`, `really`, `truly`, `simply`, `just`, `quite`.
- Ration em-dashes — at most one per finding.
- No templated pep. End when done.

## findings.json schema (the reviewer writes this)

```json
{
  "verdict": "approve | comment | request-changes",
  "bottom_line": "one sentence: what matters + is it mergeable",
  "what_it_does": "optional 1–3 sentence behavioural trace, or empty string",
  "coverage": "REQUIRED when the diff exceeds ~500 changed lines (renderer warns if missing): where the review focused and what got lighter treatment",
  "findings": [
    {
      "severity": "blocking | non-blocking",
      "label": "issue | suggestion | nitpick | question | todo | note | praise",
      "confidence": "high | low",
      "headline": "<= ~8 words, the scan-table label",
      "file": "path from repo root, or empty for global",
      "line": 123,
      "anchor_snippet": "substring of that exact diff line — REQUIRED for anchors inside hunks; the renderer refuses on mismatch",
      "problem": "what is wrong and why it matters",
      "fix": "concrete proposed fix",
      "suggestion": "optional replacement code for a fenced suggestion block, or empty"
    }
  ]
}
```

Derivation rules the reviewer must honor:
- `verdict` = `request-changes` if any finding is `blocking`; else `comment` if there
  are non-blocking findings that matter; else `approve`.
- **Signal over noise (R12):** every finding is `confidence: "high"` and verified. A
  `low`-confidence item is dropped, or kept only if you justify it in `problem` and it
  is non-blocking — never a blocking finding.
- `headline` is required and distinct from `problem`: it is the scan label, not a
  sentence. "Logger leaks auth/cookie headers", not "The logger, which uses pino-http…".
- `praise` findings are always `non-blocking`, carry no `fix`, and are excluded from the
  tally and table (they render only in the Praise footer). At most two.
- Order by altitude: put design / correctness / security findings before nits.

## Hard band (render-review.mjs greps for these and refuses to emit)

- No AI attribution anywhere: `Co-Authored-By`, `Generated with`, `noreply@anthropic.com`, 🤖.
- No decorative emoji — only the four functional ones above.
- No blocking finding without a fix.

To flag an AI-attribution trailer on the author's commit, **describe** it ("commit
`abc1234` carries an AI co-authorship trailer") — do not reproduce the literal
`Co-Authored-By:` / "Generated with" string, which the gate blocks by design.

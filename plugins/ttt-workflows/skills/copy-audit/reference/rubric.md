# copy-audit — rubric

The operator-facing scoring rubric: what the reviewer subagent enforces, distilled to a
working checklist. This is the condensed version — every check here traces to a cited source
in [standards.md](standards.md), which is the authority. Read that for the *why* and the
citations; read this to judge a unit fast.

Which rubric applies is set by `--mode` (see [modes.md](modes.md)): **copy** units are judged
against the four content pillars below; **comment** and **testname** units are judged against
comment-quality and Rule 9. The verdict and severity vocabulary is shared.

## Contents

- [The four content pillars (copy mode)](#the-four-content-pillars-copy-mode)
- [Mandatory flags](#mandatory-flags)
- [Comment-quality rules (comments mode)](#comment-quality-rules-comments-mode)
- [Rule 9 — test names encode intent (comments mode)](#rule-9--test-names-encode-intent-comments-mode)
- [Verdicts](#verdicts)
- [Severity scale](#severity-scale)
- [Category values](#category-values)

## The four content pillars (copy mode)

Each finding names the primary pillar as its `category`. Full checks + citations in
[standards.md](standards.md).

**Pillar 1 — Plain language & readability** (`category: plain-language`)

- Short sentences (aim < ~25 words), one idea each; split run-ons and stacked clauses.
- Common words over jargon/buzzwords ("leverage", "utilize", "seamless", "robust").
- Cut filler ("in order to" → "to", "at this point in time" → "now", nominalizations).
- Active voice, present tense, second person for instructions; front-load the point (BLUF).
- Define acronyms on first use.

**Pillar 2 — Inclusive & bias-free** (`category: inclusive`)

- No gendered defaults (singular "they" / role nouns, not "guys"/"manpower").
- No ableist idioms ("sanity check", "crazy", "dummy", "lame", "blind to").
- Retire loaded tech pairs (master/slave → primary/replica; blacklist/whitelist →
  blocklist/allowlist).
- No assumptions about the reader ("simply", "just", "obviously", "everyone knows").
- Person-first vs identity-first is a `flag`, not a rewrite, when the community norm is unknown.

**Pillar 3 — UX microcopy** (`category: microcopy`)

- Buttons/CTAs are action verbs naming the outcome ("Save changes", not "Submit"/"OK").
- Sentence case for UI text unless the target design system mandates title case (else `flag`).
- Errors say what happened + how to recover; no blame, no raw codes/stack traces.
- Empty states guide the next action, not "No data".
- Descriptive link text (WCAG 2.4.4) — never "click here"/"read more"/"learn more" alone.
- Labels concise and consistent; placeholders are not labels. No dark patterns/confirmshaming.

**Pillar 4 — Voice, grammar & mechanics** (`category: voice-grammar`)

- Correct grammar/spelling/punctuation ("its/it's", "your/you're", comma splices, doubled words).
- Consistent terminology, product-name casing, and number/date formatting (prefer ISO 8601).
- Alt text describes function/content, never starts with "image of" (WCAG 1.1.1); decorative → empty.
- Heading hierarchy: one H1, no skipped levels, descriptive.
- Meta title ≈ 50–60 chars; meta description ≈ 150–160 chars.
- Consistent, on-brand voice; cut redundant pairs.

## Mandatory flags

Never return `keep` for these even when the wording is otherwise good — flagging is not
rewriting, so the keep-bias below does not excuse them:

- A `<title>`/metaTitle over ~60 chars, or a meta description outside ~150–160 chars (count them).
- Any single sentence over ~30 words, or stacked clauses that force a backtrack.
- Alt text that repeats the page/site title instead of describing the image.
- Link/button text that isn't self-describing out of context ("here", "read more").

## Comment-quality rules (comments mode)

A code comment is a **defect budget**, judged by WHY-not-WHAT — not by the copy pillars.
`category: comment`.

- **delete** a comment that: restates the code or the next line ("increment i"); narrates
  task/PR/scar history ("R82: fixed the thing"); lists callers/cross-refs; is dead
  commented-out code; or states behaviour the code no longer has.
- **rewrite** a comment that carries a real WHY but is bloated or task-scarred → one crisp line
  stating the WHY (the rewrite text is the prose only, no comment markers — apply re-adds the
  original `//` / `#` / `--` / `;` / `/* */` / `<!-- -->` style).
- **keep** a comment that states a genuine hidden constraint, a workaround for a named bug, a
  warning the code cannot express, or a doc/JSDoc/param block.

Pragma and lint-directive comments (`eslint-`, `ts-ignore`, `noqa`, `rubocop:`, shebangs, …)
are load-bearing, not prose, and are never extracted as units.

## Rule 9 — test names encode intent (comments mode)

The first-argument string of `it()`/`test()`/`describe()`/… (`syntax: testname`,
`category: testname`). A test name must encode **intent** — why the behaviour matters — not
restate mechanics.

- **keep** a name stating a business-visible outcome ("rejects a payload missing the tenant
  header").
- **rewrite** a name that only restates shape ("calls fetch", "returns 200", "works") to the
  intent (the rewrite is the new string only, no quotes/wrapper).
- **never delete** a testname — removing it breaks the runner call. `apply` refuses a `delete`
  on a `testname`.

## Verdicts

One verdict per unit.

| verdict | meaning | `rewrite` | valid in |
| --- | --- | --- | --- |
| **keep** | already compliant; confirm, don't pad | `null` | all modes |
| **rewrite** | a concrete better wording exists and is safe to apply mechanically | required (plain text, no markup/markers/quotes; same unit role; URLs preserved) | all modes |
| **flag** | a real issue whose fix needs human/brand judgment or context you lack (voice, terminology call, person-first, whether the design system mandates title case) | `null`; state the issue + options | all modes |
| **delete** | the unit is pure slop and should be removed entirely | `null` | **comments mode only** (never on a `testname`) |

Bias toward `keep`. Do not rewrite for taste — only when it clearly advances a pillar (copy),
removes real slop (comment), or states intent (testname). Never change meaning, product names,
numbers, URLs, or code-like tokens; never translate. If a copy unit is actually a
code string/identifier that slipped through, verdict `keep`.

## Severity scale

- **blocker** — ships broken or harmful: accessibility failure (missing label, non-descriptive
  link, missing/"image of" alt on a meaningful image, skipped heading levels), offensive/
  exclusionary term, factually wrong copy, dark pattern.
- **high** — materially hurts comprehension, task success, or trust: blaming/opaque error, a CTA
  that misstates its action, an undefined critical acronym, a sentence far over length.
- **medium** — noticeable quality/consistency problem: jargon with a plain equivalent, passive
  voice, filler, inconsistent terminology/casing, SEO length overflow.
- **low** — minor polish: a single filler word, a small tone nit, an optional tightening.

## Category values

`plain-language` | `inclusive` | `microcopy` | `voice-grammar` (copy) · `comment` | `testname`
(comments). The holistic pass ([deep-dive.md](deep-dive.md) §12) adds `consistency` and
`repetition` for cross-cutting findings.

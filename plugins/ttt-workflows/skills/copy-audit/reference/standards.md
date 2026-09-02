# copy-audit — Standards Reference

> **Standards current as of August 2026; primary sources are living documents — re-verify URLs periodically.**

This is the authority the `copy-audit` reviewer's rubric derives from. It is written for an AI
reviewer subagent (and the humans maintaining the skill). Enforce the checks below; the _why_
explains intent so the reviewer can judge edge cases; citations anchor every rule to a real,
stable source. Prefer primary sources. When a check needs brand/house-style context you do not
have, `flag` rather than guess (see **Reviewer verdict mapping**).

How to read each pillar: **Checks** are testable and enforceable. **Why** is the rationale.
**Sources** are numbered `[Sn]` and collected in **Sources** at the end.

---

## Pillar 1 — Plain language & readability

### Checks (enforce)

- [ ] **Sentence length.** Average sentence < 20–25 words; flag any sentence > 30 words as a rewrite candidate. `[S1][S2]`
- [ ] **One idea per sentence.** Split sentences that chain two+ independent clauses with "and/but/which". `[S1]`
- [ ] **Common words over jargon.** Prefer everyday words; flag domain jargon that has a plain equivalent for the stated audience. `[S1][S3]`
- [ ] **Active voice by default.** Flag passive constructions ("was processed by") unless the actor is genuinely unknown/irrelevant. `[S1]`
- [ ] **Present tense** for describing how things behave; **second person** ("you") for instructions and UI guidance. `[S1]`
- [ ] **Cut filler / wordiness.** `in order to`→`to`; `utilize`→`use`; `at this point in time`→`now`; `due to the fact that`→`because`; `a number of`→`some/many`. `[S1]`
- [ ] **Front-load the point (BLUF).** The main message / most important info appears first in the paragraph, page, or screen. `[S1][S4]`
- [ ] **Define acronyms on first use** — spell out, then abbreviate: "single sign-on (SSO)". Skip only for terms more familiar than their expansion to the audience. `[S1][S3]`
- [ ] **Reading grade level.** Target ~grade 8–9 for general web audiences; adjust to audience. Compute Flesch Reading Ease / Flesch–Kincaid Grade Level and report the number. `[S5]`
- [ ] **Positive phrasing.** Prefer positive over double negatives ("remember to save" over "do not forget to not skip saving"). `[S1]`
- [ ] **Lists for parallel items.** Convert dense enumerations inside sentences into bulleted/numbered lists; keep list items grammatically parallel. `[S1]`

### Why

Plain language measurably improves comprehension, task success, and speed, and reduces support
load and error rates. Readers scan rather than read on the web, so front-loading and short,
scannable units respect how attention actually works. `[S1][S4]`

### Sources anchored here

- `[S1]` **Federal Plain Language Guidelines (plainlanguage.gov)** — short sentences, active voice,
  everyday words, "you", cut wordiness, logical order/BLUF, lists.
- `[S2]` **ISO 24495-1:2023, Plain language — Part 1: Governing principles and guidelines** —
  reader-centred principle: readers find, understand, and use information; sentence/structure guidance.
- `[S3]` **Nielsen Norman Group** — plain language and jargon; legibility/readability guidance.
- `[S4]` **Nielsen Norman Group — F-shaped reading pattern / how users read on the web** — scanning,
  front-loading, inverted pyramid.
- `[S5]` **Flesch Reading Ease & Flesch–Kincaid Grade Level** — readability formulas (also codified in
  U.S. plain-writing practice).

---

## Pillar 2 — Inclusive & bias-free language

### Checks (enforce)

- [ ] **No gendered defaults.** Use singular _they/them_ or a role noun ("the user", "the admin");
      flag "he/she", "guys" (as a group), "manpower", "chairman". `[S6][S7][S9]`
- [ ] **Person-first vs identity-first per community norms.** Default to person-first ("a person with
      a disability") unless the relevant community prefers identity-first (e.g. many autistic and Deaf
      people); when uncertain, `flag` for human judgment rather than rewriting. `[S9][S6]`
- [ ] **No ableist idioms.** Flag "sanity check" (→ "quick check", "confidence check"), "crazy/insane"
      (→ "surprising", "extreme"), "dummy" (→ "placeholder", "sample"), "cripple" (→ "slow", "disable"),
      "blind to", "lame", "OCD" as a casual descriptor. `[S6][S7][S8]`
- [ ] **Avoid gratuitous violent/aggressive metaphors** where a neutral term exists: "kill the
      process"→"stop/end", "hit"→"select/go to", "hang"→"stop responding". Keep established terms only
      where no clear equivalent exists. `[S7][S8]`
- [ ] **Replace exclusionary tech pairs.** master/slave → primary/replica, main/secondary, leader/follower;
      blacklist/whitelist → blocklist/allowlist (or denylist/allowlist); grandfathered → legacy/exempt. `[S8][S10][S11]`
- [ ] **No culturally-loaded or exclusionary phrasing.** Avoid idioms that don't translate, region-specific
      slang, and "us/them" framing. `[S7][S8]`
- [ ] **No unfounded assumptions** about age, geography, family structure, gender of a partner, income,
      or tech literacy ("as everyone knows", "simply", "just", "obviously"). Flag "simply/just/easy" that
      presume effort. `[S6][S7]`
- [ ] **Describe people only when relevant**, and use the terms groups use for themselves. `[S6][S9]`

### Why

Language shapes who feels addressed and included; biased or exclusionary wording alienates users,
introduces inaccuracy, and (for terms like master/slave, blacklist/whitelist) carries harmful
historical connotations that major style guides and standards bodies have moved to retire. `[S6][S8][S10]`

### Sources anchored here

- `[S6]` **Microsoft Writing Style Guide — Bias-free communication** — inclusive, bias-free wording;
  gender-neutral language; accessibility terms.
- `[S7]` **Conscious Style Guide** — curated guidance on ability, age, gender, ethnicity, and
  loaded/violent terms.
- `[S8]` **Google developer documentation style guide — Inclusive language / Word list** — avoid ableist
  and violent terms; blocklist/allowlist; primary/replica.
- `[S9]` **APA Style — Bias-Free Language guidelines** — person-first vs identity-first; describing people
  with precision and respect.
- `[S10]` **IETF RFC 9309 (robots.txt) & industry moves** plus **draft-knodel-terminology** — documented
  shift away from master/slave and blacklist/whitelist toward neutral terms.
- `[S11]` **Git / major platforms default branch → `main`** — concrete industry adoption of neutral terms.

---

## Pillar 3 — UX microcopy conventions

### Checks (enforce)

- [ ] **Buttons/CTAs are action verbs naming the outcome.** "Save changes", "Delete account",
      "Send invite" — not "Submit", "OK", "Yes". Match the verb to the heading/action. `[S12][S13][S14]`
- [ ] **Sentence case for UI text** (labels, buttons, headings, menu items) unless the _target design
      system_ mandates title case. If target system unknown, `flag` case, don't force it. `[S14][S15][S16]`
- [ ] **Error messages = what happened + how to fix + no blame + no raw codes.** Plain language,
      actionable, human tone; never expose stack traces/error numbers as the whole message. `[S12][S17]`
- [ ] **Empty states guide the next action** (explain what goes here + a clear primary action), not just
      "No data". `[S12][S15]`
- [ ] **Labels concise and consistent.** Same concept = same word everywhere; avoid synonyms drifting
      across screens. `[S12][S16]`
- [ ] **No "click here" / "read more" link text.** Link text must describe its destination/purpose and
      make sense out of context (accessibility). `[S17-244]` `[S13]`
- [ ] **Placeholder text is not a label.** Every input has a persistent visible label; placeholders show
      format hints only and must not carry essential info. `[S12][S17-331]`
- [ ] **Consistent terminology** for product/feature names and object names across the flow. `[S16][S18]`
- [ ] **No dark patterns / confirmshaming.** Avoid guilt-tripping opt-outs ("No thanks, I hate saving
      money"), pre-checked consent, or asymmetric emphasis that steers users against their interest. `[S12]`
- [ ] **Errors identified + suggestion offered.** When input is rejected, name the field and suggest a
      correction where known. `[S17-332][S17-333]`
- [ ] **Destructive actions are labeled and confirmed** with specific, non-ambiguous copy (button says
      "Delete 3 files", not "OK"). `[S12][S14]`

### Why

Microcopy is where users actually make decisions. Verb-outcome buttons reduce hesitation; blameless,
actionable errors cut abandonment; descriptive links and real labels are accessibility requirements,
not preferences; dark patterns erode trust and increasingly violate regulation. `[S12][S17]`

### Sources anchored here

- `[S12]` **Nielsen Norman Group** — microcopy, error-message guidelines, button/CTA labels, empty states,
  and deceptive-pattern research.
- `[S13]` **GOV.UK Design System & GOV.UK style guide** — button text as verbs, descriptive links,
  plain-English content patterns.
- `[S14]` **Apple Human Interface Guidelines — Writing** — clear, action-oriented controls; case
  conventions for controls.
- `[S15]` **Material Design 3 — Writing / content design** — UI writing, sentence case, empty states.
- `[S16]` **Shopify Polaris — Content guidelines** — terminology consistency, concise labels, voice.
- `[S17]` **W3C WCAG 2.2** — success criteria, cited by number below:
  - `[S17-244]` **2.4.4 Link Purpose (In Context)** — link text conveys purpose.
  - `[S17-331]` **3.3.1 Error Identification** — errors identified in text.
  - `[S17-332]` **3.3.3 Error Suggestion** — suggest corrections when known.
  - `[S17-333]` labels/instructions **3.3.2 Labels or Instructions** — provide labels for inputs.
- `[S18]` **Microsoft Writing Style Guide** — consistent product/feature terminology.

---

## Pillar 4 — Voice, grammar & mechanics

### Checks (enforce)

- [ ] **Consistent brand voice/tone.** Register matches the surrounding product and audience; flag tonal
      whiplash (jokey error in a serious flow, or vice versa). If no voice guide is provided, `flag`. `[S16][S19]`
- [ ] **Consistent product/feature naming & capitalization.** Same product name spelled and capitalized
      identically throughout; don't capitalize generic features unless the house style does. `[S6][S18]`
- [ ] **Grammar, spelling, punctuation correct.** Enforce against a single chosen house style. `[S20][S21]`
- [ ] **Pick one house style guide and hold it** — AP _or_ Chicago (or Microsoft/Google for docs). Don't
      mix conventions within one artifact. `[S20][S21][S6][S8]`
- [ ] **Oxford (serial) comma consistency.** Chicago/Microsoft/APA use it; AP generally omits it. Enforce
      whichever the chosen guide requires — consistently. `[S20][S21][S6]`
- [ ] **Sentence case vs title case consistency** across headings and UI (see Pillar 3); one convention
      per artifact. `[S6][S15]`
- [ ] **Number & date formatting consistent.** One format for dates (prefer unambiguous, e.g. ISO 8601
      `2026-08-15` or spelled month); consistent numerals vs words per house style; consistent units. `[S22][S20][S6]`
- [ ] **Meta/SEO limits.** Title tag ≈ 50–60 characters (~600px); meta description ≈ 150–160 characters.
      Flag titles/descriptions that will truncate. `[S23]`
- [ ] **Heading hierarchy.** Exactly one H1; no skipped levels (H2→H4); headings reflect structure, not
      styling. `[S17-131]` `[S24]`
- [ ] **Alt text quality.** Describe function/content and purpose; omit "image of"/"picture of"; empty
      `alt=""` for purely decorative images. `[S17-111]` `[S24]`

### Why

Consistency is credibility: mixed styles, drifting names, and formatting noise read as carelessness and
increase cognitive load. Heading structure and alt text are accessibility conformance (WCAG), and SEO
length limits determine whether your copy is even seen in search results. `[S17][S23][S24]`

### Sources anchored here

- `[S19]` **Mailchimp Content Style Guide** — voice and tone, writing about people, consistency.
- `[S20]` **The Chicago Manual of Style** — grammar/punctuation, serial comma, numbers.
- `[S21]` **The Associated Press Stylebook (AP)** — journalistic style; generally no serial comma.
- `[S22]` **ISO 8601** — unambiguous date/time formatting.
- `[S23]` **Established SEO length guidance (Google Search Central docs + Moz)** — title ~50–60 chars,
  meta description ~150–160 chars; Google may rewrite snippets.
- `[S24]` **W3C WAI — Images / alt text tutorial & headings guidance** — functional alt text, decorative
  images empty, logical heading structure.
- `[S17-131]` **WCAG 2.2 — 1.3.1 Info and Relationships** — programmatic heading structure.
- `[S17-111]` **WCAG 2.2 — 1.1.1 Non-text Content** — text alternatives for images.

---

## Reviewer verdict mapping

Each finding gets **one verdict** and **one severity**.

### Verdicts

- **keep** — Compliant with the relevant checks. No change needed. (Use to confirm, not to pad.)
- **rewrite** — A concrete, better wording exists that satisfies the rule. **You must supply the exact
  replacement text.** Use when the fix is objective (filler, passive voice, "click here", "Submit"
  button, ableist idiom with a clear neutral swap, acronym undefined).
- **flag** — A real issue, but the correct fix needs human/brand judgment or context you lack (voice/tone,
  person-first vs identity-first for a specific community, whether the target system mandates title case,
  whether a term is load-bearing jargon for this audience). State the issue and options; do not invent a fix.

### Severity scale

- **blocker** — Ships broken or harmful: accessibility conformance failure (missing label, non-descriptive
  link, missing/`image of` alt on meaningful image, skipped heading levels), offensive/exclusionary term,
  factually wrong or misleading copy, dark pattern.
- **high** — Materially hurts comprehension, task success, or trust: blaming/opaque error message, CTA that
  misstates its action, undefined critical acronym, sentence(s) far over length that obscure the point.
- **medium** — Noticeable quality/consistency problem: jargon with a plain equivalent, passive voice,
  filler/wordiness, inconsistent terminology or capitalization, SEO length overflow.
- **low** — Minor polish: single filler word, small tone nit, optional tightening, serial-comma slip in an
  otherwise consistent doc.

Report format per finding: `verdict · severity · pillar · location · issue · fix-or-question · [source]`.

---

## Sources

Each source is listed once. Re-verify URLs periodically; where a URL is unconfirmed the source is named
precisely enough to locate.

- **[S1] Federal Plain Language Guidelines** — <https://www.plainlanguage.gov/guidelines/> — short sentences,
  active voice, everyday words, "you", cut wordiness, logical order, lists.
- **[S2] ISO 24495-1:2023 Plain language — Part 1: Governing principles and guidelines** —
  <https://www.iso.org/standard/78907.html> — reader-centred plain-language principles.
- **[S3] Nielsen Norman Group — plain language / legibility & readability** — <https://www.nngroup.com/>
  (articles on plain language, legibility, readability) — jargon and reading ease on the web.
- **[S4] Nielsen Norman Group — F-Shaped Pattern / how users read on the web** —
  <https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/> — scanning, front-loading.
- **[S5] Flesch Reading Ease & Flesch–Kincaid Grade Level** — readability formulas; documented at
  <https://www.plainlanguage.gov/> and widely published — grade-level targeting.
- **[S6] Microsoft Writing Style Guide — Bias-free communication** —
  <https://learn.microsoft.com/style-guide/bias-free-communication> — inclusive wording, terminology, capitalization.
- **[S7] Conscious Style Guide** — <https://consciousstyleguide.com/> — ability, age, gender, ethnicity, loaded terms.
- **[S8] Google developer documentation style guide — Inclusive language & Word list** —
  <https://developers.google.com/style/inclusive-documentation> and <https://developers.google.com/style/word-list> —
  avoid ableist/violent terms; blocklist/allowlist; primary/replica.
- **[S9] APA Style — Bias-Free Language** — <https://apastyle.apa.org/style-grammar-guidelines/bias-free-language> —
  person-first vs identity-first; respectful, precise description.
- **[S10] IETF terminology shift (RFC 9309 robots.txt; draft-knodel-terminology "Terminology, Power, and
  Inclusive Language")** — <https://www.rfc-editor.org/rfc/rfc9309> — documented move away from master/slave,
  blacklist/whitelist.
- **[S11] Default branch `main` adoption (Git / GitHub / GitLab)** — <https://git-scm.com/> (and platform docs) —
  concrete industry adoption of neutral terminology.
- **[S12] Nielsen Norman Group — microcopy, error messages, buttons, empty states, deceptive patterns** —
  <https://www.nngroup.com/> (see error-message guidelines, form design, deceptive-design articles).
- **[S13] GOV.UK Design System & GOV.UK style guide** — <https://design-system.service.gov.uk/> and
  <https://www.gov.uk/guidance/style-guide> — verb buttons, descriptive links, plain English.
- **[S14] Apple Human Interface Guidelines — Writing** — <https://developer.apple.com/design/human-interface-guidelines/writing> —
  clear action-oriented controls; case conventions.
- **[S15] Material Design 3 — Content design / writing** — <https://m3.material.io/foundations/content-design/> —
  UI writing, sentence case, empty states.
- **[S16] Shopify Polaris — Content guidelines** — <https://polaris.shopify.com/content> — terminology
  consistency, concise labels, voice.
- **[S17] W3C WCAG 2.2 (Recommendation, Oct 2023)** — <https://www.w3.org/TR/WCAG22/> — 1.1.1 Non-text Content,
  1.3.1 Info and Relationships, 2.4.4 Link Purpose, 3.3.1 Error Identification, 3.3.2 Labels or Instructions,
  3.3.3 Error Suggestion.
- **[S18] Microsoft Writing Style Guide (top level)** — <https://learn.microsoft.com/style-guide/welcome/> —
  consistent product/feature terminology and mechanics.
- **[S19] Mailchimp Content Style Guide** — <https://styleguide.mailchimp.com/> — voice and tone, consistency.
- **[S20] The Chicago Manual of Style** — <https://www.chicagomanualofstyle.org/> — grammar, punctuation,
  serial comma, numbers.
- **[S21] The Associated Press Stylebook** — <https://www.apstylebook.com/> — journalistic style; no serial comma.
- **[S22] ISO 8601 Date and time format** — <https://www.iso.org/iso-8601-date-and-time-format.html> —
  unambiguous dates/times.
- **[S23] SEO title/description length — Google Search Central + Moz** —
  <https://developers.google.com/search/docs/appearance/title-link> and
  <https://moz.com/learn/seo/title-tag> — title ~50–60 chars, meta description ~150–160 chars.
- **[S24] W3C WAI — Images tutorial & headings** — <https://www.w3.org/WAI/tutorials/images/> —
  functional alt text, decorative images empty, logical heading structure.

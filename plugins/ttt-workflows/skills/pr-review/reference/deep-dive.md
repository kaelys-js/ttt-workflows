# pr-review — deep dive

Everything the skill does, end to end, in depth. Read top-to-bottom or jump in. For the exact
rule text see `rubric.md`; for the output schema see `output-format.md`; for platform auth
quirks see `platforms.md`.

## Contents

1. [The shape of a run](#1-the-shape-of-a-run)
2. [Preflight — the auth check](#2-preflight--the-auth-check)
3. [Fetching the PR (read-only)](#3-fetching-the-pr-read-only)
4. [What `pr.json` contains](#4-what-prjson-contains)
5. [First review vs re-review](#5-first-review-vs-re-review)
6. [Ticket-linked review](#6-ticket-linked-review)
7. [How the review is done — the rubric in full](#7-how-the-review-is-done--the-rubric-in-full)
8. [The two checks most tools skip](#8-the-two-checks-most-tools-skip)
9. [Findings: the anatomy of one](#9-findings-the-anatomy-of-one)
10. [Anchoring: why a line number is never stale](#10-anchoring-why-a-line-number-is-never-stale)
11. [Severity, labels, and the verdict rule](#11-severity-labels-and-the-verdict-rule)
12. [Rendering the comment](#12-rendering-the-comment)
13. [The refusal gate](#13-the-refusal-gate)
14. [Big diffs and honest coverage](#14-big-diffs-and-honest-coverage)
15. [Voice and comment craft](#15-voice-and-comment-craft)
16. [What it never does](#16-what-it-never-does)
17. [Files, data, and where things live](#17-files-data-and-where-things-live)
18. [Failure modes & troubleshooting](#18-failure-modes--troubleshooting)

---

## 1. The shape of a run

```text
preflight → fetch → read → review → self-verify → render → hand over
```

Only the last step produces something you act on; everything before it is read-only. Two
scripts bracket the work and are fully deterministic — `fetch-pr.mjs` (URL → `pr.json`) and
`render-review.mjs` (`findings.json` → the comment). The judgment in the middle (what's a bug,
how bad, what's the fix) is the model's, but it is fenced on both sides by mechanical checks:
the fetch can't invent a diff, and the renderer refuses to emit anything that doesn't line up
with that diff. That fencing is what keeps a language model's review trustworthy.

## 2. Preflight — the auth check

`preflight.mjs [--platform github|ado]` runs first. It verifies `node`, then the credential
for the platform the PR lives on (`gh auth status` for GitHub, an `az` account for Azure
DevOps), and reports the optional ClickUp token. If anything required is missing, it prints the
exact fix — the login command or the file path + env var — and exits non-zero. The review
does not start until it's clean. This is why you never get a cryptic failure three steps in:
the missing piece is named up front, with where to put it.

## 3. Fetching the PR (read-only)

`fetch-pr.mjs <url> --out pr.json` normalizes either platform into one JSON shape:

- **GitHub** — uses the `gh` CLI (so it inherits your `gh auth` and any enterprise host). It
  pulls the PR metadata, the unified diff, the changed-file list, and existing review threads.
- **Azure DevOps** — mints a short-lived bearer for the PR's tenant via `az account
  get-access-token` against the ADO resource GUID, then calls the ADO REST API for the same
  fields. Non-GitHub tenants need the `.git`-style host handling in `platforms.md`.
- **Ticket resolution** — if the PR body, title, or branch name references a ClickUp task
  (a `pk_`-style id or a `app.clickup.com/t/…` link), the ticket's name, status, and
  description are fetched (needs `CLICKUP_TOKEN_FILE`) and attached.

Every call is a GET. No label, comment, status, or merge state on the PR is ever written.

## 4. What `pr.json` contains

The normalized record the review reads:

| field | what it is |
| --- | --- |
| `platform` | `github` or `ado` |
| `owner`/`org`, `repo`, `number` | identity of the PR |
| `title`, `body` | the PR's own description — a *claim* to be verified, never trusted as fact |
| `headSha` | the commit the review is pinned to; deep links target this SHA |
| `diff` | the unified diff, hunk by hunk |
| `files[]` | changed-file list with per-file add/delete counts |
| `additions`/`deletions` | totals, for the scope chip |
| `threads[]` | existing review threads — the signal for re-review |
| `ticket`, `tickets[]` | linked ClickUp task(s), when resolvable |

Keeping this as one file means the review logic is identical across platforms; only the fetcher
and renderer know platform specifics.

## 5. First review vs re-review

Decided from `pr.json.threads`:

- **First review** — no prior comments from this reviewer. The whole diff is examined.
- **Re-review** — your earlier comments are already on the PR. Only the changes since your last
  pass are examined; what the author fixed is acknowledged explicitly; settled points are not
  reopened; and no new unrelated asks are injected late (that's review churn, and it's a
  rubric violation, not a courtesy). Each round is saved as
  `findings-<platform>-<repo>-<pr>.json`; the next round reads the prior file and diffs against
  it, so a resolved finding becomes an acknowledgement rather than a repeat.

## 6. Ticket-linked review

When `pr.json.ticket` is present, one question is added before any code judgment: **does this
change do what the ticket asked?** The change is compared against the ticket's description and
acceptance criteria — not just the PR body, which can overstate or drift. A PR can be clean,
correct code that solves the wrong problem; this is the check that catches it. A gap between
ticket and code is reported as a finding like any other.

## 7. How the review is done — the rubric in full

Every changed line is read (only lockfiles, generated code, and bulk data are skimmed), in
priority order so the highest-altitude problems surface first:

design → correctness → security → tests → API → readability → performance → docs

The rules (`rubric.md` has the authoritative text, R1–R15):

- **R1 Verify before commenting** — every finding traces to lines actually read; cite `file:line`. No "this looks like it might" dressed as a bug.
- **R2 Refute before keeping** — try to disprove each finding first; assume false-positive until you fail to refute it. Unsure → downgrade to a `question`.
- **R3 Label everything** — `praise` / `nitpick` / `suggestion` / `issue` / `question` / `todo` / `note`, plus `(blocking)` / `(non-blocking)`. One concern per comment.
- **R4 Priority order** — start from intent (what the change is *supposed* to do), then design, correctness, security, tests, API, readability, performance, docs.
- **R5 Security** — secrets committed; injection across every input vector; authN + object-level authZ on new endpoints (IDOR / privilege escalation); server-side validation; supply-chain (every new/bumped dep gets an existence + provenance check); PII in logs; fail-closed not fail-open.
- **R6 Tests by intent** — assertions must encode *why* behaviour matters; a test that can't fail when the logic changes is worthless. Demand edge/negative cases; reject snapshot noise and "asserts no error."
- **R7 Re-review etiquette** — review only the incremental diff; acknowledge what was addressed; don't reopen settled points or add late unrelated asks.
- **R8 Anti-patterns** — no bikeshedding what a linter governs; no nit-flooding; no vague "feels off"; don't block on preference dressed as a defect; don't gate on pre-existing problems.
- **R9 Never touch the PR** — read-only; the deliverable is a comment you paste.
- **R10 Voice** — write like a person: ration em-dashes, kill filler intensifiers, vary structure, no templated pep sign-offs, functional emoji only.
- **R11 Behaviour + currency** — see §8.
- **R12 Signal over noise** — one verified blocker beats ten nitpicks; drop what you couldn't confirm, or mark it low-confidence separately.
- **R13 Scan-first** — a one-line verdict + severity tally + one-row-per-finding table, then depth on demand; order by altitude and by blocking-first.
- **R14 AI-authored lens** — see §8.
- **R15 Comment craft** — comment on the code not the author; carry the *why*; real questions only; put clarity in the code, not the review thread; unblock on genuinely minor things.

## 8. The two checks most tools skip

**Behaviour (R11).** The PR description is a hypothesis, not a fact. The review states, in its
own words, what the code *actually* does, then diffs that against what the PR body, commit
message, and ticket *claim*. A "fixes X" that only half-fixes X, a metric that never fires, a
dimension described as handled that the code leaves unset — each is a defect, flagged like any
bug. Where feasible it exercises the real surface (reads the test that covers it, resolves the
ID/URL) rather than reasoning in the abstract.

**Currency (R11) and the AI-authored lens (R14).** The change is judged against best practice
as of the review's own month — verified against the vendor's or library's current docs, not
memory. Deprecated APIs, superseded patterns, outdated model IDs, old CI idioms get called out
with the date and source. When the diff is AI-authored (an attribution trailer, the author says
so, or it's obvious), scrutiny goes *up*, not down: 2026 data puts AI-authored PRs at a
markedly higher defect rate under a clean-looking surface. Extra checks — intent-alignment
(plausible ≠ requested), dependency existence + provenance (hallucinated package names recur and
get pre-registered by attackers), API reality (called methods exist in the *pinned* version),
and over-engineering (speculative abstractions, config nobody asked for). Polish earns more
scrutiny, not a pass.

## 9. Findings: the anatomy of one

Each finding in `findings.json` (schema in `output-format.md`) carries: a `severity`
(`blocking` / `non-blocking`), a `label` (R3), a `confidence`, a short `headline`, the
`file` + `line`, an `anchor_snippet` (see §10), the `problem` (what + why, one concern), and a
concrete `fix` — ideally a code-suggestion block the author can apply directly. A blocking
finding **must** carry a fix; the renderer refuses one that doesn't.

## 10. Anchoring: why a line number is never stale

This is the mechanism that makes an LLM review safe to trust on specifics. For every finding
inside a diff hunk, `anchor_snippet` is a substring of that exact line. Before rendering,
`render-review.mjs`:

1. confirms the finding's `file` is actually a changed file of the PR;
2. locates the cited `line` in the fetched diff;
3. checks the line **contains** `anchor_snippet`.

If any check fails, it **refuses to render**. So a hallucinated line, a number that drifted
after a rebase, or a finding on an untouched file cannot ship — the tool would rather emit
nothing than point at a line that isn't there. For anchors on context lines outside the hunks,
the renderer can only warn; the review's self-verify step confirms those against head.

## 11. Severity, labels, and the verdict rule

Two severities only — `blocking` and `non-blocking` — so there's never ambiguity about what
holds a merge. The verdict is derived, not chosen:

- any `blocking` finding → **request-changes**
- else `non-blocking` findings that matter → **comment**
- else → **approve**

Correctness and security concerns are the default blockers; preference is never a blocker
(that's R8). Pre-existing problems are flagged separately and never gate the PR.

## 12. Rendering the comment

`render-review.mjs findings.json --pr pr.json` builds the paste-ready block, platform-tailored:

- **GitHub** — collapsible `<details>` per finding; file deep-links target the head SHA
  (`blob/<sha>/path#Ln`).
- **Azure DevOps** — flat numbered sections (ADO markdown doesn't render `<details>`);
  deep-links use ADO's `?path=…&version=GC<sha>&line=n` form.
- A **scope chip** (`N files · +A −D`) and, when a ticket resolved, a **ticket line** (id,
  status, name, and any sibling tickets) are added from `pr.json`.

The layout is scan-first (R13): verdict → tally → one-row-per-finding table → full detail below,
ordered blocking-first. The renderer is deterministic — same inputs produce byte-identical
output, which the selftest checks.

## 13. The refusal gate

`render-review.mjs` exits non-zero — emits nothing — on any of:

- AI attribution anywhere in the text (`Co-Authored-By`, "Generated with", `noreply@anthropic`, 🤖);
- a decorative emoji (only the functional legend set is allowed);
- a `blocking` finding with no `fix`;
- a `low`-confidence finding marked `blocking`;
- a missing `headline` or an invalid `label`;
- a finding on a file not in the PR, or an `anchor_snippet` that isn't on the cited line.

You never hand-edit the block to get past the gate — you fix `findings.json` and re-render.
That's what makes the gate meaningful.

## 14. Big diffs and honest coverage

Past roughly 400–500 changed lines, review rigor measurably drops, and past ~2000 lines the
whole diff won't sit in context at once. The skill works the diff file-by-file (pulling each
file's hunks from `pr.json` in turn) and states in the `coverage` field where it focused and
what got lighter treatment. It never implies uniform depth over an oversized diff — an honest
"I focused here, skimmed there" beats a false clean bill.

## 15. Voice and comment craft

R10 + R15 govern how a finding is said, because that decides whether it lands in one round or
spawns a thread. Comment on the code's property, not the author ("the concurrency model adds
complexity without a measured benefit," not "why did you use threads"). Every comment carries
the *why* — the principle or consequence — so it teaches and the fix lands without a second
round. Genuine uncertainty is a real `question`; a demand dressed as a question is not. If
something needs explaining, the ask is clearer code or a code comment in the repo, not an
explanation that lives only in the review thread. And the prose reads like a person wrote it:
em-dashes rationed, filler intensifiers cut, rule-of-three symmetry broken, no templated
sign-offs.

## 16. What it never does

No `gh pr review` / `comment` / `edit` / `merge` / `ready`; no ADO thread or vote writes; no
write API calls of any kind. No AI attribution. No blocking on lint (a formatter's job) or on
problems that pre-date the PR. The only outputs are `pr.json`, `findings.json`, and the rendered
block — and you post it.

## 17. Files, data, and where things live

| file | role |
| --- | --- |
| `scripts/preflight.mjs` | checks `gh`/`az` (+ optional ClickUp); names what's missing and where |
| `scripts/fetch-pr.mjs` | URL → `pr.json` (read-only) |
| `scripts/render-review.mjs` | `findings.json` → paste-ready block; enforces the refusal gate |
| `scripts/selftest.mjs` | regression battery: render fixtures on both platforms, determinism, every refusal, the anchor gate |
| `reference/rubric.md` | R1–R15 in full |
| `reference/output-format.md` | the `findings.json` schema + templates + plain-language rules |
| `reference/platforms.md` | GitHub/ADO auth, URL shapes, troubleshooting |

Working files (`pr.json`, `findings.json`, each round's `findings-*.json`) live in a scratch
dir, never in the reviewed repo.

## 18. Failure modes & troubleshooting

- **Fetch fails on GitHub** → `gh auth status`; re-login if expired. Enterprise host? see `platforms.md`.
- **Fetch fails on Azure DevOps** → you're not logged into the PR's tenant; `az login --tenant <id>` (or set `AZURE_CONFIG_DIR`).
- **Renderer refuses** → read the message; it names the exact finding + rule. Fix `findings.json`, re-render. Never edit the output by hand.
- **Ticket didn't resolve** → `CLICKUP_TOKEN_FILE` isn't set or the PR doesn't name a task; the review proceeds without the AC check and says so.
- **Diff too large** → expect a `coverage` note; ask for a re-run focused on specific files if you need deeper treatment there.

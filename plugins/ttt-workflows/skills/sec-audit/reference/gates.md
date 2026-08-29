# sec-audit gates

`security-pocs/AGENTS.md` is THE LAW; this indexes and sequences it. Read it in full
before any mode. Six hard human-gates are never crossed autonomously — they are the
whole reason security work is gated.

## The six hard human-gates (never crossed without explicit approval)

1. **Private-first (SR1).** No public issue, PR title, branch name, or screenshot ever
   carries finding detail. Draft privately; migrate to a private GHSA before circulation.
2. **Throwaway-only (SP5).** A PoC deploys ONLY to a throwaway subscription/tenant —
   never production, never anything sharing a client id / tenant / database. It never
   points at a client's running environment.
3. **Mandatory teardown (SP2).** Every `up` has its `down`; infra is verified gone.
4. **Never push to a client default branch (SRP1).** Fixes land on `security/<sec-nn>`.
5. **Never auto-merge (SRP10).** The workflow opens the PR; a human merges — even if the
   ruleset permits admin-merge.
6. **Provenance before run (SP1).** The pinned evidence's sha256 is verified before any
   PoC executes; a hand-copied snapshot proves nothing.

Everything before the operator's approval is read-only. Anything that writes to a client
repo, opens a PR, touches ClickUp, or stands up infra is gated behind explicit approval
and (for ClickUp / PR steps) the dry-run-default pattern.

## Evidence tiers (SR3/SR4/SR5/SR11 — state explicitly on every finding)

- **Confirmed in source** — "I traced X and confirmed Y at `<sha>`", `file:line` cited.
- **Deployment-dependent** — "this reads as though / depends on running state"; list the
  exact deployment questions that move the rating. Terraform in the repo is not proof of
  running infra.
Never present the second tier as the first. A visible stand-down (SR5) beats a confident
bug.

## Voice (SR11)

Advisories read like a person: ration em-dashes, cut filler intensifiers, no decorative
emoji, no nit-flooding. An advisory is a record, not a chat message. `advisory-lint.mjs`
enforces this plus the attribution + private-first checks mechanically.

## Chain reciprocity (SR12)

Every `SEC-nn` cross-reference is bidirectional; `scripts/check-chains.sh` (in the repo)
audits it — run it, don't reimplement it.

## Coverage honesty (SFP8)

Every sweep ends with a coverage claim in the exact shape "N surfaces, M rules, K hits,
J triaged, C confirmed, S stood down, U un-triaged (reason)". `coverage-claim.mjs`
validates the shape so "covered everything" can never be silent truncation.

## No AI attribution

No `Co-Authored-By` / "Generated with" / model or vendor names / robot emoji in any
advisory, PR body, commit, or ClickUp comment. `advisory-lint.mjs` refuses a contaminated
body. (Note: the repo's own AGENTS.md SRP5 line still shows a `Co-Authored-By: Claude`
author convention — that is the repo's law; sec-audit's own outputs carry no attribution,
and where the two conflict for sec-audit-authored content, no-attribution wins.)

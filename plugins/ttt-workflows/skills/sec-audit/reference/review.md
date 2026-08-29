# review mode — Security Review Protocol (SR1–12)

Assess a target for vulnerabilities and produce a scored, private finding. The LAW is
`security-pocs/AGENTS.md` "Security Review Protocol" — read it in full; this sequences
it. Wherever wording differs, AGENTS.md wins.

## Contents
- Inputs
- The sequence (SR1–12)
- Evidence tiers
- Chain reciprocity
- Output

## Inputs

A resolved `target.json` (from `resolve-target.mjs`). Findings anchor at the recorded
`sha`; every claim cites `file:line` at that pinned SHA (SR3), never a moving branch.

## The sequence

1. **Trace at a pinned SHA (SR3).** Read the whole path — exports, callers, the
   verifier AND the controller that trusts it. Trace end-to-end before rating.
2. **State worst-plausible (SR4).** Assume the surface is reachable and nothing in
   front already neutralizes it; then list the exact deployment questions that would
   move the rating (edge/WAF, network posture, storage tier, whether a dangerous env
   value can reach a live host). Terraform in the repo is not proof of running infra.
3. **Refute (SR5).** Try to DISPROVE each finding; re-check against the pinned library
   version actually deployed, not latest docs. A finding that does not hold is re-rated
   in place with the verification shown ("stood down on the deployed version, here's
   why") — never silently dropped. A visible stand-down beats a confident bug.
4. **Score (SR2).** Stable `SEC-nn`, affected component + exact commit, private repro,
   impact, remediation. **CVSS 4.0** vector (3.1 only if a consumer requires it); mark
   "proposed — ratify in advisory" when deployment could move it, never a fabricated
   precise number. Map the finding to its **CWE** (methodology.md).
5. **Private-first (SR1).** Never a public issue / PR title / branch / screenshot.
   Draft privately; migrate into a private GitHub Security Advisory (GHSA) before it
   circulates. This is a HARD gate (gates.md).
6. **Route + clock (SR6, SR7).** Named owner (CODEOWNERS / relationship owner) and an
   SLA tied to severity: Critical 24–72h · High ≤7d · Medium ≤30d · Low ≤90d.
7. **OWASP 2025 checklist (SR8).** Secrets; injection across every vector; authN +
   object-level authZ (IDOR/priv-esc); token hygiene (issuer/audience/tenant pinning,
   identity on immutable `oid`/`sub` not a mutable email, explicit `algorithms`
   allow-lists); server-side validation; network posture; supply chain; PII in
   logs/errors; every failure fails closed.
8. **Front door (SR9).** Client-facing repos carry `SECURITY.md` + `security.txt`
   (RFC 9116, `/.well-known/`).
9. **Decision record (SR10).** Fix → ADR; owner defers → dated risk-acceptance record
   with owner + expiry.
10. **Voice (SR11).** Evidence tiers explicit; no hunch inflated to a confirmed bug; no
    nit-flooding; advisory reads like a person (ration em-dashes, cut filler, no
    decorative emoji). Run `scripts/advisory-lint.mjs` on the advisory body.
11. **Chains (SR12).** Individually-rated findings often compose. See below.

## Evidence tiers (state explicitly, every finding)

"I traced X and confirmed Y at `sha`" (confirmed-in-source) ranks above "this reads as
though / depends on deployment" (deployment-dependent). Never present the second as the
first. Reachability findings especially: source shows code + config, not running state.

## Chain reciprocity (SR12)

If A's record names B as an amplifier, B's record names A — bidirectional, same short
paragraph on both ends. Chain paragraph states: roles (entry / amplifier / sink /
collapse), composition ("A + B = capability none alone provides"), effective severity,
fix order, independence claim. CVSS 4.0 Subsequent-System metrics (`SC`/`SI`/`SA`) score
the composite; publish a separate "chain finding" GHSA when the composite crosses a
severity class. The repo's `scripts/check-chains.sh` audits reciprocity — run it.

## Output

A finding record (private advisory + POC stub) to the disclosure standard: summary ·
CVSS 4.0 vector · CWE · affected component + exact commit · evidence tiers · chain links
· owner · SLA. Nothing public. `advisory-lint.mjs` must pass before the record is shared.

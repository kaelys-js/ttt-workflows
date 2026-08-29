# sweep mode — Systematic Finding Protocol (SFP1–12)

Find NEW `SEC-nn` candidates across a target. Hybrid: scripted layer for
discovery/enumeration, agent layer for triage/verification/chain-inference. The LAW is
`security-pocs/AGENTS.md` "Systematic Finding Protocol" — read it in full.

## Contents
- Two layers (SFP1)
- The eight categories (SFP2)
- Tools (SFP3)
- Deep-read per surface (SFP12)
- Coverage claim (SFP8)
- The workflows this mode drives
- Output

## Two layers (SFP1)

Scripted layer finds *shapes* (`cors()` with no config, `jwt.sign(x, sharedSecret)`,
`localStorage.setItem('...token...')`) → `discovery/candidates.jsonl`. Agent layer
decides whether the shape *bites* (deployment context, chain composition, real impact)
→ `pocs/secXX-poc/` stubs + disclosure records. Ship both, skip neither. Hand-off is one
JSONL line per candidate: `{rule, file, line, evidence, severity_guess, sha}`.

Each scripted hit becomes an agent-triage sub-agent using the template at
`docs/agent-triage-prompt.md` (SFP5): five evidence tiers, refute-first frame, multi-file
trace, composition awareness. After the flat list is triaged, a dedicated chain-inference
sub-agent runs one pass across all confirmed findings (SFP6). Adversarial verify runs on
EVERY candidate, not just interesting ones (SFP7) — lightweight for LOW (recompute
sha256 + re-read the pinned lines + one alternative interpretation), heavier for HIGH.

## The eight categories (SFP2) — every full sweep, in order

1. **Secrets** — `gitleaks`, `trufflehog` (tree + history). 2. **Dependencies** —
`osv-scanner`, `npm audit --json`, `pip-audit` (reachability). 3. **IaC posture** —
`checkov`, `tfsec`, `trivy config` (declared vs deployed, SR4). 4. **Auth** — `semgrep`
auth ruleset (algorithm allow-lists, `oid`/`sub` vs `email`, redirect allow-lists, PKCE;
trace every `sign`+`verify` to the same key). 5. **Transport/headers** — CORS/CSP/HSTS/
frame/content-type/cookie flags (does an edge gate inject them?). 6. **Storage/data at
rest** — DB access model, blob CORS, Key Vault posture, PII in logs. 7. **Input
handling** — upload size/type, injection (SQL/command/path/template), deserialization,
XXE. 8. **CI/CD gates** — branch protection, required reviews, CODEOWNERS, CI scanning,
`security_and_analysis`. Skipping a category is allowed ONLY with a stated reason (SFP8).

## Tools (SFP3, pinned)

`semgrep>=1.90`, `gitleaks>=8.20`, `trufflehog>=3.90`, `checkov>=3.2`, `tfsec`,
`osv-scanner>=1.9`, `trivy>=0.55`, `gh>=2.60`+`jq`. Missing tools are logged as SKIPPED,
never fabricated as "clean" (SR11+SFP8). The orchestrator is `scripts/find-findings.sh`;
custom rules live in `rules/semgrep/` (SFP4) — every shipped `SEC-nn` upstreams a rule
that would catch its regression (SFP9).

## Deep-read per surface (SFP12) — fires unconditionally, not only on tool hits

Tool shapes miss semantic composition. Per HTTP app: auth + storage/supply-chain
deep-read. Per IaC module: an IaC deep-read. Per repo: a delivery-gate deep-read. Once
per pass: a cross-repo parity deep-read. Once at the end: the SR12 chain-inference pass.
Prompts in `docs/deep-read-prompts/`, orchestrated by `workflows/sfp-deep-read.js`.

## Cadence (SFP10) + output layout (SFP11)

Full sweep on every merge to default (CI job); stratified single-category sample weekly;
quarterly agent-panel spot-check with the full triage prompt (catches scripted-layer
drift). Output layout (SFP11): `discovery/candidates.jsonl` (gitignored, regenerated),
`discovery/coverage.md` (committed), `rules/semgrep/*.yaml` (committed),
`docs/agent-triage-prompt.md` (committed), `scripts/find-findings.sh` (committed).

## Coverage claim (SFP8) — honest by construction

Every sweep ends with `discovery/coverage.md`: "N surfaces swept, M rules applied, K raw
hits, J triaged, C confirmed, S stood down, U un-triaged (with reason)". Un-triaged is
non-zero on any real sweep — state it. Deep-read left un-run is its own line. Validate
the claim's shape with `scripts/coverage-claim.mjs`.

## The workflows this mode drives (Workflow tool; multi-agent opt-in required)

- `workflows/sfp-triage.js` — one triage agent per candidate (refute-first, SR3/4/5/11
  tiers, multi-file trace, composition awareness).
- `workflows/sfp-deep-read.js` — ~45 agents fanned out per surface, batched ~10, single
  SR12 pass at the end. ~5-10 min, ~500k-1M tokens — proportionate to coverage.
Both write verdicts to `discovery/*.jsonl`. Main context reconciles proposed `SEC-nn`
ids against the disclosure at author time.

## Output

`discovery/candidates.jsonl` (gitignored, regenerated), `discovery/coverage.md`
(committed), `pocs/secXX-poc/` stubs, new `rules/semgrep/*.yaml`, and the SR12 chain
paragraphs. Framed against PTES intelligence-gathering + vuln-analysis and OWASP WSTG
coverage (methodology.md).

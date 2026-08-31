# poc mode — Security POC Protocol (SP1–9)

Build or run a proof-of-concept that demonstrates a finding to a skeptic. This file is the Security POC Protocol for this skill — self-contained. A PoC whose
evidence can't be re-derived is a demo, not proof.

## Contents
- Inputs + the template contract
- The sequence (SP1–9)
- Hard safety gates
- Output

## Inputs + the template contract

A `SEC-nn` with a finding record. Every PoC starts from `reference/poc.md` (SP7)
— the `run-poc.sh` skeleton, `evidence.lock`, `fetch-evidence.sh`, README standard,
`SECURITY.md`, `security.txt`, advisory + CVSS rubric, severity→SLA table. Do NOT
reinvent the harness per finding; improve the template and migrate.

The build/verify workflows already exist in the repo — drive them, don't reimplement:
- `reference/poc.md` (and `sfp-build-poc-batch.js`) — stamp + build a PoC.
  Multi-agent; needs the operator's explicit multi-agent opt-in per run.
- `scripts/materialize-poc.py`, `scripts/fetch-fresh-src.sh` — materialize + fetch
  pinned evidence.

## The sequence

1. **Evidence by provenance, not copy (SP1).** Pull evidence from the canonical repo
   at an exact commit SHA and verify a recorded `sha256` — that is the chain of custody.
   Store only a pointer (`repo@commit@path` + checksum) in `evidence.lock`; fetch on
   demand; gitignore the cache. A hand-copied snapshot silently drifts and proves nothing.
2. **One command, full cycle, always tears down (SP2).** `./run-poc.sh` with no args:
   verify → up → attack → fix-demo → down. Same stages as sub-commands. Teardown
   (`docker compose down -v`, `terraform destroy`) is mandatory, idempotent, never
   skipped — a PoC that leaves infra running is a live cost and exposed surface.
3. **State the model, name what it can't prove (SP3).** When a local model stands in
   for the real system (Docker networks modelling Azure reachability, a mock IdP), say
   so in one breath and point at the thing that proves the rest (pinned real Terraform,
   a genuine signed token).
4. **Prove consequence AND fix (SP4).** Demonstrate the exploit (read / wipe /
   impersonate) AND the remediation blocking the same actor. A finding without a shown
   fix is half a record.
5. **Least harm, throwaway only (SP5).** Real-infra modes deploy ONLY to a throwaway
   subscription/tenant — never production, never anything sharing a client id / tenant
   / database with it. Any "leaked" credential in the repo is obviously synthetic and
   labelled. No real secret committed; the PoC never points at a client's running env.
   HARD gate (gates.md).
6. **Reproducible + self-contained (SP6).** Documented tooling only; pin images by
   tag/digest; seed deterministic data so the same command yields the same observable
   result every run (N rows dumped, `DELETE N` → `0 rows`, `BLOCKED`).
7. **README to the disclosure standard (SP8).** Faithfully from the private advisory,
   no detail dropped: summary · severity + CVSS vector · component + exact commit ·
   one-command repro · what you'll see · the model/layer explanation (SP3) · the fix ·
   provenance block (SP1) · scope + safety · footer mapping PoC → GHSA + SLA.
8. **Adversarial review before trust (SP9).** A second agent tries to refute the result
   — the exploit didn't really run, the checksum wasn't really checked, the teardown
   didn't really happen — before the finding is reported confirmed. Scale to the build;
   a one-line fix needs no panel.

## Hard safety gates (never crossed autonomously)

- **Throwaway only (SP5)** — no PoC ever points at a client's running environment or a
  shared tenant/db/subscription.
- **Mandatory teardown (SP2)** — every `up` has its `down`; verify infra is gone.
- **Provenance verified (SP1)** — sha256 of the pinned evidence checked BEFORE any run.

## Output

A `sec-audit`-stamped PoC dir with `run-poc.sh`, `evidence.lock`, driver + mock, a
disclosure-standard README, and the adversarial-review verdict. When planning only
(not running throwaway infra), stamp the dir + draft the README and STOP before `up`.

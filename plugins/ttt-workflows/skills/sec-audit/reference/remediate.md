# remediate mode — Systematic Remediation Protocol (SRP1–32)

Fix a finding on a client repo following coordinated-disclosure discipline — the mirror
of the find side. This file is the Systematic Remediation Protocol (SRP1–32) for this skill — self-contained.

## Contents

- The driver
- The sequence (SRP1–11 core)
- The auto-repair loop (SRP13–20)
- Config (SRP12, SRP28)
- Hard human-gates
- Output

## The driver

`reference/remediate.md` (via the Workflow tool) + `scripts/fix-finding.sh` /
the remediation loop (driving standard git/gh). Multi-repo: one
driver run per repo (SRP30). Multi-app monorepo discovery handled (SRP31). Multi-ecosystem
discovery via SRP-BB (SRP21). Follow this protocol.

## The sequence (core)

1. **Fix on a branch, never on default (SRP1).** `security/<sec-nn>-<slug>` (or the
   repo's own convention — surface it, follow it). Never push to main/develop/master.
2. **Follow the client's PR style (SRP2).** Sub-agent reads the last 5-10 merged PRs
   (`gh pr list --state merged --limit 10` + `gh pr view`) → match voice, section shape,
   labels, reviewers, commit convention. This repo's voice does not go on the client repo.
3. **SR1 discipline in the PR body (SRP3).** The PR describes the FIX, not the exploit.
   Never paste forged tokens / exploit strings / private GHSA detail; reference the
   advisory by ID.
4. **CVSS + test plan (SRP4).** Cite the proposed CVSS 4.0 vector; include a regression
   test that fails without the fix. After merge, the POC's `check-upstream` should DRIFT
   and every `verify-*` layer STAND-DOWN on patched source.
5. **Signed commits when required (SRP5).** Detect ruleset via
   `gh api repos/OWNER/REPO/rules/branches/<default>`; `git commit -S` if required, else
   unsigned + a loud log line (never hide the fallback).
6. **Adversarial review before opening (SRP6).** A second agent: does it actually close
   the finding? introduce a new one? break the client's public API? violate a client rule?
7. **Run the client's own tests (SRP7).** Detect via package.json/Makefile/pyproject/
   Cargo; run every candidate command. Tests fail → the PR does not open; log to
   `a fix log (scratch dir)`, no silent skip.
8. **Verify the finding stands down (SRP8).** Copy patched files into the POC evidence
   tree; run every `verify-*` layer that FAILed on vulnerable source — each must now
   STAND-DOWN (exit 0) or the fix is incomplete (block PR-open, log, restore, abort).
9. **ClickUp bidirectional link on PR-open (SRP9).** Transition the SEC-nn task to
   `SRP_STATUS_ON_PR_OPEN`; post the PR URL as a task comment; include the task URL in
   the PR body. Both directions.
10. **Never auto-merge (SRP10).** The workflow authors + opens the PR; merge is a human
    decision — even if the ruleset permits admin-merge. HARD gate (gates.md).
11. **Rollback plan required (SRP11).** Every PR body: revert command, operational
    impact of the revert, follow-up items (rotate the secret, invalidate the token).

## The auto-repair loop (SRP13–20)

When the client CI (Stage F) fails a patch, the driver does NOT accept it. It writes
`srp-fail-<sec>-a<N>.json` (prior bundle + failing command + stderr tail) and exits 66, so
main context re-invokes it in REVISE mode with `previous_attempt` context (SRP13). Bundle is `full_content`; adversarial reads the BUNDLE (SRP14). REVISE
auto-fetches test-runner config on config-shaped failures (SRP15). Attack-outcome
detection is POC-configurable (SRP19). Adversarial runs both semantic and full-content
passes over the bundle (SRP-FF + JJ, SRP22). Stage F discovers ALL
client verification, not just workflows (SRP16), and is authoritative over the advisory
verdict (SRP17). The loop fires on ANY stage 5-8 failure (SRP18), up to
`SRP_FIX_LOOP_MAX_ATTEMPTS` (default 5). On `--push-force` the PR body is regenerated
(SRP24). All docker-compose files are tracked so the bundle is complete (SRP25); the
bundle schema is unified across producers (SRP27). Goal: zero-touch across findings, not on the
first (SRP20).

## Config (SRP12, SRP28)

`the mode config` holds every knob (branch prefix, PR labels/title template, status IDs, test
command order, time estimates, CODEOWNERS auto-review request SRP23).
Nothing hardcoded per client — adding a client is one line. Any operator can clone + run
(SRP28). Terraform/infra fixes handled (SRP32); Prisma raw-SQL detect (SRP26).

## Hard human-gates (never crossed autonomously)

- **Never push to default (SRP1).** Branch only.
- **Never auto-merge (SRP10).** Human merges.
- **Tests + stand-down green before PR-open (SRP7, SRP8).** A failing patch does not
  open a PR.

## Output

A client-style fix PR on a `security/` branch, regression test included, CVSS + rollback
in the body, ClickUp bidirectionally linked, stand-down verified — opened, never merged.
When planning only, draft the branch diff + PR body and STOP before `gh pr create`.

# Professional audit methodology (the fold-in)

What established security-audit firms do, mapped onto this skill's four modes. The four
protocols (SR/SP/SFP/SRP) cover most of it; this file names the industry frameworks,
adds the steps they don't (threat modeling, DAST, standard-mapped reporting), and records
currency deltas. Judge every audit against best practice as of the audit's own date.

## Contents
- Frameworks + our crosswalk
- PTES 7 phases → our modes
- Threat modeling (added step)
- OWASP WSTG coverage
- DAST (throwaway-only)
- Reporting: CWE + CVSS + compliance crosswalk
- Currency deltas (recheck at run time)

## Frameworks + our crosswalk

The 2026 baseline: **PTES** (practitioner methodology), **OWASP WSTG v4.2** (91 web
test cases), **NIST SP 800-115** (documentation/authorization discipline for
compliance), **MITRE ATT&CK** (technique mapping), and the **SAST/DAST/SCA/IaC/secrets**
tool taxonomy. For an enterprise engagement: PTES overall, WSTG for web app components,
NIST 800-115 for compliance documentation.

## PTES 7 phases → our modes

| PTES phase | This skill |
|---|---|
| 1 Pre-engagement | scope from `target.json`; authorization is implicit in the operator's request |
| 2 Intelligence gathering | `sweep` scripted layer (`find-findings.sh`) |
| 3 Threat modeling | the added step below; `sweep` deep-read framing |
| 4 Vulnerability analysis | `sweep` agent triage + `review` (SR3-8) |
| 5 Exploitation | `poc` (SP4 consequence), throwaway-only |
| 6 Post-exploitation | `poc` chain demonstration (SR12 composite) |
| 7 Reporting | `review` scored advisory + GAP-LIST/executive brief; the reporting crosswalk below |

## Threat modeling (added step — audit firms do this; the protocols imply it via SR12)

Before deep analysis of a Tier-1 surface, run a lightweight agile threat model (30–60
min/surface, per 2026 practice): data flows, trust boundaries, assets, and the STRIDE
categories against each boundary. Output feeds the `sweep` deep-read prompts and the SR12
chain-inference pass. It is what turns "here are shapes" into "here is what an attacker
does" — the same reasoning that produced the SEC-02 nOAuth and the SR12 chains.

## OWASP WSTG coverage

For any HTTP-serving surface, walk the WSTG v4.2 categories: information gathering,
config/deploy management, identity management, authentication, authorization, session
management, input validation, error handling, cryptography, business logic, client-side.
Map each `sweep` category (sweep.md's eight) onto its WSTG cases so coverage is claimable
against a named standard, not ad hoc.

## DAST (throwaway-only, gated)

The protocols are source-first (SAST/SCA/IaC). Audit firms also run DAST — dynamic
testing against a running target. In this skill DAST is OPTIONAL and gated: it runs ONLY
against a throwaway deployment (SP5), NEVER a client's production or shared environment.
Correlate DAST findings back to the SAST/SCA/IaC source finding (who owns the fix). If no
throwaway target exists, DAST is a stated coverage gap (SFP8), not a silent skip.

## Reporting: CWE + CVSS + compliance crosswalk

Every finding carries: a **CWE** id (root-cause class), a **CVSS 4.0** vector (SR2), and
a mapping to the compliance frameworks the client answers to — **PCI DSS**, **ISO 27001**,
**SOC 2**, **FedRAMP/NIST** where relevant. The deliverable set: per-finding advisory
(private GHSA), the GAP-LIST (executive brief + technical + posture summary — the
an existing audit POC dir is the reference), coverage claim (SFP8), and ADR /
risk-acceptance records (SR10). Reports are standard-mapped, not a bag of bullets.

## Currency deltas (recheck at run time — best practice moves)

- **SSVC + CSAF.** The July 2026 four-nation joint CVD guidance adds SSVC
  (Stakeholder-Specific Vulnerability Categorization) as a triage framework and CSAF as
  the machine-readable advisory format. Consider SSVC alongside CVSS for prioritization;
  emit CSAF when a consumer wants machine-readable advisories.
- **Semgrep "Assistant" → "Multimodal"** (renamed 2026-03-19). The SFP5
  reference to "Semgrep Assistant" is the old name; the AI-triage layer is Multimodal.
- Verify tool versions (sweep.md SFP3) against current releases before a sweep; pin
  deliberately.

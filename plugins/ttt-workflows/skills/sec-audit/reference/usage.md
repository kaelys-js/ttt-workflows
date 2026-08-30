# sec-audit

A security audit that reads your code, your live Azure, and your identity setup — read-only.

**❯ Point me at a repo, PR, or folder** — then `sweep`, `review`, `poc`, or `remediate`.
You'll get one report: what's exposed, how bad, and how to fix it.

`options` — the three layers, coverage grids & flags

<details>
<summary><code>options</code></summary>

```
sec-audit — audit code + live Azure + identity/CI → one report (read-only)

USAGE
  sec-audit <mode> <target> [--known <file>] [--map <file>] [--remediated <ids>]

MODES
  sweep                full audit across all three layers
  review <finding>     score one finding (CVSS 4.0 + CWE) → private advisory
  poc SEC-nn           prove a finding with a throwaway PoC that self-tears-down
  remediate SEC-nn     write the fix as a PR (opened, never merged)

TARGET
  <repo-url>           GitHub or Azure DevOps repo
  <pr-url>             …/pull/N or …/pullrequest/N (scope = the diff)
  <path>               a local repo, folder, or single file

LAYERS               a sweep runs all three
  code                 auth, injection, mass-assignment, upload limits, IaC, dep CVEs
  azure                public DBs, weak TLS, Key Vaults, ACR admin, diagnostics
  entra + ci           app-reg login flaws, long-lived secrets, cleartext tokens

FLAGS                coverage vs a prior audit → found/remediated/gap grid
  --known <csv|json>   the prior findings (id,title,severity)
  --map <json>         {"<id>":"<regex>"} attribute a finding to your ID by evidence
  --remediated <ids>   comma list verified fixed live

AUTH
  node, git            required
  az login             live layers (Reader + Graph app-read + ADO bearer)
  semgrep gitleaks checkov osv-scanner trivy    code scanners (missing = reported)

EXAMPLES
  sweep https://github.com/org/repo
  sweep ./oms-be --known prior.csv --map map.json --remediated SEC-37,SEC-54
  review "USER can PATCH role=ADMIN" in ./oms-be
  poc for SEC-01

NEVER  changes anything until you approve · probes are GET-only · AI attribution
```
</details>

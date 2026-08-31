#!/usr/bin/env bash
# find-findings.sh — the scanner layer. Runs each security scanner that is on PATH over a
# scan root and aggregates hits into one JSONL file. Fully self-contained and agnostic:
# no workspace assumptions, no client data, no external repo. A missing scanner is logged
# as skipped (reported as not-covered), never silently ignored.
#
# Usage:
#   find-findings.sh --evidence <dir> [--out candidates.jsonl] [--category <name>] [--dry-run]
#
#   --evidence <dir>   scan root (a repo, folder, or file). Default: current directory.
#   --out <file>       output JSONL. Default: ./candidates.jsonl
#   --category <name>  run only one: secrets | deps | iac | sast
#   --dry-run          print the tool plan, run nothing.
#
# Scanners (any subset may be installed): gitleaks (secrets), osv-scanner (deps),
# checkov + trivy (IaC/container), semgrep (SAST). Nothing is auto-installed. The only
# network egress is whatever those tools already do (e.g. the OSV database query).
set -euo pipefail

SCAN_ROOT="."; OUT="./candidates.jsonl"; FILTER=""; MODE="run"
while [ $# -gt 0 ]; do
  case "$1" in
    --evidence) SCAN_ROOT="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --category) FILTER="$2"; shift 2 ;;
    --dry-run) MODE="dry-run"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "find-findings: unknown arg: $1 (try --help)" >&2; exit 2 ;;
  esac
done
[ -e "$SCAN_ROOT" ] || { echo "find-findings: scan root not found: $SCAN_ROOT" >&2; exit 1; }

: > "$OUT"
want() { [ -z "$FILTER" ] || [ "$FILTER" = "$1" ]; }
have() { command -v "$1" >/dev/null 2>&1; }
emit() { printf '%s\n' "$1" >> "$OUT"; }             # one candidate JSON object per line
note() { printf '   %s\n' "$*" >&2; }
skipped=()

echo "== scanner sweep — root=$SCAN_ROOT  filter=${FILTER:-all}  mode=$MODE  out=$OUT" >&2

run_tool() { # category tool json-cmd...
  local cat="$1" tool="$2"; shift 2
  want "$cat" || return 0
  if ! have "$tool"; then skipped+=("$tool ($cat)"); note "skip: $tool not installed"; return 0; fi
  if [ "$MODE" = "dry-run" ]; then note "would run: $tool over $SCAN_ROOT ($cat)"; return 0; fi
  note "run: $tool ($cat)"
  "$@" 2>/dev/null || true
}

# --- secrets --------------------------------------------------------------
run_tool secrets gitleaks bash -c \
  'gitleaks detect --source "'"$SCAN_ROOT"'" --report-format json --report-path /dev/stdout --no-banner 2>/dev/null \
   | python3 -c "import sys,json;
d=json.load(sys.stdin) if sys.stdin.readable() else []
[print(json.dumps({\"category\":\"secrets\",\"tool\":\"gitleaks\",\"file\":x.get(\"File\"),\"line\":x.get(\"StartLine\"),\"rule\":x.get(\"RuleID\"),\"desc\":x.get(\"Description\")})) for x in (d or [])]" >> "'"$OUT"'"'

# --- dependencies ---------------------------------------------------------
run_tool deps osv-scanner bash -c \
  'osv-scanner scan --format json -r "'"$SCAN_ROOT"'" 2>/dev/null \
   | python3 -c "import sys,json;
d=json.load(sys.stdin);
[print(json.dumps({\"category\":\"deps\",\"tool\":\"osv-scanner\",\"pkg\":p.get(\"package\",{}).get(\"name\"),\"id\":v.get(\"id\")})) for r in d.get(\"results\",[]) for p in r.get(\"packages\",[]) for v in p.get(\"vulnerabilities\",[])]" >> "'"$OUT"'"'

# --- IaC / container ------------------------------------------------------
run_tool iac checkov bash -c \
  'checkov -d "'"$SCAN_ROOT"'" -o json --compact 2>/dev/null \
   | python3 -c "import sys,json;
d=json.load(sys.stdin); d=d if isinstance(d,list) else [d];
[print(json.dumps({\"category\":\"iac\",\"tool\":\"checkov\",\"file\":c.get(\"file_path\"),\"rule\":c.get(\"check_id\"),\"desc\":c.get(\"check_name\")})) for blk in d for c in blk.get(\"results\",{}).get(\"failed_checks\",[])]" >> "'"$OUT"'"'
run_tool iac trivy bash -c \
  'trivy fs --quiet --format json "'"$SCAN_ROOT"'" 2>/dev/null \
   | python3 -c "import sys,json;
d=json.load(sys.stdin);
[print(json.dumps({\"category\":\"iac\",\"tool\":\"trivy\",\"target\":r.get(\"Target\"),\"id\":v.get(\"VulnerabilityID\") or v.get(\"ID\")})) for r in (d.get(\"Results\") or []) for v in (r.get(\"Vulnerabilities\") or [])+(r.get(\"Misconfigurations\") or [])]" >> "'"$OUT"'"'

# --- SAST -----------------------------------------------------------------
run_tool sast semgrep bash -c \
  'semgrep --config auto --json "'"$SCAN_ROOT"'" 2>/dev/null \
   | python3 -c "import sys,json;
d=json.load(sys.stdin);
[print(json.dumps({\"category\":\"sast\",\"tool\":\"semgrep\",\"file\":r.get(\"path\"),\"line\":r.get(\"start\",{}).get(\"line\"),\"rule\":r.get(\"check_id\")})) for r in d.get(\"results\",[])]" >> "'"$OUT"'"'

count=$(wc -l < "$OUT" | tr -d ' ')
echo "== $count candidate(s) → $OUT" >&2
[ ${#skipped[@]} -eq 0 ] || echo "== not covered (install to include): ${skipped[*]}" >&2

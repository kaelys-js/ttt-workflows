#!/bin/bash
# Preflight invariants, enforced on every pre-push:
#  1. CI == lefthook: the Checks workflow runs the full lefthook gate, and the containerized
#     web-e2e job exists — so every pre-push command is also exercised in CI.
#  2. No test input is hidden by .gitignore: every baseline / snapshot the suites read must be
#     git-tracked (a *.png ignored on disk would silently disable a visual-regression check).
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

# --- 1. parity ---
grep -q "lefthook run pre-push --all-files" .github/workflows/lint.yml \
  || {
    echo "PARITY: Checks workflow must run 'lefthook run pre-push --all-files'."
    fail=1
  }
grep -q "run-web-e2e.sh" .github/workflows/web-e2e.yml \
  || {
    echo "PARITY: web-e2e.yml must run the containerized website suite."
    fail=1
  }

# --- 2. no test input is ignored ---
required=(
  "packages/products/website/e2e/visual.spec.ts-snapshots/hero-light-desktop-linux.png"
)
for f in "${required[@]}"; do
  if ! git ls-files --error-unmatch "$f" > /dev/null 2>&1; then
    echo "GITIGNORE: '$f' is not git-tracked (hidden by .gitignore?). Un-ignore it."
    fail=1
  fi
done
# Any baseline / snapshot PNG that exists on disk but is ignored is a red flag.
while IFS= read -r p; do
  echo "GITIGNORE: '$p' exists but is git-ignored — a test input must be tracked."
  fail=1
done < <(git ls-files --others --ignored --exclude-standard \
  -- 'packages/products/website/e2e/**/*.png' 2> /dev/null)

[ "$fail" = "0" ] && echo "preflight: parity + gitignore invariants hold."
exit "$fail"

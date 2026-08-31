#!/usr/bin/env bash
# run-poc.sh — throwaway proof-of-concept for <SEC-nn>. Stands up only what it needs,
# proves the finding, and tears everything down. Re-derivable: same inputs → same evidence.
# NEVER touches shared/persistent infra. NEVER runs against a client default branch.
set -euo pipefail
echo "== PoC for <SEC-nn>: <one-line claim> =="
# 1. setup (throwaway only) ...
# 2. exercise the finding, capture evidence ...
# 3. assert the expected-vs-actual that proves it ...
trap 'echo "== teardown =="; : # remove anything created above' EXIT
echo "PASS: evidence re-derived (see README.md for the exact expected/actual)"

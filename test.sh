#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
./format.sh
exec python3 -B tests/run_suite.py "$@"

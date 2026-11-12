#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
# The format check needs clang-format 18; without it the tests still run.
status=0
./format.sh || status=$?
if [[ $status == 3 ]]; then
  echo 'Formatprüfung übersprungen, die Tests laufen trotzdem.' >&2
elif [[ $status != 0 ]]; then
  exit "$status"
fi
exec python3 -B tests/run_suite.py "$@"

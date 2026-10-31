#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
./build.sh
exec "$(python3 -B build_config.py directory)/fish" "$@"

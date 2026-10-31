#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
task_build_dir="$(python3 -B build_config.py directory)"
exec make -s -j"${BUILD_JOBS:-$(python3 -B build_config.py jobs)}" BUILD_DIR="$task_build_dir" SANITIZE="${SANITIZE:-0}" all

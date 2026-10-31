#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ "${SANITIZE:-0}" == 1 ]]; then task_build_dir="${BUILD_DIR:-bin-sanitize}"; else task_build_dir="${BUILD_DIR:-bin}"; fi
exec make -s -j"${BUILD_JOBS:-$(nproc 2>/dev/null || echo 4)}" BUILD_DIR="$task_build_dir" SANITIZE="${SANITIZE:-0}" all

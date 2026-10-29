#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
formatter="${CLANG_FORMAT:-clang-format-18}"
if ! command -v "$formatter" >/dev/null; then formatter="${CLANG_FORMAT:-clang-format}"; fi
if ! command -v "$formatter" >/dev/null || [[ ! $("$formatter" --version) =~ version\ 18\. ]]; then
  echo 'clang-format 18 benötigt; mit CLANG_FORMAT den Programmpfad setzen.' >&2
  exit 1
fi
mode=(--dry-run --Werror)
if [[ "${1:-}" == --write ]]; then mode=(-i); elif [[ $# != 0 ]]; then exit 2; fi
mapfile -d '' sources < <(find src colony-core tests ui -type f \( -name '*.cc' -o -name '*.hh' -o -name '*.js' \) -print0 | sort -z)
"$formatter" --style=file "${mode[@]}" "${sources[@]}"

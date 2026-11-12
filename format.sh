#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
formatter="${CLANG_FORMAT:-clang-format-18}"
if ! command -v "$formatter" >/dev/null; then formatter="${CLANG_FORMAT:-clang-format}"; fi
version_18() { command -v "$1" >/dev/null && [[ $("$1" --version) =~ version\ 18\. ]]; }
# On NixOS nix-shell supplies clang-format 18 for this one command.
if ! version_18 "$formatter" && [[ -z ${CLANG_FORMAT:-} ]] && command -v nix-shell >/dev/null; then
  formatter=$(nix-shell -p clang-tools_18 --run 'command -v clang-format' 2>/dev/null) || true
fi
# Exit 3: no clang-format 18 here. Other versions format differently, so they cannot check.
if ! version_18 "$formatter"; then
  echo 'clang-format 18 benötigt; mit CLANG_FORMAT den Programmpfad setzen.' >&2
  exit 3
fi
mode=(--dry-run --Werror)
if [[ "${1:-}" == --write ]]; then mode=(-i); elif [[ $# != 0 ]]; then exit 2; fi
mapfile -d '' sources < <(find src colony-core tests ui -type f \( -name '*.cc' -o -name '*.hh' -o -name '*.js' \) -print0 | sort -z)
sources+=(werkzeug/fischbau.mjs werkzeug/atelier.cc werkzeug/atelier_compiler.hh werkzeug/atelier_connections.hh)
"$formatter" --style=file "${mode[@]}" "${sources[@]}"

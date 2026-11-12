#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
version_18() { command -v "$1" >/dev/null && [[ $("$1" --version) =~ version\ 18\. ]]; }
formatter="${CLANG_FORMAT:-clang-format-18}"
if [[ -z ${CLANG_FORMAT:-} ]] && ! version_18 "$formatter"; then
  formatter=clang-format
  # NixOS has no clang-format 18 in PATH; take it from the system's nixpkgs.
  if ! version_18 "$formatter" && command -v nix-build >/dev/null &&
    package=$(nix-build '<nixpkgs>' -A llvmPackages_18.clang-tools --no-out-link); then
    formatter="$package/bin/clang-format"
  fi
fi
# Exit 3: no clang-format 18 here. Other versions format differently, so they cannot check.
if ! version_18 "$formatter"; then
  echo 'clang-format 18 fehlt. CLANG_FORMAT auf ein clang-format 18 setzen, unter Nix:' >&2
  echo "CLANG_FORMAT=\$(nix-build -I nixpkgs=channel:nixos-25.11 '<nixpkgs>' -A llvmPackages_18.clang-tools --no-out-link)/bin/clang-format ./test.sh" >&2
  exit 3
fi
mode=(--dry-run --Werror)
if [[ "${1:-}" == --write ]]; then mode=(-i); elif [[ $# != 0 ]]; then exit 2; fi
mapfile -d '' sources < <(find src colony-core tests ui -type f \( -name '*.cc' -o -name '*.hh' -o -name '*.js' \) -print0 | sort -z)
sources+=(werkzeug/fischbau.mjs werkzeug/atelier.cc werkzeug/atelier_compiler.hh werkzeug/atelier_connections.hh)
"$formatter" --style=file "${mode[@]}" "${sources[@]}"

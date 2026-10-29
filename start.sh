#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
./build.sh
task_opencl_requested=0
task_previous_arg=''
for task_arg in "$@"; do
  if [[ "$task_arg" == --benchmark-opencl || "$task_arg" == --compute=opencl* || ( "$task_previous_arg" == --compute && "$task_arg" == opencl* ) ]]; then task_opencl_requested=1; fi
  task_previous_arg="$task_arg"
done
if [[ "$task_opencl_requested" == 1 && -e /etc/NIXOS ]]; then
  export LD_LIBRARY_PATH="/run/opengl-driver/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  if [[ -z "${OCL_ICD_VENDORS:-}" && -z "${OPENCL_VENDOR_PATH:-}" ]]; then
    if [[ -r /run/opengl-driver/lib/libnvidia-opencl.so.1 ]]; then
      export OCL_ICD_VENDORS=/run/opengl-driver/lib/libnvidia-opencl.so.1
    elif [[ -d /run/opengl-driver/etc/OpenCL/vendors ]]; then
      export OCL_ICD_VENDORS=/run/opengl-driver/etc/OpenCL/vendors
    fi
  fi
  if [[ -z "${FISH_OPENCL_LIBRARY:-}" ]] && ! ./bin/fish --check-opencl-loader; then
    if command -v nix >/dev/null 2>&1; then
      if task_opencl_package="$(nix build --no-link --print-out-paths nixpkgs#ocl-icd)"; then
        export FISH_OPENCL_LIBRARY="$task_opencl_package/lib/libOpenCL.so.1"
        export LD_LIBRARY_PATH="$task_opencl_package/lib:$LD_LIBRARY_PATH"
      else
        printf '%s\n' 'OpenCL-Lader konnte nicht bereitgestellt werden; CPU-Rückfall.' >&2
      fi
    fi
  fi
fi
exec python3 -B viewer.py "$@"

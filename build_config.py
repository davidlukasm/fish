"""Shared build directory, CPU budget and compiler target detection."""

import hashlib
import math
import os
from pathlib import Path
import shlex
import subprocess
import sys


def build_directory(root):
    default = "bin-sanitize" if os.environ.get("SANITIZE") == "1" else "bin"
    directory = Path(os.environ.get("BUILD_DIR") or default)
    return directory if directory.is_absolute() else Path(root) / directory


def available_jobs():
    count = os.cpu_count() or 1
    if hasattr(os, "sched_getaffinity"):
        try:
            count = min(count, len(os.sched_getaffinity(0)))
        except OSError:
            pass
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()
        if quota != "max" and int(quota) > 0 and int(period) > 0:
            count = min(count, math.ceil(int(quota) / int(period)))
    except (OSError, ValueError):
        try:
            quota = int(Path("/sys/fs/cgroup/cpu/cpu.cfs_quota_us").read_text())
            period = int(Path("/sys/fs/cgroup/cpu/cpu.cfs_period_us").read_text())
            if quota > 0 and period > 0:
                count = min(count, math.ceil(quota / period))
        except (OSError, ValueError):
            pass
    return max(1, count)


def compiler_signature(command):
    # Verbose preprocessing reports the resolved native CPU/tuning options as well
    # as compiler version and target macros. No object or dependency file is written.
    probe = subprocess.run(
        [*command, "-v", "-dM", "-E", "-x", "c++", "-"],
        input="", capture_output=True, text=True, check=True,
    )
    macros = "\n".join(
        line for line in probe.stdout.splitlines()
        if not line.startswith(("#define __DATE__ ", "#define __TIME__ ",
                                "#define __TIMESTAMP__ "))
    )
    content = shlex.join(command) + "\n" + macros + "\n" + probe.stderr
    return hashlib.sha256(content.encode()).hexdigest()


if __name__ == "__main__":
    if sys.argv[1:] == ["directory"]:
        print(build_directory(Path(__file__).resolve().parent))
    elif sys.argv[1:] == ["jobs"]:
        print(available_jobs())
    elif sys.argv[1:3] == ["signature", "--"] and len(sys.argv) > 3:
        print(compiler_signature(sys.argv[3:]))
    else:
        raise SystemExit("Usage: build_config.py directory|jobs|signature -- CXX [flags]")

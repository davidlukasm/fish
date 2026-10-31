"""Build reuse, native target changes and quota-aware defaults."""

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build_config import available_jobs, build_directory


with patch.dict(os.environ, {}, clear=True):
    assert build_directory(ROOT) == ROOT / "bin"
    os.environ["SANITIZE"] = "1"
    assert build_directory(ROOT) == ROOT / "bin-sanitize"
    os.environ["BUILD_DIR"] = "custom engine"
    assert build_directory(ROOT) == ROOT / "custom engine"
    os.environ["BUILD_DIR"] = str(ROOT / "alternate")
    assert build_directory(ROOT) == ROOT / "alternate"


def budget(quota):
    return patch.object(Path, "read_text", return_value=quota)


with patch("os.cpu_count", return_value=32), patch("os.sched_getaffinity", return_value=set(range(8)), create=True):
    with budget("250000 100000"):
        assert available_jobs() == 3
    with budget("50000 100000"):
        assert available_jobs() == 1
    with budget("max 100000"):
        assert available_jobs() == 8

with tempfile.TemporaryDirectory(prefix="fish-build-") as temporary:
    project = Path(temporary)
    for name in ("Makefile", "build_config.py", "VERSION"):
        shutil.copy2(ROOT / name, project / name)
    (project / "tests").mkdir()
    (project / "tests/suite.py").write_text("print('')\n")
    (project / "src").mkdir()
    source = project / "src/probe.cc"
    source.write_text("int fish_build_probe() { return 42; }\n")
    compiler = project / "compiler"
    compiler.write_text(
        "#!/usr/bin/env python3\n"
        "import os,subprocess,sys\n"
        "args=sys.argv[1:]\n"
        "if '-dM' in args:\n"
        " p=subprocess.run(['c++',*args],input=sys.stdin.buffer.read(),capture_output=True)\n"
        " sys.stdout.buffer.write(p.stdout)\n"
        " print('#define FISH_TEST_CPU_TARGET '+os.environ['FISH_TEST_CPU_TARGET'])\n"
        " sys.stderr.buffer.write(p.stderr);sys.exit(p.returncode)\n"
        "os.execvp('c++',['c++',*args])\n"
    )
    compiler.chmod(0o755)
    target = project / "bin/obj/src/probe.o"
    environment = {**os.environ, "BUILD_DIR": "bin", "FISH_TEST_CPU_TARGET": "1"}

    def make():
        result = subprocess.run(
            ["make", "-s", "CXX=./compiler", "LTO=0", "bin/obj/src/probe.o"],
            cwd=project, env=environment, capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        return target.stat().st_mtime_ns, (project / "bin/build-flags").read_bytes()

    first = make()
    assert make() == first, "Unchanged toolchain must reuse its object"
    environment["FISH_TEST_CPU_TARGET"] = "2"
    second = make()
    assert second[0] > first[0] and second[1] != first[1], "Changed target must rebuild"
    assert make() == second, "New target must settle to a reusable build"

print("Build: CPU-Quote, Verzeichniswahl, Wiederverwendung und Zielwechsel: OK")

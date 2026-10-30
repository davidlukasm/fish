"""One inventory for make and the test runner. No simulation campaigns."""
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BUILD = Path(os.environ.get("BUILD_DIR", "bin-sanitize" if os.environ.get("SANITIZE") == "1" else "bin"))
if not BUILD.is_absolute():
    BUILD = ROOT / BUILD

CORE = "material actuators v019 waterborne feeding ui_ecology physiology".split()
NATIVE = CORE + "vision environment lifecycle food_web state sensory_rules organ_model founders render_wire".split()
PYTHON = "history_check journal_check traits_check population_check profile_delta transport_check render_check review_check program_check package_check".split()
JAVASCRIPT = "report diagnostics vegetation renderer tooltips thoughts".split()


def binary(name="fish"):
    return str(BUILD / name)


if __name__ == "__main__":
    if sys.argv[1:] == ["core"]:
        print(" ".join(CORE))
    else:
        raise SystemExit("Usage: suite.py core")

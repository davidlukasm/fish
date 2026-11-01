"""One inventory for make and the test runner. No simulation campaigns."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build_config import build_directory

BUILD = build_directory(ROOT)

# Lasting rules only: energy and checkpoints in the engine; module links and wording in the UI.
NATIVE = ["invariants"]
JAVASCRIPT = ["texts"]


def binary(name="fish"):
    return str(BUILD / name)


if __name__ == "__main__":
    if sys.argv[1:] == ["native"]:
        print(" ".join(NATIVE))
    else:
        raise SystemExit("Usage: suite.py native")

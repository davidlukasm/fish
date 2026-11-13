from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build_config import build_directory

BUILD = build_directory(ROOT)

NATIVE = ["invariants", "compiler"]
# Parts of a JavaScript check run in parallel; together they cover its whole file.
JAVASCRIPT = {"texts": [[]], "studio": [["--ui"], ["--region-controls"], ["--canvas"]]}


def binary(name="fish"):
    return str(BUILD / name)


if __name__ == "__main__":
    if sys.argv[1:] == ["native"]:
        print(" ".join(NATIVE))
    else:
        raise SystemExit("Usage: suite.py native")

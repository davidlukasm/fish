from pathlib import Path
import json
from build_config import build_directory

ROOT = Path(__file__).resolve().parent


def engine_path():
    return build_directory(ROOT) / "fish"


def command_path(path):
    value = str(path)
    if any(ord(c) < 32 for c in value):
        raise ValueError("Ungültiger Dateipfad")
    return json.dumps(value, ensure_ascii=False)

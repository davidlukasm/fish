from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent


def command_path(path):
    value = str(path)
    if any(ord(c) < 32 for c in value):
        raise ValueError("Ungültiger Dateipfad")
    return json.dumps(value, ensure_ascii=False)

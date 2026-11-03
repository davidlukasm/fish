"""Persistent editable fish designs and user-built organ assemblies."""

import json
import os
import tempfile
from pathlib import Path

MAX_DOCUMENT = 1_000_000
MAX_MODULES = 100
FORMAT = "v019-organ-studio"


def _file(data_dir, key):
    if key not in ("draft", "modules"):
        raise ValueError("studio.invalidDocument")
    return Path(data_dir) / "atelier" / f"{key}.json"


def _read(data_dir, key):
    try:
        return json.loads(_file(data_dir, key).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None if key == "draft" else []


def _write(data_dir, key, value):
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_DOCUMENT:
        raise ValueError("studio.invalidDocument")
    path = _file(data_dir, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    target = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".atelier-", suffix=".tmp",
                                         dir=path.parent, delete=False) as temporary:
            target = Path(temporary.name)
            temporary.write(encoded)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(target, path)
    finally:
        if target is not None:
            target.unlink(missing_ok=True)


def run(data_dir, data):
    op = data.get("operation")
    if op == "load-draft":
        return {"document": _read(data_dir, "draft")}
    if op == "save-draft":
        doc = data.get("document")
        if (not isinstance(doc, dict) or doc.get("format") != FORMAT or
                not isinstance(doc.get("organs"), list) or
                not isinstance(doc.get("wires"), list) or
                not isinstance(doc.get("assemblies"), list) or
                not isinstance(doc.get("substances"), list) or
                len(doc["organs"]) > 361 or len(doc["wires"]) > 4096):
            raise ValueError("studio.invalidDocument")
        _write(data_dir, "draft", doc)
        return {"saved": True}
    if op == "list-modules":
        return {"modules": _read(data_dir, "modules")}
    if op == "save-module":
        value = data.get("module")
        if (not isinstance(value, dict) or not isinstance(value.get("name"), str) or
                not 0 < len(value["name"]) <= 60 or
                not isinstance(value.get("organs"), list) or
                not isinstance(value.get("wires"), list)):
            raise ValueError("studio.invalidDocument")
        modules = _read(data_dir, "modules")
        modules = [mod for mod in modules if mod.get("id") != value.get("id")]
        if len(modules) >= MAX_MODULES:
            raise ValueError("studio.invalidDocument")
        modules.append(value)
        _write(data_dir, "modules", modules)
        return {"modules": modules}
    if op == "delete-module":
        modules = [mod for mod in _read(data_dir, "modules")
                   if mod.get("id") != data.get("id")]
        _write(data_dir, "modules", modules)
        return {"modules": modules}
    raise ValueError("studio.invalidDocument")

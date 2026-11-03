"""The studio's validated bridge to the v019 CPPN compiler."""

import json
import math
import subprocess
import tempfile
from pathlib import Path

from build_config import build_directory
from viewer_paths import ROOT

FIELDS = (
    "zone side u0 u1 v0 v1 w0 w1 role function copies threshold tau field "
    "q1 q2 qwidth sign mode pace modulator sender1 sender2 receiver1 receiver2 "
    "sigma crossing range"
).split()
RECEPTOR_FIELDS = "active baseline sensitivity half substance width".split()
MAX_GENOME = 1_000_000


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Ungültiger Zahlenwert im Bauplan.")
    return str(value)


def encode_plan(plan):
    if not isinstance(plan, dict) or not isinstance(plan.get("groups"), list):
        raise ValueError("Ein Bauplan mit Zellgruppen ist erforderlich.")
    groups = plan["groups"]
    name = plan.get("name", "Entwurf")
    if not isinstance(name, str) or not 0 < len(name) <= 40 or len(groups) > 80:
        raise ValueError("Der Entwurf benötigt einen Namen und höchstens 80 Zellgruppen.")
    rows = [json.dumps(name, ensure_ascii=False) + " " + str(len(groups))]
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("name"), str):
            raise ValueError("Ungültige Zellgruppe.")
        if len(group["name"]) > 60 or any(ord(c) < 32 for c in group["name"]):
            raise ValueError("Ungültiger Gruppenname.")
        rows.append(json.dumps(group["name"], ensure_ascii=False) + " " +
                    " ".join(number(group[f]) for f in FIELDS))
        receptors = group.get("receptors", [])
        if not isinstance(receptors, list) or len(receptors) != 7:
            raise ValueError("Jede Zellgruppe benötigt sieben Rezeptoreinstellungen.")
        for r in receptors:
            if not isinstance(r, dict):
                raise ValueError("Ungültiger Rezeptor.")
            rows.append(" ".join(number(r[f]) for f in RECEPTOR_FIELDS))
    return "\n".join(rows) + "\n"


def genome_text(value):
    if not isinstance(value, str) or not value.startswith("FISH_CPPN\n") or len(value.encode()) > MAX_GENOME:
        raise ValueError("Ein v019-Genom mit höchstens 1 MB ist erforderlich.")
    return value


def edit_command(data):
    op = data.get("edit")
    if op in ("node", "link", "connect", "split", "add-node"):
        fields = {"node": ["id", "type", "parameter"],
                  "link": ["id", "weight", "enabled"],
                  "connect": ["from", "to", "weight", "port"],
                  "split": ["id"], "add-node": ["type", "parameter"]}[op]
        return op + " " + " ".join(number(data[f]) for f in fields) + "\n"
    raise ValueError("Unbekannte CPPN-Bearbeitung.")


def run(data):
    if not isinstance(data, dict):
        raise ValueError("Ungültige Atelier-Anfrage.")
    op = data.get("operation")
    if op not in ("build", "inspect", "edit", "new", "probe"):
        raise ValueError("Unbekannte Atelier-Aktion.")
    tool = build_directory(ROOT) / "atelier"
    if not tool.is_file():
        raise ValueError("Der Atelier-Compiler fehlt. Bitte ./build.sh ausführen.")
    with tempfile.TemporaryDirectory(prefix="fish-atelier-") as tmp:
        original = Path(tmp) / "original.genome"
        result = Path(tmp) / "result.genome"
        if op not in ("build", "new"):
            original.write_text(genome_text(data.get("genome")), encoding="utf-8")
        args = [str(tool), op]
        args += ([str(result)] if op in ("build", "new") else
                 [str(original)] if op in ("inspect", "probe") else [str(original), str(result)])
        body = encode_plan(data.get("plan")) if op == "build" else (
            edit_command(data) if op == "edit" else
            data.get("example", "blank") if op == "new" else "")
        if op == "probe":
            group = data.get("group")
            steps = data.get("steps", 18)
            if type(group) is not int or type(steps) is not int or not (0 <= group < 80 and 1 <= steps <= 32):
                raise ValueError("Ungültige Zellgruppe oder Reizdauer.")
            body = f"{group} {steps}\n" + encode_plan(data.get("plan"))
        try:
            completed = subprocess.run(args, cwd=ROOT, input=body, text=True,
                                       capture_output=True, timeout=35)
        except subprocess.TimeoutExpired as error:
            raise ValueError("Gehirnentwicklung hat das Zeitlimit überschritten.") from error
        if completed.returncode:
            raise ValueError((completed.stderr.strip() or "Gehirnentwicklung fehlgeschlagen.")[:500])
        report = json.loads(completed.stdout)
        if op not in ("inspect", "probe"):
            report["genome"] = genome_text(result.read_text(encoding="utf-8"))
        return report

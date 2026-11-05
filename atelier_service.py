"""The studio's validated bridge to the v019 CPPN compiler."""

import json
import math
import subprocess
import tempfile
from pathlib import Path

from build_config import build_directory
from viewer_paths import ROOT
from studio_storage import run as store_design
from protocol_schema import ATELIER_PLAN_FIELDS as FIELDS, ATELIER_RECEPTOR_FIELDS as RECEPTOR_FIELDS, ATELIER_LIMITS, GenomeImport, Hormones
from wording import Refusal



def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise Refusal("studio.errors.invalidNumber")
    return str(value)


def receptor_row(r):
    if not isinstance(r, dict) or any(field not in r for field in RECEPTOR_FIELDS):
        raise Refusal("studio.errors.invalidReceptors")
    return " ".join(number(r[f]) for f in RECEPTOR_FIELDS)


def encode_plan(plan):
    if not isinstance(plan, dict) or not isinstance(plan.get("groups"), list):
        raise Refusal("studio.errors.invalidPlan")
    groups = plan["groups"]
    name = plan.get("name", "")
    if not isinstance(name, str) or not 0 < len(name) <= ATELIER_LIMITS["max_name"] or len(groups) > ATELIER_LIMITS["max_groups"]:
        raise Refusal("studio.errors.invalidName")
    rows = [json.dumps(name, ensure_ascii=False) + " " + str(len(groups))]
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("name"), str):
            raise Refusal("studio.errors.invalidGroup")
        if len(group["name"]) > ATELIER_LIMITS["max_group_name"] or any(ord(c) < 32 for c in group["name"]):
            raise Refusal("studio.errors.invalidGroupName")
        if any(field not in group for field in FIELDS):
            raise Refusal("studio.errors.invalidGroup")
        rows.append(json.dumps(group["name"], ensure_ascii=False) + " " +
                    " ".join(number(group[f]) for f in FIELDS))
        receptors = group.get("receptors", [])
        if not isinstance(receptors, list) or len(receptors) != ATELIER_LIMITS["receptors"]:
            raise Refusal("studio.errors.invalidReceptors")
        for r in receptors:
            rows.append(receptor_row(r))
    # The body's growth receptor follows the groups.
    rows.append(receptor_row(plan.get("growth")))
    options = plan.get("compiler")
    connections = plan.get("connections")
    if not isinstance(options, dict) or not isinstance(connections, list) or len(connections) > 129600:
        raise Refusal("studio.errors.invalidPlan")
    rows.append(" ".join(number(options.get(k)) for k in ("capacityTolerance", "traitTolerance", "extraCells", "reserve")))
    rows.append(str(len(connections)))
    for edge in connections:
        if not isinstance(edge, dict):
            raise Refusal("studio.errors.invalidPlan")
        rows.append(" ".join(number(edge.get(k)) for k in ("from", "to", "spread", "bundle")))
    return "\n".join(rows) + "\n"


def genome_text(value):
    if not isinstance(value, str) or not value.startswith("FISH_CPPN\n") or len(value.encode()) > GenomeImport.MAX_BYTES:
        raise Refusal("studio.errors.invalidGenome")
    return value


def edit_command(data):
    op = data.get("edit")
    if op in ("node", "link", "connect", "split", "add-node"):
        fields = {"node": ["id", "type", "parameter"],
                  "link": ["id", "weight", "enabled"],
                  "connect": ["from", "to", "weight", "port"],
                  "split": ["id"], "add-node": ["type", "parameter"]}[op]
        return op + " " + " ".join(number(data[f]) for f in fields) + "\n"
    raise Refusal("studio.errors.invalidEdit")


def sight_line(sight):
    """The sight scene line of the design operation: 0 without one, else 1 and its values (eye
    side, bearing in degrees, distance, radius, hue in degrees)."""
    if sight is None:
        return "0\n"
    if not isinstance(sight, dict):
        raise Refusal("studio.errors.invalidSight")
    values = [sight.get(key) for key in ("side", "bearing", "distance", "radius", "hue")]
    return "1 " + " ".join(number(v) for v in values) + "\n"


SENSE_SCENES = {"smell": 1, "touch": 2, "flow": 3, "wound": 4}


def sense_line(sense):
    """The sense scene line of the design operation: 0 without one, else 1, its kind and values
    (bearing in degrees, distance in body radii, strength, odor kind)."""
    if sense is None:
        return "0\n"
    if not isinstance(sense, dict) or sense.get("kind") not in SENSE_SCENES:
        raise Refusal("studio.errors.invalidProbe")
    values = [sense.get(key, 0) for key in ("bearing", "distance", "strength", "scent")]
    return "1 " + str(SENSE_SCENES[sense["kind"]]) + " " + " ".join(number(v) for v in values) + "\n"


def run(data, data_dir=None):
    if not isinstance(data, dict):
        raise Refusal("studio.errors.invalidRequest")
    op = data.get("operation")
    if op in ("load-draft", "save-draft", "list-modules", "save-module", "delete-module"):
        if data_dir is None:
            raise Refusal("studio.errors.invalidDocument")
        return store_design(data_dir, data)
    if op not in ("design", "build", "inspect", "edit", "new", "probe", "measure", "check", "sites"):
        raise Refusal("studio.errors.invalidOperation")
    tool = build_directory(ROOT) / "atelier"
    if not tool.is_file():
        raise Refusal("studio.errors.compilerMissing")
    if op == "design":
        # The design view: the engine's anatomy of the plan, without CPPN or development, and
        # with a sight or a sense scene what the eyes or the other senses take of it.
        body = (sight_line(data.get("sight")) + sense_line(data.get("sense")) +
                encode_plan(data.get("plan")))
        try:
            completed = subprocess.run([str(tool), "design"], cwd=ROOT, input=body, text=True,
                                       capture_output=True, timeout=8)
        except subprocess.TimeoutExpired as error:
            raise Refusal("studio.errors.timeout") from error
        if completed.returncode:
            detail = completed.stderr.strip()
            if detail:
                raise ValueError(detail[:500])
            raise Refusal("studio.errors.developmentFailed")
        return json.loads(completed.stdout)
    if op == "sites":
        completed = subprocess.run(
            [str(tool), "sites"], cwd=ROOT, text=True,
            capture_output=True, timeout=8, check=False,
        )
        if completed.returncode:
            raise Refusal("studio.errors.sitesUnavailable")
        return json.loads(completed.stdout)
    with tempfile.TemporaryDirectory(prefix="fish-atelier-") as tmp:
        original = Path(tmp) / "original.genome"
        result = Path(tmp) / "result.genome"
        if op not in ("build", "new"):
            original.write_text(genome_text(data.get("genome")), encoding="utf-8")
        args = [str(tool), op]
        args += ([str(result)] if op in ("build", "new") else
                 [str(original)] if op in ("inspect", "probe", "measure", "check") else [str(original), str(result)])
        body = encode_plan(data.get("plan")) if op == "build" else (
            edit_command(data) if op == "edit" else
            data.get("example", "blank") if op == "new" else "")
        if op == "edit":
            plan = data.get("plan")
            body += "0\n" if plan is None else "1\n" + encode_plan(plan)
        if op == "check":
            body = encode_plan(data.get("plan"))
        if op == "probe":
            groups = data.get("groups")
            steps = data.get("steps", 18)
            plan = data.get("plan")
            total = len(plan.get("groups", [])) if isinstance(plan, dict) else 0
            if (not isinstance(groups, list) or not 0 < len(groups) <= total
                    or any(type(group) is not int or not 0 <= group < total for group in groups)
                    or len(set(groups)) != len(groups)
                    or type(steps) is not int or not 1 <= steps <= ATELIER_LIMITS["max_probe_steps"]):
                raise Refusal("studio.errors.invalidStimulus")
            body = f"{len(groups)} {' '.join(map(str, groups))} {steps}\n" + encode_plan(plan)
        if op == "measure":
            substance, level, maturity = data.get("substance"), data.get("level"), data.get("maturity")
            steps = data.get("steps", ATELIER_LIMITS["max_measure_steps"])
            unit = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool) and 0 <= x <= 1
            if type(substance) is not int or not 0 <= substance <= Hormones.LEVELS or not unit(level) or not unit(maturity) or type(steps) is not int or not 1 <= steps <= ATELIER_LIMITS["max_measure_steps"]:
                raise Refusal("studio.errors.invalidMeasurement")
            body = f"{substance} {number(level)} {number(maturity)} {steps}\n" + encode_plan(data.get("plan"))
        try:
            completed = subprocess.run(args, cwd=ROOT, input=body, text=True,
                                       capture_output=True, timeout=35)
        except subprocess.TimeoutExpired as error:
            raise Refusal("studio.errors.timeout") from error
        if completed.returncode:
            detail = completed.stderr.strip()
            if detail:
                raise ValueError(detail[:500])
            raise Refusal("studio.errors.developmentFailed")
        report = json.loads(completed.stdout)
        if op not in ("inspect", "probe", "measure", "check"):
            report["genome"] = genome_text(result.read_text(encoding="utf-8"))
        return report

import json
import math
import subprocess
import tempfile
import threading
import secrets
import time
from pathlib import Path

from build_config import build_directory
from viewer_paths import ROOT
from studio_storage import run as store_design
from protocol_schema import ATELIER_PLAN_FIELDS as FIELDS, ATELIER_RECEPTOR_FIELDS as RECEPTOR_FIELDS, ATELIER_LIMITS, GenomeImport
from wording import Refusal, worded

QUICK_SECONDS = 8
COMPILE_JOB_TTL_SECONDS = 300
COMPILE_JOB_RESULTS = 4
COMPILE_TIMEOUT_SECONDS = 35
COMPILE_POLL_SECONDS = .1
DETAIL_CHARACTERS = 500
# Genome seeds travel as decimal strings so JavaScript cannot round their 64-bit values.
SEED_MAX = (1 << 64) - 1



class CompileJobs:
    def __init__(self):
        self.lock = threading.Lock()
        self.jobs = {}

    def request(self, data, data_dir):
        with self.lock:
            now = time.monotonic()
            self.jobs = {key: job for key, job in self.jobs.items()
                         if job["status"] == "running" or now - job["updated"] < COMPILE_JOB_TTL_SECONDS}
            if data.get("operation") == "build-start":
                encode_plan(data.get("plan"))
                if any(job["status"] == "running" for job in self.jobs.values()):
                    raise Refusal("studio.errors.compilerBusy")
                while len(self.jobs) >= COMPILE_JOB_RESULTS:
                    del self.jobs[next(iter(self.jobs))]
                key = secrets.token_hex(16)
                job = {"status": "running", "phase": "search", "started": now,
                       "updated": now, "cancel": threading.Event()}
                self.jobs[key] = job
                threading.Thread(target=self._work, args=(key, data, data_dir), daemon=True).start()
            else:
                key = data.get("job")
                if not isinstance(key, str) or key not in self.jobs:
                    raise Refusal("studio.errors.invalidRequest")
                job = self.jobs[key]
                if data.get("operation") == "build-cancel" and job["status"] == "running":
                    job["cancel"].set()
            result = {k: v for k, v in job.items() if k not in ("cancel", "started", "updated")}
            result.update(job=key, milliseconds=1000 * (now - job["started"]))
            return result

    def _work(self, key, data, data_dir):
        job = self.jobs[key]
        def progress(value):
            with self.lock:
                job.update(phase=value["phase"], attempts=value.get("attempts", 0))
        try:
            result = run({**data, "operation": "build"}, data_dir, progress, job["cancel"])
            with self.lock:
                if job["cancel"].is_set():
                    job["status"] = "cancelled"
                else:
                    job.update(status="done", result=result)
        except Exception as error:
            with self.lock:
                job.update(status="cancelled" if job["cancel"].is_set() else "failed",
                           error=worded(error))
        finally:
            with self.lock:
                job["updated"] = time.monotonic()

    def close(self):
        with self.lock:
            for job in self.jobs.values():
                if job["status"] == "running":
                    job["cancel"].set()


def execute(args, body, progress=None, cancel=None):
    # Separate file handles let progress be read while the native process writes a large report.
    with tempfile.TemporaryFile(mode="w+") as source, tempfile.TemporaryFile(mode="w+") as output, tempfile.NamedTemporaryFile(mode="w+") as errors:
        source.write(body)
        source.seek(0)
        process = subprocess.Popen(args, cwd=ROOT, stdin=source, stdout=output, stderr=errors,
                                   text=True)
        details = []
        deadline = time.monotonic() + COMPILE_TIMEOUT_SECONDS
        def consume(reader):
            for line in reader:
                try:
                    value = json.loads(line)
                    if value.get("phase") in ("search", "encode", "validate"):
                        if progress:
                            progress(value)
                        continue
                except (ValueError, AttributeError):
                    pass
                details.append(line)
        try:
            with open(errors.name, encoding="utf-8") as reader:
                while True:
                    if cancel is not None and cancel.is_set():
                        raise Refusal("studio.errors.cancelled")
                    if time.monotonic() >= deadline:
                        raise Refusal("studio.errors.timeout")
                    consume(reader)
                    try:
                        process.wait(timeout=COMPILE_POLL_SECONDS)
                        break
                    except subprocess.TimeoutExpired:
                        pass
                consume(reader)
            output.seek(0)
            return subprocess.CompletedProcess(args, process.returncode, output.read(), "".join(details))
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()


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
        rows.append(receptor_row(group.get("growth")))
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
    source = plan.get("source")
    rows.append("1" if source is not None else "0")
    if source is not None:
        if not isinstance(source, dict):
            raise Refusal("studio.errors.invalidPlan")
        seeds = [source.get(key) for key in ("development", "variation")]
        if any(not isinstance(seed, str) or not seed.isascii() or not seed.isdecimal()
               or len(seed) > len(str(SEED_MAX)) or int(seed) > SEED_MAX for seed in seeds):
            raise Refusal("studio.errors.invalidPlan")
        addresses = source.get("addresses")
        if (not isinstance(addresses, list) or len(addresses) != len(groups)
                or any(not isinstance(row, list) or len(row) != ATELIER_LIMITS["contact_values"] for row in addresses)):
            raise Refusal("studio.errors.invalidPlan")
        rows.append(" ".join(seeds))
        rows.extend(" ".join(number(value) for value in row) for row in addresses)
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


SENSE_SCENES = {"smell": 1, "touch": 2, "flow": 3, "wound": 4, "gut": 5}


def sense_line(sense):
    """The sense scene line of the design operation: 0 without one, else 1, its kind and values
    (bearing in degrees, distance in body radii, strength, odor kind, nutrient signal)."""
    if sense is None:
        return "0\n"
    if not isinstance(sense, dict) or sense.get("kind") not in SENSE_SCENES:
        raise Refusal("studio.errors.invalidProbe")
    values = [sense.get(key, 0) for key in ("bearing", "distance", "strength", "scent", "nutrient")]
    return "1 " + str(SENSE_SCENES[sense["kind"]]) + " " + " ".join(number(v) for v in values) + "\n"


def run(data, data_dir=None, progress=None, cancel=None):
    if not isinstance(data, dict):
        raise Refusal("studio.errors.invalidRequest")
    op = data.get("operation")
    if op in ("load-draft", "save-draft", "list-modules", "save-module", "delete-module"):
        if data_dir is None:
            raise Refusal("studio.errors.invalidDocument")
        return store_design(data_dir, data)
    if op not in ("design", "build", "inspect", "edit", "new", "check", "sites"):
        raise Refusal("studio.errors.invalidOperation")
    tool = build_directory(ROOT) / "atelier"
    if not tool.is_file():
        raise Refusal("studio.errors.compilerMissing")
    if op == "design":
        body = (sight_line(data.get("sight")) + sense_line(data.get("sense")) +
                encode_plan(data.get("plan")))
        try:
            completed = subprocess.run([str(tool), "design"], cwd=ROOT, input=body, text=True,
                                       capture_output=True, timeout=QUICK_SECONDS)
        except subprocess.TimeoutExpired as error:
            raise Refusal("studio.errors.timeout") from error
        if completed.returncode:
            detail = completed.stderr.strip()
            if detail:
                raise ValueError(detail[:DETAIL_CHARACTERS])
            raise Refusal("studio.errors.developmentFailed")
        return json.loads(completed.stdout)
    if op == "sites":
        completed = subprocess.run(
            [str(tool), "sites"], cwd=ROOT, text=True,
            capture_output=True, timeout=QUICK_SECONDS, check=False,
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
                 [str(original)] if op in ("inspect", "check") else [str(original), str(result)])
        body = encode_plan(data.get("plan")) if op == "build" else (
            edit_command(data) if op == "edit" else
            data.get("example", "blank") if op == "new" else "")
        if op == "edit":
            plan = data.get("plan")
            body += "0\n" if plan is None else "1\n" + encode_plan(plan)
        if op == "check":
            body = encode_plan(data.get("plan"))
        try:
            completed = execute(args, body, progress, cancel)
        except subprocess.TimeoutExpired as error:
            raise Refusal("studio.errors.timeout") from error
        if completed.returncode:
            detail = completed.stderr.strip()
            if detail:
                raise ValueError(detail[:DETAIL_CHARACTERS])
            raise Refusal("studio.errors.developmentFailed")
        report = json.loads(completed.stdout)
        if op not in ("inspect", "check"):
            report["genome"] = genome_text(result.read_text(encoding="utf-8"))
        return report

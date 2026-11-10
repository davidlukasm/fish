"""Breeding station: a fish lives in several start worlds without help, one world after another.

Each world runs the native breeding tank and is summarised while it runs; finished worlds are
kept per genome and step count, so the same fish is never bred twice in the same world."""
import hashlib
import json
import secrets
import subprocess
import tempfile
import threading
from pathlib import Path

from atelier_service import START_DOCUMENTS, genome_text
from build_config import build_directory
from file_io import atomic_write
from protocol_schema import Breeding
from viewer_paths import ROOT
from wording import Refusal, worded

FOLDER = "labor"
FINGERPRINT_CHARACTERS = 16
JOB_ID_BYTES = 8
DETAIL_CHARACTERS = 500
HABITAT = "aquarium"


def start_genome(key):
    document = START_DOCUMENTS.get(key)
    if document is None:
        raise Refusal("labor.errors.unknownFish")
    return document.with_name(document.name.removesuffix(".fish.json") + ".genome")


def fingerprint(genome):
    return hashlib.sha256(genome.encode()).hexdigest()[:FINGERPRINT_CHARACTERS]


def parent_generation(sample):
    """The youngest generation that has had offspring so far, -1 before the first hatch."""
    return max((g for g, count in sample.get("parents", []) if count > 0), default=-1)


class World:
    def __init__(self, seed, steps):
        self.summary = {"seed": seed, "steps": steps, "samples": [], "deaths": {},
                        "hatches": 0, "done": False}

    def read(self, event):
        kind = event.get("event")
        if kind == "sample":
            self.summary["samples"].append(
                [event["t"], event["n"], event["peakGeneration"], parent_generation(event)])
        elif kind == "hatch":
            self.summary["hatches"] += 1
        elif kind == "death":
            cause = str(event["cause"])
            self.summary["deaths"][cause] = self.summary["deaths"].get(cause, 0) + 1


class Results:
    """Finished worlds per fish and step count under data_dir/labor."""

    def __init__(self, data_dir):
        self.folder = Path(data_dir) / FOLDER

    def path(self, mark, steps):
        return self.folder / f"zucht-{mark}-{steps}.json"

    def read(self, mark, steps):
        try:
            return json.loads(self.path(mark, steps).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def keep(self, mark, steps, name, world):
        entry = self.read(mark, steps) or {"fingerprint": mark, "steps": steps, "worlds": {}}
        entry["name"] = name
        entry["worlds"][str(world["seed"])] = world
        atomic_write(self.path(mark, steps), json.dumps(entry, separators=(",", ":")))

    def all(self):
        entries = []
        for path in sorted(self.folder.glob("zucht-*.json")):
            try:
                entries.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue
        return entries


class BreedingJobs:
    def __init__(self, starter_genomes):
        self.starter_genomes = starter_genomes
        self.lock = threading.Lock()
        self.job = None

    def request(self, data, data_dir):
        operation = data.get("operation")
        if operation == "start":
            return self.start(data, data_dir)
        if operation == "overview":
            return self.overview(data_dir)
        with self.lock:
            job = self.job
            if job is None or data.get("job") != job["id"]:
                raise Refusal("labor.errors.unknownJob")
            if operation == "cancel" and job["status"] == "running":
                job["cancel"].set()
                if job["process"] is not None:
                    job["process"].kill()
            elif operation not in ("status", "cancel"):
                raise Refusal("labor.errors.invalidRequest")
            return self.shown(job)

    def overview(self, data_dir):
        released = {path.resolve() for path in self.starter_genomes()}
        fish = []
        for key in START_DOCUMENTS:
            path = start_genome(key)
            if path.is_file():
                fish.append({"key": key, "fingerprint": fingerprint(path.read_text(encoding="utf-8")),
                             "released": path.resolve() in released})
        with self.lock:
            job = self.shown(self.job) if self.job else None
        return {"fish": fish, "results": Results(data_dir).all(), "job": job}

    def start(self, data, data_dir):
        steps, worlds = data.get("steps"), data.get("worlds")
        if (not all(isinstance(v, int) and not isinstance(v, bool) for v in (steps, worlds)) or
                steps not in Breeding.STEPS or worlds not in Breeding.WORLDS):
            raise Refusal("labor.errors.invalidRequest")
        key = data.get("fish")
        if key == "draft":
            genome = genome_text(data.get("genome"))
            name = data.get("name")
            if not isinstance(name, str) or not name.strip():
                raise Refusal("labor.errors.invalidRequest")
        else:
            genome = start_genome(key).read_text(encoding="utf-8")
            name = key
        tool = build_directory(ROOT) / "zuchtbecken"
        if not tool.is_file():
            raise Refusal("labor.errors.toolMissing")
        with self.lock:
            if self.job and self.job["status"] == "running":
                raise Refusal("labor.errors.busy")
            self.job = {"id": secrets.token_hex(JOB_ID_BYTES),
                        "status": "running", "fish": key, "name": name,
                        "fingerprint": fingerprint(genome), "steps": steps,
                        "worlds": [], "error": None, "cancel": threading.Event(),
                        "process": None}
            job = self.job
            threading.Thread(target=self.work, args=(job, genome, tool, worlds, data_dir),
                             daemon=True).start()
            return self.shown(job)

    def work(self, job, genome, tool, worlds, data_dir):
        results = Results(data_dir)
        kept = (results.read(job["fingerprint"], job["steps"]) or {}).get("worlds", {})
        try:
            with tempfile.TemporaryDirectory(prefix="fish-labor-") as folder:
                path = Path(folder) / "fish.genome"
                path.write_text(genome, encoding="utf-8")
                for seed in range(1, worlds + 1):
                    if str(seed) in kept and kept[str(seed)]["done"]:
                        with self.lock:
                            job["worlds"].append(kept[str(seed)])
                        continue
                    world = World(seed, job["steps"])
                    with self.lock:
                        job["worlds"].append(world.summary)
                    self.breed(job, tool, path, world)
                    if job["cancel"].is_set():
                        break
                    with self.lock:
                        world.summary["done"] = True
                    results.keep(job["fingerprint"], job["steps"], job["name"], world.summary)
            with self.lock:
                job["status"] = "cancelled" if job["cancel"].is_set() else "done"
        except Exception as error:
            with self.lock:
                job.update(status="cancelled" if job["cancel"].is_set() else "failed",
                           error=worded(error))
        finally:
            with self.lock:
                job["process"] = None

    def breed(self, job, tool, path, world):
        args = [str(tool), str(path), str(world.summary["seed"]), str(job["steps"]),
                str(Breeding.FOUNDERS), HABITAT]
        with tempfile.TemporaryFile(mode="w+") as errors:
            process = subprocess.Popen(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=errors,
                                       text=True)
            with self.lock:
                job["process"] = process
                if job["cancel"].is_set():
                    process.kill()
            for line in process.stdout:
                event = json.loads(line)
                with self.lock:
                    world.read(event)
            process.wait()
            if process.returncode and not job["cancel"].is_set():
                errors.seek(0)
                raise ValueError(errors.read().strip()[:DETAIL_CHARACTERS] or "zuchtbecken")

    @staticmethod
    def shown(job):
        return json.loads(json.dumps({k: v for k, v in job.items() if k not in ("cancel", "process")}))

    def close(self):
        with self.lock:
            if self.job and self.job["status"] == "running":
                self.job["cancel"].set()
                if self.job["process"] is not None:
                    self.job["process"].kill()

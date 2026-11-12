"""Stations that test a fish with the native tools, one job at a time.

The breeding station lets a fish live in several start worlds without help; the trial lab sets it
before food or an open mussel and records each approach. Finished runs are kept per genome, so the
same fish is never tested twice in the same world."""
import gzip
import hashlib
import json
import secrets
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

from atelier_service import START_DOCUMENTS, genome_text
from build_config import build_directory
from file_io import atomic_write
from protocol_schema import Breeding, TrialKind, TrialLab
from viewer_paths import ROOT
from wording import Refusal, worded
from labor_recording import LifeArchive, read_life

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


def fingerprint(genome, engine):
    return hashlib.sha256((engine + "\0" + genome).encode()).hexdigest()[:FINGERPRINT_CHARACTERS]


def whole_number(value):
    return isinstance(value, int) and not isinstance(value, bool)


def parent_generation(sample):
    """The youngest generation that has had offspring so far, -1 before the first hatch."""
    return max((g for g, count in sample.get("parents", []) if count > 0), default=-1)


class World:
    def __init__(self, seed, steps, folder=None):
        self.detail_folder = folder
        self.archive = LifeArchive(folder)
        self.summary = {"seed": seed, "steps": steps, "samples": [], "deaths": {},
                        "hatches": 0, "done": False, "lives": self.archive.lives, "scenes": []}

    def read(self, event):
        kind = event.get("event")
        if kind == "life":
            self.archive.read(event)
        elif kind == "setup":
            self.summary["setup"] = {k: v for k, v in event.items() if k != "event"}
        elif kind == "recording":
            self.summary["observation"] = {k: v for k, v in event.items() if k != "event"}
        elif kind == "scene":
            if self.detail_folder is not None:
                path = self.detail_folder / f"scene-{event['t']}.json"
                with path.open("rb") as source, gzip.open(str(path) + ".gz", "wb", compresslevel=1) as target:
                    shutil.copyfileobj(source, target)
                path.unlink()
            self.summary["scenes"].append(event["t"])
        elif kind == "sample":
            for life in self.archive.lives.values():
                if life["hatch"] is None and life["death"] is None:
                    life["last"] = event["t"]
            fish = sum(count for _, count in event["swimmers"])
            self.summary["samples"].append({
                "step": event["t"], "fish": fish, "eggs": event["n"] - fish,
                "generation": event["peakGeneration"], "parents": parent_generation(event),
                "reserve": event["swimmerReserve"], "diet": event["diet"],
                "availableFeed": event["availableFeed"],
                "leaves": event["anchoredLeaf"] + event["driftingLeaf"],
            })
        elif kind == "hatch":
            self.summary["hatches"] += 1
        elif kind == "death":
            cause = str(event["cause"])
            self.summary["deaths"][cause] = self.summary["deaths"].get(cause, 0) + 1


class Session:
    """One trial world: the hatch and every trial the lab reports, path included."""
    TRIAL_EVENTS = {TrialKind.FEED: "trial", TrialKind.MUSSEL: "mussel", TrialKind.CRAB: "crab"}

    def __init__(self, seed, trial):
        self.event = self.TRIAL_EVENTS[trial]
        self.summary = {"seed": seed, "trial": trial, "hatch": None, "trials": [], "died": None,
                        "done": False}

    def read(self, event):
        kind = event.get("event")
        if kind == "hatch":
            self.summary["hatch"] = event["t"]
        elif kind == "death":
            self.summary["died"] = {"egg": bool(event["egg"]), "age": event["age"]}
        elif kind == self.event:
            self.summary["trials"].append({k: v for k, v in event.items() if k != "event"})


class Results:
    """Finished runs per fish and variant under data_dir/labor; runs are keyed by seed."""

    def __init__(self, data_dir, prefix, variant, runs, engine):
        self.folder = Path(data_dir) / FOLDER
        self.prefix, self.variant, self.runs = prefix, variant, runs
        self.engine = engine

    def detail_folder(self, mark, variant, seed):
        return self.folder / f"{self.prefix}-{mark}-{variant}" / str(seed)

    def path(self, mark, variant):
        return self.folder / f"{self.prefix}-{mark}-{variant}.json"

    def read(self, mark, variant):
        try:
            entry = json.loads(self.path(mark, variant).read_text(encoding="utf-8"))
            return entry if entry.get("engine") == self.engine else None
        except (OSError, ValueError):
            return None

    def keep(self, mark, variant, name, run):
        entry = self.read(mark, variant) or {"fingerprint": mark, "engine": self.engine,
                                             self.variant: variant, self.runs: {}}
        entry["name"] = name
        entry[self.runs][str(run["seed"])] = run
        atomic_write(self.path(mark, variant), json.dumps(entry, separators=(",", ":")))

    def all(self):
        entries = []
        for path in sorted(self.folder.glob(f"{self.prefix}-*.json")):
            try:
                entry = json.loads(path.read_text(encoding="utf-8"))
                if entry.get("engine") == self.engine:
                    entries.append(entry)
            except (OSError, ValueError):
                continue
        return entries


class Jobs:
    """One running job per station, answered by start, status, cancel and overview."""
    TOOL = ""

    def __init__(self, starter_genomes):
        self.starter_genomes = starter_genomes
        self.lock = threading.Lock()
        self.job = None

    def results(self, data_dir, engine):
        raise NotImplementedError

    def executable(self):
        try:
            return (build_directory(ROOT) / self.TOOL).read_bytes()
        except FileNotFoundError:
            raise Refusal("labor.errors.toolMissing") from None

    def plan(self, data):
        """The validated settings of a start request: variant, seeds and job fields, among them
        the count of seeds."""
        raise NotImplementedError

    def run(self, seed, job, folder=None):
        """A fresh summary for one seed and the reader that fills it."""
        raise NotImplementedError

    def arguments(self, tool, path, seed, job, run=None):
        raise NotImplementedError

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
        engine = hashlib.sha256(self.executable()).hexdigest()
        released = {path.resolve() for path in self.starter_genomes()}
        fish = []
        for key in START_DOCUMENTS:
            path = start_genome(key)
            if path.is_file():
                fish.append({"key": key, "fingerprint": fingerprint(path.read_text(encoding="utf-8"), engine),
                             "released": path.resolve() in released})
        with self.lock:
            job = self.shown(self.job) if self.job else None
        return {"engine": engine, "fish": fish, "results": self.results(data_dir, engine).all(),
                "job": job}

    def start(self, data, data_dir):
        variant, seeds, fields = self.plan(data)
        key = data.get("fish")
        if key == "draft":
            genome = genome_text(data.get("genome"))
            name = data.get("name")
            if not isinstance(name, str) or not name.strip():
                raise Refusal("labor.errors.invalidRequest")
        else:
            genome = start_genome(key).read_text(encoding="utf-8")
            name = key
        executable = self.executable()
        engine = hashlib.sha256(executable).hexdigest()
        with self.lock:
            if self.job and self.job["status"] == "running":
                raise Refusal("labor.errors.busy")
            self.job = {"id": secrets.token_hex(JOB_ID_BYTES), "status": "running", "fish": key,
                        "name": name, "fingerprint": fingerprint(genome, engine),
                        "engine": engine, "variant": variant,
                        **fields, "runs": [], "error": None, "cancel": threading.Event(),
                        "process": None}
            job = self.job
            threading.Thread(target=self.work, args=(job, genome, executable, seeds, data_dir),
                             daemon=True).start()
            return self.shown(job)

    def work(self, job, genome, executable, seeds, data_dir):
        results = self.results(data_dir, job["engine"])
        kept = (results.read(job["fingerprint"], job["variant"]) or {}).get(results.runs, {})
        try:
            with tempfile.TemporaryDirectory(prefix="fish-labor-") as folder:
                # Every world in a job uses the same executable, even while a rebuild finishes.
                tool = Path(folder) / self.TOOL
                tool.write_bytes(executable)
                tool.chmod(0o700)
                path = Path(folder) / "fish.genome"
                path.write_text(genome, encoding="utf-8")
                for seed in seeds:
                    if str(seed) in kept and kept[str(seed)]["done"]:
                        with self.lock:
                            job["runs"].append(kept[str(seed)])
                        continue
                    detail_folder = results.detail_folder(job["fingerprint"], job["variant"], seed)
                    run = self.run(seed, job, detail_folder)
                    with self.lock:
                        job["runs"].append(run.summary)
                    self.stream(job, self.arguments(tool, path, seed, job, run), run)
                    if job["cancel"].is_set():
                        break
                    with self.lock:
                        run.summary["done"] = True
                    results.keep(job["fingerprint"], job["variant"], job["name"], run.summary)
            with self.lock:
                job["status"] = "cancelled" if job["cancel"].is_set() else "done"
        except Exception as error:
            with self.lock:
                job.update(status="cancelled" if job["cancel"].is_set() else "failed",
                           error=worded(error))
        finally:
            with self.lock:
                job["process"] = None

    def stream(self, job, args, run):
        with tempfile.TemporaryFile(mode="w+") as errors:
            process = subprocess.Popen([str(a) for a in args], cwd=ROOT, stdout=subprocess.PIPE,
                                       stderr=errors, text=True)
            with self.lock:
                job["process"] = process
                if job["cancel"].is_set():
                    process.kill()
            for line in process.stdout:
                if not line.strip():
                    continue
                event = json.loads(line)
                with self.lock:
                    run.read(event)
            process.wait()
            if process.returncode and not job["cancel"].is_set():
                errors.seek(0)
                raise ValueError(errors.read().strip()[:DETAIL_CHARACTERS] or self.TOOL)

    @staticmethod
    def shown(job):
        return json.loads(json.dumps({k: v for k, v in job.items() if k not in ("cancel", "process")}))

    def close(self):
        with self.lock:
            if self.job and self.job["status"] == "running":
                self.job["cancel"].set()
                if self.job["process"] is not None:
                    self.job["process"].kill()


class BreedingJobs(Jobs):
    TOOL = "zuchtbecken"

    def request(self, data, data_dir):
        if data.get("operation") not in ("life", "scene"):
            return super().request(data, data_dir)
        mark, steps, seed = data.get("fingerprint"), data.get("steps"), data.get("seed")
        if (not isinstance(mark, str) or not re.fullmatch(r"[0-9a-f]{16}", mark) or
                not whole_number(steps) or steps not in Breeding.STEPS or
                not whole_number(seed) or seed < 0):
            raise Refusal("labor.errors.invalidRequest")
        with self.lock:
            job = self.job
            active = job and job["fingerprint"] == mark and job["steps"] == steps
            engine = job["engine"] if active else hashlib.sha256(self.executable()).hexdigest()
            results = self.results(data_dir, engine)
            world = next((r for r in job["runs"] if r["seed"] == seed), None) if active else None
            if world is None:
                world = (results.read(mark, steps) or {}).get("worlds", {}).get(str(seed))
            if world is None:
                raise Refusal("labor.errors.unknownJob")
            folder = results.detail_folder(mark, steps, seed)
            if data["operation"] == "scene":
                step = data.get("step")
                if not whole_number(step) or step not in world.get("scenes", []):
                    raise Refusal("labor.errors.invalidRequest")
                with gzip.open(folder / f"scene-{step}.json.gz", "rt", encoding="utf-8") as source:
                    return {"step": step, "frame": json.load(source)}
            identity = data.get("id")
            if not whole_number(identity) or str(identity) not in world.get("lives", {}):
                raise Refusal("labor.errors.invalidRequest")
            return json.loads(json.dumps({
                "id": identity, "seed": seed, "summary": world["lives"][str(identity)],
                "observation": world.get("observation"), "scenes": world.get("scenes", []),
                **read_life(folder, identity)}))

    def results(self, data_dir, engine):
        return Results(data_dir, "zucht", "steps", "worlds", engine)

    def plan(self, data):
        steps, worlds = data.get("steps"), data.get("worlds")
        if (not all(whole_number(v) for v in (steps, worlds)) or steps not in Breeding.STEPS or
                worlds not in Breeding.WORLDS):
            raise Refusal("labor.errors.invalidRequest")
        return steps, range(1, worlds + 1), {"steps": steps, "count": worlds}

    def run(self, seed, job, folder=None):
        return World(seed, job["steps"], folder)

    def arguments(self, tool, path, seed, job, run=None):
        return [tool, path, seed, job["steps"], Breeding.FOUNDERS, HABITAT, "record=1",
                "scenes=" + str(run.detail_folder / "scene")]


class TrialJobs(Jobs):
    TOOL = "verhaltenslabor"
    SETTINGS = {
        TrialKind.FEED: ["aquarium=1", "supply=0", f"prewait={TrialLab.FEED_SCENT_WAIT}",
                         f"cluster={TrialLab.FEED_CLUSTER}", f"distance={TrialLab.FEED_DISTANCE}",
                         f"trial={TrialLab.FEED_STEPS}"],
        TrialKind.MUSSEL: ["mussel=1", "hungry=1", f"distance={TrialLab.MUSSEL_DISTANCE}",
                           f"trial={TrialLab.MUSSEL_STEPS}"],
        TrialKind.CRAB: ["crab=1", "hungry=1", f"distance={TrialLab.CRAB_DISTANCE}",
                         f"trial={TrialLab.CRAB_STEPS}"],
    }

    def results(self, data_dir, engine):
        return Results(data_dir, "versuch", "trial", "seeds", engine)

    def plan(self, data):
        trial, seeds = data.get("trial"), data.get("seeds")
        if (not all(whole_number(v) for v in (trial, seeds)) or trial not in self.SETTINGS or
                seeds not in TrialLab.SEEDS):
            raise Refusal("labor.errors.invalidRequest")
        return trial, range(1, seeds + 1), {"trial": trial, "count": seeds}

    def run(self, seed, job, folder=None):
        return Session(seed, job["trial"])

    def arguments(self, tool, path, seed, job, run=None):
        return [tool, path, seed, "rounds=1", f"path={TrialLab.PATH_EVERY}",
                *self.SETTINGS[job["trial"]]]

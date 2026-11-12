"""Interactive native aquaria, with independent command and recording channels."""
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import secrets
import subprocess
import threading

from atelier_service import START_DOCUMENTS, genome_text
from file_io import atomic_write
from labor_recording import LifeArchive, read_life
from viewer_paths import ROOT, command_path, engine_path
from wording import Refusal


def start_genome(key):
    if not isinstance(key, str) or key not in START_DOCUMENTS:
        raise Refusal("labor.errors.unknownFish")
    document = START_DOCUMENTS[key]
    return document.with_name(document.name.removesuffix(".fish.json") + ".genome")


def integer(value, low, high):
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise Refusal("labor.errors.invalidRequest")
    return value


def decimal(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise Refusal("labor.errors.invalidRequest")
    return value


class NativeWorld:
    def __init__(self, tool, folder, candidates, seed, copies, steps, parameters=()):
        self.folder, self.seed, self.limit = Path(folder), seed, steps
        self.folder.mkdir(parents=True, exist_ok=True)
        self.candidates = [c["id"] for c in candidates]
        self.lock, self.transport = threading.RLock(), threading.Lock()
        self.ready, self.closed = threading.Event(), threading.Event()
        self.latest, self.scene, self.scene_revision = {}, None, 0
        self.archives = {name: LifeArchive(self.folder / name) for name in ("trial", "control")}
        self.lines = {name: {} for name in self.archives}
        self.events, self.sequence = deque(maxlen=12000), 0
        self.samples = deque(maxlen=4000)
        self.pending, self.request_id = {}, 0
        self.error, self.status = None, "preparing"
        self.interventions = []
        self.logs = deque(maxlen=10)
        self.process = None
        command = [str(tool), "--laboratory", "--session", str(self.folder), "--seed", str(seed),
                   "--fish", str(len(candidates) * copies), "--food", "800", "--threads", "2"]
        for candidate in candidates:
            command += ["--start-genome", str(candidate["path"])]
        for name, value in parameters:
            command += ["--param", f"{name}={value}"]
        self.process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, bufsize=1)
        threading.Thread(target=self.read, daemon=True).start()
        threading.Thread(target=self.read_errors, daemon=True).start()
        threading.Thread(target=self.configure, daemon=True).start()

    def read_errors(self):
        for line in self.process.stderr:
            self.logs.append(line.strip())

    def configure(self):
        if not self.ready.wait(90) or self.closed.is_set():
            return
        try:
            self.command(f"lab-stop-at {self.limit}")
            self.command("delay 10")
            self.command("resume")
        except (ValueError, OSError) as error:
            self.error = str(error)

    def read(self):
        try:
            with (self.folder / "events.jsonl").open("w", encoding="utf-8") as record:
                for line in self.process.stdout:
                    event = json.loads(line)
                    kind = event.get("event")
                    if kind == "command":
                        with self.transport:
                            pending = self.pending.get(event["request"])
                            if pending:
                                pending["reply"] = event
                                pending["done"].set()
                        continue
                    if kind == "labor":
                        with self.lock:
                            scene = event.pop("scene", None)
                            if scene is not None:
                                self.scene, self.scene_revision = scene, self.scene_revision + 1
                            self.latest = event
                            self.status = "ready"
                            if not self.samples or self.samples[-1]["step"] != event["step"]:
                                self.samples.append({"step": event["step"],
                                                     "fish": sum(p["hatched"] for p in event["fish"]),
                                                     "eggs": sum(not p["hatched"] for p in event["fish"]),
                                                     "reserve": sum(p["energy"] for p in event["fish"]),
                                                     "intake": sum(p["intake"] for p in event["fish"]),
                                                     "controlReserve": sum(p["energy"] for p in event.get("control", []))})
                        self.ready.set()
                    elif kind in ("life", "labor-line"):
                        record.write(json.dumps(event, separators=(",", ":")) + "\n")
                        channel = event.get("world", "trial")
                        with self.lock:
                            if kind == "labor-line":
                                self.lines[channel][str(event["id"])] = event["line"]
                            else:
                                self.archives[channel].read(event)
                                self.sequence += 1
                                self.events.append({**event, "seq": self.sequence})
                    elif kind == "labor-error":
                        self.error = "labor.live.comparisonFailed"
                record.flush()
            status = self.process.wait()
            if status and not self.closed.is_set():
                self.error = "\n".join(self.logs) or f"Engine: {status}"
        except (OSError, ValueError, KeyError) as error:
            self.error = str(error)
        finally:
            self.status = "closed" if self.closed.is_set() else "failed"
            with self.transport:
                for pending in self.pending.values():
                    pending["done"].set()

    def command(self, text):
        if self.closed.is_set() or self.process.poll() is not None:
            raise Refusal("labor.errors.unknownJob")
        with self.transport:
            self.request_id += 1
            identifier = self.request_id
            pending = {"done": threading.Event(), "reply": None}
            self.pending[identifier] = pending
            self.process.stdin.write(f"request {identifier} {text}\n")
            self.process.stdin.flush()
        try:
            if not pending["done"].wait(3):
                raise ValueError("labor.live.commandTimeout")
            answer = pending["reply"]
            if not answer or not answer["ok"]:
                raise ValueError(answer.get("message") if answer else "labor.live.closed")
            return answer
        finally:
            with self.transport:
                self.pending.pop(identifier, None)

    def snapshot(self, after=0, scene=0):
        with self.lock:
            lives = []
            for channel, archive in self.archives.items():
                for key, life in archive.lives.items():
                    lives.append({**{k: life[k] for k in (
                        "id", "parent", "generation", "start", "hatch", "death", "cause", "last",
                        "intake", "firstIntake", "closings", "emptyClosings")},
                                  "world": channel, "line": self.lines[channel].get(key, -1)})
            result = {"seed": self.seed, "status": self.status, "error": self.error,
                      "limit": self.limit, "state": self.latest.copy(), "lives": lives,
                      "sequence": self.sequence, "sceneRevision": self.scene_revision,
                      "events": [e for e in self.events if e["seq"] > after],
                      "resetPaths": bool(self.events and after < self.events[0]["seq"] - 1),
                      "samples": list(self.samples), "interventions": list(self.interventions)}
            if scene != self.scene_revision:
                result["scene"] = self.scene
            return result

    def life(self, channel, identifier):
        if channel not in self.archives:
            raise Refusal("labor.errors.invalidRequest")
        path = self.folder / channel / f"fish-{identifier}.jsonl"
        with self.lock:
            length = path.stat().st_size if path.exists() else 0
        return read_life(path.parent, identifier, length)

    def finished(self):
        with self.lock:
            return bool(self.latest and (self.latest["step"] >= self.limit or not self.latest["fish"]))

    def close(self):
        self.closed.set()
        process = self.process
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)


def rank_candidates(candidates, worlds):
    rows = []
    for candidate in candidates:
        counts, hatched, meals = [], 0, []
        for world in worlds:
            if candidate["id"] not in world.candidates:
                counts.append(0)
                continue
            line = world.candidates.index(candidate["id"])
            with world.lock:
                lives = [life for key, life in world.archives["trial"].lives.items()
                         if world.lines["trial"].get(key) == line]
                descendants = [life for life in lives if life["generation"] > 0]
                counts.append(sum(life["firstIntake"] is not None for life in descendants))
                hatched += sum(life["hatch"] is not None for life in descendants)
                meals.extend(life["firstIntake"] - life["hatch"] for life in lives
                             if life["firstIntake"] is not None and life["hatch"] is not None)
        rows.append({k: v for k, v in candidate.items() if k != "path"} | {
            "fed": counts, "score": sum(counts) / len(counts) if counts else 0,
            "hatches": hatched, "mealAge": sum(meals) / len(meals) if meals else None,
            "tested": len(counts) >= 2 and all(w.finished() for w in worlds)})
    return sorted(rows, key=lambda r: (-r["score"], r["id"]))


def choose_parents(rows, ids=None, count=2):
    chosen, families = [], {}
    for row in rows:
        if not row["viable"] or (ids is not None and row["id"] not in ids):
            continue
        family = row["family"]
        if families.get(family, 0) >= 2:
            if ids is not None:
                raise Refusal("labor.live.familyLimit")
            continue
        chosen.append(row["id"])
        families[family] = families.get(family, 0) + 1
        if ids is None and len(chosen) >= count:
            break
    if not chosen or (ids is not None and set(chosen) != set(ids)):
        raise Refusal("labor.live.chooseParents")
    return chosen


class LiveStation:
    def __init__(self, breeding=False):
        self.breeding = breeding
        self.lock = threading.RLock()
        self.job = None
        self.worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="fish-laboratory")

    def overview(self):
        with self.lock:
            job = self.job
            return {"fish": [{"key": key} for key in ("brisa", "start", "plants")],
                    "results": [], "job": self.summary(job) if job else None}

    def summary(self, job):
        return {k: job[k] for k in ("id", "status", "error", "generation", "steps", "scale", "seeds")}

    def request(self, data, data_dir):
        operation = data.get("operation")
        if operation == "overview":
            return self.overview()
        if operation == "start":
            return self.start(data, data_dir)
        with self.lock:
            job = self.job
            if not job or data.get("job") != job["id"]:
                raise Refusal("labor.errors.unknownJob")
            worlds = list(job["worlds"])
        if operation == "status":
            cursors = data.get("cursors", {})
            states = [w.snapshot(integer(cursors.get(str(i), {}).get("after", 0), 0, 2**53),
                                 integer(cursors.get(str(i), {}).get("scene", 0), 0, 2**53))
                      for i, w in enumerate(worlds)]
            rows = rank_candidates(job["candidates"], worlds)
            return {**self.summary(job), "worlds": states, "candidates": rows,
                    "generations": list(job["generations"]),
                    "canBreed": self.breeding and len(worlds) >= 2 and all(w.finished() for w in worlds)}
        if operation == "cancel":
            job["cancel"].set()
            job["status"] = "cancelled"
            process = job.get("mutationProcess")
            if process and process.poll() is None:
                process.terminate()
            for world in worlds:
                self.worker.submit(world.close)
            return self.summary(job)
        if operation == "next":
            if not self.breeding or len(worlds) < 2 or not all(w.finished() for w in worlds):
                raise Refusal("labor.live.finishWorlds")
            ids = data.get("parents")
            if ids is not None and (not isinstance(ids, list) or not all(isinstance(v, str) for v in ids)):
                raise Refusal("labor.errors.invalidRequest")
            rows = rank_candidates(job["candidates"], worlds)
            selected = choose_parents(rows, ids)
            with self.lock:
                if job["status"] == "preparing":
                    raise Refusal("labor.errors.busy")
                job["status"] = "preparing"
                job["generations"].append({"generation": job["generation"], "candidates": rows,
                                           "parents": selected, "seeds": job["seeds"].copy()})
            parents = [c for c in job["candidates"] if c["id"] in selected]
            self.worker.submit(self.generation, job, parents, worlds)
            return self.summary(job)
        index = integer(data.get("world", 0), 0, max(0, len(worlds) - 1))
        if not worlds:
            raise Refusal("labor.live.preparing")
        world = worlds[index]
        if operation == "life":
            return world.life(data.get("channel", "trial"), integer(data.get("fish"), 1, 2**53))
        if operation == "export":
            identifier = integer(data.get("fish"), 1, 2**53)
            path = world.folder / f"chosen-{identifier}.genome"
            world.command(f"export-genome {identifier} {command_path(path)}")
            return {"genome": genome_text(path.read_text(encoding="utf-8"))}
        if operation != "command":
            raise Refusal("labor.errors.invalidRequest")
        action = data.get("action")
        if action in ("pause", "resume", "step"):
            command = action
        elif action == "speed":
            value = integer(data.get("value"), 0, 1000)
            command = f"delay {value}"
        elif action in ("compare", "end-compare") and not self.breeding:
            command = "lab-" + action
            if action == "compare":
                with world.lock:
                    world.archives["control"] = LifeArchive(world.folder / "control")
                    world.lines["control"] = {}
        elif action == "clear" and not self.breeding:
            command = f"lab-clear {integer(data.get('fish'), 1, 2**53)}"
        elif action == "control" and not self.breeding:
            identifier = integer(data.get("fish"), 1, 2**53)
            axis = data.get("axis")
            if axis not in {"forward", "turn", "jaw", "suction", "energy", "auto-forward", "auto-turn",
                            "auto-mouth", "leaves", "egg", "sperm", "vision", "odor", "touch", "flow"}:
                raise Refusal("labor.errors.invalidRequest")
            value = decimal(data.get("value"), -2, 1)
            command = f"lab-control {identifier} {axis} {value}"
        elif action == "reward" and self.breeding:
            identifier = integer(data.get("fish"), 1, 2**53)
            with world.lock:
                fish = next((p for p in world.latest.get("fish", []) if p["id"] == identifier), None)
            if not fish:
                raise Refusal("animalGone")
            command = f"food {fish['x']} {fish['y']}"
        else:
            raise Refusal("labor.errors.invalidRequest")
        answer = world.command(command)
        if action not in ("pause", "resume", "step", "speed"):
            with world.lock:
                world.interventions.append({"step": world.latest.get("step", 0), "action": action,
                                             "fish": data.get("fish"), "axis": data.get("axis"),
                                             "value": data.get("value")})
        return answer

    def start(self, data, data_dir):
        steps = integer(data.get("steps", 8000), 100, 100000)
        scale = decimal(data.get("scale", .3), 0, 1)
        key = data.get("fish", "plants")
        if key == "draft":
            genome = genome_text(data.get("genome"))
        else:
            genome = start_genome(key).read_text(encoding="utf-8")
        with self.lock:
            if self.job and self.job["status"] not in ("cancelled", "failed"):
                raise Refusal("labor.errors.busy")
            identity = secrets.token_hex(8)
            folder = Path(data_dir) / "labor-live" / identity
            folder.mkdir(parents=True)
            base = folder / "base.genome"
            base.write_text(genome, encoding="utf-8")
            tool = folder / "fish"
            shutil_data = engine_path().read_bytes()
            tool.write_bytes(shutil_data)
            tool.chmod(0o700)
            candidate = {"id": "g0-0", "name": data.get("name") or key, "family": key,
                         "path": base, "parent": None, "viable": True, "mutation": 0}
            job = {"id": identity, "status": "preparing", "error": None, "folder": folder,
                   "tool": tool, "engine": hashlib.sha256(shutil_data).hexdigest(),
                   "steps": steps, "scale": scale, "generation": -1, "worlds": [],
                   "seeds": [], "candidates": [], "generations": [],
                   "cancel": threading.Event(), "mutationProcess": None}
            self.job = job
            self.worker.submit(self.generation, job, [candidate], [])
            return self.summary(job)

    def generation(self, job, parents, old_worlds):
        try:
            for world in old_worlds:
                world.close()
            number = job["generation"] + 1
            folder = job["folder"] / f"generation-{number}"
            folder.mkdir()
            candidates = []
            for parent in parents:
                copies = 3 if self.breeding else 1
                for variant in range(copies):
                    if job["cancel"].is_set():
                        return
                    index = len(candidates)
                    target = folder / f"candidate-{index}.genome"
                    scale = job["scale"] if variant else 0
                    command = [str(job["tool"]), "--breed-from", str(parent["path"]),
                               "--output", str(target), "--mutation-scale", str(scale),
                               "--seed", str(secrets.randbits(32))]
                    process = subprocess.Popen(command, stdout=subprocess.PIPE,
                                               stderr=subprocess.PIPE, text=True)
                    job["mutationProcess"] = process
                    out, errors = process.communicate()
                    if job["cancel"].is_set():
                        return
                    if process.returncode:
                        raise ValueError(errors[-1500:])
                    result = json.loads(out)
                    candidates.append({"id": f"g{number}-{index}", "name": parent["name"],
                                       "family": parent["family"], "parent": parent["id"],
                                       "path": target, "viable": result["viable"], "mutation": scale})
                    with self.lock:
                        job["candidates"] = candidates.copy()
            viable = [c for c in candidates if c["viable"]]
            if not viable:
                raise Refusal("labor.live.noViable")
            seeds = list({secrets.randbits(32) for _ in range(4)})[:2 if self.breeding else 1]
            with self.lock:
                job.update(generation=number, candidates=candidates, seeds=seeds, worlds=[])
            for index, seed in enumerate(seeds):
                if job["cancel"].is_set():
                    return
                world = NativeWorld(job["tool"], folder / f"world-{index}", viable, seed,
                                    3 if self.breeding else 12, job["steps"])
                with self.lock:
                    job["worlds"].append(world)
            with self.lock:
                job["status"] = "running"
            atomic_write(job["folder"] / "experiment.json", json.dumps({
                **self.summary(job), "engine": job["engine"], "generations": job["generations"],
                "candidates": [{k: str(v) if k == "path" else v for k, v in c.items()} for c in candidates]}))
        except Exception as error:
            with self.lock:
                if not job["cancel"].is_set():
                    job.update(status="failed", error=str(error))
        finally:
            job["mutationProcess"] = None

    def close(self):
        with self.lock:
            job = self.job
            if job:
                job["cancel"].set()
                process = job.get("mutationProcess")
                if process and process.poll() is None:
                    process.terminate()
                for world in job["worlds"]:
                    world.close()
        self.worker.shutdown(wait=False, cancel_futures=True)

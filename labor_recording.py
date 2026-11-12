"""Individual laboratory histories, with detail read only for the selected fish."""
import json
from pathlib import Path


class LifeArchive:
    def __init__(self, folder=None):
        self.folder = Path(folder) if folder is not None else None
        self.lives = {}
        if self.folder is not None:
            self.folder.mkdir(parents=True, exist_ok=True)
            # An unfinished world is rerun from its seed; its previous trace must not be appended.
            for pattern in ("fish-*.jsonl", "scene-*.json", "scene-*.json.gz"):
                for path in self.folder.glob(pattern):
                    path.unlink()

    def read(self, event):
        identity, step, kind = str(event["id"]), event["t"], event["kind"]
        if kind == "start":
            self.lives[identity] = {
                "id": event["id"], "parent": event["parent"], "generation": event["generation"],
                "start": step, "hatch": None, "death": None, "cause": None, "last": step,
                "intake": 0, "diet": [], "closings": 0, "emptyClosings": 0,
                "nearSamples": 0, "regularSamples": 0, "firstIntake": None,
                "lastIntake": None, "longestNoFood": {"from": step, "to": step},
                "phases": {}, "events": [],
            }
        life = self.lives.get(identity)
        if life is None:
            return
        if self.folder is not None:
            with (self.folder / f"fish-{identity}.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(event, separators=(",", ":")) + "\n")
        life["last"] = max(life["last"], step)
        if life["hatch"] is not None:
            since = life["lastIntake"] if life["lastIntake"] is not None else life["hatch"]
            gap = life["longestNoFood"]
            if step - since > gap["to"] - gap["from"]:
                life["longestNoFood"] = {"from": since, "to": step}
        if kind == "point":
            life["gut"], life["energy"], life["maturity"] = event["gut"], event["energy"], event["maturity"]
            if event["regular"]:
                life["regularSamples"] += 1
                life["nearSamples"] += bool(event["near"])
        elif kind == "intake":
            if life["firstIntake"] is None:
                life["firstIntake"] = step
                life["phases"]["feeding"] = step
                life["events"].append({"kind": "firstIntake", "t": step})
            life["lastIntake"] = step
            life["intake"] += sum(event["diet"])
            if not life["diet"]:
                life["diet"] = [0] * len(event["diet"])
            life["diet"] = [a + b for a, b in zip(life["diet"], event["diet"])]
        elif kind == "close":
            life["closings"] += 1
            life["emptyClosings"] += bool(event["empty"])
        elif kind in ("hatch", "full", "emptying", "ripe", "laid", "death"):
            life["events"].append({k: v for k, v in event.items() if k not in ("event", "id")})
            if kind == "hatch":
                life["hatch"] = step
                life["hatchLeaf"] = event["leaf"]
                life["longestNoFood"] = {"from": step, "to": step}
            elif kind == "full" and life["firstIntake"] is not None:
                life["phases"].setdefault("full", step)
            elif kind == "emptying" and "full" in life["phases"]:
                life["phases"].setdefault("emptying", step)
            elif kind == "death":
                life["death"], life["cause"] = step, event["cause"]


def read_life(folder, identity, length=None):
    path = Path(folder) / f"fish-{identity}.jsonl"
    if not path.is_file():
        return {"points": [], "events": []}
    points, events = {}, []
    with path.open("rb") as stream:
        for line in stream.read(length).splitlines() if length is not None else stream:
            event = json.loads(line)
            if event["kind"] == "point":
                points[event["t"]] = {k: v for k, v in event.items() if k not in ("event", "kind", "id")}
            else:
                events.append({k: v for k, v in event.items() if k not in ("event", "id")})
    return {"points": sorted(points.values(), key=lambda p: p["t"]), "events": events}

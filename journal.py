"""Compact species profiles, durable events and twelve deduplicated genome slots."""

from journal_population import record_births, record_viability, record_dominance
from journal_records import choose_records, record_diversity
from journal_species import observe_species
from journal_pedigree import update_pedigree
from protocol_schema import Fish
from collections import defaultdict
from pathlib import Path
import hashlib, json, time
from history import atomic_write
from wording import Refusal

# Events carry a wording key and its values; the interface phrases them in its language.
RECORDS = ("nutrition", "offspring", "age", "generation")
from species_traits import CATALOG, summary_labels


class Journal:

    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "catalog.json"
        self.catalog = (
            json.loads(self.path.read_text())
            if self.path.exists()
            else {group: {} for group in ("records", "recent", "runs", "lineages", "favorites")}
        )
        self.candidate_cache = {}
        self.intake_profiles = {}
        self.session = None
        self.known = {}
        self.events = []
        self.total_events = 0
        self.last_step = -1
        self.last_notice = {}
        self.announced = set()
        self.last_persist = 0
        self.species = {}
        self.traces = {}
        self.pedigree = {}
        self.status = {}
        self.records = {}
        self.generation = 0

    def begin(self, session):
        self.session = Path(session)
        self.event_path = self.session / "events.jsonl"
        self.state_path = self.session / "profiles.json"
        self.events = []
        self.total_events = 0
        if self.event_path.exists():
            with self.event_path.open() as source:
                for line in source:
                    entry = json.loads(line)
                    self.total_events = max(self.total_events, entry["id"])
                    self.events.append(entry)
                    if len(self.events) > 8192:
                        del self.events[:-4096]
            self.events = self.events[-4096:]
        state = (
            json.loads(self.state_path.read_text()) if self.state_path.exists() else {}
        )
        self.pedigree = {int(row[0]): row for row in state.get("ancestry", [])}
        self.known = state.get("known", {})
        self.announced = set(state.get("announced", []))
        self.status = state.get("status", {})
        self.records = state.get("records", {})
        self.last_step = -1
        self.last_notice = {}
        self.species = {}
        self.traces = {}
        self.generation += 1
        self.candidate_cache = {}
        self.intake_profiles = {}
        for known in self.known.values():
            self.announced.update(known.get("labels", []))

    def event_page(self, after=0, before=0, limit=500):
        limit = max(1, min(500, limit))
        if not before and (
            not after or not self.events or after >= self.events[0]["id"] - 1
        ):
            rows = (
                self.events
                if not after
                else [e for e in self.events if e["id"] > after]
            )
            return rows[-limit:] if not after else rows[:limit]
        rows = []
        if self.event_path.exists():
            with self.event_path.open() as source:
                for line in source:
                    e = json.loads(line)
                    if before and e["id"] >= before:
                        break
                    if e["id"] > after:
                        rows.append(e)
                    if after and (not before) and (len(rows) >= limit):
                        return rows
                    if len(rows) > 2 * limit:
                        del rows[:-limit]
        return rows[-limit:]

    def event(self, key, wording, step, data=None, species=0, kind="evolution", milestone=False):
        if self.last_notice.get(key, -100000) + 1200 > step:
            return
        self.last_notice[key] = step
        important = (
            key in ("first-trait-Riese", "first-trait-Koloss")
            or kind in ("record", "warning")
            or key == "recovery"
            or (
                milestone
                and (
                    kind != "trait"
                    or CATALOG.get(key.removeprefix("first-trait-"), {}).get("group")
                    == "Kombination"
                )
                and (not key.startswith("species-name-"))
            )
        )
        entry = {
            "important": important,
            "id": self.total_events + 1,
            "step": step,
            "species_id": species,
            "kind": kind,
            "wording": wording,
            "data": data or {},
            "milestone": milestone,
        }
        self.events.append(entry)
        self.total_events += 1
        if len(self.events) > 4096:
            del self.events[:-4096]
        with self.event_path.open("a", encoding="utf8") as out:
            out.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def milestone(self, key, wording, step, data=None, species=0, kind="evolution"):
        achieved = self.status.setdefault("milestones", {})
        if key in achieved:
            return
        self.event(key, wording, step, data, species, kind, milestone=True)
        achieved[key] = step

    def observe(self, f):
        if f.get("historical") or f.get("step", 0) <= self.last_step:
            return []
        event_count = self.total_events
        step = f["step"]
        self.last_step = step
        fish = f.get("fish", [])
        traits = {t["id"]: t for t in f.get("traits", [])}
        self.intake_profiles = traits
        groups = defaultdict(list)
        for row in fish:
            if row[Fish.HATCHED]:
                groups[row[Fish.SPECIES]].append(row)
        mortality_changed = update_pedigree(self, f, fish, step)
        tasks = []
        confirmed = []
        catalog_changed = False
        for s in f.get("species", []):
            result = observe_species(self, f, s, groups[s["id"]], traits)
            tasks.extend(result.tasks)
            confirmed.extend(result.confirmed)
            catalog_changed |= result.catalog_changed
        tasks.extend(choose_records(self, fish))
        record_diversity(self, confirmed, step)
        deepest = record_births(self, f, fish, step)
        record_viability(self, f, deepest, step)
        record_dominance(self, f, confirmed, step)
        self.persist_observations(event_count, mortality_changed, catalog_changed)
        return tasks

    def commit(self, task, genome, step=None, intake=None):
        kind, key, p, s, value = task
        if kind == "record" and value <= self.catalog["runs"].get(self.session.name + ":" + key, {}).get(
            "value", -1
        ):
            return
        event_step = self.last_step if step is None else step
        lines = genome.splitlines()
        canonical = b"\n".join(
            (
                (
                    line
                    if not line.startswith(b"History ")
                    else b" ".join(line.split()[:2])
                )
                for i, line in enumerate(lines)
                if i < 3 or line.startswith((b"History ", b"Node ", b"Conn ", b"End"))
            )
        )
        digest = hashlib.sha256(canonical or genome).hexdigest()[:24]
        path = self.root / (digest + ".genome")
        if not path.exists():
            path.write_bytes(genome)
        intake = intake if intake is not None else self.intake_profiles.get(p[Fish.ID], {})
        entry = {
            "diet": intake.get("diet"),
            "raw_diet": intake.get("raw_diet"),
            "id": digest,
            "fish_id": p[Fish.ID],
            "species_id": s["id"],
            "session": self.session.name,
            "name": s["name"],
            "genus": s.get("genus_name", s["name"].split()[0]),
            "labels": s.get("summary_labels", s.get("labels", []))[:3],
            "portrait": p,
            "value": value,
            "step": event_step,
            "updated": time.time(),
            "category": key if kind == "record" else "recent",
        }
        if kind == "record":
            self.catalog["runs"][self.session.name + ":" + key] = entry
            if value > self.catalog["records"].get(key, {}).get("value", -1):
                self.catalog["records"][key] = entry
        elif kind == "favorite":
            self.catalog["favorites"][digest] = entry
        else:
            self.catalog["lineages" if kind == "lineage" else "recent"][key] = entry
        if kind == "record":
            notice = self.status.setdefault("record_notices", {})
            last = notice.get(key, {})
            if (
                not last
                or (
                    last.get("id") != digest
                    and event_step - last.get("step", 0) >= 1200
                )
                or value >= max(last.get("value", 0) * 1.15, last.get("value", 0) + 1)
            ):
                if event_step - last.get("step", -1200) >= 1200:
                    self.event(
                        "record-" + key,
                        "record",
                        event_step,
                        {
                            "category": key,
                            "name": s["name"],
                            "value": round(value, 1) if key == "nutrition" else int(value),
                        },
                        s["id"],
                        "record",
                    )
                    notice[key] = {"id": digest, "step": event_step, "value": value}
        recent = sorted(
            self.catalog["recent"].items(),
            key=lambda pair: pair[1]["updated"],
            reverse=True,
        )
        self.catalog["recent"] = dict(recent[:8])
        sessions = sorted({e["session"] for group in ("runs", "lineages") for e in self.catalog[group].values()}, reverse=True)[:8]
        for group in ("runs", "lineages"):
            self.catalog[group] = {k: e for k, e in self.catalog[group].items() if e["session"] in sessions}
        # Bound automatic representatives, preserving genera before second niches.
        keep = {}
        for session in sessions:
            groups = {}
            rows = sorted(((k, e) for k, e in self.catalog["lineages"].items() if e["session"] == session), key=lambda pair: pair[1]["value"], reverse=True)
            for k, e in rows:
                groups.setdefault(e["genus"], []).append((k, e))
            count = 0
            while groups and count < 16:
                for genus in list(groups):
                    k, e = groups[genus].pop(0)
                    keep[k] = e
                    count += 1
                    if not groups[genus]:
                        del groups[genus]
                    if count == 16:
                        break
        self.catalog["lineages"] = keep
        atomic_write(self.path, json.dumps(self.catalog, ensure_ascii=False))
        used = {e["id"] for group in self.catalog.values() for e in group.values()}
        for file in self.root.glob("*.genome"):
            if file.stem not in used:
                file.unlink()

    def accept(self, event):
        kind, key = (event["kind"], event["key"])
        p = event["fish"]
        s = next((s for s in event["species"] if s["id"] == p[Fish.SPECIES]), None)
        if not s:
            return
        known = self.known.get(str(s["id"]), {})
        details = {
            word: known["trait_details"][word]
            for word in known.get("labels", [])
            if word in known.get("trait_details", {})
        }
        s = {
            **s,
            "labels": known.get("labels", []),
            "summary_labels": summary_labels(details),
        }
        content = event.get("genome", "").encode()
        if kind == "record":
            if content:
                self.candidate_cache[key] = content
            else:
                content = self.candidate_cache.get(key, b"")
        if not content:
            return
        if kind == "recent":
            key = self.session.name + ":" + key
        self.commit((kind, key, p, s, event["value"]), content, event["step"], event.get("intake"))

    def snapshot(self):
        data = self.view()
        if self.event_path.exists():
            with self.event_path.open() as source:
                data["events"] = [
                    entry
                    for line in source
                    if (entry := json.loads(line))["id"] <= self.total_events
                ]
        elif self.total_events > len(self.events):
            raise Refusal("eventHistoryMissing")
        else:
            data["events"] = list(self.events)
        return data

    def view(self):
        entries = {}
        for key, e in self.catalog["records"].items():
            entries.setdefault(e["id"], {**e, "categories": [], "recent": False})[
                "categories"
            ].append(key)
        for e in self.catalog["favorites"].values():
            entries.setdefault(e["id"], {**e, "categories": ["favorite"], "recent": False})
        for e in self.catalog["recent"].values():
            entries.setdefault(e["id"], {**e, "categories": [], "recent": False})[
                "recent"
            ] = True
        return {
            "species_ancestry": [
                known["lineage"] for known in self.known.values() if "lineage" in known
            ],
            "ancestry": list(self.pedigree.values()),
            "events": self.events[-500:],
            "total_events": self.total_events,
            "archive": list(entries.values()),
            "profiles": list(self.species.values()),
            "traces": self.traces,
            "records": self.catalog["records"],
        }

    def resolve(self, identifier):
        ids = {e["id"] for group in self.catalog.values() for e in group.values()}
        if identifier not in ids:
            raise Refusal("genomeNotArchived")
        return self.root / (identifier + ".genome")

    def persist_observations(self, event_count, mortality_changed, catalog_changed):
        if (
            self.total_events != event_count
            or mortality_changed
            or time.monotonic() - self.last_persist >= 2
        ):
            atomic_write(
                self.state_path,
                json.dumps(
                    {
                        "ancestry": list(self.pedigree.values()),
                        "known": self.known,
                        "announced": sorted(self.announced),
                        "status": self.status,
                        "records": self.records,
                    },
                    ensure_ascii=False,
                ),
            )
            self.last_persist = time.monotonic()
        if catalog_changed:
            atomic_write(self.path, json.dumps(self.catalog, ensure_ascii=False))

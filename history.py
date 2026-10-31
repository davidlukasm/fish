"""Step-based ecological observations and complete, compressed milestones."""

from datetime import datetime, timezone
from pathlib import Path
import gzip, json, uuid, shutil
from file_io import atomic_write
from wording import Refusal

# Current checkpoint family.
MODEL = "tank-ecology-47"
MAX_POINTS = 600
MAX_MILESTONES = 10
MAX_SESSIONS = 6
MAX_ARCHIVE_BYTES = 128 * 1024 * 1024


def read_metadata(directory):
    meta = json.loads((directory / "meta.json").read_text())
    if (
        not isinstance(meta, dict)
        or meta.get("id") != directory.name
        or not isinstance(meta.get("created"), str)
        or not isinstance(meta.get("options"), dict)
    ):
        raise Refusal("invalidSessionMeta")
    return meta


def read_entries(path, required):
    rows = json.loads(path.read_text())
    if not isinstance(rows, list) or any(
        not isinstance(row, dict)
        or any(not isinstance(row.get(key), kind) for key, kind in required.items())
        for row in rows
    ):
        raise Refusal("invalidHistoryEntries")
    return rows


def read_milestones(directory):
    rows = read_entries(
        directory / "milestones.json", {"id": str, "key": str, "step": int}
    )
    if any(
        row.get("blob") is not None and not isinstance(row["blob"], str) for row in rows
    ):
        raise Refusal("invalidStorageReference")
    return rows


class History:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.session = None
        self.meta = None
        self.points = []
        self.milestones = []

    def begin(self, options, resume=True):
        active = self.root / "active.json"
        if resume and active.exists():
            try:
                identifier = json.loads(active.read_text())["id"]
                if (
                    not isinstance(identifier, str)
                    or not identifier
                    or identifier in (".", "..")
                    or Path(identifier).name != identifier
                ):
                    raise Refusal("invalidRun")
                directory = self.root / identifier
                meta = read_metadata(directory)
                if meta.get("model") == MODEL and (directory / "latest.state").exists():
                    self.open(identifier)
                    return str(directory / "latest.state")
            except (OSError, ValueError, KeyError, TypeError):
                pass
        identifier = (
            datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
            + "-"
            + uuid.uuid4().hex[:8]
        )
        self.session = self.root / identifier
        self.session.mkdir()
        self.meta = {
            "id": identifier,
            "created": datetime.now(timezone.utc).isoformat(),
            "options": options,
            "model": MODEL,
            "last_periodic_step": 0,
        }
        self.points = []
        self.milestones = []
        self.save()
        atomic_write(active, json.dumps({"id": identifier}))
        return None

    def open(self, identifier):
        directory = self.root / identifier
        meta = read_metadata(directory)
        points = read_entries(directory / "history.json", {"step": int})
        milestones = read_milestones(directory)
        self.session, self.meta = directory, meta
        self.points, self.milestones = points, milestones
        self.trim()
        self.save()
        self.clean_orphans()

    def clean_orphans(self):
        keep = {m["blob"] for m in self.milestones if m.get("blob")}
        directory = self.session / "milestones"
        if directory.exists():
            try:
                paths = list(directory.iterdir())
            except OSError:
                return
            for path in paths:
                if path.name.split(".")[0] not in keep:
                    try:
                        path.unlink()
                    except OSError:
                        pass

    def trim(self):
        self.points = self.points[-MAX_POINTS:]
        automatic = [m for m in self.milestones if not m["key"].startswith("manual-")]
        discard = {m["id"] for m in automatic[:-MAX_MILESTONES]}
        self.milestones = [m for m in self.milestones if m["id"] not in discard]
        sessions = self.sessions()
        disposable, entries_by_session = [], {}
        protected = set()
        for old in sessions:
            try:
                entries = (
                    self.milestones
                    if old["id"] == self.meta["id"]
                    else read_milestones(self.root / old["id"])
                )
            except (OSError, ValueError):
                continue
            entries_by_session[old["id"]] = entries
            manual = {m.get("blob") for m in entries if m["key"].startswith("manual-")}
            protected.update((old["id"], blob) for blob in manual)
            if not manual:
                disposable.append(old)
        for old in disposable[MAX_SESSIONS:]:
            if old["id"] != self.meta["id"]:
                try:
                    shutil.rmtree(self.root / old["id"])
                except OSError:
                    pass
        blobs = []
        for path in self.root.glob("*/milestones/*.state.gz"):
            try:
                size = path.stat().st_size
                population = path.with_name(path.name.split(".")[0] + ".population")
                size += population.stat().st_size if population.exists() else 0
                blobs.append((path.stat().st_mtime, path, size))
            except OSError:
                continue
        blobs.sort(key=lambda item: item[0])
        total = sum(size for _, _, size in blobs)
        for _, path, size in blobs:
            if total <= MAX_ARCHIVE_BYTES:
                break
            identifier = path.parent.parent.name
            blob = path.name.split(".")[0]
            if identifier not in entries_by_session or (identifier, blob) in protected:
                continue
            entries = [
                m for m in entries_by_session[identifier] if m.get("blob") != blob
            ]
            try:
                if identifier == self.meta["id"]:
                    self.milestones = entries
                else:
                    atomic_write(
                        path.parent.parent / "milestones.json",
                        json.dumps(entries, ensure_ascii=False),
                    )
                for related in path.parent.glob(blob + ".*"):
                    related.unlink(missing_ok=True)
                entries_by_session[identifier] = entries
                total -= size
            except OSError:
                continue

    def save(self):
        for name, value in [
            ("meta", self.meta),
            ("history", self.points),
            ("milestones", self.milestones),
        ]:
            atomic_write(
                self.session / f"{name}.json",
                json.dumps(value, ensure_ascii=False, allow_nan=False),
            )

    def record(self, event, journal=None):
        previous = self.points, self.milestones
        self.points, self.milestones = list(self.points), list(self.milestones)
        try:
            self.record_entry(event, journal)
        except (ValueError, OSError, KeyError, TypeError):
            self.points, self.milestones = previous
            raise

    def record_entry(self, event, journal):
        def spool_file(key):
            path = Path(event[key]).resolve()
            if path.parent != (self.session / "spool").resolve():
                raise Refusal("invalidSnapshot")
            return path

        path = spool_file("population_path") if event.get("population_path") else None
        state_path = spool_file("state_path") if event.get("state_path") else None
        manual = event["event"] == "bookmark"
        point = {
            k: v
            for k, v in event.items()
            if k
            not in (
                "event",
                "population_path",
                "state_path",
                "species",
                "request",
            )
        }
        point["events"] = point.get("events", [])[-8:]
        names = {s["id"]: s["name"] for s in event.get("species", [])}
        point["name"] = names.get(point.get("species_id"))
        if not manual:
            self.points = [p for p in self.points if p["step"] != point["step"]] + [
                point
            ]
            self.points.sort(key=lambda p: p["step"])
        if manual:
            blob_id = None
            if path is not None and state_path is not None:
                population = path.read_bytes()
                state = state_path.read_bytes()
                blob_id = uuid.uuid4().hex[:12]
                directory = self.session / "milestones"
                directory.mkdir(exist_ok=True)
                atomic_write(directory / f"{blob_id}.population", population)
                atomic_write(
                    directory / f"{blob_id}.state.gz",
                    gzip.compress(state, compresslevel=3),
                )
                if journal is not None:
                    atomic_write(
                        directory / f"{blob_id}.journal.json",
                        json.dumps(journal, ensure_ascii=False, allow_nan=False),
                    )
            # The interface words the reason; the name is absent for the tank as a whole.
            self.milestones.append(
                {
                    **point,
                    "id": uuid.uuid4().hex[:12],
                    "blob": blob_id,
                    "session": self.meta["id"],
                    "key": "manual-" + uuid.uuid4().hex,
                    "reason": "experiment" if point.get("experiment") else "bookmark",
                    "species_id": point.get("species_id", 0),
                    "created": datetime.now(timezone.utc).isoformat(),
                    "complete_state": bool(blob_id),
                }
            )
        self.trim()
        self.save()
        self.clean_orphans()
        if path:
            path.unlink()
        if state_path:
            state_path.unlink()

    def sessions(self):
        result = []
        for path in self.root.glob("*/meta.json"):
            try:
                m = read_metadata(path.parent)
            except (OSError, ValueError):
                continue
            result.append(
                {
                    "id": m["id"],
                    "created": m["created"],
                    "options": m["options"],
                    "model": m.get("model", "unknown"),
                }
            )
        return sorted(result, key=lambda s: s["created"], reverse=True)

    def view(self, identifier=None):
        if identifier is None or identifier == self.meta["id"]:
            meta, points, milestones = self.meta, self.points, self.milestones
        else:
            if identifier not in {s["id"] for s in self.sessions()}:
                raise Refusal("unknownRun")
            directory = self.root / identifier
            meta = read_metadata(directory)
            points = read_entries(directory / "history.json", {"step": int})
            milestones = read_milestones(directory)
        return {
            "session": meta,
            "points": points,
            "milestones": milestones,
            "sessions": self.sessions(),
            "active": self.meta["id"],
            "retention": {
                "points": MAX_POINTS,
                "milestones": MAX_MILESTONES,
                "sessions": MAX_SESSIONS,
                "archive_mib": MAX_ARCHIVE_BYTES // (1024 * 1024),
                "manual_unlimited": True,
            },
        }

    def resolve(self, session, identifier):
        view = self.view(session)
        entry = next((m for m in view["milestones"] if m["id"] == identifier), None)
        if entry is None:
            raise Refusal("unknownMilestone")
        if not entry.get("complete_state"):
            raise Refusal("milestoneStatisticsOnly")
        return (
            self.root
            / view["session"]["id"]
            / "milestones"
            / f'{entry["blob"]}.population',
            entry,
        )

    def materialize_state(self, session, identifier):
        _, entry = self.resolve(session, identifier)
        source = self.root / session / "milestones" / f'{entry["blob"]}.state.gz'
        destination = (
            self.session / "spool" / ("observed-" + uuid.uuid4().hex + ".state")
        )
        destination.parent.mkdir(exist_ok=True)
        with gzip.open(source, "rb") as f:
            destination.write_bytes(f.read())
        return destination, entry

    def observation(self, session, entry):
        source = self.root / session / "milestones" / f'{entry["blob"]}.journal.json'
        journal = json.loads(source.read_text()) if source.exists() else {}
        return {
            "key": session + ":" + entry["id"],
            "session": session,
            "step": entry["step"],
            "journal": journal,
        }

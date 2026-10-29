"""Start-line selection reuses the persistent genome archive and native anatomy."""

import copy
import hashlib
import time
import json
import subprocess
import threading
import tempfile
from pathlib import Path
from history import atomic_write
from protocol_schema import Fish, Anatomy
from viewer_paths import ROOT, command_path


class PopulationCatalog:
    def __init__(self, simulation):
        self.simulation = simulation
        self.preview_lock = threading.Lock()
        self.previews = {}

    def entries(self):
        sim = self.simulation
        founders = [dict(e, group="founders") for e in sim.founders.state()["entries"]]
        with sim.lock:
            catalog = copy.deepcopy(sim.journal.catalog)
        favorites = {e["id"] for e in catalog["favorites"].values()}
        established = {e["id"] for group in ("records", "recent", "runs", "lineages")
                       for e in catalog[group].values()}
        saved = {}
        for group in ("records", "recent", "runs", "lineages", "favorites"):
            for e in catalog[group].values():
                if e["id"] not in saved or e["updated"] > saved[e["id"]]["updated"]:
                    saved[e["id"]] = e
        rows = []
        for e in sorted(saved.values(), key=lambda e: (e["session"], e["value"]), reverse=True):
            portrait = e.get("portrait", ())
            def measured(index):
                return portrait[index] if not e.get("imported") and len(portrait) > index else None
            nutrition, steps = measured(Fish.NUTRITION), measured(Fish.NUTRITION_STEPS)
            rows.append({
                **e, "id": "archive:" + e["id"],
                "group": "saved" if e["id"] in established else "favorites",
                "favorite": e["id"] in favorites,
                "observed_offspring": measured(Fish.OFFSPRING),
                "observed_generation": measured(Fish.GENERATION),
                "observed_age": measured(Fish.AGE),
                "observed_diet": e.get("diet"),
                "observed_raw_diet": e.get("raw_diet"),
                "observed_digested": measured(Fish.DIGESTED),
                "diet_scope": "Individuum" if e.get("diet") is not None else "noch ungemessen",
                "observed_intake": 100 * nutrition / steps
                if nutrition is not None and steps else None,
            })
        for row in founders + rows:
            portrait = row.get("portrait", ())
            organs = portrait[Fish.ORGANS] if len(portrait) > Fish.ORGANS else ()
            row["anatomy"] = {
                key: organs[index] for key, index in
                (("jaw", Anatomy.JAW_LENGTH), ("gut", Anatomy.GUT_LENGTH),
                 ("teeth", Anatomy.BLUNT_TEETH), ("undulation", Anatomy.UNDULATION))
                if len(organs) > index
            } if organs else row.get("anatomy", {})
            row["sense_cells"] = {
                key: sum(organs[i] if len(organs) > i else 0 for i in pair)
                for key, pair in (("eye", (Anatomy.EYE_LEFT, Anatomy.EYE_RIGHT)),
                                  ("nose", (Anatomy.SMELL_LEFT, Anatomy.SMELL_RIGHT)),
                                  ("lateral", (Anatomy.LATERAL_LEFT, Anatomy.LATERAL_RIGHT)))
            } if organs else row.get("sense_cells", {})
            if row["group"] != "founders" and not row.get("imported"):
                row["observed_speed"] = portrait[Fish.RELATIVE_SPEED] if len(portrait) > Fish.RELATIVE_SPEED else None
                row["observed_torque"] = abs(portrait[Fish.TORQUE]) if len(portrait) > Fish.TORQUE else None
        # Present different genera before another representative of the same genus.
        ordered = []
        for category in ("favorites", "saved"):
            groups = {}
            for row in rows:
                if row["group"] == category:
                    groups.setdefault(row.get("genus", row["name"].split()[0]), []).append(row)
            while groups:
                for genus in list(groups):
                    ordered.append(groups[genus].pop(0))
                    if not groups[genus]:
                        del groups[genus]
        return {"entries": founders + ordered}

    def resolve(self, identifier):
        if not isinstance(identifier, str):
            raise ValueError("Ungültige Startlinie")
        if identifier.startswith("founder:"):
            entry = next((e for e in self.simulation.founders.state()["entries"]
                          if e["id"] == identifier), None)
            if entry:
                return ROOT / "genomes/pool" / entry["file"]
        elif identifier.startswith("archive:"):
            return self.simulation.journal.resolve(identifier.removeprefix("archive:"))
        raise ValueError("Startlinie nicht mehr verfügbar; Auswahl neu öffnen.")

    def preview(self, identifier):
        with self.preview_lock:
            with self.simulation.lock:
                path = self.resolve(identifier)
                content = path.read_bytes()
                stamp = path.stat().st_mtime_ns
            key = (identifier, stamp)
            if key in self.previews:
                return self.previews[key]
            with tempfile.TemporaryDirectory(prefix="fish-preview-") as directory:
                source = Path(directory) / "preview.genome"
                source.write_bytes(content)
                try:
                    result = subprocess.run(
                        [str(ROOT / "bin/fish"), "--preview-genome", str(source)],
                        cwd=ROOT, capture_output=True, text=True, timeout=25,
                    )
                except subprocess.TimeoutExpired as error:
                    raise ValueError("Entwicklung der Startlinie dauert zu lange.") from error
            if result.returncode:
                raise ValueError(result.stderr.strip() or "Vorschau konnte nicht entwickelt werden.")
            portrait = json.loads(result.stdout)
            if len(self.previews) >= 128:
                self.previews.pop(next(iter(self.previews)))
            self.previews[key] = {"portrait": portrait}
            return self.previews[key]

    def import_genome(self, content, name):
        if not isinstance(content, str) or not content or len(content.encode()) > 1000000:
            raise ValueError("Aktuelles Fischgenom erforderlich (höchstens 1 MB).")
        if not isinstance(name, str):
            raise ValueError("Dateiname fehlt.")
        # An unnamed genome takes its file name, so the founder species is called after it.
        if "~NAME" not in content:
            label = " ".join(Path(name).stem.replace("_", " ").split())[:40]
            label = "".join(c for c in label if c not in '"\\' and ord(c) >= 32)
            if label:
                content = content.rstrip("\n") + '\n~NAME "' + label + '"\n'
        content = content.encode()
        with tempfile.TemporaryDirectory(prefix="fish-import-") as directory:
            path = Path(directory) / "import.genome"
            path.write_bytes(content)
            try:
                result = subprocess.run(
                    [str(ROOT / "bin/fish"), "--preview-genome", str(path)],
                    cwd=ROOT, capture_output=True, text=True, timeout=25)
            except subprocess.TimeoutExpired as error:
                raise ValueError("Entwicklung des Genoms dauert zu lange.") from error
        if result.returncode:
            raise ValueError(result.stderr.strip() or "Genom konnte nicht entwickelt werden.")
        portrait = json.loads(result.stdout)
        digest = hashlib.sha256(content).hexdigest()[:24]
        name = Path(name).stem[:120].strip() or "Importiertes Genom"
        with self.simulation.lock:
            journal = self.simulation.journal
            (journal.root / (digest + ".genome")).write_bytes(content)
            journal.catalog["favorites"][digest] = {
                "id": digest, "name": name, "genus": name, "labels": [],
                "portrait": portrait, "value": 0, "session": "Import", "step": 0,
                "updated": time.time(), "imported": True,
            }
            atomic_write(journal.path, json.dumps(journal.catalog, ensure_ascii=False))
        return "archive:" + digest

    def selected(self, ids, count, budgets):
        if (not isinstance(ids, list) or len(ids) > min(128, count)
                or any(not isinstance(i, str) for i in ids)
                or len(set(ids)) != len(ids)):
            raise ValueError("Jede Startlinie einmal wählen, mindestens ein Fisch je Linie (höchstens 128 Linien).")
        content = []
        for identifier in ids:
            portrait = self.preview(identifier)["portrait"]
            if (portrait[Fish.NODES] > budgets["max_neurons"]
                    or portrait[Fish.EDGES] > budgets["max_connections"]):
                raise ValueError("Eine gewählte Startlinie überschreitet das eingestellte Gehirnbudget.")
            with self.simulation.lock:
                content.append(self.resolve(identifier).read_bytes())
        return content

    def favorite(self, identifier, enabled):
        sim = self.simulation
        with sim.lock:
            self.resolve(identifier)
            if not identifier.startswith("archive:"):
                raise ValueError("Favoriten stammen aus gespeicherten Fischen.")
            digest = identifier.removeprefix("archive:")
            if enabled:
                entry = next(e for group in sim.journal.catalog.values()
                             for e in group.values() if e["id"] == digest)
                sim.journal.catalog["favorites"][digest] = dict(entry)
            else:
                sim.journal.catalog["favorites"].pop(digest, None)
            atomic_write(sim.journal.path, json.dumps(sim.journal.catalog, ensure_ascii=False))
        return "Favorit gespeichert." if enabled else "Favorit entfernt."

    def favorite_fish(self, identifier):
        sim = self.simulation
        with sim.lifecycle:
            with sim.lock:
                frame = sim.latest or {}
                p = next((p for p in frame.get("fish", [])
                          if p[Fish.ID] == identifier and p[Fish.HATCHED]), None)
                if p is None:
                    raise ValueError("Einen lebenden, geschlüpften Fisch auswählen.")
                p = copy.deepcopy(p)
                s = copy.deepcopy(sim.journal.species.get(p[Fish.SPECIES]) or next(
                    (s for s in frame["species"] if s["id"] == p[Fish.SPECIES]), None
                ))
                if s is None:
                    raise ValueError("Artprofil noch nicht verfügbar.")
                path = sim.history.session / "spool" / ("favorite-" + str(identifier) + ".genome")
            try:
                sim.command(f"export-genome {identifier} {command_path(path)}")
                content = path.read_bytes()
                with sim.lock:
                    sim.journal.commit(("favorite", str(identifier), p, s, p[Fish.OFFSPRING]), content)
            finally:
                path.unlink(missing_ok=True)
        return "Fisch als Favorit gespeichert."

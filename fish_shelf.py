"""The fish the game offers: the finished fish of the shelf and, apart from them, the drafts.
Each is a blueprint with the genome built from it (werkzeug/fischbau.mjs)."""
import json
from viewer_paths import ROOT

SHELF, DRAFTS = "shelf", "drafts"
FOLDERS = {SHELF: ROOT / "genomes/regal", DRAFTS: ROOT / "genomes/entwuerfe"}
BLUEPRINT, GENOME = ".fish.json", ".genome"


def offered():
    """Every offered fish as its key, category and name, the shelf first."""
    rows = []
    for category, folder in FOLDERS.items():
        for path in sorted(folder.glob("*" + BLUEPRINT)):
            stem = path.name.removesuffix(BLUEPRINT)
            if path.with_name(stem + GENOME).is_file():
                name = json.loads(path.read_text(encoding="utf-8")).get("name") or stem
                rows.append({"key": category + "/" + stem, "category": category, "name": name})
    return rows


def blueprint(key):
    """The blueprint of an offered fish, or None for anything else."""
    if isinstance(key, str) and any(row["key"] == key for row in offered()):
        category, stem = key.split("/")
        return FOLDERS[category] / (stem + BLUEPRINT)
    return None


def genome(key):
    path = blueprint(key)
    return path.with_name(path.name.removesuffix(BLUEPRINT) + GENOME) if path else None


def genomes(category):
    return [genome(row["key"]) for row in offered() if row["category"] == category]

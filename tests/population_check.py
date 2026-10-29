from suite import binary
"""Focused checks for founder measurements and overlapping start collections."""
from pathlib import Path
from types import SimpleNamespace
import json
import math
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from founder_search import FounderSearch
from population_catalog import PopulationCatalog

founders = FounderSearch().state()["entries"]
for e in founders:
    assert 0 <= e["foraging"] <= 1
    assert math.isfinite(e["foraging_speed"]) and e["foraging_speed"] >= 0
    assert math.isfinite(e["foraging_turn"]) and e["foraging_turn"] >= 0
    assert 0 <= e["foraging_eaten"] <= 6 and 0 <= e["foraging_samples"] <= 1800
    assert all(v is None or 0 <= v <= 1 for v in e["sense_foraging"])
    if e["measured"]:
        assert 0 < e["hatches"] <= e["hatch_attempts"] <= 3
        assert e["hatch_steps"] <= 1000
    else:
        assert e["overall_score"] is None and e["foraging_samples"] == 0
        assert e["feeding_offspring"] == 0 and e["feeding_parents"] == 0
    assert e["observed_diet"] is None or (len(e["observed_diet"]) == 11
           and all(0 <= u <= r for u, r in zip(e["observed_diet"], e["observed_raw_diet"])))

with tempfile.TemporaryDirectory() as directory:
    def entry(id, genus):
        return dict(id=id, name=genus + " prima", genus=genus, updated=1, value=2,
                    session="run-test", step=500)

    a, b, c = entry("a", "Nerella"), entry("b", "Velira"), entry("c", "Serella")
    archive = dict(records={"a": a, "b": b}, recent={}, runs={}, lineages={}, favorites={"c": c})
    journal = SimpleNamespace(catalog=archive, path=Path(directory) / "catalog.json",
                              resolve=lambda id: ROOT / "genomes/cppn-start.genome")
    sim = SimpleNamespace(lock=threading.RLock(), journal=journal, founders=FounderSearch())
    catalog = PopulationCatalog(sim)
    before = [e["id"] for e in catalog.entries()["entries"] if e["group"] == "saved"]
    catalog.favorite("archive:a", True)
    rows = catalog.entries()["entries"]
    assert [e["id"] for e in rows if e["group"] == "saved"] == before
    assert {e["id"] for e in rows if e.get("favorite")} == {"archive:a", "archive:c"}
    assert len({e["id"] for e in rows}) == len(rows)
    catalog.favorite("archive:a", False)
    assert [e["id"] for e in catalog.entries()["entries"] if e["group"] == "saved"] == before
    assert "a" not in json.loads(journal.path.read_text())["favorites"]
    rows = catalog.entries()["entries"]

    portrait = json.loads(subprocess.check_output(
        [binary("fish"), "--preview-genome", str(ROOT / "genomes/cppn-start.genome")],
        cwd=ROOT, text=True,
    ))
    path = Path(directory) / "population.json"
    fixture = dict(id="founder:fixture",name="Fons prima",group="founders",class_=0,selection_group=0,
                   measured=True,foraging=0.5,foraging_speed=1,foraging_turn=.1,foraging_eaten=2,
                   foraging_samples=1800,sense_cells={"eye":2,"nose":3,"lateral":4},
                   anatomy={"jaw":.3,"gut":.5,"teeth":.8},hatches=3,hatch_attempts=3,hatch_steps=200)
    fixture['class']=fixture.pop('class_')
    path.write_text(json.dumps(dict(entries=[fixture]+[e for e in rows if e['group']!='founders'], portrait=portrait)))
    subprocess.run(["node", "tests/population_picker.js", str(path)], cwd=ROOT, check=True)
print("Founder-Auswahl: Messwerte, unabhängige Favoriten und Speichern: OK")

# Imported files remain selectable across runs without invented lifetime measurements.
from journal import Journal
with tempfile.TemporaryDirectory() as directory:
    journal = Journal(Path(directory))
    sim = SimpleNamespace(lock=threading.RLock(), journal=journal, founders=FounderSearch())
    catalog = PopulationCatalog(sim)
    content = (ROOT / 'genomes/cppn-start.genome').read_text()
    identifier = catalog.import_genome(content, 'Futtersammler.genome')
    row = next(e for e in catalog.entries()['entries'] if e['id'] == identifier)
    assert row['favorite'] and row['name'] == 'Futtersammler' and row['anatomy']
    assert row['observed_intake'] is None and row['observed_offspring'] is None
    assert catalog.selected([identifier], 1, {'max_neurons': 65536, 'max_connections': 10000000}) == [content.encode()]
    sim.journal = Journal(Path(directory))
    assert catalog.resolve(identifier).read_text() == content
    before = len(sim.journal.catalog['favorites'])
    try:
        catalog.import_genome('not a genome', 'broken.genome')
        raise AssertionError('Invalid genome accepted')
    except ValueError:
        pass
    assert len(sim.journal.catalog['favorites']) == before
print('Genomimport: Vorschau, Startauswahl, dauerhafter Favorit und ungültige Datei: OK')

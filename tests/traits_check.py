"""Vocabulary evidence, unknown observations and compact/expanded descriptions."""
from pathlib import Path
import colorsys
import copy
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol_schema import BehaviorScale
from species_traits import RULES, CATALOG, describe, profile_labels, summary_labels
from trait_context import prepare_traits
from trait_metrics import RULES as METRIC_RULES

assert all(r.evidence and r.basis in ("anatomy", "behavior", "mixed") for r in RULES)
# Every explanation and every piece of evidence has its wording in the interface texts.
words = json.loads((Path(__file__).resolve().parents[1] / "ui/text/de/trait_model.json").read_text())
for r in RULES:
    kind, values = r.note["key"], r.note["values"]
    assert (r.name in words["notes"] if kind == "rule"
            else all(p in words["parts"] for p in values["parts"]) if kind == "parts"
            else kind == "interval" and values["measure"] in words["measures"]), r.name
assert describe() == []
assert not any(r["basis"] != "anatomy" for r in describe(profile=[0] * 20))

body = dict(senses=[8] * 10, thresholds=[.002, .003] + [.08] * 8,
            early=[.8] * 10, late=[0] * 10, span=[.05, .05] + [.4] * 8,
            directions=[9, 2, 8, 8] + [0] * 6, vision=[.8, .7, .6],
            scents=[1] * 8, scent_thresholds=[.01] * 8, fillings=[4, 3, 1],
            internal=32, radius=4, mass=2, mouth=24, bite=14,
            aperture=2.4, head=10, cord=5, propulsion=10, armor=4,
            barbels=2, smell_sites=2, egg_organs=1, sperm_organs=1, hermaphrodites=1)
profile = [.1] * 26
profile[0], profile[1], profile[5] = .5, .1, .9
ecology = dict(samples=1000, grass=.8, surface=.9, buried=.1, shadow=.7, light=.1,
               drift_grass=0)
args = dict(profile=profile, diet=[1000, 0, 0, 0, 0, 0], body=body, ecology=ecology,
            bottom=.8, top=0, habitat=1000, offspring=12)
details = {r["name"]: r for r in describe(**args)}
assert {"feinfühlig", "kitzlig", "wundfühlig", "Spürnase", "Gleiter"} <= details.keys()
assert "Spürsegler" not in CATALOG and "Laichdetektiv" not in CATALOG
assert "Aufreißer" not in details and "Laichsucher" not in details
assert any(e["key"] == "pulse" for e in details["Gleiter"]["evidence"])
ctx = prepare_traits(**args)
assert len(ctx.sensitive) == 11 and ctx.sensitive[8] and ctx.sensitive[9]
assert ctx.proof["motion"]["values"]["speed"] == BehaviorScale.SPEED * .5
assert abs(ctx.proof["turn"]["values"]["turn"] - BehaviorScale.TURN_DEGREES * .1) < 1e-9
assert all(p["key"] in words["evidence"] for k, p in ctx.proof.items() if p["key"] != "measure")
assert all(p["values"]["measure"] in words["measures"]
           for p in ctx.proof.values() if p["key"] == "measure")
assert ctx.values["body_mass"] == 2 and ctx.values["body_armor"] == 4
assert all(ctx.proof["sense" + str(i)]["values"]["early"] == .8 for i in range(10))

# Removing each actual constituent removes the corresponding combined description.
without_nose = copy.deepcopy(args)
without_nose["body"]["senses"][1] = 0
assert "Spürnase" not in {r["name"] for r in describe(**without_nose)}
without_motion = {**args, "profile": []}
assert "Gleiter" not in {r["name"] for r in describe(**without_motion)}
without_sight = copy.deepcopy(args)
without_sight["body"]["vision"] = [0, 0, 0]
assert "Radar" not in {r["name"] for r in describe(**without_sight)}
assert not any(r["group"] == "Sehen" for r in describe(**without_sight))

# Missing measurements do not invent absent organs or black skin.
unknown = prepare_traits(body={"vision": [.3, .3, .3]})
assert "body_mass" not in unknown.values and "internal_share" not in unknown.values
assert "skin_brightness" not in unknown.values
assert not any(r.predicate(unknown) for r in METRIC_RULES if r.evidence.startswith("body_"))

# Bounded intervals assign one name at boundaries, never contradictory adjectives.
facets = {}
for r in METRIC_RULES:
    facets.setdefault(r.evidence, []).append(r)
for key, rules in facets.items():
    for value in (0, .001, .01, .1, .5, .7, 1, 2, 4, 8, 24, 100, 360):
        ctx.values[key] = value
        assert sum(bool(r.predicate(ctx)) for r in rules) <= 1, (key, value)
    ctx.values[key] = None
    assert not any(r.predicate(ctx) for r in rules)

skin_names = set()
for hue in range(0, 360, 15):
    p = profile[:]
    p[17:20] = colorsys.hsv_to_rgb(hue / 360, 1, 1)
    matches = [r for r in describe(profile=p) if r["facet"] == "skin_hue"]
    assert len(matches) == 1
    skin_names.add(matches[0]["name"])
assert len(skin_names) == 24

compact, expanded = summary_labels(details), profile_labels(details)
assert len(compact) == 4 and 4 < len(expanded) <= 6
assert set(compact) <= set(expanded)
assert len({details[n]["facet"] for n in expanded}) == len(expanded)
assert len({details[n]["group"] for n in expanded}) >= 5
assert all(details[n]["evidence"] for n in expanded)
assert profile_labels({}) == []
assert len(profile_labels(details, limit=6)) == 6
assert len(profile_labels(details, limit=100)) == 6
assert len(profile_labels(details, limit=4)) == 4
assert profile_labels(details, limit=0) == []
# New animal sources count as animal food; anatomy alone does not establish a diet.
for source in (6, 7, 8, 9):
    diet = [0] * 11
    diet[4], diet[source] = 300, 700
    names = {r["name"] for r in describe(diet=diet)}
    assert "Mischköstler" in names and "Spezialist" not in names
shell_diet = [0] * 8 + [0, 1000, 0]
assert "Knacker" not in {r["name"] for r in describe(diet=shell_diet)}
assert "Knacker" in {r["name"] for r in describe(
    diet=shell_diet, body={"bite": 20, "blunt_teeth": .8})}
assert "Knacker" not in {r["name"] for r in describe(
    diet=shell_diet, body={"bite": 20, "blunt_teeth": .1})}
assert "Knacker" not in {r["name"] for r in describe(
    body={"bite": 20, "blunt_teeth": .8})}
print("Merkmale: Kombinationsbedingungen, Messbelege, widerspruchsfreie und begrenzte Anzeige: OK")

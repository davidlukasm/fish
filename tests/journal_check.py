from pathlib import Path
import sys, tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from journal import Journal
from species_traits import describe, summary_labels, CATALOG


def labels(*args, **kwargs):
    return [item["name"] for item in describe(*args, **kwargs)]


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    session = root / "session"
    session.mkdir()
    j = Journal(root / "archive")
    j.begin(session)
    profile = [
        0.7,
        0.3,
        0.1,
        0.1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0.1,
        0.1,
        0.3,
        0,
        0.1,
        0.2,
        0.2,
        0.2,
    ]
    profile += [0] * 6
    assert "Flitzer" in labels(profile) and "blind" not in labels(profile)
    assert not any(r["group"] == "Sehen" for r in describe(profile, body={"vision": [0, 0, 0]}))
    assert "Jäger" in labels(profile, [0, 300, 0, 0]) and "Jäger" not in labels(
        profile, [300, 0, 0, 0]
    )
    assert "Aasfresser" in labels(profile, [0, 0, 0, 300])

    def species(identifier=1):
        return {
            "id": identifier,
            "name": "Velira",
            "profile": profile,
            "profile_samples": 3,
            "born": 0,
            "adults": 3,
            "alive": 3,
            "gametes": 0,
            "eggs": 0,
            "successful_offspring": 3,
            "nutrition_per_1000": 200,
            "confirmed": True,
            "mother": 0,
            "father": 0,
            "extinct_at": 0,
        }

    def fish(identifier=1, species=1):
        p = [0] * 42
        p[4] = identifier
        p[8] = 1
        p[11] = 3
        p[22] = species
        p[6] = 1000
        p[36] = 500
        p[37] = 600
        p[41] = 3
        p[32] = [1] * 40
        return p

    def frame(step, s=None):
        return {
            "step": step,
            "fish": [fish()],
            "species": [s or species()],
            "hatched": 3,
            "environment": 0,
            "births": 3,
            "hatches": 3,
            "behavior": [],
            "traits": [],
            "performance": {},
            "assistance": {"need": 1, "deaths": 0},
        }

    j.observe(frame(100))
    assert not any(e["kind"] == "species" for e in j.events)
    tasks = j.observe(frame(600))
    assert any(e["kind"] == "species" for e in j.events)
    assert j.species[1]["labels"] and len(tasks) >= 4
    assert (
        j.species[1]["initial_profile"] == profile
        and j.species[1]["initial_step"] == 100
    )
    assert j.pedigree[1][0:2] == [1, 1] and j.pedigree[1][9] == 100
    senses = [0, 4, 0, 0, 0, 0, 0, 4]
    assert {"Laichsucher", "großgoschert"}.issubset(
        labels(body=
            {
                "senses": senses,
                "scents": [0.1, 0, 0, 0, 0, 0.1, 1, 0],
                "internal": 8,
                "mouth": 30,
                "aperture": 3,
                "jaw_length": .9,
                "radius": 4,
            }
        )
    )
    j.intake_profiles[1] = {"diet": [0,0,0,0,10,0,20,0,0,0,30],
                            "raw_diet": [0,0,0,0,40,0,20,0,0,0,30]}
    for t in tasks:
        j.commit(t, b"same genome")
    for record in j.catalog["records"].values():
        assert record["diet"] == j.intake_profiles[1]["diet"]
        assert record["raw_diet"] == j.intake_profiles[1]["raw_diet"]
    assert len(list((root / "archive").glob("*.genome"))) == 1
    assert len(j.catalog["records"]) == 4
    for identifier in range(2, 14):
        s = species(identifier)
        p = fish(identifier, identifier)
        j.commit(
            ("recent", "session:" + str(identifier), p, s, 3),
            ("genome-" + str(identifier)).encode(),
        )
    assert (
        len(j.catalog["recent"]) == 8
        and len(list((root / "archive").glob("*.genome"))) <= 12
    )
    assert all(j.resolve(e["id"]).exists() for e in j.view()["archive"])
    try:
        j.resolve("../../secret")
        raise AssertionError("Unbounded file access")
    except ValueError:
        pass
    # No duplicate established-species event on resume or while reading old worlds.
    count = sum(e["kind"] == "species" for e in j.events)
    j.begin(session)
    assert 1 in j.pedigree
    assert j.known["1"]["lineage"]["name"] == "Velira"
    assert j.known["1"]["initial_profile"] == profile
    j.observe(frame(800))
    j.observe({**frame(900), "historical": True})
    assert sum(e["kind"] == "species" for e in j.events) == count
    # Extinction is delayed and keeps its evidence; archive slots survive it.
    extinct = species()
    extinct.update(alive=0, adults=0, extinct_at=1000)
    j.observe({**frame(1000, extinct), "fish": []})
    assert not any(e["kind"] == "extinction" for e in j.events)
    j.observe({**frame(1900, extinct), "fish": []})
    assert any(e["kind"] == "extinction" for e in j.events)
    for step in range(2000, 3000, 100):
        j.observe({**frame(step, extinct), "fish": []})
    assert sum(e["kind"] == "extinction" for e in j.events) == 1
    assert any(record[0] == 1 for record in j.view()["ancestry"])
    assert any(record["name"] == "Velira" for record in j.view()["species_ancestry"])
    # Milestones explain first confirmed traits, generation thresholds, and sustained replacement.
    assert any(
        e.get("milestone")
        and e["wording"] == "firstTrait"
        and "Velira" in e["data"]["name"]
        and e["data"]["note"]
        for e in j.events
    )
    growing = species()
    growing.update(replacement_deaths=10, replacement_hatches=12)
    f = frame(3200, growing)
    f["fish"][0][41] = 5
    j.observe(f)
    assert any(
        e.get("milestone") and e["wording"] == "naturalGeneration" and e["data"]["n"] == 5
        for e in j.events
    )
    f["step"] = 3800
    j.observe(f)
    assert not any(e["wording"] == "speciesSustaining" for e in j.events)
    f["step"] = 4400
    j.observe(f)
    matches = [e for e in j.events if e["wording"] == "speciesSustaining"]
    assert len(matches) == 1 and matches[0]["data"]["ratio"] == 1.2
    count = len([e for e in j.events if e.get("milestone")])
    j.begin(session)
    f["step"] = 4500
    j.observe(f)
    assert len([e for e in j.events if e.get("milestone")]) == count
    assert j.event_path.exists() and len(j.event_path.read_text().splitlines()) == len(
        j.events
    )
# Nicknames distinguish sensory thresholds, complementary senses and observed diet.
p = [0.4, 0.2, 0.1, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.2, 0.4, 0.1, 0.2, 0.2, 0.3, 0.4] + [0] * 6


def body():
    return {
        "vision": [0.8, 0.7, 0.6],
        "senses": [8, 4, 2, 2, 2, 2, 4, 2],
        "scents": [0.1, 0, 0, 0, 0, 0.1, 1, 0],
        "thresholds": [0.03, 0.01, 0.04, 0.5, 0.5, 0.5, 0.08, 0.5],
        "early": [0.4, 0.6, 0, 0, 0, 0, 0.8, 0],
        "late": [0] * 8,
        "span": [0.4] * 8,
        "directions": [9, 6, 4, 6, 0, 0, 0, 0],
        "scent_thresholds": [0.6, 0.2, 0.6, 0.9],
        "internal": 12,
        "mouth": 30,
        "radius": 4,
        "aperture": 3,
                "jaw_length": .9,
        "bite": 20,
        "barbels": 2,
        "smell_sites": 2,
        "hermaphrodites": 1,
        "egg_organs": 1,
        "sperm_organs": 1,
    }


b = body()
words = set(labels(p, body=b))
assert {
    "Adlerauge",
    "Spürnase",
    "wundfühlig",
}.issubset(words)
assert not {"Wundgefühl", "rotblind", "Rotseher", "Grünseher", "Blauseher"} & words
late = body()
late["thresholds"][6] = 0.85
late["early"][6] = 0
late["late"][6] = 0.9
assert "zach" in labels(p, body=late) and "wundfühlig" not in labels(
    p, body=late
)
weak = body()
weak["thresholds"][0] = 0.08
weak["early"][0] = 0
weak["directions"][0] = 1
assert "Adlerauge" not in labels(p, body=weak)
color = body()
color["vision"] = [0, 0.8, 0]
assert "farbselektiv" in labels(p, body=color)
color["vision"] = [0, 0, 0]
assert not any(r["group"] == "Sehen" for r in describe(p, body=color))
assert "Plünderer" in labels(p, [0, 0, 300, 0], body=b) and "Plünderer" not in labels(
    p, [300, 0, 0, 0], body=b
)
details = {
    item["name"]: {k: v for k, v in item.items() if k != "name"}
    for item in describe(p, body=b)
}
compact = summary_labels(details)
assert (
    len(compact) == 4
    and sum(details[word]["group"] == "Kombination" for word in compact) == 2
    and len({details[word]["group"] for word in compact}) == 3
)
assert all(item["note"] and item["evidence"] for item in details.values())
# One changing trait cannot keep all the other labels from being confirmed.
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    session = root / "s"
    session.mkdir()
    j = Journal(root / "archive")
    j.begin(session)
    s = species()
    s["profile"] = p.copy()
    s["body_profile"] = body()
    f = frame(10, s)
    j.observe(f)
    for step, attack in ((100, 0.1), (200, 0.01), (300, 0.1), (500, 0.01)):
        f["step"] = step
        f["species"][0]["profile"][15] = attack
        j.observe(f)
    assert (
        "Adlerauge" in j.species[1]["labels"]
        and "Raufer" not in j.species[1]["labels"]
    )
    assert (
        len(j.species[1]["summary_labels"]) <= 4
        and j.species[1]["trait_details"]["Adlerauge"]["evidence"]
    )
print("Ereignisse, Sinnesprofile und begrenztes Genomarchiv: OK")

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    session = root / "taxonomy"
    session.mkdir()
    j = Journal(root / "archive")
    j.begin(session)
    group = species()
    group.update(
        name="Nerella sp. 1", genus=1, genus_name="Nerella", epithet="", name_reason=""
    )
    j.observe(frame(100, group))
    group.update(
        name="Nerella fossoria",
        epithet="fossoria",
        name_reason="lebt überwiegend am Boden",
    )
    j.observe(frame(600, group))
    j.observe(frame(800, group))
    assert sum(e["data"].get("name") == "Nerella fossoria" and e["wording"] == "speciesNamed" for e in j.events) == 1
    assert sum(e["data"].get("genus") == "Nerella" for e in j.events) == 1
    j.begin(session)
    j.observe(frame(900, group))
    assert sum(e["data"].get("name") == "Nerella fossoria" and e["wording"] == "speciesNamed" for e in j.events) == 1
    assert j.view()["species_ancestry"][0]["genus_name"] == "Nerella"

# Modest two-sense brains receive combinations without a hunting record.
pair = {"vision": [0.3, 0.2, 0.1], "senses": [2, 2, 0, 0, 0, 0, 0, 0]}
assert "Kundschafter" in labels([0] * 20, body=pair)
pair["vision"] = [0, 0, 0]
pair["senses"] = [0, 2, 2, 0, 0, 0, 0, 0]
assert "Sucher" in labels([0] * 20, body=pair) and "Kundschafter" not in labels(
    [0] * 20, body=pair
)
assert summary_labels({}, 0) == []

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    session = root / "session"
    session.mkdir()
    j = Journal(root / "archive")
    j.begin(session)
    j.observe({"step": 1, "fish": [fish()], "species": [species()]})
    j.observe({"step": 2, "fish": [], "species": [], "recent_deaths": [[1, 8, 2]]})
    assert j.pedigree[1][11:] == [8, 2]
    reloaded = Journal(root / "archive")
    reloaded.begin(session)
    assert reloaded.pedigree[1][11:] == [
        8,
        2,
    ], "parent death cause must persist immediately"

# New niches require measured habitat and distinguish attached and drifting grass.
eco = {
    "samples": 1000,
    "surface": 0.8,
    "grass": 0.7,
    "buried": 0.4,
    "shadow": 0.7,
    "light": 0.15,
    "drift_grass": 250,
}
meadow = labels(p, [0, 0, 0, 0, 200, 600], body=body(), ecology=eco)
assert {
    "Treibgutsammler",
    "Grasgänger",
    "Gräber",
    "Dunkelgänger",
    "Graser",
}.issubset(meadow)
unknown = labels(p, [0, 0, 0, 0, 200, 600], body=body())
assert (
    "Dunkelgänger" not in unknown
    and "Gräber" not in unknown
    and "Treibgutsammler" not in unknown
)
assert len(CATALOG) >= 120 and all(item.get("note") for item in CATALOG.values())

# Anatomy and pulse statistics must describe the actual motor and sensory mechanisms.
assert "Nager" not in labels(
    p, [0, 0, 0, 0, 0, 1000], body={**body(), "bite": 0, "mouth": 100}
)
assert "Nager" in labels(
    p, [0, 0, 0, 0, 0, 1000], body={**body(), "bite": 20, "mouth": 0, "blunt_teeth": .8}
)
assert "Maulwurf" not in labels(
    p, body={**body(), "barbels": 0}, ecology={"samples": 1000, "buried": 0.8}
)
assert "Zwitter" not in labels(p, body={**body(), "hermaphrodites": 0.6})
assert "Raufer" in labels([*p[:15], 0.1, *p[16:]], body=body())
from species_traits import individual_profile

own = fish()
own[11] = 0
individual = {
    "selected": own[4],
    "fish": [own],
    "selected_body": {**body(), "vision": [0, 0, 0]},
    "behavior": [{"id": own[4], "samples": 20, "descriptor": p}],
    "traits": [
        {
            "id": own[4],
            "bottom": 0.8,
            "top": 0,
            "habitat_steps": 1000,
            "ecology_steps": 1000,
            "ecology": [100, 200, 800, 300, 400],
        }
    ],
}
classified = individual_profile(individual)
assert (
    "blind" not in classified["labels"]
    and "Adlerauge" not in classified["labels"]
    and "Flitzer" not in classified["labels"]
)
assert len(classified["labels"]) <= 4
assert set(classified["labels"]) == set(classified["trait_details"])
assert "Maulwurf" in classified["labels"]
assert len(classified["summary_labels"]) <= 4 and classified["id"] == own[4]
# Retain a bounded hot tail while every historical event remains accessible on disk.
with tempfile.TemporaryDirectory() as directory:
    j = Journal(Path(directory) / "archive")
    session = Path(directory) / "session"
    session.mkdir()
    j.begin(session)
    for i in range(4300):
        j.event(str(i), "Ereignis " + str(i), i)
    assert j.total_events == 4300 and len(j.events) == 4096
    assert [e["id"] for e in j.event_page(after=1)] == list(range(2, 502))
    assert [e["id"] for e in j.event_page(before=1001)] == list(range(501, 1001))
    j.begin(session)
    assert j.total_events == 4300 and len(j.events) == 4096
    j.event("next", "Fortsetzung", 5000)
    assert j.events[-1]["id"] == 4301

# The start collection protects genera, niches, current-run records and explicit favorites.
from journal_records import choose_records
from protocol_schema import Fish, Anatomy
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    session = root / "20261023-first"
    session.mkdir()
    j = Journal(root / "archive")
    j.begin(session)
    population = []
    for i in range(24):
        p = [0] * Fish.COUNT
        p[Fish.ID] = i + 1
        p[Fish.SPECIES] = i + 1
        p[Fish.HATCHED] = 1
        p[Fish.NUTRITION_STEPS] = 600
        p[Fish.NUTRITION] = 10000 if i < 16 else 100
        p[Fish.OFFSPRING] = 4
        p[Fish.ORGANS] = [0] * Anatomy.COUNT
        p[Fish.ORGANS][Anatomy.EYE_LEFT if i % 2 else Anatomy.SMELL_LEFT] = 6
        genus = "Dominant" if i < 16 else "Rare" + str(i)
        j.species[i+1] = {"id":i+1, "name":genus+" species", "genus_name":genus, "diet":[i%2, 1-i%2], "summary_labels":["test"]}
        population.append(p)
    tasks = choose_records(j, population)
    lineages = [t for t in tasks if t[0] == "lineage"]
    assert len({t[3]["genus_name"] for t in lineages}) == 9
    for task in tasks:
        j.commit(task, ("Genome " + str(task[2][Fish.ID])).encode())
    favorite = population[-1]
    j.commit(("favorite", "favorite", favorite, j.species[24], 0), b"favorite genome")
    favorite_id = next(iter(j.catalog["favorites"]))
    for run in range(10):
        session = root / f"20261024-{run:02d}"
        session.mkdir()
        j.begin(session)
        j.species[24] = {"id":24, "name":"Rare survivor", "genus_name":"Rare", "diet":[1,0]}
        new = choose_records(j, [favorite])
        assert any(t[0] == "record" for t in new), "last-run records cannot be excluded by an older all-time record"
        for task in new:
            j.commit(task, ("Genome later " + str(run)).encode())
    reloaded = Journal(root / "archive")
    assert reloaded.resolve(favorite_id).read_bytes() == b"favorite genome"
    assert len({e["session"] for e in reloaded.catalog["runs"].values()}) <= 8
    assert len(reloaded.catalog["lineages"]) <= 128
print("Startsammlung: Gattungsvielfalt, Nischen, letzte Läufe und dauerhafte Favoriten: OK")

from pathlib import Path
import sys, tempfile, json, gzip

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from history import History, MAX_POINTS, MAX_MILESTONES, MAX_SESSIONS

with tempfile.TemporaryDirectory() as directory:
    h = History(directory)
    h.begin({"steps": 1200}, resume=False)
    (h.session / "latest.state").write_text("world")

    def record(step, markers=(), manual=False, window=0, fertilisations=0):
        stem = h.session / "spool" / str(step)
        stem.parent.mkdir(exist_ok=True)
        population = stem.with_suffix(".population")
        state = stem.with_suffix(".state")
        population.write_text("FISH_POPULATION 4 1\n")
        state.write_text("complete-world-" + str(step))
        h.record(
            {
                "event": "bookmark" if manual else "observation",
                "population_path": str(population),
                "state_path": str(state),
                "step": step,
                "observation_window": window,
                "best_index": 0,
                "best": 2,
                "average": 1,
                "population_size": 1,
                "adults": 1,
                "total_births": 0,
                "fertilisations": fertilisations,
                "species_id": 7,
                "species": [{"id": 7, "name": "Velora"}],
                "ecological_milestones": list(markers),
                "events": [],
            }
        )
        assert not population.exists() and not state.exists()

    record(0)
    record(50, fertilisations=100)
    assert h.milestones == []
    marker = {
        "key": "offspring-hatch",
        "title": "Erster Nachwuchs geschlüpft",
        "evidence": "1 Nachkomme geschlüpft",
        "tick": 55,
        "species": 7,
    }
    record(55, [marker])
    record(70, [marker])
    assert not h.milestones
    assert [p["step"] for p in h.points] == [
        0,
        50,
        55,
        70,
    ]  # Multiple observations within one window remain distinct.
    record(70, [marker], manual=True)
    assert (
        h.milestones[-1]["reason"] == "Gemerkter Stand"
        and h.milestones[-1]["name"] == "Velora"
    )
    path, entry = h.resolve(h.meta["id"], h.milestones[0]["id"])
    assert path.read_text().startswith("FISH_POPULATION")
    state, entry = h.materialize_state(h.meta["id"], entry["id"])
    assert state.read_text() == "complete-world-70"
    with gzip.open(path.with_suffix(".state.gz"), "rb") as f:
        assert f.read() == b"complete-world-70"
    record(12000, [marker], window=10)
    assert len(h.milestones) == 1
    old_id = h.meta["id"]
    copy = History(directory)
    assert copy.begin({}, resume=True) == str(h.session / "latest.state")
    assert copy.view(old_id)["milestones"][0]["complete_state"]
    # Metrics have bounded retention and can arrive without full-state files.
    h.points = [{"step": step, "average": 1} for step in range(MAX_POINTS)]
    for step in (13000, 13001, 13002):
        h.record(
            {
                "event": "observation",
                "population_path": "",
                "state_path": "",
                "step": step,
                "average": 1,
                "best": 2,
                "adults": 1,
                "events": [],
            }
        )
    assert len(h.points) == MAX_POINTS and h.points[0]["step"] == 3
    assert h.points[-1]["step"] == 13002 and "species" not in h.points[-1]
    for step in range(14000, 14000 + MAX_MILESTONES + 1):
        record(step, manual=True)
    assert len(h.milestones) == MAX_MILESTONES + 2
    assert len(list((h.session / "milestones").glob("*.state.gz"))) == MAX_MILESTONES + 2
    for _ in range(MAX_SESSIONS + 1):
        copy.begin({}, resume=False)
        copy.trim()
        copy.save()
    assert h.session.exists() and len(copy.view(old_id)["milestones"]) == MAX_MILESTONES + 2
    try:
        copy.resolve("../../invalid", "missing")
        raise AssertionError("invalid path accepted")
    except ValueError:
        pass
print("Verlauf: OK")

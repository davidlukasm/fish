"""Regression checks for historical provenance, broken history and HTTP boundaries."""

from pathlib import Path
from types import SimpleNamespace
import http.client
import json
import sys
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from history import History
from simulation import Simulation
from viewer_commands import CommandRouter
from viewer_http import Handler

sim = Simulation.__new__(Simulation)
sim.offer_population = False
sim.frames = SimpleNamespace(
    latest={"historical": True, "species": [{"id": 1, "labels": ["saved"]}]}
)
sim.journal = SimpleNamespace(species={1: {"labels": ["future"]}})
assert sim.species_profiles()[1]["labels"] == ["saved"]
sim.observed_context = {
    "key": "saved:1",
    "session": "saved",
    "step": 50,
    "journal": {
        "profiles": [{"id": 1, "labels": ["at save"]}],
        "ancestry": [[1, 1, 111]],
    },
}
assert sim.species_profiles()[1]["labels"] == ["at save"]
sim.frames.latest["historical"] = False
assert sim.species_profiles()[1]["labels"] == ["future"]
sim.journal.species[1].update(ecology={"samples": 500, "grass": 0.25}, nutrition_steps=420)
assert sim.species_profiles()[1]["ecology"] == {"samples": 500, "grass": 0.25}
assert sim.species_profiles()[1]["nutrition_steps"] == 420

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / "active.json").write_text(json.dumps({"id": "deleted-session"}))
    history = History(root)
    assert history.begin({}) is None and history.session.exists()
    population = history.session / "spool" / "saved.population"
    population.parent.mkdir(exist_ok=True)
    population.write_text("population")
    state = population.with_suffix(".state")
    state.write_text("state")
    journal = {
        "profiles": [{"id": 1, "labels": ["at save"]}],
        "ancestry": [[1, 1, 111]],
    }
    history.record(
        {
            "event": "bookmark",
            "step": 50,
            "species_id": 1,
            "population_path": str(population),
            "state_path": str(state),
            "events": [],
        },
        journal,
    )
    entry = history.milestones[0]
    first, _ = history.materialize_state(history.meta["id"], entry["id"])
    second, _ = history.materialize_state(history.meta["id"], entry["id"])
    assert first != second and first.read_bytes() == second.read_bytes()
    journal["profiles"][0]["labels"] = ["future"]
    assert history.observation(history.meta["id"], entry)["journal"]["profiles"][0][
        "labels"
    ] == ["at save"]
    assert history.view()["retention"]["manual_unlimited"] is True

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
server.page = b"test page"
server.static_assets = {}
server.token = "test-token"
server.fps_report = None
sent = []
server.simulation = SimpleNamespace(
    journal_view=lambda after, before: {"events": []},
    state=lambda brain, after: {},
    command=lambda line: sent.append(line) or "",
)
server.commands = CommandRouter(server.simulation, {})
server.commands.VIEW_TEMPO_LEASE = 0.05
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:

    def status(method, path, headers=None):
        connection = http.client.HTTPConnection(
            "127.0.0.1", server.server_port, timeout=3
        )
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        code = response.status
        response.read()
        connection.close()
        return code

    assert status("GET", "/") == 200
    assert status("GET", "/", {"Host": "untrusted.invalid"}) == 403
    assert (
        status(
            "POST",
            "/command",
            {"Origin": "https://untrusted.invalid", "X-Fish-Token": server.token},
        )
        == 403
    )
    assert status("GET", "/journal?after=abc") == 400
    assert status("GET", "/journal?before=-1") == 400
    assert status("GET", "/journal?after=0") == 200

    def command(data):
        body = json.dumps(data).encode()
        connection = http.client.HTTPConnection(
            "127.0.0.1", server.server_port, timeout=3
        )
        connection.request(
            "POST",
            "/command",
            body,
            {"X-Fish-Token": server.token, "Content-Type": "application/json"},
        )
        response = connection.getresponse()
        response.read()
        connection.close()
        return response.status

    # A view tempo the page stops renewing lapses back to the visitor's tempo; a chosen tempo
    # ends the view tempo for good.
    assert command({"command": "view-delay", "value": 700, "base": 30}) == 200
    assert status("GET", "/state") == 200 and sent == ["delay 700"]
    time.sleep(0.1)
    assert status("GET", "/state") == 200 and sent == ["delay 700", "delay 30"]
    assert command({"command": "view-delay", "value": 500, "base": 30}) == 200
    assert command({"command": "delay", "value": 100}) == 200
    time.sleep(0.1)
    assert status("GET", "/state") == 200 and sent[-1] == "delay 100"
    assert command({"command": "view-delay", "value": 1001, "base": 30}) == 400
    # Life protection reaches the engine only as a whole switch for one fish.
    assert command({"command": "immortal", "id": 12, "value": 1}) == 200
    assert command({"command": "revive", "id": 12}) == 200
    assert sent[-2:] == ["immortal 12 1", "revive 12"]
    for refused in ({"id": 12, "value": True}, {"id": 12, "value": 2}, {"id": "12", "value": 0}):
        assert command({"command": "immortal", **refused}) == 400
    assert command({"command": "revive", "id": 0}) == 400 and sent[-1] == "revive 12"
finally:
    server.shutdown()
    server.server_close()
    thread.join()
print(
    "Review: historische Herkunft, getrennte Spooldateien, fehlende Sitzung, HTTP-Grenzen "
    "und ablaufendes Ansichtstempo: OK"
)

# A bookmark preserves the complete event sequence, not the live page of 500 rows.
from journal import Journal
from frame_store import FrameStore
from collections import deque
import io
import history as history_module

with tempfile.TemporaryDirectory() as directory:
    h = History(Path(directory) / "history")
    h.begin({})
    j = Journal(Path(directory) / "journal")
    j.begin(h.session)
    rows = [{"id": i, "step": i} for i in range(1, 1501)]
    j.events, j.total_events = rows[-500:], 1500
    j.event_path.write_text("".join(json.dumps(row) + "\n" for row in rows))

    def bookmark(step):
        spool = h.session / "spool"
        spool.mkdir(exist_ok=True)
        population, state = spool / "p.population", spool / "s.state"
        population.write_text("population")
        state.write_text("state")
        h.record(
            {
                "event": "bookmark",
                "step": step,
                "population_path": str(population),
                "state_path": str(state),
            },
            j.snapshot(),
        )

    bookmark(1500)
    sim = Simulation.__new__(Simulation)
    sim.offer_population = False
    sim.lock, sim.history, sim.journal = threading.RLock(), h, j
    sim.frames = SimpleNamespace(latest={"historical": True})
    sim.observed_context = h.observation(h.meta["id"], h.milestones[0])
    assert [e["id"] for e in sim.journal_view()["events"]] == list(range(1001, 1501))
    assert [e["id"] for e in sim.journal_view(before=1001)["events"]] == list(
        range(501, 1001)
    )
    assert [e["id"] for e in sim.journal_view(before=501)["events"]] == list(
        range(1, 501)
    )
    assert [e["id"] for e in sim.journal_view(after=500)["events"]] == list(
        range(501, 1001)
    )
    # Old damaged sessions and a tiny automatic quota must never erase this manual save.
    damaged = h.root / "damaged"
    damaged.mkdir()
    (damaged / "meta.json").write_text("{")
    limit = history_module.MAX_ARCHIVE_BYTES
    try:
        history_module.MAX_ARCHIVE_BYTES = 1
        bookmark(1501)
    finally:
        history_module.MAX_ARCHIVE_BYTES = limit
    assert len(json.loads((h.session / "milestones.json").read_text())) == 2
    assert len(list((h.session / "milestones").glob("*.state.gz"))) == 2
    assert (damaged / "meta.json").read_text() == "{"
    # Persistence failure must not create a ghost bookmark in the UI.
    write = history_module.atomic_write

    def fail_registration(path, content):
        if Path(path) == h.session / "milestones.json":
            raise OSError("registration failed")
        write(path, content)

    try:
        history_module.atomic_write = fail_registration
        try:
            bookmark(1502)
            raise AssertionError("failed registration accepted")
        except OSError:
            pass
    finally:
        history_module.atomic_write = write
    assert len(h.milestones) == 2
    assert len(json.loads((h.session / "milestones.json").read_text())) == 2

for invalid in ([], None, {}, {"id": "wrong", "created": "", "options": {}}):
    with tempfile.TemporaryDirectory() as directory:
        h = History(directory)
        h.begin({})
        original = h.session
        (original / "latest.state").write_text("state")
        (original / "meta.json").write_text(json.dumps(invalid))
        replacement = History(directory)
        assert replacement.begin({}) is None
        assert replacement.session != original and original.exists()

# A C++ acknowledgement is successful only after Python registered the bookmark.
for failure in (False, True):
    sim = Simulation.__new__(Simulation)
    sim.offer_population = False
    request = {
        "command": "bookmark",
        "ready": threading.Event(),
        "frame_ready": threading.Event(),
    }
    sim.lock, sim.pending = threading.RLock(), {7: request}
    from concurrent.futures import ThreadPoolExecutor
    sim.transport_lock = threading.RLock()
    sim.events = ThreadPoolExecutor(max_workers=1)
    sim.frames, sim.logs = FrameStore(), deque()
    sim.observed_context = None
    sim.journal = SimpleNamespace(snapshot=lambda: {})

    def record(*_):
        if failure:
            raise OSError("disk full")

    sim.history = SimpleNamespace(record=record)
    messages = [
        {"event": "bookmark", "request": 7, "step": 0},
        {"event": "command", "request": 7, "ok": True},
    ]
    process = SimpleNamespace(
        stdout=io.BytesIO(("\n".join(json.dumps(m) for m in messages) + "\n").encode())
    )
    sim.process = process
    sim.read_frames(process)
    sim.events.shutdown(wait=True)
    assert request["result"]["ok"] is not failure
    if failure:
        assert request["result"]["message"] == "disk full"

# Metadata and its origin are promoted together when the post-acknowledgement frame arrives.
sim = Simulation.__new__(Simulation)
sim.offer_population = False
sim.frames = FrameStore()
sim.observed_context = {"key": "old"}
sim.observed_name = "old"
sim.pending_observation = {
    "observation": {"key": "new", "name": "new"},
    "frame_ready": threading.Event(),
}
request = sim.pending_observation
sim.accept_frame({"render_epoch": "e", "revision": 2, "historical": True}, b"{}")
assert sim.observed_context["key"] == "new" and request["frame_ready"].is_set()
assert request["observation_applied"]
print(
    "Review: full historical pages, isolated damaged sessions, durable bookmarks and atomic context: OK"
)

# A delayed pre-command snapshot cannot acknowledge a newly selected historical world.
sim.pending_observation = {"identifier": 9, "observation": {"key": "later"},
                           "frame_ready": threading.Event()}
request = sim.pending_observation
sim.accept_frame({"render_epoch": "e", "revision": 3, "command_request": 8}, b"{}")
assert sim.observed_context["key"] == "new" and not request["frame_ready"].is_set()
sim.accept_frame({"render_epoch": "e", "revision": 4, "command_request": 9}, b"{}")
assert sim.observed_context["key"] == "later" and request["frame_ready"].is_set()

# A name makes the engine remember the fish for a revival; one that already died unremembered
# keeps the name for the history; a name the engine could not take is not kept.
with tempfile.TemporaryDirectory() as directory:
    sim = Simulation.__new__(Simulation)
    sim.args, sim.lock, sent = SimpleNamespace(data_dir=Path(directory)), threading.RLock(), []
    reply = None

    def engine(line):
        sent.append(line)
        if reply:
            raise ValueError(reply)
        return ""

    sim.command = engine
    assert sim.rename_fish(5, "Susi") == {"key": "fishNamed", "values": {"id": 5, "name": "Susi"}}
    reply = {"key": "notFound", "values": {}}
    sim.rename_fish(6, "Otto")
    assert sim.fish_names() == {"5": "Susi", "6": "Otto"}
    reply = "Simulation ist beendet"
    try:
        sim.rename_fish(7, "Lotte")
        raise AssertionError("name kept without the engine")
    except ValueError:
        pass
    reply = None
    sim.rename_fish(5, "")
    assert sim.fish_names() == {"6": "Otto"}
    assert sent == ["remember-fish 5 1", "remember-fish 6 1", "remember-fish 7 1",
                    "remember-fish 5 0"]
print("Review: Lebensschutz-Befehle und Namen als Erinnerung für die Wiederbelebung: OK")

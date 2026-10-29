from suite import binary
"""Compare full and delta output of the real engine, including browser decoding."""

from pathlib import Path
import copy
import json
import queue
import subprocess
import sys
import tempfile
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from view_transport import FrameDecoder, SceneHistory, apply_patch

root = Path(__file__).resolve().parents[1]


def capture(base):
    pool = base / "pool"
    pool.mkdir()
    args = [
        binary("fish"),
        "--interactive",
        "--input",
        "genomes/cppn-start.genome",
        "--founder-pool",
        str(pool),
        "--empty-world",
        "--session",
        str(base / "session"),
        "--output",
        str(base / "best.genome"),
        "--fish",
        "3",
        "--threads",
        "1",
        "--seed",
        "42",
    ]
    args.append("--view-stream")
    process = subprocess.Popen(
        args,
        cwd=root,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    lines = queue.Queue()

    def read():
        for line in process.stdout:
            lines.put(line)
        lines.put(None)

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    decoder = FrameDecoder()
    frames = []
    messages = []

    def receive():
        while True:
            line = lines.get(timeout=12)
            assert line is not None, "Engine ended before its frame: " + process.stderr.read()
            message = json.loads(line)
            if message.get("event") == "view":
                frame = decoder.accept(message)
            else:
                continue
            frames.append(copy.deepcopy(frame))
            messages.append(message)
            return frame

    def send(command):
        process.stdin.write(command + "\n")
        process.stdin.flush()

    try:
        send("pause")
        while not receive()["paused"]:
            pass
        for command in [
            "brain 1",
            "step",
            "clear-food",
            "spray 400 400 10 18",
            "step",
            "brain 0",
        ]:
            send(command)
            receive()
        send("stop")
        receive()
        process.wait(timeout=12)
        assert process.returncode == 0, process.stderr.read()
        latest = base / "session/latest.state"
        previous = base / "session/previous.state"
        assert (
            latest.read_bytes() != previous.read_bytes()
        ), "Stop overwrites the previous checkpoint generation"
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        process.stdin.close()
        reader.join(timeout=2)
        process.stdout.close()
        process.stderr.close()
    return frames, messages


def normalized(frame):
    frame = copy.deepcopy(frame)
    for key in ["render_epoch", "tick_ms", "step_phases"]:
        frame.pop(key, None)
    if frame.get("brain"):
        frame["brain"]["layout_id"] = frame["brain"]["layout_id"].rsplit(":", 1)[-1]
    return frame



# Opening the chooser emits a paused world without searching or saving it as a run.
with tempfile.TemporaryDirectory() as preview:
    result = subprocess.run(
        [str(binary()), "--interactive", "--choose-population", "--view-stream",
         "--session", preview, "--output", str(Path(preview) / "best.genome"),
         "--fish", "200", "--threads", "1"],
        cwd=root, input="stop\n", capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    messages = [json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")]
    assert not any(m.get("phase") == "founders" for m in messages)
    decoder = FrameDecoder()
    views = [decoder.accept(m) for m in messages if m.get("event") == "view"]
    assert views and views[0]["paused"] and not views[0]["fish"]
    assert not (Path(preview) / "latest.state").exists()

with tempfile.TemporaryDirectory(prefix="fish-transport-") as directory:
    base = Path(directory)
    (base / "delta").mkdir()
    frames, messages = capture(base / "delta")
    fixtures = subprocess.check_output(
        [binary("state-tests"), "--transport-fixtures"],
        cwd=root,
        text=True,
    )
    cases = [json.loads(line) for line in fixtures.splitlines()]
    assert cases
    for case in cases:
        assert apply_patch(case["old"], case["patch"]) == case["new"], case
    fixture = base / "frames.json"
    fixture.write_text(
        json.dumps(
            {
                "messages": messages,
                "frames": frames,
                "cases": cases,
                "light_values": [normalized(f)["light"]["bytes"] for f in frames],
            }
        )
    )
    subprocess.run(["node", "tests/transport.js", str(fixture)], check=True, cwd=root)
    history = SceneHistory()
    for f, m in zip(frames, messages):
        history.record(f, m.get("patch"))
    for index in range(len(frames)):
        restored = frames[index]
        patches = history.since(f"{restored['render_epoch']}:{restored['revision']}")
        assert len(patches) <= 1, "Skipped displays must coalesce to one current update"
        for patch in patches:
            restored = apply_patch(restored, patch)
        assert restored == frames[-1], "Skipped HTTP polls lose changes"
    assert history.since("missing") is None
    for index in range(40):
        history.record(
            {**frames[-1], "revision": 100 + index},
            [2, {"revision": [0, 100 + index]}, []],
        )
    assert (
        history.since(f"{frames[0]['render_epoch']}:{frames[0]['revision']}") is None
    ), "Expired clients need a full scene"
    try:
        FrameDecoder().accept(messages[1])
        raise AssertionError("Missing base accepted")
    except ValueError:
        pass
    # Savings depend on what changes, so a historical percentage is not a contract.
    assert any(m.get("patch") for m in messages), "The live stream must actually use patches"
    print("Scene patches: C++/Python/JavaScript round-trip, coalescing and recovery: OK")

# A failed asset decode preserves the usable scene. A full image restores a
# decoder even if earlier messages could not be read.
from frame_store import FrameStore
from frame_assets import hydrate_render
from protocol_schema import Fish, Corpse

store = FrameStore()
shape = [[], [], [], [], [], {}]
row = [0] * (Fish.MORPHOLOGY_ASSET + 1)
row[Fish.ORGANS] = None
row[Fish.MORPHOLOGY_ASSET] = 1
first = {"render_epoch": "atomic", "revision": 1, "fish": [row], "assets": {"1": shape}}
store.accept(first, None)
previous = store.latest
try:
    broken_row = row[:]
    broken_row[Fish.MORPHOLOGY_ASSET] = 2
    store.accept({**first, "revision": 2, "fish": [broken_row], "assets": {}}, None)
except KeyError:
    pass
else:
    raise AssertionError("Missing geometry was accepted")
assert store.latest is previous
assert set(store.render_assets) == {"1"}
assert store.scene_history.key == "atomic:1"
decoder = FrameDecoder()
decoder.accept({"sequence": 1, "frame": first})
try:
    decoder.accept({"sequence": 3, "base": 2, "patch": [0, first]})
except ValueError:
    pass
else:
    raise AssertionError("A skipped delta was accepted")
assert decoder.accept({"sequence": 4, "frame": first}) == first
print("Atomic display assets and full-frame recovery: OK")

# A corpse template can be announced before the particle cadence displays it.
assets = {}
hydrate_render({"fish": [], "corpses": [], "assets": {"116": None}}, assets)
assert "116" in assets, "Announced template was discarded before its first use"
restored = hydrate_render({"fish": [], "corpses": [[0] * Corpse.MORPHOLOGY_ASSET + [116]]}, assets)
assert restored["corpses"][0][Corpse.MORPHOLOGY_ASSET] is None
hydrate_render({"fish": [], "corpses": [], "retired_assets": [116]}, assets)
assert "116" not in assets, "Retired template leaked"
hydrate_render({"fish": [], "assets": {"117": []}}, assets)
hydrate_render({"fish": [], "asset_reset": True, "assets": {"118": []}}, assets)
assert set(assets) == {"118"}
print(
    "Regression 'Speichern/Lesen: 116': announced, delayed, retired and reset templates: OK"
)

# Recover through the actual process reader after one missing template.
from simulation import Simulation
from types import SimpleNamespace
from collections import deque


class Lines:
    def __init__(self, values):
        self.lines = [json.dumps(value) + "\n" for value in values]
        self.remaining = iter(self.lines)

    def __iter__(self):
        return iter(self.lines)

    def readline(self):
        return next(self.remaining, "").encode()

    def close(self):
        pass


class Commands:
    def __init__(self):
        self.values = []

    def write(self, value):
        self.values.append(value.decode() if isinstance(value, bytes) else value)

    def flush(self):
        pass


sim = Simulation.__new__(Simulation)
sim.offer_population = False
sim.lock = threading.RLock()
from concurrent.futures import ThreadPoolExecutor
sim.transport_lock = threading.RLock()
sim.events = ThreadPoolExecutor(max_workers=1)
sim.logs, sim.pending, sim.starting = deque(maxlen=20), {}, False
sim.reset_frames()
valid = {
    "render_epoch": "reader",
    "revision": 1,
    "fish": [],
    "corpses": [],
    "assets": {},
}
broken = {**valid, "revision": 2, "corpses": [[0] * Corpse.MORPHOLOGY_ASSET + [999]]}
stream = Lines(
    [
        {"event": "view", "sequence": 1, "frame": valid},
        {"event": "view", "sequence": 2, "base": 1, "patch": [0, broken]},
        {"event": "view", "sequence": 4, "frame": {**valid, "revision": 4}},
    ]
)
sim.process = SimpleNamespace(stdout=stream, stdin=Commands(), poll=lambda: None)
sim.read_frames(sim.process)
sim.events.shutdown(wait=True)
assert sim.latest["revision"] == 4 and sim.frames.frame_decoder.sequence == 4
assert sim.process.stdin.values == ["view-reset\n"]
assert len(sim.logs) == 1 and "999" in sim.logs[0]
assert not sim.view_resync_pending
print(
    "Process reader: missing template, single recovery request and resumed frames: OK"
)

# Background preparation must leave the published snapshot and reconnect history intact.
base = FrameStore()
base.accept_message({"event": "view", "sequence": 1, "frame": valid})
prepared = base.prepare_message({"event": "view", "sequence": 2, "base": 1,
    "patch": [2, {"revision": [0, 2], "assets": [0, {"7": [1, 2, 3]}]}, []]})
assert base.latest["revision"] == 1 and base.frame_decoder.sequence == 1
assert base.scene_history.key == "reader:1" and not base.render_asset_versions
assert prepared.latest["revision"] == 2 and prepared.render_asset_versions["7"] == 1
assert prepared.scene_history.key == "reader:2"
print("Background statistics preparation preserves published state: OK")

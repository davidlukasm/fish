from suite import binary
"""Cross-language typed scene fixtures use the exact C++ bytes sent to the browser."""

from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temporary:
    fixture = Path(temporary) / "render.bin"
    fixture.write_bytes(
        subprocess.check_output(
            [binary("render_wire-tests"), "--fixtures"], cwd=root
        )
    )
    subprocess.run(
        ["node", "--experimental-vm-modules", "tests/render_wire.js", str(fixture)],
        cwd=root,
        check=True,
    )

# Exercise the process protocol, opaque Python relay and the real display adapter.
import base64
import json
import sys

sys.path.insert(0, str(root))
from frame_store import FrameStore
from render_transport import RenderRelay, read_exact

with tempfile.TemporaryDirectory() as temporary:
    process = subprocess.Popen(
        [
            binary("fish"),
            "--interactive",
            "--render-stream",
            "--input",
            "genomes/cppn-start.genome",
            "--fish",
            "3",
            "--food",
            "30",
            "--empty-world",
            "--threads",
            "1",
            "--seed",
            "42",
            "--session",
            temporary,
            "--output",
            str(Path(temporary) / "best.genome"),
        ],
        cwd=root,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    frames, relay, packets = FrameStore(), RenderRelay(), []

    def read():
        line = process.stdout.readline()
        if not line:
            raise AssertionError(process.stderr.read().decode())
        if line.startswith(b"FSCENE "):
            raw = read_exact(process.stdout, int(line[7:]))
            assert process.stdout.read(1) == b"\n"
            relay.accept(raw)
            return None
        value = json.loads(line)
        if value.get("event") == "view":
            frame = frames.frame_decoder.accept(value)
            frames.accept(frame, None, value.get("patch"))
        return value

    def command(identifier, text):
        process.stdin.write(f"request {identifier} {text}\n".encode())
        process.stdin.flush()
        while True:
            value = read()
            if (
                value
                and value.get("event") == "command"
                and value["request"] == identifier
            ):
                assert value["ok"], value
                return

    try:
        while frames.latest is None:
            read()
        command(1, "pause")
        # Read the metadata emitted after the acknowledgement.
        paused = False
        while not paused:
            read()
            paused = frames.latest["paused"]
        # Modell 19 develops the individual plan after placement; an egg at step 0
        # legitimately has no neuron states yet.
        while frames.latest["brain"]["planning"]:
            step = frames.latest["step"]
            assert step < 90, "individual brain plan did not finish"
            command(100 + step, "step")
            while frames.latest["step"] == step:
                read()
        metadata = frames.latest
        assert (
            metadata["binary_scene"]
            and not metadata["food"]
            and not metadata["corpses"]
        )
        assert all(p[75] and len(p[75]["torsoPlan"]) == 5 for p in metadata["fish"]), \
            "Fish outside the image need canonical geometry for previews and events"
        for request, base in enumerate([0, 1, 0, 2], 2):
            before = relay.revision
            command(request, f'render {base} 1230 820 2460 1640 1 "" "" -1')
            assert relay.revision == before + 1
            packets.append(base64.b64encode(relay.latest).decode())
        command(6, "brain-mode 1")
        command(7, 'render 4 1230 820 2460 1640 1 "" "" -1')
        packets.append(base64.b64encode(relay.latest).decode())
        raw = relay.latest
        import struct

        size, assets, inspection = struct.unpack_from("<III", raw, 4)
        details = json.loads(raw[16 + size + assets :])
        layout = details["brain"]["layout_id"]
        command(8, f'render 5 1230 820 2460 1640 1 "{layout}" "" -1')
        raw = relay.latest
        size, assets, inspection = struct.unpack_from("<III", raw, 4)
        details = json.loads(raw[16 + size + assets :])
        assert "layout" not in details["brain"], "Stable brain layout repeated"
        assert details["brain"]["neuron_state"]
        assert "visual_image" not in details["brain"], "Retina sent twice"
        assert details["vision"] is None or len(details["vision"]["bands"]) <= 256
        inspection_id = details["inspection_id"]
        command(9, f'render 6 1230 820 2460 1640 1 "{layout}" "{inspection_id}" -1')
        raw = relay.latest
        size, assets, inspection = struct.unpack_from("<III", raw, 4)
        reused = json.loads(raw[16 + size + assets:])
        assert reused == {"context": details["context"], "inspection_id": inspection_id}
        assert inspection < 256, "Paused inspection repeats unchanged details"
        command(10, "select 0")
        command(11, 'render 0 0 0 1 1 1 "" "" -1')
        culled = base64.b64encode(relay.latest).decode()
        path = Path(temporary) / "scene.json"
        path.write_text(
            json.dumps(dict(metadata=metadata, packets=packets, layout=layout, culled=culled))
        )
        subprocess.run(
            ["node", "--experimental-vm-modules", "tests/scene_frame.js", str(path)],
            cwd=root,
            check=True,
        )
        native = Path(temporary) / "native.json"
        native.write_text(
            json.dumps(
                {
                    "state": {
                        "frame": metadata,
                        "session": "wire-test",
                        "exit_code": None,
                        "options": {"fish": 3, "seed": 42},
                    },
                    "history": {
                        "active": "wire-test",
                        "points": [],
                        "milestones": [],
                        "sessions": [],
                    },
                    "binary_packet": packets[0],
                    "culled_packet": culled,
                }
            )
        )
        subprocess.run(
            ["node", "--experimental-vm-modules", "tests/modules.js", str(native)],
            cwd=root,
            check=True,
        )
        subprocess.run(["node", "tests/animals.js", str(native)], cwd=root, check=True)
        command(9, "stop")
        process.wait(timeout=15)
        assert process.returncode == 0
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()

# A stopped statistics consumer must never stop image requests or command acknowledgements.
import os
import queue
import threading
with tempfile.TemporaryDirectory() as temporary:
    metadata_read, metadata_write = os.pipe()
    process = subprocess.Popen(
        [binary("fish"), "--interactive", "--render-stream", "--metadata-fd",
         str(metadata_write), "--input", "genomes/cppn-start.genome", "--fish", "3",
         "--empty-world", "--threads", "1", "--seed", "42", "--session", temporary,
         "--output", str(Path(temporary) / "best.genome")], cwd=root,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        pass_fds=(metadata_write,))
    os.close(metadata_write)
    replies = queue.Queue()
    def images():
        try:
            while line := process.stdout.readline():
                if line.startswith(b"FSCENE "):
                    raw = read_exact(process.stdout, int(line[7:]))
                    assert process.stdout.read(1) == b"\n"
                    replies.put(("image", raw))
                else:
                    replies.put(("event", json.loads(line)))
        except Exception as error:
            replies.put(("error", error))
    reader = threading.Thread(target=images, daemon=True)
    reader.start()
    stream = os.fdopen(metadata_read, "rb")
    try:
        # Wait until the pipe is full and the background writer is blocked.
        import fcntl, select, time
        capacity = fcntl.fcntl(metadata_read, fcntl.F_GETPIPE_SZ)
        available = __import__('array').array('i', [0])
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            fcntl.ioctl(metadata_read, __import__('termios').FIONREAD, available)
            if available[0] == capacity:
                break
            time.sleep(.01)
        assert available[0] == capacity, "Statistics writer did not reach backpressure"
        process.stdin.write(b'request 1 pause\nrequest 2 render 0 1230 820 2460 1640 1 "" "" -1\n')
        process.stdin.flush()
        acknowledged, image = set(), False
        while acknowledged != {1, 2} or not image:
            kind, value = replies.get(timeout=3)
            assert kind != "error", value
            if kind == "image":
                image = True
            elif value.get("event") == "command":
                assert value["ok"], value
                acknowledged.add(value["request"])
        # The binary image and both acknowledgements arrived while the statistics pipe stayed full.
        assert select.select([stream], [], [], 0)[0]
        metadata_done = threading.Event()
        captured = []
        def statistics():
            from view_transport import FrameDecoder
            decoder = FrameDecoder()
            for line in stream:
                frame = decoder.accept(json.loads(line))
                captured.append(frame)
                if frame.get("command_request", 0) >= 1 and frame["paused"]:
                    metadata_done.set()
        metadata = threading.Thread(target=statistics, daemon=True)
        metadata.start()
        assert metadata_done.wait(5), "Statistics did not recover after the pipe resumed"
        process.stdin.write(b'request 3 stop\n')
        process.stdin.flush()
        process.wait(timeout=5)
        metadata.join(timeout=2)
        assert not metadata.is_alive() and process.returncode == 0
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        stream.close()
        reader.join(timeout=2)
print("Separate statistics channel: blocked reader, uninterrupted images, ordered recovery: OK")

# Archive fsyncs may stall arbitrarily; the image pipe and command acknowledgements stay live.
from concurrent.futures import ThreadPoolExecutor
from collections import deque
from types import SimpleNamespace
import struct
import journal as journal_module
from simulation import Simulation
from protocol_schema import Fish

with tempfile.TemporaryDirectory() as temporary:
    sim = Simulation.__new__(Simulation)
    sim.offer_population = False
    sim.lock, sim.transport_lock, sim.lifecycle = (threading.RLock() for _ in range(3))
    sim.events = ThreadPoolExecutor(max_workers=1)
    sim.pending, sim.request_id, sim.logs = {}, 0, deque()
    sim.reset_frames()
    sim.journal = journal_module.Journal(Path(temporary) / "journal")
    sim.journal.begin(Path(temporary))
    entered, release = threading.Event(), threading.Event()
    original = journal_module.atomic_write

    def blocked_write(path, content):
        entered.set()
        assert release.wait(5), "Test did not release the archive writer"
        original(path, content)

    payload = b"FSV1" + struct.pack("<III", 120, 0, 0) + bytes(120)
    read_fd, write_fd = os.pipe()
    writer = os.fdopen(write_fd, "wb", buffering=0)

    class Input:
        def write(self, line):
            request = int(line.split()[1])
            writer.write(b"FSCENE " + str(len(payload)).encode() + b"\n" + payload + b"\n")
            writer.write((json.dumps({"event": "command", "request": request, "ok": True}) + "\n").encode())

        def flush(self):
            pass

    sim.process = SimpleNamespace(stdout=os.fdopen(read_fd, "rb"), stdin=Input(), poll=lambda: None)
    fish = [0] * 76
    fish[Fish.ID], fish[Fish.SPECIES] = 1, 1
    candidate = dict(event="genome-candidate", kind="record", key="age", value=1000,
                     step=1000, fish=fish, species=[dict(id=1, name="Test")],
                     genome="FISH_CPPN\nTest\nEnd\n")
    journal_module.atomic_write = blocked_write
    reader = threading.Thread(target=sim.read_frames, args=(sim.process,))
    result = queue.Queue()

    def render():
        try:
            result.put(sim.render(0, [0, 0, 100, 100, 1]))
        except Exception as error:
            result.put(error)

    request = threading.Thread(target=render)
    try:
        reader.start()
        writer.write((json.dumps(candidate) + "\n").encode())
        assert entered.wait(2), "Archive write was not reached"
        request.start()
        assert result.get(timeout=1) == payload, "Image request waited for archive fsync"
        assert not release.is_set(), "Disk writer must still be blocked during the image request"
    finally:
        release.set()
        writer.close()
        reader.join(5)
        request.join(5)
        sim.events.shutdown(wait=True)
        journal_module.atomic_write = original
    assert not reader.is_alive() and not request.is_alive()
    assert (sim.journal.root / "catalog.json").is_file()
print("Blocked archive fsync: image bytes and acknowledgement remain available; record persists: OK")

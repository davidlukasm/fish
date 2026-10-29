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

# Exercise the process protocol, the separate image channel and the real display adapter.
import base64
import json
import queue
import sys
import threading

sys.path.insert(0, str(root))
from frame_store import FrameStore
from render_transport import SceneChannel

with tempfile.TemporaryDirectory() as temporary:
    channel = SceneChannel(str(Path(temporary) / "scene.sock"))
    process = subprocess.Popen(
        [
            binary("fish"),
            "--interactive",
            "--render-stream",
            "--render-socket",
            channel.path,
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
    frames, packets = FrameStore(), []

    def scene(base, viewport, brain="", inspection=""):
        return channel.render(base, viewport, brain, inspection, -1)

    # The engine must never block on its command output while an image is requested.
    lines = queue.Queue()

    def drain():
        while line := process.stdout.readline():
            lines.put(line)
        lines.put(b"")

    threading.Thread(target=drain, daemon=True).start()

    def read():
        line = lines.get(timeout=30)
        if not line:
            raise AssertionError(process.stderr.read().decode())
        assert not line.startswith(b"FSCENE"), "Images must not use the command output"
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
        view = [1230, 820, 2460, 1640, 1]
        for base in [0, 1, 0, 2]:
            packets.append(base64.b64encode(scene(base, view)).decode())
        command(6, "brain-mode 1")
        raw = scene(4, view)
        packets.append(base64.b64encode(raw).decode())
        import struct

        size, assets, inspection = struct.unpack_from("<III", raw, 4)
        details = json.loads(raw[16 + size + assets :])
        layout = details["brain"]["layout_id"]
        raw = scene(5, view, layout)
        size, assets, inspection = struct.unpack_from("<III", raw, 4)
        details = json.loads(raw[16 + size + assets :])
        assert "layout" not in details["brain"], "Stable brain layout repeated"
        assert details["brain"]["neuron_state"]
        assert "visual_image" not in details["brain"], "Retina sent twice"
        assert details["vision"] is None or len(details["vision"]["bands"]) <= 256
        inspection_id = details["inspection_id"]
        raw = scene(6, view, layout, inspection_id)
        size, assets, inspection = struct.unpack_from("<III", raw, 4)
        reused = json.loads(raw[16 + size + assets:])
        assert reused == {"context": details["context"], "inspection_id": inspection_id}
        assert inspection < 256, "Paused inspection repeats unchanged details"
        command(10, "select 0")
        culled = base64.b64encode(scene(0, [0, 0, 1, 1, 1])).decode()
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
        try:
            scene(0, view, "x" * 101)
            raise AssertionError("Oversized brain key accepted")
        except ValueError:
            pass
        command(9, "stop")
        process.wait(timeout=15)
        assert process.returncode == 0
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        channel.close()

# A stopped statistics consumer must never stop image requests or command acknowledgements.
import os
import queue
import threading
with tempfile.TemporaryDirectory() as temporary:
    channel = SceneChannel(str(Path(temporary) / "scene.sock"))
    metadata_read, metadata_write = os.pipe()
    process = subprocess.Popen(
        [binary("fish"), "--interactive", "--render-stream", "--render-socket", channel.path,
         "--metadata-fd",
         str(metadata_write), "--input", "genomes/cppn-start.genome", "--fish", "3",
         "--empty-world", "--threads", "1", "--seed", "42", "--session", temporary,
         "--output", str(Path(temporary) / "best.genome")], cwd=root,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        pass_fds=(metadata_write,))
    os.close(metadata_write)
    replies = queue.Queue()
    def events():
        try:
            while line := process.stdout.readline():
                replies.put(("event", json.loads(line)))
        except Exception as error:
            replies.put(("error", error))
    reader = threading.Thread(target=events, daemon=True)
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
        process.stdin.write(b'request 1 pause\n')
        process.stdin.flush()
        def image():
            try:
                replies.put(("image", channel.render(0, [1230, 820, 2460, 1640, 1])))
            except Exception as error:
                replies.put(("error", error))
        threading.Thread(target=image, daemon=True).start()
        acknowledged, image = set(), False
        while acknowledged != {1} or not image:
            kind, value = replies.get(timeout=3)
            assert kind != "error", value
            if kind == "image":
                image = True
            elif value.get("event") == "command":
                assert value["ok"], value
                acknowledged.add(value["request"])
        # The binary image and the acknowledgement arrived while the statistics pipe stayed full.
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
        channel.close()
print("Separate statistics channel: blocked reader, uninterrupted images, ordered recovery: OK")

# Archive fsyncs may stall arbitrarily; command acknowledgements stay live.
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

    read_fd, write_fd = os.pipe()
    writer = os.fdopen(write_fd, "wb", buffering=0)

    class Input:
        def write(self, line):
            request = int(line.split()[1])
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

    def pause():
        try:
            result.put(sim.command("pause"))
        except Exception as error:
            result.put(error)

    request = threading.Thread(target=pause)
    try:
        reader.start()
        writer.write((json.dumps(candidate) + "\n").encode())
        assert entered.wait(2), "Archive write was not reached"
        request.start()
        assert result.get(timeout=1) == "", "Command acknowledgement waited for archive fsync"
        assert not release.is_set(), "Disk writer must still be blocked during the command"
    finally:
        release.set()
        writer.close()
        reader.join(5)
        request.join(5)
        sim.events.shutdown(wait=True)
        journal_module.atomic_write = original
    assert not reader.is_alive() and not request.is_alive()
    assert (sim.journal.root / "catalog.json").is_file()
print("Blocked archive fsync: acknowledgement remains available; record persists: OK")

# The front process answers /scene itself while the statistics process is busy, relays all
# other routes unchanged and skips answers to abandoned image requests.
import http.client
import socket
from viewer_http import FrontServer, WorkerServer

payload = b"FSV1" + struct.pack("<III", 120, 0, 0) + bytes(120)


def engine(path, answers):
    """Fake engine: connects like bin/fish and replies with the given callable."""
    link = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    link.connect(path)

    def serve():
        buffer = b""
        try:
            while part := link.recv(65536):
                buffer += part
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    link.sendall(answers(int(line.split()[1]), line))
        except OSError:
            pass

    threading.Thread(target=serve, daemon=True).start()
    return link


with tempfile.TemporaryDirectory() as temporary:
    channel = SceneChannel(str(Path(temporary) / "scene.sock"), timeout=0.3)
    try:
        channel.render(0, [0, 0, 1, 1, 1])
        raise AssertionError("Image without engine")
    except ValueError:
        pass
    def first_engine(request, line):
        if request == 1:
            # The reply stops inside the image; the request times out.
            return b"FSCENE 1 " + str(len(payload)).encode() + b"\n" + payload[:50]
        if request == 2:
            # Rest of the abandoned reply, then a rejection.
            return payload[50:] + b'FERROR 2 "Ung\\u00fcltig"\n'
        return b"FSCENE " + str(request).encode() + b" " + str(len(payload)).encode() + b"\n" + payload

    first = engine(channel.path, first_engine)
    deadline = time.monotonic() + 2
    while channel.link is None and time.monotonic() < deadline:
        time.sleep(0.01)
    try:
        channel.render(0, [0, 0, 1, 1, 1])
        raise AssertionError("Missing answer must time out")
    except ValueError as error:
        assert "noch nicht" in str(error)
    try:
        channel.render(0, [0, 0, 1, 1, 1])
        raise AssertionError("Engine rejection must reach the client")
    except ValueError as error:
        assert str(error) == "Ungültig", error
    assert channel.render(0, [0, 0, 1, 1, 1]) == payload
    # A new engine run replaces the previous connection.
    second = engine(channel.path, lambda request, line: b"FSCENE " + str(request).encode()
                    + b" " + str(len(payload) + 4).encode() + b"\n" + payload[:4]
                    + struct.pack("<III", 124, 0, 0) + bytes(124))
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        try:
            if len(channel.render(0, [0, 0, 1, 1, 1])) == len(payload) + 4:
                break
        except ValueError:
            pass
        time.sleep(0.01)
    else:
        raise AssertionError("Reconnected engine not used")

    busy, release = threading.Event(), threading.Event()

    def state(*_):
        busy.set()
        assert release.wait(5)
        return b'{"frame":null}'

    simulation = SimpleNamespace(state=state, state_wire=state, offer_population=True)
    front = FrontServer(("127.0.0.1", 0), channel, str(Path(temporary) / "statistics.sock"))
    worker = WorkerServer(front.worker_path, front.server_port, simulation, "token", b"page", {})
    servers = [threading.Thread(target=s.serve_forever, daemon=True) for s in (front, worker)]
    for thread in servers:
        thread.start()

    def call(method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", front.server_port, timeout=5)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        value = response.status, response.read(), response.getheader("Content-Type")
        connection.close()
        return value

    try:
        pending = queue.Queue()
        threading.Thread(target=lambda: pending.put(call("GET", "/state?wire=1")), daemon=True).start()
        assert busy.wait(2), "State request did not reach the statistics process"
        status, body, kind = call("GET", "/scene?base=0&x=0&y=0&width=1&height=1&scale=1")
        assert status == 200 and kind == "application/octet-stream" and len(body) == len(payload) + 4
        assert not release.is_set(), "Image waited for the statistics process"
        release.set()
        assert pending.get(timeout=5)[:2] == (200, b'{"frame":null}')
        assert call("GET", "/scene?base=0&x=0&y=0&width=1&height=nan&scale=1")[0] == 400
        assert call("GET", "/scene", headers={"Host": "untrusted.invalid"})[0] == 403
        assert call("GET", "/")[1] == b"page"
        assert call("GET", "/", headers={"Host": "untrusted.invalid"})[0] == 403
        command = json.dumps({"command": "population-ready"}).encode()
        assert call("POST", "/command", command, {"X-Fish-Token": "wrong"})[0] == 403
        status, body, _ = call("POST", "/command", command, {"X-Fish-Token": "token"})
        assert status == 200 and json.loads(body)["ok"] and simulation.offer_population is False
        worker.shutdown()
        worker.server_close()
        os.unlink(front.worker_path)
        assert call("GET", "/history")[0] == 503
    finally:
        release.set()
        front.shutdown()
        front.server_close()
        channel.close()
        first.close()
        second.close()
print("Image front: /scene independent of the statistics process, verbatim relay, stale answers skipped: OK")

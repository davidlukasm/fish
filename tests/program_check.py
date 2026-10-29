"""Real HTTP cockpit: new worlds, parameter persistence, and saved continuation."""

from pathlib import Path
import json
import os
import queue
import re
import shutil
import signal
import subprocess
import struct
import tempfile
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from suite import binary
import threading
import time
from urllib.request import Request, urlopen
from urllib.parse import quote
from urllib.error import HTTPError

root = Path(__file__).resolve().parents[1]


def wait_for(read, predicate, label, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = read()
        if predicate(value):
            return value
        time.sleep(0.025)
    raise AssertionError(label)


with tempfile.TemporaryDirectory(prefix='fish-ä-quote-"-') as directory:
    # Keep the HTTP test independent of the size of the user's persistent Founder pool.
    project = Path(directory) / "project"
    project.mkdir()
    for source in [*root.glob("*.py"), root / "viewer.html", root / "VERSION"]:
        shutil.copy2(source, project / source.name)
    shutil.copytree(root / "ui", project / "ui")
    shutil.copytree(root / "genomes", project / "genomes")
    (project / "bin").mkdir()
    (project / "bin/fish").symlink_to(binary())
    manifest = project / "genomes/pool/index.pool"
    rows = manifest.read_text().splitlines()
    header = rows[0].split()
    header[2] = str(min(4, len(rows) - 1))
    manifest.write_text(" ".join(header) + "\n" + "\n".join(rows[1:5]) + "\n")
    process = subprocess.Popen(
        [
            "python3",
            "-u",
            "viewer.py",
            "--no-browser",
            "--port",
            "0",
            "--data-dir",
            directory,
            "--fps-report",
            "--fresh",
            "--empty-world",
            "--input", "genomes/cppn-start.genome",
            "--param", "assist_min_population=0",
            "--fish",
            "1",
            "--seed",
            "42",
            "--threads",
            "2",
        ],
        cwd=project,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    lines = queue.Queue()
    transcript = []

    def drain():
        for line in process.stdout:
            transcript.append(line)
            lines.put(line)

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        deadline = time.monotonic() + 15
        address = None
        while address is None and time.monotonic() < deadline:
            try:
                match = re.search(r"http://127\.0\.0\.1:\d+/", lines.get(timeout=0.1))
                if match:
                    address = match[0]
            except queue.Empty:
                assert process.poll() is None, "".join(transcript)
        assert address, "Cockpit did not start"

        def get(path=""):
            with urlopen(address + path, timeout=15) as response:
                assert response.status == 200
                return response.read().decode()

        page = get()
        match = re.search(r'window\.FISH_TOKEN\s*=\s*[\'"]([^\'"]+)', page)
        assert match, "Cockpit token missing"
        token = match[1]
        assert "window.FISH_FPS_REPORT=true" in page
        assert not any(
            name in page for name in ("render-fps", "render-times", "render-stats")
        )
        assets = re.findall(r'(?:src|href)="/(ui/[^"?#]+)"', page)
        assert assets, "Cockpit assets missing from HTML"
        for path in assets:
            assert (
                get(path) == (root / path).read_text()
            ), f"Cockpit asset not served correctly: {path}"

        (report_path,) = Path(directory).glob("fps-report-*.jsonl")
        header = json.loads(report_path.read_text().splitlines()[0])
        assert header["type"] == "start" and len(header["source_sha256"]) == 64

        def fps_post(payload, request_token=token):
            request = Request(
                address + "fps-report",
                data=json.dumps(payload).encode(),
                headers={
                    "Content-Type": "application/json",
                    "X-Fish-Token": request_token,
                },
            )
            try:
                with urlopen(request, timeout=10) as response:
                    return response.status
            except HTTPError as error:
                return error.code

        sample = {
            "client_id": "integration",
            "step": 0,
            "frames": {"fps": 6, "callbacks": 6},
            "frame_ms": {"max": 400},
            "transport": {"bytes": 512},
        }
        assert fps_post(sample, "wrong") == 403
        assert fps_post({"unexpected": "value"}) == 400
        assert fps_post({"frame_ms": {"max": float("nan")}}) == 400
        assert (
            len(report_path.read_text().splitlines()) == 1
        ), "Rejected reports alter the log"
        assert fps_post(sample) == 200
        recorded = json.loads(report_path.read_text().splitlines()[-1])
        assert (
            recorded["frames"]["fps"] == 6
            and recorded["frame_ms"]["max"] == 400
            and recorded["simulation"]["session"]
        )
        assert recorded["type"] == "frames" and recorded["transport"]["bytes"] == 512

        def command(op, **values):
            payload = json.dumps({"command": op, **values}).encode()
            request = Request(
                address + "command",
                data=payload,
                headers={"Content-Type": "application/json", "X-Fish-Token": token},
            )
            try:
                with urlopen(request, timeout=20) as response:
                    result = json.load(response)
            except HTTPError as error:
                raise AssertionError(op + ": " + error.read().decode()) from error
            assert result.get("ok"), result

        def state():
            value = json.loads(get("state"))
            assert not value.get("logs"), value.get("logs")
            return value

        initial = wait_for(state, lambda s: s.get("frame"), "Initial world missing")
        command("pause")
        paused = wait_for(state, lambda s: s["frame"]["paused"], "Pause missing")
        assert len(paused["frame"]["fish"]) == 1, (len(paused["frame"]["fish"]), paused["frame"]["step"])
        step = paused["frame"]["step"]
        command("step")
        current = wait_for(state, lambda s: s["frame"]["step"] > step, "Step missing")
        assert current["frame"]["step"] == step + 1 and current["frame"]["paused"]
        raw = urlopen(address + "scene?base=0&x=300&y=200&width=615&height=410&scale=1", timeout=5).read()
        assert raw.startswith(b"FSV1"), "HTTP must serve the typed image stream"
        size, assets, details = struct.unpack_from("<III", raw, 4)
        assert len(raw) == 16 + size + assets + details
        # Command acknowledgement, actual editor state and restart persistence cross all layers.
        command("parameter", name="stroke_push", value=0.04)
        command("spray", x=300, y=100, count=4, radius=18)
        current = wait_for(state, lambda s: s["frame"]["parameters"]["stroke_push"] == .04,
                           "Changed parameter missing")
        command("restart")
        resumed = wait_for(state, lambda s: s.get("frame") and s["frame"]["paused"],
                           "Restart failed")
        assert resumed["frame"]["parameters"]["stroke_push"] == .04
        assert resumed["frame"]["step"] == current["frame"]["step"]
        command("stop")
    finally:
        if process.poll() is None:
            process.send_signal(signal.SIGINT)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        reader.join(timeout=1)
        process.stdout.close()
print("HTTP: Start, Zugriffsschutz, Diagnose, Bild, Einzelstep und Neustart: OK")

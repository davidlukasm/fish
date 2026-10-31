#!/usr/bin/env python3
"""Statistics process: simulation, archive and all routes except /scene (started by viewer.py)."""

import gc
import json
import os
import re
import secrets
import subprocess
import sys
import threading
from viewer_paths import ROOT
from simulation import Simulation
from fps_report import FpsReport, source_fingerprint
from viewer import arguments
from viewer_http import WorkerServer


def page_bytes(args, token, defaults):
    page_text = (
        (ROOT / "viewer.html")
        .read_text()
        .replace("__TOKEN__", token)
        .replace("__FPS_REPORT__", json.dumps(args.fps_report))
        .replace(
            "__FISH_BUILD__",
            json.dumps({
                "version": (ROOT / "VERSION").read_text().strip(),
                "source_sha256": source_fingerprint(),
            }),
        )
    )

    page_text = re.sub(
        r"<title>[^<]*</title>",
        "<title>Fish v" + (ROOT / "VERSION").read_text().strip() + " · Evolution</title>",
        page_text,
    )

    def default_input(match):
        name = match[1].replace("-", "_")
        spec = defaults.get(name)
        if spec is None:
            return match[0]
        return re.sub(r'value="[^"]*"', 'value="' + str(spec["value"]) + '"', match[0])

    return re.sub(r'<input id="new-([a-z-]+)"[^>]*>', default_input, page_text).encode()


def main():
    # Large parsed frames, no reference cycles: a full collection over ~1e6 objects pauses
    # statistics answers for up to a second (images are unaffected in the front process).
    gc.set_threshold(50000, 50, 200)
    directory, port, ready = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    args = arguments(sys.argv[4:])
    # The engine sends images straight to the front process.
    args.render_socket = os.path.join(directory, "scene.sock")
    simulation = Simulation(args)
    token = secrets.token_urlsafe(24)
    fps_report = None
    defaults = json.loads(
        subprocess.check_output([str(ROOT / "bin/fish"), "--defaults-json"], text=True)
    )
    server = WorkerServer(
        os.path.join(directory, "statistics.sock"),
        port,
        simulation,
        token,
        page_bytes(args, token, defaults),
        defaults,
    )

    def watch_front():
        # EOF: the front process has ended.
        sys.stdin.buffer.read()
        server.shutdown()

    threading.Thread(target=watch_front, daemon=True).start()
    try:
        simulation.start(resume=not args.fresh and not args.input)
        if args.fps_report:
            fps_report = FpsReport(args)
            server.fps_report = fps_report
            print(f"FPS-Bericht: {fps_report.path}", flush=True)
        os.write(ready, b"1")
        os.close(ready)
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        simulation.close()
        if fps_report:
            fps_report.close()


if __name__ == "__main__":
    main()

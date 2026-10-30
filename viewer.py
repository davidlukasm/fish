#!/usr/bin/env python3
"""Local browser view for the C++ simulation (Python standard library only)."""

# Two processes: this front serves the image stream (/scene) and relays every other route
# to the statistics process (viewer_worker.py), so JSON and archive work never holds the
# interpreter lock of the image path.

import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from viewer_paths import ROOT, engine_path
import argparse
import webbrowser
from render_transport import SceneChannel
from viewer_http import FrontServer


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fps-report",
        action="store_true",
        help="Browser-Bildrate und Zeichenphasen als JSONL unter --data-dir protokollieren",
    )
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument(
        "--empty-world",
        action="store_true",
        help="Neuen Lauf im freien Becken beginnen",
    )
    parser.add_argument("--input")
    parser.add_argument(
        "--param",
        action="append",
        default=[],
        metavar="NAME=WERT",
        help="Evolutions- oder Futterparameter, wiederholbar",
    )
    parser.add_argument("--fresh", action="store_true")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "run")
    for name, default in [
        ("fish", 200),
        ("food", 1200),
        ("threads", 0),
        ("seed", None),
        ("max-neurons", 8192),
        ("max-connections", 65536),
        ("neural-budget", 64000000),
    ]:
        parser.add_argument("--" + name, type=int, default=default)
    parser.add_argument(
        "--compute",
        choices=["cpu", "opencl-optics", "opencl-graphics"],
        default="cpu",
        help="CPU oder optionale GPU-Sichtdämpfung",
    )
    parser.add_argument(
        "--benchmark-opencl",
        action="store_true",
        help="Sichtdämpfung, Augenbilder und Gesamtsimulation vergleichen",
    )
    parser.add_argument(
        "--benchmark-steps",
        type=int,
        default=100,
        help="Schritte je CPU-/OpenCL-Durchlauf (1–1.000.000; drei Wiederholungen)",
    )
    args = parser.parse_args(argv)
    if args.compute == "opencl-graphics":
        args.compute = "opencl-optics"
    if args.seed is None:
        args.seed = secrets.randbits(32)
    if args.threads == 0:
        args.threads = int(
            subprocess.check_output(
                [str(engine_path()), "--available-threads"], text=True
            )
        )
    if not 1 <= args.benchmark_steps <= 1000000:
        parser.error("--benchmark-steps: 1–1.000.000 erforderlich")
    args.data_dir = args.data_dir.resolve()
    for name, maximum in [("fish", 2000), ("threads", 64)]:
        if not 1 <= getattr(args, name) <= maximum:
            parser.error("Ungueltiger Wert: " + name)
    if not 0 <= args.food <= 10000 or not 0 <= args.seed <= 4294967295:
        parser.error("Ungueltiges Futter/Seed")
    for parameter in args.param:
        if not re.fullmatch(r"[a-z_]{1,40}=[-+0-9.eE]{1,24}", parameter):
            parser.error("--param NAME=WERT erwartet: " + parameter)
    return args


def main():
    args = arguments()
    if args.benchmark_opencl:
        raise SystemExit(
            subprocess.run(
                [
                    str(engine_path()),
                    "--benchmark-opencl",
                    "--threads",
                    str(args.threads),
                    "--fish",
                    str(args.fish),
                    "--benchmark-steps",
                    str(args.benchmark_steps),
                    "--compute",
                    args.compute,
                ]
            ).returncode
        )
    # Private directory for the image socket of the engine and the statistics socket.
    directory = Path(tempfile.mkdtemp(prefix="fish-viewer-"))
    scenes = server = worker = None
    try:
        scenes = SceneChannel(str(directory / "scene.sock"))
        server = FrontServer(("127.0.0.1", args.port), scenes, str(directory / "statistics.sock"))
        ready_read, ready_write = os.pipe()
        try:
            # stdin stays open while this process lives; EOF ends the statistics process.
            worker = subprocess.Popen(
                [sys.executable, str(ROOT / "viewer_worker.py"), str(directory),
                 str(server.server_port), str(ready_write), *sys.argv[1:]],
                stdin=subprocess.PIPE,
                pass_fds=(ready_write,),
            )
        finally:
            os.close(ready_write)
        with os.fdopen(ready_read, "rb") as ready:
            started = ready.read(1)
        if not started:
            raise SystemExit(worker.wait())

        def watch():
            worker.wait()
            server.shutdown()

        threading.Thread(target=watch, daemon=True).start()
        url = f"http://127.0.0.1:{server.server_address[1]}/"
        print(f"Fish: {url}", flush=True)
        print("Zum Beenden im Terminal Strg+C druecken.", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        if server:
            server.server_close()
        if worker:
            worker.stdin.close()
            try:
                worker.wait(timeout=30)
            except subprocess.TimeoutExpired:
                worker.send_signal(signal.SIGINT)
                worker.wait()
        if scenes:
            scenes.close()
        shutil.rmtree(directory, ignore_errors=True)


if __name__ == "__main__":
    main()

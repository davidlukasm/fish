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

from protocol_schema import PopulationLimits, RunLimit
from viewer_paths import ROOT, engine_path
import argparse
import webbrowser
from render_transport import SceneChannel
from viewer_http import FrontServer
from viewer_commands import PARAMETER_NAME

# The viewer listens on DEFAULT_PORT; seeds have SEED_BITS bits; a parameter value from the
# command line takes up to VALUE_CHARS characters. The server checks for shutdown every POLL_S,
# and the statistics process gets STOP_S to finish.
DEFAULT_PORT, SEED_BITS, VALUE_CHARS, POLL_S, STOP_S = 8765, 32, 24, 0.2, 30


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fps-report",
        action="store_true",
        help="Browser-Bildrate und Zeichenphasen als JSONL unter --data-dir protokollieren",
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument(
        "--empty-world",
        action="store_true",
        help="Neuen Lauf im freien Becken beginnen",
    )
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
        ("fish", RunLimit.DEFAULT_FISH),
        ("food", RunLimit.DEFAULT_FOOD),
        ("threads", 0),
        ("seed", None),
        ("max-neurons", RunLimit.DEFAULT_BRAIN_NODES),
        ("max-connections", RunLimit.DEFAULT_BRAIN_EDGES),
        ("neural-budget", RunLimit.DEFAULT_NEURAL_BUDGET),
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
        default=RunLimit.BENCHMARK_STEPS,
        help=f"Schritte je CPU-/OpenCL-Durchlauf (1–{RunLimit.MAX_BENCHMARK_STEPS:,}; drei Wiederholungen)".replace(",", "."),
    )
    args = parser.parse_args(argv)
    if args.compute == "opencl-graphics":
        args.compute = "opencl-optics"
    if args.seed is None:
        args.seed = secrets.randbits(SEED_BITS)
    if args.threads == 0:
        args.threads = int(
            subprocess.check_output(
                [str(engine_path()), "--available-threads"], text=True
            )
        )
    if not 1 <= args.benchmark_steps <= RunLimit.MAX_BENCHMARK_STEPS:
        parser.error(f"--benchmark-steps: 1–{RunLimit.MAX_BENCHMARK_STEPS:,} erforderlich".replace(",", "."))
    args.data_dir = args.data_dir.resolve()
    for name, maximum in [("fish", PopulationLimits.MAX_FISH), ("threads", RunLimit.MAX_THREADS)]:
        if not 1 <= getattr(args, name) <= maximum:
            parser.error("Ungueltiger Wert: " + name)
    if not 0 <= args.food <= RunLimit.MAX_FOOD or not 0 <= args.seed < 2**SEED_BITS:
        parser.error("Ungueltiges Futter/Seed")
    for parameter in args.param:
        if not re.fullmatch(PARAMETER_NAME + r"=[-+0-9.eE]{1," + str(VALUE_CHARS) + "}", parameter):
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
        server.serve_forever(poll_interval=POLL_S)
    except KeyboardInterrupt:
        pass
    finally:
        if server:
            server.server_close()
        if worker:
            worker.stdin.close()
            try:
                worker.wait(timeout=STOP_S)
            except subprocess.TimeoutExpired:
                worker.send_signal(signal.SIGINT)
                worker.wait()
        if scenes:
            scenes.close()
        shutil.rmtree(directory, ignore_errors=True)


if __name__ == "__main__":
    main()

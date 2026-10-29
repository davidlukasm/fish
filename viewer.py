#!/usr/bin/env python3
"""Local browser view for the C++ simulation (Python standard library only)."""

import json
import re
import secrets
import subprocess
from pathlib import Path
from viewer_paths import ROOT
import argparse
import webbrowser
from simulation import Simulation
from frame_assets import hydrate_brain, hydrate_render, BRAIN_LAYOUT_FIELDS
from fps_report import FpsReport, source_fingerprint
from viewer_http import ViewerServer


def main():
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
    args = parser.parse_args()
    if args.compute == "opencl-graphics":
        args.compute = "opencl-optics"
    if args.seed is None:
        args.seed = secrets.randbits(32)
    if args.threads == 0:
        args.threads = int(
            subprocess.check_output(
                [str(ROOT / "bin/fish"), "--available-threads"], text=True
            )
        )
    if not 1 <= args.benchmark_steps <= 1000000:
        parser.error("--benchmark-steps: 1–1.000.000 erforderlich")
    if args.benchmark_opencl:
        raise SystemExit(
            subprocess.run(
                [
                    str(ROOT / "bin/fish"),
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
    args.data_dir = args.data_dir.resolve()
    for name, maximum in [("fish", 2000), ("threads", 64)]:
        if not 1 <= getattr(args, name) <= maximum:
            parser.error("Ungueltiger Wert: " + name)
    if not 0 <= args.food <= 10000 or not 0 <= args.seed <= 4294967295:
        parser.error("Ungueltiges Futter/Seed")
    for parameter in args.param:
        if not re.fullmatch(r"[a-z_]{1,40}=[-+0-9.eE]{1,24}", parameter):
            parser.error("--param NAME=WERT erwartet: " + parameter)
    simulation = Simulation(args)
    token = secrets.token_urlsafe(24)
    fps_report = None
    defaults = json.loads(
        subprocess.check_output([str(ROOT / "bin/fish"), "--defaults-json"], text=True)
    )
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

    page = re.sub(r'<input id="new-([a-z-]+)"[^>]*>', default_input, page_text).encode()
    server = ViewerServer(("127.0.0.1", args.port), simulation, token, page, defaults)
    try:
        simulation.start(resume=not args.fresh and not args.input)
        if args.fps_report:
            fps_report = FpsReport(args)
            server.fps_report = fps_report
        url = f"http://127.0.0.1:{server.server_address[1]}/"
        if fps_report:
            print(f"FPS-Bericht: {fps_report.path}", flush=True)
        print(f"Fish: {url}", flush=True)
        print("Zum Beenden im Terminal Strg+C druecken.", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        simulation.founders.close()
        simulation.close()
        if fps_report:
            fps_report.close()


if __name__ == "__main__":
    main()

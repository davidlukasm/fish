"""Optional append-only browser timing report."""

import hashlib
import platform
import json
import secrets
import threading
import time
from viewer_paths import ROOT


def source_fingerprint():
    source = hashlib.sha256()
    for path in sorted(
        [
            *ROOT.glob("*.py"),
            ROOT / "viewer.html",
            *ROOT.glob("ui/*"),
            *ROOT.glob("src/*"),
            *ROOT.glob("colony-core/*/*.cc"),
            *ROOT.glob("colony-core/*/*.hh"),
        ]
    ):
        if path.is_file():
            source.update(
                path.relative_to(ROOT).as_posix().encode()
                + b"\0"
                + path.read_bytes()
            )
    return source.hexdigest()


class FpsReport:
    """One append-only report per viewer launch; browser summaries contain no scene arrays."""

    def __init__(self, args):
        args.data_dir.mkdir(parents=True, exist_ok=True)
        self.path = args.data_dir / (
            "fps-report-"
            + time.strftime("%Y%m%d-%H%M%S")
            + "-"
            + secrets.token_hex(3)
            + ".jsonl"
        )
        self.lock = threading.Lock()
        self.file = self.path.open("x", encoding="utf-8", buffering=1)
        self.write(
            {
                "type": "start",
                "format": 1,
                "source_sha256": source_fingerprint(),
                "system": platform.platform(),
                "options": {
                    k: getattr(args, k)
                    for k in (
                        "fish",
                        "food",
                        "threads",
                        "seed",
                        "compute",
                        "empty_world",
                        "param",
                        "max_neurons",
                        "max_connections",
                        "neural_budget",
                    )
                },
            }
        )

    def write(self, data):
        line = (
            json.dumps(
                {"recorded_at": time.time(), **data},
                allow_nan=False,
                separators=(",", ":"),
            )
            + "\n"
        )
        with self.lock:
            self.file.write(line)

    def append(self, data, simulation):
        if set(data) - {
            "client_id",
            "client",
            "reason",
            "session",
            "epoch",
            "step",
            "view",
            "zoom",
            "viewport",
            "state",
            "objects",
            "frames",
            "frame_ms",
            "callback_ms",
            "work_ms",
            "phases_ms",
            "phase_max_ms",
            "draws",
            "vertices",
            "transport",
            "resources",
            "error",
        }:
            raise ValueError("Ungueltiger FPS-Bericht")
        with simulation.lock:
            f = simulation.latest or {}
            context = {
                "session": simulation.history.meta.get("id"),
                "seed": simulation.args.seed,
                "step": f.get("step"),
                "tick_ms": f.get("tick_ms"),
                "step_phases_ms": f.get("step_phases", []),
            }
        self.write({**data, "type": "frames", "simulation": context})

    def close(self):
        with self.lock:
            self.file.close()

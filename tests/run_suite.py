"""Run the checks within a single wall-clock budget."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

from suite import ROOT, BUILD, NATIVE, JAVASCRIPT, binary
from build_config import available_jobs

MAX_SECONDS = 20
CLEANUP_SECONDS = 0.25


def main():
    started = time.monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", choices=NATIVE + list(JAVASCRIPT) + ["interface"],
                        help="Run only named checks, e.g. --only invariants")
    parser.add_argument("--timeout", type=float, default=MAX_SECONDS,
                        help="Wall-clock budget in seconds, at most 20")
    args = parser.parse_args()
    if not 0 < args.timeout <= MAX_SECONDS:
        parser.error("Die Zeitgrenze muss zwischen 0 und 20 Sekunden liegen.")
    deadline = started + args.timeout - CLEANUP_SECONDS
    selected = set(args.only or NATIVE + list(JAVASCRIPT) + ["interface"])
    if selected - set(NATIVE) and not shutil.which("node"):
        parser.error("Node.js fehlt (Befehl „node“).")

    needed = [binary(name + "-tests") for name in NATIVE if name in selected]
    if "studio" in selected:
        needed.extend([binary("atelier"), binary("compiler-tests")])
    if "interface" in selected:
        needed.append(binary("zuchtbecken"))
    missing = [Path(name).name for name in dict.fromkeys(needed) if not os.access(name, os.X_OK)]
    if missing:
        parser.error(f"Prüfprogramme fehlen ({', '.join(missing)}). Zuerst ./build.sh checks ausführen.")

    environment = {**os.environ, "BUILD_DIR": str(BUILD), "PYTHONDONTWRITEBYTECODE": "1"}
    commands = [(name, [binary(name + "-tests")]) for name in NATIVE if name in selected]
    if "interface" in selected:
        commands.append(("interface", [sys.executable, "-B", "tests/build_check.py"]))
    commands += [(" ".join([name, *(arg.lstrip("-") for arg in part)]),
                  ["node", f"tests/{name}.js", *part])
                 for name, parts in JAVASCRIPT.items() if name in selected for part in parts]

    def run(label, command):
        begin = time.monotonic()
        if begin >= deadline:
            print(f"FEHLER {label:22} Gesamtzeitgrenze erreicht", flush=True)
            return False
        with subprocess.Popen(command, cwd=ROOT, env=environment, start_new_session=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) as process:
            failed = None
            try:
                output, _ = process.communicate(timeout=max(0, deadline - time.monotonic()))
                if process.returncode:
                    failed = f"Exit {process.returncode}"
            except subprocess.TimeoutExpired:
                failed = f"Gesamtzeitgrenze {args.timeout:g} s"
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                output, _ = process.communicate()
            finally:
                # Failed checks can leave helpers holding the process group open.
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        elapsed = time.monotonic() - begin
        status = "FEHLER" if failed else "OK"
        detail = f" — {failed}" if failed else ""
        if output and failed:
            detail += "\n" + output.rstrip("\n")
        print(f"{status:6} {label:22} {elapsed:6.2f} s{detail}", flush=True)
        return failed is None

    jobs = min(len(commands), max(1, int(os.environ.get("TEST_JOBS") or available_jobs())))
    with ThreadPoolExecutor(max_workers=jobs) as executor:
        futures = [executor.submit(run, label, command) for label, command in commands]
        results = [future.result() for future in as_completed(futures)]
    print(f"{sum(results)}/{len(results)} Prüfungen bestanden, "
          f"{time.monotonic() - started:.2f} s insgesamt.")
    return int(not all(results))


if __name__ == "__main__":
    raise SystemExit(main())

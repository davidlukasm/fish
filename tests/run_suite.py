"""Short automated checks; report each duration and bound hung processes."""
import argparse
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import signal
import subprocess
import sys
import time
from build_check import ensure_node
from suite import ROOT, BUILD, NATIVE, JAVASCRIPT, binary
from build_config import available_jobs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-build", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--only", nargs="+", choices=NATIVE + JAVASCRIPT + ["interface"],
                        help="Run only named checks, e.g. --only invariants")
    parser.add_argument("--timeout", type=float, default=30, help="Seconds per check (default: 30)")
    args = parser.parse_args()
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("Zeitgrenzen müssen positiv sein")
    if not args.only or set(args.only) - set(NATIVE):
        ensure_node()
    environment = {**os.environ, "BUILD_DIR": str(BUILD), "PYTHONDONTWRITEBYTECODE": "1"}

    def run(label, command, timeout, show_output=False):
        started = time.monotonic()
        process = subprocess.Popen(command, cwd=ROOT, env=environment, start_new_session=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        failed = None
        try:
            output, _ = process.communicate(timeout=timeout)
            if process.returncode:
                failed = f"Exit {process.returncode}"
        except subprocess.TimeoutExpired:
            failed = f"Zeitgrenze {timeout:g} s"
            os.killpg(process.pid, signal.SIGKILL)
            output, _ = process.communicate()
        finally:
            # A failed check must not leave a process running.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        duration = time.monotonic() - started
        details = f" — {failed}" if failed else ""
        if output and (failed or show_output):
            details += "\n" + output.rstrip("\n")
        print(f"{'FEHLER' if failed else 'OK':6} {label:22} {duration:6.2f} s" + details, flush=True)
        return failed is None

    selected = set(args.only or [])
    natives = [n for n in NATIVE if not selected or n in selected]
    if not args.no_build:
        targets = [binary(), *(binary(n + "-tests") for n in natives)]
        if not selected or {"studio", "interface"} & selected:
            targets.extend([binary("atelier"), binary("zuchtbecken")])
        command = ["make", "-s", "-j" + (os.environ.get("BUILD_JOBS") or str(available_jobs())),
                   "BUILD_DIR=" + str(BUILD), *targets]
        if not run("Kompilieren", command, None, show_output=True):
            return 1
    commands = [(n, [binary(n + "-tests")]) for n in natives]
    commands.append(("interface", [sys.executable, "-B", "tests/build_check.py"]))
    commands += [(n, ["node", "tests/" + n + ".js"]) for n in JAVASCRIPT]
    if selected:
        commands = [(name, command) for name, command in commands if name in selected]
    started = time.monotonic()
    jobs = max(1, min(4, int(os.environ.get("TEST_JOBS") or available_jobs())))
    with ThreadPoolExecutor(max_workers=jobs) as executor:
        futures = {executor.submit(run, name, command, args.timeout): name for name, command in commands}
        results = [f.result() for f in as_completed(futures)]
    failures = results.count(False)
    print(f"{len(results) - failures}/{len(results)} Prüfungen bestanden; "
          f"{time.monotonic() - started:.2f} s ohne Kompilierung.")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())

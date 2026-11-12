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
    parser.add_argument("--only", nargs="+", choices=NATIVE + list(JAVASCRIPT) + ["interface"],
                        help="Run only named checks, e.g. --only invariants")
    parser.add_argument("--timeout", type=float, default=60, help="Seconds per check (default: 60)")
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
        targets = [] if selected else [binary()]
        targets.extend(binary(n + "-tests") for n in natives)
        if not selected or "studio" in selected:
            targets.extend([binary("atelier"), binary("compiler-tests")])
        if not selected or "interface" in selected:
            targets.append(binary("zuchtbecken"))
        if targets:
            command = ["make", "-s", "-j" + (os.environ.get("BUILD_JOBS") or str(available_jobs())),
                       "BUILD_DIR=" + str(BUILD), *dict.fromkeys(targets)]
            if not run("Kompilieren", command, None, show_output=True):
                return 1
    commands = [(n, n, [binary(n + "-tests")]) for n in natives]
    commands.append(("interface", "interface", [sys.executable, "-B", "tests/build_check.py"]))
    commands += [(n, " ".join([n, *(a.lstrip("-") for a in part)]), ["node", f"tests/{n}.js", *part])
                 for n, parts in JAVASCRIPT.items() for part in parts]
    if selected:
        commands = [command for command in commands if command[0] in selected]
    started = time.monotonic()
    jobs = max(1, min(4, int(os.environ.get("TEST_JOBS") or available_jobs())))
    with ThreadPoolExecutor(max_workers=jobs) as executor:
        futures = [executor.submit(run, label, command, args.timeout) for _, label, command in commands]
        results = [f.result() for f in as_completed(futures)]
    failures = results.count(False)
    print(f"{len(results) - failures}/{len(results)} Prüfungen bestanden; "
          f"{time.monotonic() - started:.2f} s ohne Kompilierung.")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())

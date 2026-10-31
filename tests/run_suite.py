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
from suite import ROOT, BUILD, CORE, NATIVE, PYTHON, JAVASCRIPT, binary
from build_config import available_jobs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compile-only", action="store_true")
    parser.add_argument("--core", action="store_true", help="Checks also run by build.sh")
    parser.add_argument("--no-build", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--opencl", action="store_true", help="Include device-dependent OpenCL checks")
    parser.add_argument("--only", nargs="+", choices=NATIVE + PYTHON + JAVASCRIPT + ["interface", "opencl"],
                        help="Run only named checks, e.g. --only feeding population_check")
    parser.add_argument("--timeout", type=float, default=30, help="Seconds per check (default: 30)")
    parser.add_argument("--build-timeout", type=float, help="Optional build time limit")
    args = parser.parse_args()
    if any(v is not None and (not math.isfinite(v) or v <= 0)
           for v in (args.timeout, args.build_timeout)):
        parser.error("Zeitgrenzen müssen positiv sein")
    if args.no_build and args.compile_only:
        parser.error("--compile-only benötigt den Build")
    if args.core and args.only:
        parser.error("--core oder --only wählen")
    if not args.compile_only and (not args.only or set(args.only) - set(NATIVE + ["opencl"])):
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
            # A failed check must not leave a simulator or HTTP server running.
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
    natives = list(CORE if args.core else NATIVE)
    if selected:
        natives = [n for n in NATIVE + ["opencl"] if n in selected]
        for check, dependency in (("render_check", "render_wire"), ("transport_check", "state")):
            if check in selected and dependency not in natives:
                natives.append(dependency)
    if args.opencl and "opencl" not in natives:
        natives.append("opencl")
    if not args.no_build:
        command = ["make", "-s", "-j" + (os.environ.get("BUILD_JOBS") or str(available_jobs())),
                   "BUILD_DIR=" + str(BUILD), binary(), *(binary(n + "-tests") for n in natives)]
        if not run("Kompilieren", command, args.build_timeout, show_output=True):
            return 1
    if args.compile_only:
        return 0
    # render_check runs render_wire once while creating its cross-language fixtures.
    commands = [(n, [binary(n + "-tests")]) for n in natives if n != "render_wire"]
    commands.append(("interface", [sys.executable, "-B", "tests/build_check.py"]))
    if not args.core:
        commands += [(n, [sys.executable, "-B", "tests/" + n + ".py"]) for n in PYTHON]
        commands += [(n, ["node", "tests/" + n + ".js"]) for n in JAVASCRIPT]
    else:
        commands += [(n, [sys.executable, "-B", "tests/" + n + ".py"])
                     for n in ("population_check", "profile_delta")]
        commands.append(("report", ["node", "tests/report.js"]))
    if selected:
        commands = [(name, command) for name, command in commands if name in selected]
        if "render_wire" in selected:
            commands.append(("render_wire", [binary("render_wire-tests")]))
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

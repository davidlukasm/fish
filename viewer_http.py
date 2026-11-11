import json
import hashlib
import secrets
import socket
import socketserver
import time
from viewer_paths import ROOT, command_path
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from viewer_commands import CommandRouter, MAX_ID
from atelier_service import run as run_atelier, CompileJobs
from labor_service import BreedingJobs, TrialJobs
from wording import Refusal, worded, wording
from protocol_schema import GenomeImport, Route

COMMAND_LIMIT, REPORT_LIMIT = 2000000, 32768
# Atelier requests and genome imports carry an escaped genome beside a plan or a command.
GENOME_REQUEST_LIMIT = 2 * GenomeImport.MAX_BYTES + COMMAND_LIMIT
EXPORT_WAIT_S, EXPORT_POLL_S = 3, 0.01
RELAY_TIMEOUT_S, RELAY_CHUNK, RELAY_ANSWER_CHUNK = 120, 1 << 16, 1 << 20


def request_limit(path):
    return (REPORT_LIMIT if path == Route.FPS_REPORT else
            GENOME_REQUEST_LIMIT if path in (Route.ATELIER, Route.COMMAND) else COMMAND_LIMIT)


class Handler(BaseHTTPRequestHandler):

    def log_message(self, *_):
        pass

    def send(self, code, data, kind="application/json", etag=None):
        payload = (
            data
            if isinstance(data, bytes)
            else json.dumps(data, allow_nan=False, separators=(",", ":")).encode()
        )
        self.send_response(code)
        self.send_header(
            "Content-Type",
            kind if kind == "application/octet-stream" else kind + "; charset=utf-8",
        )
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-cache" if etag else "no-store")
        if etag:
            self.send_header("ETag", etag)
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def allowed_request(self):
        port = self.server.server_port
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"}
        if self.headers.get("Host", "") not in hosts:
            self.send(HTTPStatus.FORBIDDEN, {"error": wording("invalidHost")})
            return False
        origin = self.headers.get("Origin")
        if origin and origin not in {"http://" + host for host in hosts}:
            self.send(HTTPStatus.FORBIDDEN, {"error": wording("invalidOrigin")})
            return False
        return True

    def do_GET(self):
        if not self.allowed_request():
            return
        parsed = urlparse(self.path)
        if parsed.path == Route.PAGE:
            self.send(HTTPStatus.OK, self.server.page, "text/html")
        elif parsed.path in self.server.static_assets:
            payload, kind, etag = self.server.static_assets[parsed.path]
            self.send(
                HTTPStatus.NOT_MODIFIED if self.headers.get("If-None-Match") == etag else HTTPStatus.OK,
                b"" if self.headers.get("If-None-Match") == etag else payload,
                kind,
                etag=etag,
            )
        elif parsed.path == Route.GENOME:
            try:
                identifier = int(parse_qs(parsed.query).get("id", ["0"])[0])
                assert 0 < identifier < MAX_ID
                destination = (
                    self.server.simulation.history.session
                    / "spool"
                    / f"export-{identifier}-{secrets.token_hex(4)}.genome"
                )
                self.server.simulation.command(
                    f"export-genome {identifier} {command_path(destination)}"
                )
                deadline = time.monotonic() + EXPORT_WAIT_S
                while not destination.exists() and time.monotonic() < deadline:
                    time.sleep(EXPORT_POLL_S)
                if not destination.exists():
                    raise Refusal("animalGone")
                self.send(HTTPStatus.OK, destination.read_bytes(), "application/octet-stream")
                destination.unlink()
            except (ValueError, AssertionError, OSError) as error:
                self.send(HTTPStatus.BAD_REQUEST, {"error": worded(error)})
        elif parsed.path == Route.JOURNAL:
            try:
                query = parse_qs(parsed.query)
                after, before = int(query.get("after", ["0"])[0]), int(
                    query.get("before", ["0"])[0]
                )
                if after < 0 or before < 0:
                    raise Refusal("invalidEventId")
                self.send(HTTPStatus.OK, self.server.simulation.journal_view(after, before))
            except (ValueError, OSError, KeyError) as error:
                self.send(HTTPStatus.BAD_REQUEST, {"error": worded(error)})
        elif parsed.path in (Route.POPULATION, Route.POPULATION_PREVIEW):
            try:
                catalog = self.server.simulation.population_catalog
                value = (catalog.entries() if parsed.path == Route.POPULATION
                         else catalog.preview(parse_qs(parsed.query).get("id", [""])[0]))
                self.send(HTTPStatus.OK, value)
            except (ValueError, OSError) as error:
                self.send(HTTPStatus.BAD_REQUEST, {"error": worded(error)})
        elif parsed.path == Route.NAMES:
            names, favorites = self.server.simulation.fish_people()
            self.send(HTTPStatus.OK, {"fish": names, "favorites": favorites})
        elif parsed.path == Route.STATE:
            self.server.commands.lapse_view_tempo()
            query = parse_qs(parsed.query)
            read = (
                self.server.simulation.state_wire
                if query.get("wire") == ["1"]
                else self.server.simulation.state
            )
            self.send(HTTPStatus.OK,
                (
                    read(
                        query.get("brain", [None])[0],
                        query.get("after", [None])[0],
                        query.get("assets", [None])[0],
                        query.get("scene", [None])[0],
                        query.get("profile", [None])[0],
                        query.get("species", [None])[0],
                    )
                    if query.get("wire") == ["1"]
                    else read(
                        query.get("brain", [None])[0], query.get("after", [None])[0]
                    )
                ),
            )
        elif parsed.path == Route.HISTORY:
            try:
                with self.server.simulation.lock:
                    data = self.server.simulation.history.view(
                        parse_qs(parsed.query).get("session", [None])[0]
                    )
                self.send(HTTPStatus.OK, data)
            except (ValueError, OSError, KeyError) as error:
                self.send(HTTPStatus.BAD_REQUEST, {"error": worded(error)})
        else:
            self.send(HTTPStatus.NOT_FOUND, {"error": wording("notFound")})

    def do_POST(self):
        if not self.allowed_request():
            return
        if self.path not in (Route.COMMAND, Route.FPS_REPORT, Route.ATELIER, Route.LABOR,
                             Route.TRIALS) or (
            self.path == Route.FPS_REPORT and self.server.fps_report is None
        ):
            self.send(HTTPStatus.NOT_FOUND, {"error": wording("notFound")})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        limit = request_limit(self.path)
        # The body is read even for a refused request: answering while the client is still
        # sending would reset the connection instead of delivering the refusal.
        body = self.rfile.read(length) if 0 < length <= limit else b""
        if self.headers.get("X-Fish-Token") != self.server.token:
            self.send(HTTPStatus.FORBIDDEN, {"error": wording("invalidRequest")})
            return
        try:
            if not 0 < length <= limit:
                raise Refusal("invalidRequest")
            data = json.loads(body)
            if not isinstance(data, dict):
                raise Refusal("invalidRequest")
            if self.path == Route.FPS_REPORT:
                self.server.fps_report.append(data, self.server.simulation)
                self.send(HTTPStatus.OK, {"ok": True})
                return
            if self.path == Route.ATELIER:
                directory = self.server.simulation.args.data_dir
                result = (self.server.compiler_jobs.request(data, directory)
                          if data.get("operation") in ("build-start", "build-status", "build-cancel")
                          else run_atelier(data, directory))
                self.send(HTTPStatus.OK, {"ok": True, "result": result})
                return
            if self.path in (Route.LABOR, Route.TRIALS):
                station = self.server.breeding if self.path == Route.LABOR else self.server.trials
                result = station.request(data, self.server.simulation.args.data_dir)
                self.send(HTTPStatus.OK, {"ok": True, "result": result})
                return
            message = self.server.commands.dispatch(data)
            self.send(HTTPStatus.OK, {"ok": True, "message": message})
        except (ValueError, KeyError, TypeError, OSError) as error:
            self.send(HTTPStatus.BAD_REQUEST, {"error": worded(error)})


class FrontHandler(Handler):

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != Route.SCENE:
            self.relay()
            return
        if not self.allowed_request():
            return
        try:
            query = parse_qs(parsed.query)
            viewport = [
                float(query[name][0]) for name in ("x", "y", "width", "height", "scale")
            ]
            payload = self.server.scenes.render(
                int(query.get("base", ["0"])[0]),
                viewport,
                query.get("brain", [""])[0],
                query.get("inspection", [""])[0],
                int(query.get("focus", ["-1"])[0]),
            )
            self.send(HTTPStatus.OK, payload, "application/octet-stream")
        except (ValueError, KeyError, OSError) as error:
            self.send(HTTPStatus.BAD_REQUEST, {"error": worded(error)})

    def do_POST(self):
        self.relay()

    def relay(self):
        # Host, Origin and token are checked by the statistics process on the forwarded headers.
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 <= length <= request_limit(self.path):
                raise ValueError
        except ValueError:
            self.send(HTTPStatus.BAD_REQUEST, {"error": wording("invalidRequest")})
            return
        head = self.requestline + "\r\n"
        head += "".join(f"{key}: {value}\r\n" for key, value in self.headers.items())
        worker = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            worker.settimeout(RELAY_TIMEOUT_S)
            worker.connect(self.server.worker_path)
        except OSError:
            worker.close()
            self.send(HTTPStatus.SERVICE_UNAVAILABLE, {"error": wording("statisticsUnavailable")})
            return
        try:
            with worker:
                worker.sendall(head.encode("latin-1") + b"\r\n")
                while length:
                    part = self.rfile.read(min(length, RELAY_CHUNK))
                    if not part:
                        break
                    worker.sendall(part)
                    length -= len(part)
                while part := worker.recv(RELAY_ANSWER_CHUNK):
                    self.wfile.write(part)
        except OSError:
            pass


class FrontServer(ThreadingHTTPServer):
    def __init__(self, address, scenes, worker_path):
        super().__init__(address, FrontHandler)
        self.scenes = scenes
        self.worker_path = worker_path


class WorkerServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):

    daemon_threads = True

    def __init__(self, path, port, simulation, token, page, defaults):
        super().__init__(path, Handler)
        # Host and Origin refer to the public port of the front process.
        self.server_port = port
        self.static_assets = {}
        kinds = {
            ".js": "application/javascript",
            ".css": "text/css",
            ".json": "application/json; charset=utf-8",
        }
        for source in sorted((ROOT / "ui").rglob("*")):
            relative = source.relative_to(ROOT / "ui")
            key = Route.ASSETS + relative.as_posix()
            if source.is_file() and (
                (not key.startswith(Route.TEXTS) and source.suffix in (".js", ".css"))
                or (key.startswith(Route.TEXTS) and source.suffix == ".json")
            ):
                payload = source.read_bytes()
                kind = kinds[source.suffix]
                self.static_assets[key] = (
                    payload,
                    kind,
                    '"' + hashlib.sha256(payload).hexdigest() + '"',
                )
        self.simulation = simulation
        self.token = token
        self.page = page
        self.fps_report = None
        self.commands = CommandRouter(simulation, defaults)
        self.compiler_jobs = CompileJobs()
        self.breeding = BreedingJobs(simulation.starter_genomes)
        self.trials = TrialJobs(simulation.starter_genomes)

    def server_close(self):
        if hasattr(self, "compiler_jobs"):
            self.compiler_jobs.close()
        for station in ("breeding", "trials"):
            if hasattr(self, station):
                getattr(self, station).close()
        super().server_close()

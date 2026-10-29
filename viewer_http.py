"""Local HTTP routes; simulation commands live in viewer_commands."""

import json
import hashlib
import secrets
import time
from viewer_paths import ROOT, command_path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from viewer_commands import CommandRouter


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
            self.send(403, {"error": "Ungültiger Host"})
            return False
        origin = self.headers.get("Origin")
        if origin and origin not in {"http://" + host for host in hosts}:
            self.send(403, {"error": "Ungültiger Ursprung"})
            return False
        return True

    def do_GET(self):
        if not self.allowed_request():
            return
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.send(200, self.server.page, "text/html")
        elif parsed.path in self.server.static_assets:
            payload, kind, etag = self.server.static_assets[parsed.path]
            self.send(
                304 if self.headers.get("If-None-Match") == etag else 200,
                b"" if self.headers.get("If-None-Match") == etag else payload,
                kind,
                etag=etag,
            )
        elif parsed.path == "/genome":
            try:
                identifier = int(parse_qs(parsed.query).get("id", ["0"])[0])
                assert 0 < identifier < 1000000000
                destination = (
                    self.server.simulation.history.session
                    / "spool"
                    / f"export-{identifier}-{secrets.token_hex(4)}.genome"
                )
                self.server.simulation.command(
                    f"export-genome {identifier} {command_path(destination)}"
                )
                deadline = time.monotonic() + 3
                while not destination.exists() and time.monotonic() < deadline:
                    time.sleep(0.01)
                if not destination.exists():
                    raise ValueError("Tier nicht mehr vorhanden")
                self.send(200, destination.read_bytes(), "application/octet-stream")
                destination.unlink()
            except (ValueError, AssertionError, OSError) as error:
                self.send(400, {"error": str(error)})
        elif parsed.path == "/journal":
            try:
                query = parse_qs(parsed.query)
                after, before = int(query.get("after", ["0"])[0]), int(
                    query.get("before", ["0"])[0]
                )
                if after < 0 or before < 0:
                    raise ValueError("Ungültige Ereigniskennung")
                self.send(200, self.server.simulation.journal_view(after, before))
            except (ValueError, OSError, KeyError) as error:
                self.send(400, {"error": str(error)})
        elif parsed.path == "/archive-genome":
            try:
                with self.server.simulation.lock:
                    path = self.server.simulation.journal.resolve(
                        parse_qs(parsed.query).get("id", [""])[0]
                    )
                    content = path.read_bytes()
                self.send(200, content, "application/octet-stream")
            except (ValueError, OSError) as error:
                self.send(400, {"error": str(error)})
        elif parsed.path in ("/population", "/population-preview"):
            try:
                catalog = self.server.simulation.population_catalog
                value = (catalog.entries() if parsed.path == "/population"
                         else catalog.preview(parse_qs(parsed.query).get("id", [""])[0]))
                self.send(200, value)
            except (ValueError, OSError) as error:
                self.send(400, {"error": str(error)})
        elif parsed.path == "/founders":
            self.send(200, self.server.simulation.founders.state())
        elif parsed.path == "/scene":
            try:
                query = parse_qs(parsed.query)
                viewport = [
                    float(query[name][0])
                    for name in ("x", "y", "width", "height", "scale")
                ]
                payload = self.server.simulation.render(
                    int(query.get("base", ["0"])[0]),
                    viewport,
                    query.get("brain", [""])[0],
                    query.get("inspection", [""])[0],
                    int(query.get("focus", ["-1"])[0]),
                )
                self.send(200, payload, "application/octet-stream")
            except (ValueError, KeyError, OSError) as error:
                self.send(400, {"error": str(error)})
        elif parsed.path == "/state":
            query = parse_qs(parsed.query)
            read = (
                self.server.simulation.state_wire
                if query.get("wire") == ["1"]
                else self.server.simulation.state
            )
            self.send(
                200,
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
        elif parsed.path == "/history":
            try:
                with self.server.simulation.lock:
                    data = self.server.simulation.history.view(
                        parse_qs(parsed.query).get("session", [None])[0]
                    )
                self.send(200, data)
            except (ValueError, OSError, KeyError) as error:
                self.send(400, {"error": str(error)})
        else:
            self.send(404, {"error": "Nicht gefunden"})

    def do_POST(self):
        if not self.allowed_request():
            return
        if self.path not in ("/command", "/fps-report") or (
            self.path == "/fps-report" and self.server.fps_report is None
        ):
            self.send(404, {"error": "Nicht gefunden"})
            return
        if self.headers.get("X-Fish-Token") != self.server.token:
            self.send(403, {"error": "Ungueltige Anfrage"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= (32768 if self.path == "/fps-report" else 2000000):
                raise ValueError("Ungueltige Anfrage")
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("Ungueltige Anfrage")
            if self.path == "/fps-report":
                self.server.fps_report.append(data, self.server.simulation)
                self.send(200, {"ok": True})
                return
            message = self.server.commands.dispatch(data)
            self.send(200, {"ok": True, "message": message})
        except (ValueError, KeyError, TypeError, OSError) as error:
            self.send(400, {"error": str(error)})


class ViewerServer(ThreadingHTTPServer):
    def __init__(self, address, simulation, token, page, defaults):
        super().__init__(address, Handler)
        self.static_assets = {}
        for source in (ROOT / "ui").iterdir():
            if source.is_file() and source.suffix in (".js", ".css"):
                payload = source.read_bytes()
                kind = (
                    "text/css" if source.suffix == ".css" else "application/javascript"
                )
                self.static_assets["/ui/" + source.name] = (
                    payload,
                    kind,
                    '"' + hashlib.sha256(payload).hexdigest() + '"',
                )
        self.simulation = simulation
        self.token = token
        self.page = page
        self.fps_report = None
        self.commands = CommandRouter(simulation, defaults)

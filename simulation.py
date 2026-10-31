"""Simulation process, acknowledged commands and observation lifecycle."""

from frame_store import FrameStore
from protocol_schema import Fish
import json
import subprocess
import os
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from viewer_paths import ROOT, command_path, engine_path
from history import History
from journal import Journal
from species_traits import individual_profile
from population_catalog import PopulationCatalog
from frame_assets import BRAIN_LAYOUT_FIELDS, SPECIES_PROFILE_FIELDS
from wording import worded, wording

UNCHANGED_OBSERVATION = object()


class Simulation:

    @property
    def latest(self):
        return self.frames.latest

    def __init__(self, args):
        self.args = args
        self.lock = threading.RLock()
        self.lifecycle = threading.RLock()
        # The command channel never takes the archive/statistics lock.
        self.transport_lock = threading.RLock()
        self.events = ThreadPoolExecutor(max_workers=1, thread_name_prefix="fish-archive")
        self.process = None
        self.pending = {}
        self.request_id = 0
        self.starting = False
        self.logs = deque(maxlen=20)
        self.reader = None
        self.reset_frames()
        self.history = History(args.data_dir / "history")
        self.journal = Journal(args.data_dir / "genome-archive-v2")
        self.output = args.data_dir / "best.genome"
        self.observed_name = None
        self.observed_context = None
        self.egg_source = None
        self.initial_energy = {}
        self.offer_population = None
        self.initial_genomes = []
        self.population_catalog = PopulationCatalog(self)

    def reset_frames(self):
        self.frames = FrameStore()
        self.view_resync_pending = False
        self.pending_observation = None

    def accept_frame(self, frame, wire, patch=None):
        self.frames.accept(frame, wire, patch)
        self.apply_observation()

    def apply_observation(self):
        request = getattr(self, "pending_observation", None)
        if request is not None and self.frames.latest and self.frames.latest.get(
            "command_request", 0
        ) >= request.get("identifier", 0):
            self.observed_context = request["observation"]
            self.observed_name = (request["observation"] or {}).get("name")
            self.pending_observation = None
            request["observation_applied"] = True
            request["frame_ready"].set()

    def start(self, resume=True):
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                raise ValueError("Simulation laeuft bereits")
            if self.process is not None and self.process.stdin:
                self.process.stdin.close()
            options = {
                name: getattr(self.args, name)
                for name in (
                    "fish",
                    "food",
                    "threads",
                    "seed",
                    "max_neurons",
                    "max_connections",
                    "neural_budget",
                    "empty_world",
                )
            }
            options["energy"] = self.initial_energy.copy()
            checkpoint = self.history.begin(options, resume=resume)
            if self.offer_population is None:
                self.offer_population = not checkpoint and not self.args.input
            if checkpoint:
                options = self.history.meta["options"]
                for name, value in options.items():
                    if name == "energy":
                        self.initial_energy = value
                    elif name != "threads":
                        setattr(self.args, name, value)
            source = (
                ROOT / self.args.input
                if self.args.input
                else ROOT / "genomes/cppn-start.genome"
            )
            command = [
                str(engine_path()),
                "--output",
                str(self.output),
                "--interactive",
                "--render-stream",
                "--session",
                str(self.history.session),
            ]
            command.extend(["--compute", self.args.compute])
            # Images bypass this process: the engine answers the front's /scene directly.
            if getattr(self.args, "render_socket", None):
                command.extend(["--render-socket", self.args.render_socket])
            if self.args.input:
                command.extend(["--input", str(source)])
            for name, flag in [
                ("fish", "fish"),
                ("food", "food"),
                ("threads", "threads"),
                ("seed", "seed"),
                ("max_neurons", "max-neurons"),
                ("max_connections", "max-connections"),
                ("neural_budget", "neural-budget"),
            ]:
                command.extend(["--" + flag, str(getattr(self.args, name))])
            for parameter in self.args.param:
                command.extend(["--param", parameter])
            if not checkpoint:
                for name, value in self.initial_energy.items():
                    command.extend(["--param", f"{name}={value}"])
            if (not checkpoint and not self.initial_genomes and not self.args.input
                    and not self.offer_population):
                self.initial_genomes = [path.read_bytes() for path in self.example_genomes()]
            if not checkpoint:
                for index, content in enumerate(self.initial_genomes):
                    path = self.history.session / f"start-{index}.genome"
                    path.write_bytes(content)
                    command.extend(["--start-genome", str(path)])
            if not checkpoint and self.offer_population and not self.initial_genomes and not self.args.input:
                command.append("--choose-population")
            if self.args.empty_world:
                command.append("--empty-world")
            if checkpoint:
                command.extend(["--resume-state", checkpoint])
            self.journal.begin(self.history.session)
            self.reset_frames()
            self.logs.clear()
            self.observed_name = None
            self.observed_context = None
            self.egg_source = None
            self.starting = True
            metadata_read, metadata_write = os.pipe()
            command.extend(["--metadata-fd", str(metadata_write)])
            try:
                self.process = subprocess.Popen(
                    command,
                    cwd=ROOT,
                    bufsize=-1,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    pass_fds=(metadata_write,),
                )
            except BaseException:
                os.close(metadata_read)
                raise
            finally:
                os.close(metadata_write)
            process = self.process
            metadata = os.fdopen(metadata_read, "rb")
            self.metadata_reader = threading.Thread(
                target=self.read_frames, args=(process, metadata), daemon=True
            )
            self.metadata_reader.start()
            self.reader = threading.Thread(
                target=self.read_frames, args=(process,), daemon=True
            )
            self.reader.start()
            threading.Thread(
                target=self.read_logs, args=(process,), daemon=True
            ).start()
            self.curator = threading.Thread(target=self.curate, args=(process,), daemon=True)
            self.curator.start()

    def acknowledge(self, frame):
        with self.transport_lock:
            request = self.pending.get(frame["request"])
            if request is None:
                return
            if request.get("command") == "bookmark" and frame["ok"]:
                if not request.get("bookmark_done"):
                    request["acknowledgement"] = frame
                    return
                if not request.get("bookmark_saved"):
                    frame = {
                        **frame,
                        "ok": False,
                        "message": request.get(
                            "save_error", "Weltzustand konnte nicht registriert werden."
                        ),
                    }
            request["result"] = frame
            request["ready"].set()

    def record_event(self, process, frame):
        # Serial persistence preserves event order, but cannot hold up stdout.
        bookmark = frame.get("event") == "bookmark"
        error = None
        try:
            with self.lock:
                if self.process is not process:
                    return
                if frame.get("event") == "command":
                    with self.transport_lock:
                        request = self.pending.get(frame["request"])
                    if request and frame["ok"] and "observation" in request:
                        self.pending_observation = request
                        self.apply_observation()
                    self.acknowledge(frame)
                elif frame.get("event") == "genome-candidate":
                    self.journal.accept(frame)
                elif frame.get("event") == "startup":
                    self.frames.startup = frame
                elif "event" in frame:
                    self.history.record(frame, self.bookmark_journal() if bookmark else None)
                else:
                    self.accept_frame(frame, None)
        except (ValueError, OSError, KeyError, TypeError, IndexError) as caught:
            error = str(caught)
            detail = f"Verlauf speichern ({type(caught).__name__}): {caught}"
            self.logs.append(detail)
            print("Fish: " + detail, flush=True)
        finally:
            if bookmark:
                with self.transport_lock:
                    request = self.pending.get(frame.get("request"))
                    if request:
                        request["bookmark_done"] = True
                        request["bookmark_saved"] = error is None
                        if error is not None:
                            request["save_error"] = error
                        acknowledgement = request.pop("acknowledgement", None)
                        if acknowledgement:
                            self.acknowledge(acknowledgement)

    def finish_output(self, process):
        with self.transport_lock:
            if self.process is process:
                self.starting = False
                for request in self.pending.values():
                    request["ready"].set()
                    request["frame_ready"].set()

    def read_frames(self, process, metadata=None):
        stream = metadata if metadata is not None else process.stdout
        while True:
            line = stream.readline()
            if not line:
                break
            phase = "Prozessausgabe lesen"
            try:
                frame = json.loads(line)
                if frame.get("event") == "view":
                    phase = "Darstellungsdaten lesen"
                    with self.lock:
                        if self.process is not process:
                            continue
                        previous = self.frames
                    prepared = previous.prepare_message(frame)
                    with self.lock:
                        if self.process is process and self.frames is previous:
                            prepared.inherit_profile_cache(previous)
                            self.frames = prepared
                            self.apply_observation()
                            self.view_resync_pending = False
                    continue
                with self.transport_lock:
                    if self.process is not process:
                        continue
                    request = self.pending.get(frame.get("request"))
                    if frame.get("event") == "command" and not (
                        request and "observation" in request
                    ):
                        self.acknowledge(frame)
                    else:
                        self.events.submit(self.record_event, process, frame)
            except (ValueError, OSError, KeyError, TypeError, IndexError) as error:
                with self.transport_lock:
                    detail = f"{phase} ({type(error).__name__}): {error}"
                    self.logs.append(detail)
                    if (
                        self.process is process
                        and not self.view_resync_pending
                        and process.poll() is None
                    ):
                        self.view_resync_pending = True
                        try:
                            process.stdin.write(b"view-reset\n")
                            process.stdin.flush()
                        except (OSError, BrokenPipeError):
                            pass
                print("Fish: " + detail, flush=True)
        stream.close()
        if metadata is None:
            # A bookmark queued before EOF must still report its persistence result.
            self.events.submit(self.finish_output, process)

    def curate(self, process):
        while process.poll() is None:
            time.sleep(0.5)
            with self.lock:
                if self.process is not process:
                    return
                frame = self.frames.latest
                if not frame or frame.get("historical"):
                    continue
                tasks = self.journal.observe(frame)
                session = self.history.session
                generation = self.journal.generation
            for task in tasks:
                kind, key, p, s, value = task
                with self.lock:
                    if (
                        self.process is not process
                        or self.journal.generation != generation
                    ):
                        return
                    if self.frames.latest and self.frames.latest.get("historical"):
                        break
                    existing = next(
                        (
                            e
                            for group in self.journal.catalog.values()
                            for e in group.values()
                            if e["session"] == session.name
                            and e["fish_id"] == p[Fish.ID]
                        ),
                        None,
                    )
                    content = (
                        (self.journal.root / (existing["id"] + ".genome")).read_bytes()
                        if existing
                        else None
                    )
                path = session / "spool" / ("curate-" + str(p[Fish.ID]) + ".genome")
                try:
                    if content is None:
                        self.command(f"export-genome {p[Fish.ID]} {command_path(path)}")
                        content = path.read_bytes()
                    with self.lock:
                        if (
                            self.process is process
                            and self.journal.generation == generation
                        ):
                            self.journal.commit(task, content)
                except (ValueError, OSError):
                    pass
                finally:
                    path.unlink(missing_ok=True)

    def bookmark_journal(self):
        if (self.frames.latest or {}).get("historical"):
            return (self.observed_context or {}).get("journal", {})
        return self.journal.snapshot()

    def read_logs(self, process):
        for line in process.stderr:
            with self.lock:
                if self.process is process:
                    message = line.decode("utf-8", "replace").rstrip()
                    self.logs.append(message)
                    print("Fish: " + message, flush=True)
        process.stderr.close()

    def command(self, command, observation=UNCHANGED_OBSERVATION):
        request = {
            "ready": threading.Event(),
            "frame_ready": threading.Event(),
            "result": None,
            "command": command,
        }
        if observation is UNCHANGED_OBSERVATION and command in (
            "current",
            "evolution 1",
        ):
            observation = None
        if observation is not UNCHANGED_OBSERVATION:
            request["observation"] = observation
        with self.transport_lock:
            if self.process is None or self.process.poll() is not None:
                raise ValueError(
                    "Simulation ist beendet. Einen neuen Lauf starten oder den Stand fortsetzen."
                )
            self.request_id += 1
            identifier = self.request_id
            request["identifier"] = identifier
            self.pending[identifier] = request
            try:
                self.process.stdin.write(f"request {identifier} {command}\n".encode())
                self.process.stdin.flush()
            except (BrokenPipeError, OSError):
                self.pending.pop(identifier, None)
                raise ValueError("Simulation ist beendet") from None
        try:
            if not request["ready"].wait(15):
                raise ValueError(
                    "Die Simulation hat den Eingriff noch nicht bestätigt. Bitte ihren Status prüfen."
                )
            result = request["result"]
            if result is None:
                raise ValueError("Simulation wurde während des Eingriffs beendet.")
            if not result["ok"]:
                raise ValueError(result.get("message") or "Eingriff abgewiesen")
            if "observation" in request:
                if not request["frame_ready"].wait(15) or not request.get(
                    "observation_applied"
                ):
                    raise ValueError(
                        "Das Bild der geladenen Welt wurde noch nicht bestätigt."
                    )
            return result.get("message", "")
        finally:
            with self.transport_lock:
                self.pending.pop(identifier, None)

    def observe(self, session, identifier):
        with self.lifecycle:
            with self.lock:
                path, entry = self.history.materialize_state(session, identifier)
                context = self.history.observation(session, entry)
                context["name"] = entry["name"]
            try:
                return self.command(
                    f"load-state {command_path(path)}", observation=context
                )
            finally:
                path.unlink(missing_ok=True)

    def restart(self):
        with self.lifecycle:
            with self.lock:
                previous = self.frames.latest or {}
            self.close()
            self.start(resume=True)
            if previous.get("paused"):
                self.command("pause")
            self.command("delay " + str(previous.get("delay_ms", 30)))
            if previous.get("brain_detail"):
                self.command("brain 1")
            if previous.get("brain_mode"):
                self.command("brain-mode 1")
        return "Gespeicherter Weltzustand wird fortgesetzt."

    def selected_profile(self):
        frame = self.frames.latest
        if not frame:
            return None
        selected = frame.get("selected")
        fish = next((p for p in frame.get("fish", []) if p[Fish.ID] == selected), None)
        traits = next((t for t in frame.get("traits", []) if t["id"] == selected), None)
        behavior = next(
            (b for b in frame.get("behavior", []) if b["id"] == selected), None
        )
        body = frame.get("selected_body")
        sources = (
            (
                selected,
                fish[Fish.OFFSPRING] if fish else None,
                fish[Fish.HATCHED] if fish else None,
            ),
            traits,
            behavior,
            body,
        )
        old = self.frames.profile_sources
        if (
            old is None
            or old[0] != sources[0]
            or any((a is not b for a, b in zip(old[1:], sources[1:])))
        ):
            self.frames.profile_sources = sources
            profile = individual_profile(frame)
            if old is None or profile != self.frames.profile_value:
                self.frames.profile_value = profile
                self.frames.profile_version = self.frames.profile_version + 1
        return self.frames.profile_value

    def state_metadata(self, after=None):
        frame = self.frames.latest
        exit_code = None if self.process is None else self.process.poll()
        version = (
            str(frame.get("render_epoch"))
            + ":"
            + str(frame.get("revision"))
            + ":"
            + str(self.journal.total_events)
            + ":"
            + str(exit_code)
            + ":"
            + self.observation_key()
            if frame
            else ""
        )
        data = {
            "frame_version": version,
            "offer_population": self.offer_population,
            "session": self.history.meta["id"],
            "exit_code": exit_code,
            "logs": list(self.logs),
            "observation": self.observation_metadata(),
        }
        if after and after == version:
            return {**data, "unchanged": True}
        return {
            **data,
            "individual_profile": self.selected_profile(),
            "observed_name": self.observed_name,
            "current_name": (
                self.history.points[-1]["name"] if self.history.points else None
            ),
            "options": {
                key: getattr(self.args, key)
                for key in (
                    "fish",
                    "seed",
                    "fresh",
                    "max_neurons",
                    "max_connections",
                    "neural_budget",
                    "empty_world",
                )
            },
            "starting": self.starting,
            "startup": self.frames.startup,
        }

    def observation_key(self):
        context = getattr(self, "observed_context", None)
        if self.frames.latest and self.frames.latest.get("historical"):
            return context["key"] if context else "historical"
        return "live"

    def observation_metadata(self):
        context = getattr(self, "observed_context", None)
        return (
            {key: context[key] for key in ("key", "session", "step")}
            if context and self.observation_key() != "live"
            else {"key": self.observation_key()}
        )

    def journal_view(self, after=0, before=0):
        with self.lock:
            context = getattr(self, "observed_context", None) or {}
            if self.frames.latest and self.frames.latest.get("historical"):
                data = dict(context.get("journal", {}))
                events = data.get("events", [])
                data["events"] = [
                    e
                    for e in events
                    if e["id"] > after and (not before or e["id"] < before)
                ]
                data["events"] = (
                    data["events"][:500]
                    if after and not before
                    else data["events"][-500:]
                )
                data.setdefault("ancestry", [])
                data.setdefault("species_ancestry", [])
                data.setdefault("total_events", len(events))
                data["archive"] = []
                data["autosaves"] = []
            else:
                data = self.journal.view()
                data["events"] = self.journal.event_page(after, before)
                data["autosaves"] = [
                    {
                        "id": name,
                        "name": (
                            "Letzter automatischer Stand"
                            if name == "latest"
                            else "Voriger automatischer Stand"
                        ),
                        "saved": (self.history.session / (name + ".state"))
                        .stat()
                        .st_mtime,
                    }
                    for name in ("latest", "previous")
                    if (self.history.session / (name + ".state")).exists()
                ]
            # Profiles use the versioned statistics channel. Snapshots retain them,
            # but the journal UI consumes only events, ancestry, traces and records.
            data.pop("profiles", None)
            return {
                **data,
                "session": self.history.meta["id"],
                "observation": self.observation_key(),
            }

    def species_profiles(self):
        profiles = {}
        for s in self.frames.latest.get("species", []):
            historical = self.frames.latest.get("historical")
            context = getattr(self, "observed_context", None) or {}
            saved_profiles = context.get("journal", {}).get("profiles", [])
            observed = (
                next((p for p in saved_profiles if p.get("id") == s["id"]), {})
                if historical
                else self.journal.species.get(s["id"], {})
            )
            profiles[s["id"]] = {
                key: observed.get(key, s.get(key))
                for key in SPECIES_PROFILE_FIELDS
                if key in observed or key in s
            }
        return profiles

    def species_profile_delta(self, since=None):
        epoch = str(self.frames.latest.get("render_epoch")) + ":" + self.observation_key()
        cache = getattr(self, "species_transport", None)
        if cache is None or cache["epoch"] != epoch:
            cache = self.species_transport = {"epoch": epoch, "serial": 0, "profiles": {}, "versions": {}, "history": {}}
        profiles = self.species_profiles()
        if cache["profiles"].keys() - profiles.keys():
            cache["serial"] += 1
        for key, value in profiles.items():
            if cache["profiles"].get(key) != value:
                cache["serial"] += 1
                cache["versions"][key] = cache["serial"]
        cache["profiles"] = profiles
        cache["versions"] = {key: cache["versions"][key] for key in profiles}
        key = epoch + ":" + str(cache["serial"])
        previous = cache["history"].get(since, {})
        changed = {sid: value for sid, value in profiles.items()
                   if previous.get(sid) != cache["versions"][sid]}
        cache["history"][key] = dict(cache["versions"])
        while len(cache["history"]) > 16:
            del cache["history"][next(iter(cache["history"]))]
        return {"species_key": key, "species_profiles": changed,
                "species_profile_ids": list(profiles)}

    def fish_names(self):
        """Names the user gave to individual fish (kept beside the run data)."""
        path = self.args.data_dir / "names.json"
        try:
            names = json.loads(path.read_text(encoding="utf-8"))
            return {str(k): str(v) for k, v in names.get("fish", {}).items()}
        except (OSError, ValueError, AttributeError):
            return {}

    def rename_fish(self, identifier, name):
        """Names a fish or takes its name back. The engine remembers a named fish, so it can
        be revived after its death; without a name it is forgotten. The engine is told
        first, so a name it could not take is not kept either."""
        # Keep the engine reminder and its name in one operation, including run changes.
        # The frame reader still needs self.lock while command() awaits its reply.
        with self.lifecycle:
            try:
                self.command(f"remember-fish {identifier} {int(bool(name))}")
            except ValueError as error:
                # A fish that had already died unremembered keeps its name in the history only.
                if worded(error) != wording("notFound"):
                    raise
            with self.lock:
                names = self.fish_names()
                if name:
                    names[str(identifier)] = name
                else:
                    names.pop(str(identifier), None)
                path = self.args.data_dir / "names.json"
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix(".tmp")
                temporary.write_text(json.dumps({"fish": names}, ensure_ascii=False), encoding="utf-8")
                temporary.replace(path)
            return wording("fishNamed" if name else "fishNameRemoved", id=identifier, name=name)

    def state(self, brain_key=None, after=None):
        with self.lock:
            data = self.state_metadata(after)
            if data.get("unchanged"):
                return data
            frame = self.frames.latest
            if frame:
                profiles = self.species_profiles()
                frame = {
                    **frame,
                    "species": [
                        {**s, **profiles[s["id"]]} for s in frame.get("species", [])
                    ],
                }
                if (
                    brain_key
                    and (frame.get("brain") or {}).get("layout_id") == brain_key
                ):
                    frame = {
                        **frame,
                        "brain": {
                            k: v
                            for k, v in frame["brain"].items()
                            if k not in BRAIN_LAYOUT_FIELDS
                        },
                    }
            return {**data, "frame": frame}

    def state_wire(self, brain_key=None, after=None, assets_key=None, scene_key=None, profile_key=None, species_key=None):
        data, frame = self._state_wire_snapshot(brain_key, after, assets_key, scene_key, profile_key, species_key)
        envelope = json.dumps(data, allow_nan=False, separators=(",", ":")).encode()
        if frame is None:
            return envelope
        if not isinstance(frame, bytes):
            frame = json.dumps(frame, allow_nan=False, separators=(",", ":")).encode()
        return b'{"frame":' + frame + b"," + envelope[1:]

    def _state_wire_snapshot(
        self,
        brain_key=None,
        after=None,
        assets_key=None,
        scene_key=None,
        profile_key=None,
        species_key=None,
    ):
        with self.lock:
            scene = self.frames.scene_history
            if not self.frames.latest or (
                not self.frames.latest_wire and (not (scene and scene.frame))
            ):
                return self.state(brain_key, after), None
            data = self.state_metadata(after)
            if data.get("unchanged"):
                return data, None
            data["profile_key"] = (
                str(self.frames.latest["render_epoch"])
                + ":"
                + str(self.frames.profile_version)
            )
            if profile_key == data["profile_key"]:
                data.pop("individual_profile", None)
            data.update(self.species_profile_delta(species_key))
            data["assets_key"] = (
                str(self.frames.assets_epoch) + ":" + str(self.frames.assets_version)
            )
            if assets_key != data["assets_key"]:
                try:
                    epoch, number = assets_key.rsplit(":", 1)
                    since = (
                        int(number) if epoch == str(self.frames.assets_epoch) else -1
                    )
                except (ValueError, AttributeError):
                    since = -1
                data["render_assets"] = {
                    key: value
                    for key, value in self.frames.render_assets.items()
                    if self.frames.render_asset_versions.get(key, 0) > since
                }
                data["asset_ids"] = list(self.frames.render_assets)
            brain = self.frames.latest.get("brain")
            if brain and brain.get("layout_id") != brain_key:
                data["brain_layout"] = {
                    key: brain[key] for key in BRAIN_LAYOUT_FIELDS if key in brain
                }
            if scene and scene.frame:
                data["scene_key"] = scene.key
                patches = scene.since(scene_key) if scene_key else None
                if patches is not None:
                    return {**data, "base_scene": scene_key, "frame_patches": patches}, None
                return data, self.frames.latest_wire or scene.frame
            return data, self.frames.latest_wire

    @staticmethod
    def example_genomes():
        """Shipped example classes start a run when nothing else is chosen; without v019
        examples the shipped random start body does."""
        return sorted((ROOT / "genomes/futtersammler").glob("*.genome")) or [
            ROOT / "genomes/cppn-start.genome"
        ]

    def close(self):
        with self.transport_lock:
            process = self.process
        if process is None:
            return
        if process.poll() is None:
            try:
                self.command("stop")
            except ValueError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        if process.stdin:
            process.stdin.close()
        if self.reader:
            self.reader.join()
        if getattr(self, "metadata_reader", None):
            self.metadata_reader.join()
        if getattr(self, "curator", None):
            self.curator.join()
        self.events.submit(lambda: None).result()

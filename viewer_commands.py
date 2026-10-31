"""Validated HTTP commands dispatched to focused handlers."""

import math
import re
import secrets
from viewer_paths import command_path
from wording import Refusal


class CommandRouter:
    handlers = {
        "population-ready": "handle_population_ready",
        "population-import": "handle_population_import",
        "favorite-fish": "handle_favorite",
        "favorite-genome": "handle_favorite",
        "rename-species": "handle_rename",
        "rename-fish": "handle_rename",
        "pause": "handle_pause",
        "resume": "handle_pause",
        "stop": "handle_pause",
        "step": "handle_pause",
        "reset": "handle_pause",
        "bookmark": "handle_pause",
        "current": "handle_pause",
        "brain-all": "handle_pause",
        "probe-clear": "handle_pause",
        "clear-food": "handle_pause",
        "undo": "handle_pause",
        "delay": "handle_delay",
        "density": "handle_delay",
        "count": "handle_delay",
        "select": "handle_delay",
        "pin": "handle_delay",
        "evolution": "handle_delay",
        "protect": "handle_delay",
        "safety": "handle_delay",
        "limit": "handle_delay",
        "brain": "handle_delay",
        "brain-mode": "handle_delay",
        "neuron": "handle_delay",
        "reset-brain": "handle_delay",
        "release-sperm": "handle_delay",
        "turbo": "handle_delay",
        "stimulate": "handle_stimulate",
        "brain-turn": "handle_brain_turn",
        "probe": "handle_probe",
        "burst": "handle_burst",
        "group": "handle_group",
        "food": "handle_food",
        "spray": "handle_food",
        "obstacle": "handle_food",
        "erase": "handle_food",
        "eggs": "handle_food",
        "remove-food": "handle_food",
        "mussels": "handle_food",
        "worms": "handle_food",
        "crabs": "handle_food",
        "startle": "handle_food",
        "crush": "handle_crush",
        "encourage": "handle_crush",
        "bite-plant": "handle_crush",
        "grass": "handle_food",
        "algae": "handle_food",
        "remove-plants": "handle_food",
        "sediment": "handle_food",
        "remove-sediment": "handle_food",
        "load-autosave": "handle_load_autosave",
        "saved-eggs": "handle_saved_eggs",
        "egg-source": "handle_egg_source",
        "mutation": "handle_mutation",
        "flow": "handle_mutation",
        "gravity": "handle_mutation",
        "feeding": "handle_mutation",
        "novelty": "handle_mutation",
        "neural-cost": "handle_mutation",
        "parameter": "handle_parameter",
        "bottom-residence": "handle_bottom_residence",
        "history-interval": "handle_bottom_residence",
        "experiment": "handle_experiment",
        "mutant": "handle_mutant",
        "current-source": "handle_current_source",
        "polygon": "handle_polygon",
        "wall": "handle_wall",
        "move-obstacle": "handle_wall",
        "feeder": "handle_feeder",
        "remove-feeder": "handle_feeder",
        "archive-eggs": "handle_feeder",
        "size": "handle_size",
        "observe": "handle_observe",
        "restart": "handle_restart",
        "new": "handle_new",
    }

    def __init__(self, simulation, defaults):
        self.simulation = simulation
        self.defaults = defaults

    def dispatch(self, data):
        op = data.get("command")
        if not isinstance(op, str) or op not in self.handlers:
            raise Refusal("unknownCommand")
        return getattr(self, self.handlers[op])(data)

    def handle_population_import(self, data):
        return self.simulation.population_catalog.import_genome(data.get("genome"), data.get("name"))

    def handle_population_ready(self, data):
        self.simulation.offer_population = False
        return ""

    def handle_favorite(self, data):
        if data["command"] == "favorite-fish":
            identifier = data.get("id")
            if type(identifier) != int or not 0 < identifier < 1000000000:
                raise Refusal("invalidFish")
            return self.simulation.population_catalog.favorite_fish(identifier)
        if type(data.get("enabled")) != bool:
            raise Refusal("invalidFavorite")
        return self.simulation.population_catalog.favorite(data.get("id"), data["enabled"])

    def handle_rename(self, data):
        identifier, name = data.get("id"), data.get("name")
        if type(identifier) != int or not 0 < identifier < 1000000000000:
            raise Refusal("invalidSelection")
        if not isinstance(name, str):
            raise Refusal("nameRequired")
        name = " ".join(name.split())
        if len(name) > 64 or any(ord(c) < 32 for c in name):
            raise Refusal("nameTooLong")
        if data["command"] == "rename-fish":
            return self.simulation.rename_fish(identifier, name)
        if not name:
            raise Refusal("nameRequired")
        quoted = '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'
        return self.simulation.command(f"rename-species {identifier} {quoted}")

    def handle_pause(self, data):
        simulation = self.simulation
        op = data.get("command")
        return simulation.command(op)

    def handle_delay(self, data):
        simulation = self.simulation
        op = data.get("command")
        value = data["value"]
        if isinstance(value, bool) or not isinstance(value, int):
            raise Refusal("integerRequired")
        maximum = {
            "delay": 1000,
            "density": 10000,
            "count": 2000,
            "select": 1000000000,
            "pin": 1000000000,
            "evolution": 1,
            "protect": 1,
            "safety": 1,
            "limit": 2000,
            "brain": 1,
            "brain-mode": 1,
            "neuron": 65535,
            "reset-brain": 1000000000,
            "release-sperm": 1000000000,
            "turbo": 1,
        }[op]
        if not 0 <= value <= maximum:
            raise Refusal("invalidValue")
        if op == "select" and value > 0:
            simulation.egg_source = None
        return simulation.command(f"{op} {value}")

    def handle_stimulate(self, data):
        simulation = self.simulation
        message = ""
        amount = float(data.get("amount", 1))
        neurons = data.get("neurons", [data.get("neuron")])
        if (
            not isinstance(neurons, list)
            or not 1 <= len(neurons) <= 65536
            or any(
                (
                    isinstance(n, bool)
                    or not isinstance(n, int)
                    or (not 0 <= n <= 65535)
                    for n in neurons
                )
            )
            or (not math.isfinite(amount))
            or (not 0 <= amount <= 1)
        ):
            raise Refusal("invalidCellStimulus")
        neurons = sorted(set(neurons))
        if "neurons" in data:
            message = simulation.command(
                f"stimulate-group {len(neurons)} {amount} "
                + " ".join((str(n) for n in neurons))
            )
        else:
            message = simulation.command(f"stimulate {neurons[0]} {amount}")
        return message

    def handle_brain_turn(self, data):
        simulation = self.simulation
        value = float(data["value"])
        if not math.isfinite(value) or not -360 <= value <= 360:
            raise Refusal("invalidGaze")
        return simulation.command(f"brain-turn {value}")

    def handle_probe(self, data):
        simulation = self.simulation
        kind = data["kind"]
        sense = data.get("sense", 0)
        if (
            isinstance(kind, bool)
            or not isinstance(kind, int)
            or kind not in (0, 1, 2)
            or isinstance(sense, bool)
            or (not isinstance(sense, int))
            or (not 0 <= sense < 11)
        ):
            raise Refusal("invalidSenseStimulus")
        values = [
            float(data.get(k, d))
            for k, d in [
                ("x", 0),
                ("y", 0),
                ("energy", 120),
                ("radius", 2),
                ("sense", 0),
                ("value", 0),
            ]
        ]
        color = data.get("color", [1, 0, 0])
        scents = data.get("scents", [1, 0, 0, 0, 0, 0, 0, 0])
        if (
            not isinstance(color, list)
            or len(color) != 3
            or (not isinstance(scents, list))
            or (len(scents) != 8)
        ):
            raise Refusal("invalidStimulusMix")
        values += [float(x) for x in color + scents]
        if (
            not all((math.isfinite(x) for x in values))
            or abs(values[0]) > 1000000
            or abs(values[1]) > 1000000
        ):
            raise Refusal("invalidSenseStimulus")
        return simulation.command(
            "probe "
            + str(kind)
            + " "
            + " ".join((str(x) if i != 4 else str(sense) for i, x in enumerate(values)))
        )

    def handle_burst(self, data):
        simulation = self.simulation
        kind = data.get("kind")
        if kind not in ("food", "mutation"):
            raise Refusal("unknownBurst")
        return simulation.command("burst " + kind)

    def handle_group(self, data):
        simulation = self.simulation
        value = data["value"]
        if value not in ("best", "random", "marked") and (
            not isinstance(value, str)
            or not re.fullmatch("niche:(?:[0-9]|1[0-9]|2[0-3])", value)
        ):
            raise Refusal("invalidSelection")
        return simulation.command("group " + value)

    def handle_crush(self, data):
        kind, target, organ = data.get("kind"), data.get("id"), data.get("organ", -1)
        if (kind not in (5, 7, 8, 9) or isinstance(target, bool) or not isinstance(target, int)
                or target < 0 or not isinstance(organ, int) or not -1 <= organ <= 65535):
            raise Refusal("invalidTarget")
        op = data["command"]
        along = data.get("along", 0)
        if isinstance(along, bool) or not isinstance(along, (int, float)) or not 0 <= along <= 1:
            along = 0
        if op == "bite-plant":
            return self.simulation.command(f"bite-plant {target} {organ} {float(along)}")
        return self.simulation.command(
            f"{op} {kind} {target}" + (f" {organ} {float(along)}" if op == "crush" else ""))

    def handle_food(self, data):
        simulation = self.simulation
        op = data.get("command")
        message = ""
        x, y = (float(data["x"]), float(data["y"]))
        with simulation.lock:
            frame = simulation.latest or {}
            width = frame.get("width", 1230)
            height = frame.get("height", 820)
        if (
            not math.isfinite(x)
            or not math.isfinite(y)
            or (
                op not in ("obstacle", "erase")
                and (not (0 <= x < width and 0 <= y < height))
            )
            or (abs(x) > 1000000)
            or (abs(y) > 1000000)
        ):
            raise Refusal("invalidPosition")
        count = data.get("count", 12 if op != "eggs" else 3)
        if (
            isinstance(count, bool)
            or not isinstance(count, int)
            or (not 1 <= count <= 100)
        ):
            raise Refusal("invalidAmount")
        radius = float(data.get("radius", 28 if op == "obstacle" else 18))
        if not math.isfinite(radius) or not 1 <= radius <= 120:
            raise Refusal("invalidRadius")
        if op == "eggs" and simulation.egg_source:
            path, _ = simulation.history.resolve(*simulation.egg_source)
            message = simulation.command(
                f"import {command_path(path)} {x} {y} {min(50, count)}"
            )
        elif op == "startle":
            message = simulation.command(f"startle {x} {y} {radius}")
        elif op in ("mussels", "worms", "crabs"):
            morph = float(data.get("morph", -1))
            if not math.isfinite(morph) or not -1 <= morph < 4:
                raise Refusal("invalidAnimalForm")
            message = simulation.command(f"{op} {x} {y} {radius} {min(20, count)} {morph}")
        elif op == "eggs":
            message = simulation.command(f"eggs {x} {y} {min(50, count)}")
        elif op == "obstacle":
            message = simulation.command(f"obstacle {x} {y} {radius}")
        elif op == "erase":
            message = simulation.command(f"erase {x} {y}")
        elif op in (
            "remove-food",
            "grass",
            "algae",
            "remove-plants",
            "sediment",
            "remove-sediment",
        ):
            plant = data.get("plant", -1)
            amount = float(data.get("amount", 8))
            if (
                isinstance(plant, bool)
                or not isinstance(plant, int)
                or (not -1 <= plant <= 5)
                or (not math.isfinite(amount))
                or (not 0.5 <= amount <= 16)
            ):
                raise Refusal("invalidBrush")
            message = simulation.command(
                f"{op} {x} {y} {radius}"
                + (f" {plant} {amount}" if op != "remove-food" else "")
            )
        else:
            message = simulation.command(f"spray {x} {y} {count} {radius}")
        return message

    def handle_load_autosave(self, data):
        simulation = self.simulation
        name = data["id"]
        if name not in ("latest", "previous"):
            raise Refusal("invalidAutosave")
        with simulation.lock:
            path = simulation.history.session / (name + ".state")
        if not path.exists():
            raise Refusal("autosaveMissing")
        context = {
            "key": simulation.history.meta["id"]
            + ":"
            + name
            + ":"
            + str(path.stat().st_mtime_ns),
            "session": simulation.history.meta["id"],
            "step": (simulation.latest or {}).get("step", 0),
            "journal": {},
            "name": "Autosave",
        }
        with simulation.lifecycle:
            return simulation.command(
                f"load-state {command_path(path)}", observation=context
            )

    def handle_saved_eggs(self, data):
        simulation = self.simulation
        identifier = data["id"]
        x, y = (float(data["x"]), float(data["y"]))
        count = data.get("count", 3)
        with simulation.lock:
            frame = simulation.latest or {}
            path = simulation.journal.resolve(identifier)
        if (
            not all((math.isfinite(v) for v in (x, y)))
            or not (
                0 <= x < frame.get("width", 2460) and 0 <= y < frame.get("height", 1640)
            )
            or type(count) != int
            or (not 1 <= count <= 50)
        ):
            raise Refusal("invalidEggPlacement")
        return simulation.command(f"saved-eggs {command_path(path)} {x} {y} {count}")

    def handle_egg_source(self, data):
        simulation = self.simulation
        message = ""
        if data.get("id"):
            simulation.history.resolve(data["session"], data["id"])
            simulation.egg_source = (data["session"], data["id"])
        else:
            simulation.egg_source = None
        return message

    def handle_mutation(self, data):
        simulation = self.simulation
        op = data.get("command")
        value = float(data["value"])
        maximum = {
            "mutation": 1,
            "flow": 2,
            "gravity": 0.3,
            "feeding": .2,
            "novelty": 1,
            "neural-cost": 100,
        }[op]
        if (
            not math.isfinite(value)
            or not (
                0.01
                if op == "neural-cost"
                else 0.1 if op == "novelty" else 0
            )
            <= value
            <= maximum
        ):
            raise Refusal("invalidValue")
        return simulation.command(f"{op} {value}")

    def handle_parameter(self, data):
        simulation = self.simulation
        name = data["name"]
        value = float(data["value"])
        if (
            not isinstance(name, str)
            or not re.fullmatch("[a-z_]{1,40}", name)
            or (not math.isfinite(value))
        ):
            raise Refusal("invalidParameter")
        return simulation.command(f"parameter {name} {value}")

    def handle_bottom_residence(self, data):
        simulation = self.simulation
        op = data.get("command")
        value = data["value"]
        if type(value) != int or not (
            0 if op == "bottom-residence" else 100
        ) <= value <= (100000 if op == "bottom-residence" else 1000000):
            raise Refusal("invalidInterval")
        return simulation.command(f"{op} {value}")

    def handle_experiment(self, data):
        simulation = self.simulation
        kind = data["kind"]
        identifier = data["id"]
        neuron = data.get("neuron", -1)
        if (
            kind not in ("vision", "nutrient", "neuron")
            or type(identifier) != int
            or identifier < 1
            or (type(neuron) != int)
            or (not -1 <= neuron <= 65535)
        ):
            raise Refusal("invalidExperiment")
        return simulation.command(f"experiment {kind} {identifier} {neuron}")

    def handle_mutant(self, data):
        simulation = self.simulation
        identifier = data["id"]
        count = data.get("count", 3)
        strength = float(data.get("strength", 0.15))
        if (
            type(identifier) != int
            or identifier < 1
            or type(count) != int
            or (not 1 <= count <= 20)
            or (not math.isfinite(strength))
            or (not 0 <= strength <= 1)
        ):
            raise Refusal("invalidMutation")
        return simulation.command(f"mutant {identifier} {count} {strength}")

    def handle_current_source(self, data):
        simulation = self.simulation
        x, y, angle, width, strength = (
            float(data[key]) for key in ("x", "y", "angle", "width", "strength")
        )
        index = data.get("index", -1)
        with simulation.lock:
            frame = simulation.latest or {}
        if (
            type(index) != int
            or not -1 <= index < len(frame.get("currents", []))
            or (not all((math.isfinite(v) for v in (x, y, angle, width, strength))))
            or (
                not (
                    0 <= x < frame.get("width", 2460)
                    and 0 <= y < frame.get("height", 1640)
                )
            )
            or (not 32 <= width <= 600)
            or (not 0 <= strength <= 6)
        ):
            raise Refusal("invalidCurrentSource")
        return simulation.command(
            f"current-source {index} {x} {y} {angle} {width} {strength}"
        )

    def handle_polygon(self, data):
        simulation = self.simulation
        points = data["points"]
        if not isinstance(points, list) or not 3 <= len(points) <= 32:
            raise Refusal("invalidPolygon")
        values = [float(p[k]) for p in points for k in ("x", "y")]
        if not all((math.isfinite(v) and abs(v) <= 1000000 for v in values)):
            raise Refusal("invalidPosition")
        return simulation.command(
            "polygon " + str(len(points)) + " " + " ".join(map(str, values))
        )

    def handle_wall(self, data):
        simulation = self.simulation
        op = data.get("command")
        x, y, tx, ty = (float(data[key]) for key in ("x", "y", "tx", "ty"))
        if not all((math.isfinite(v) for v in (x, y, tx, ty))) or any(
            (abs(v) > 1000000 for v in (x, y, tx, ty))
        ):
            raise Refusal("invalidPosition")
        extra = float(data.get("width", 12) if op == "wall" else data.get("angle", 0))
        if not math.isfinite(extra) or not (
            4 <= extra <= 100 if op == "wall" else -6.3 <= extra <= 6.3
        ):
            raise Refusal("invalidGeometry")
        return simulation.command(f"{op} {x} {y} {tx} {ty} {extra}")

    def handle_feeder(self, data):
        simulation = self.simulation
        op = data.get("command")
        message = ""
        x, y = (float(data["x"]), float(data["y"]))
        with simulation.lock:
            frame = simulation.latest or {}
        if (
            not math.isfinite(x)
            or not math.isfinite(y)
            or (
                not (
                    0 <= x < frame.get("width", 1230)
                    and 0 <= y < frame.get("height", 820)
                )
            )
        ):
            raise Refusal("invalidPosition")
        if op == "feeder":
            rate, radius = (float(data.get("rate", 1)), float(data.get("radius", 24)))
            if (
                not math.isfinite(rate)
                or not math.isfinite(radius)
                or (not 0 <= rate <= 100)
                or (not 1 <= radius <= 120)
            ):
                raise Refusal("invalidSource")
            index = data.get("index", -1)
            if type(index) != int or not -1 <= index < len(frame.get("feeders", [])):
                raise Refusal("feederMissing")
            message = simulation.command(f"feeder {x} {y} {rate} {radius} {index}")
        elif op == "archive-eggs":
            index, count = (data["index"], data.get("count", 2))
            if (
                type(index) != int
                or type(count) != int
                or (not 0 <= index < 128)
                or (not 1 <= count <= 50)
            ):
                raise Refusal("invalidArchiveEntry")
            message = simulation.command(f"archive-eggs {index} {x} {y} {count}")
        else:
            message = simulation.command(f"remove-feeder {x} {y}")
        return message

    def handle_size(self, data):
        simulation = self.simulation
        width, height = (float(data["width"]), float(data["height"]))
        if (
            not math.isfinite(width)
            or not math.isfinite(height)
            or (not 615 <= width <= 4920)
            or (not 410 <= height <= 3280)
        ):
            raise Refusal("invalidTankSize")
        return simulation.command(f"size {width} {height}")

    def handle_observe(self, data):
        simulation = self.simulation
        return simulation.observe(data["session"], data["id"])

    def handle_restart(self, data):
        simulation = self.simulation
        return simulation.restart()

    def handle_new(self, data):
        simulation = self.simulation
        fish = data.get("fish", simulation.args.fish)
        seed = data.get("seed")
        world = data.get("world", "starter")
        if world not in ("starter", "empty"):
            raise Refusal("invalidStartWorld")
        energy = data.get("energy", {})
        energy_names = {name for name, spec in self.defaults.items() if spec.get("initial")}
        if not isinstance(energy, dict) or set(energy) - energy_names:
            raise Refusal("invalidEnergySettings")
        costs = {}
        defaults = self.defaults
        for name in energy_names:
            spec = defaults[name]
            default, minimum, maximum = (spec["value"], spec["min"], spec["max"])
            value = energy.get(name, default)
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or (not math.isfinite(value))
                or (not minimum <= value <= maximum)
            ):
                raise Refusal("invalidEnergyValue")
            costs[name] = value
        if seed is None:
            seed = secrets.randbits(32)
            while seed == simulation.args.seed:
                seed = secrets.randbits(32)
        if (
            isinstance(fish, bool)
            or not isinstance(fish, int)
            or (not 1 <= fish <= 2000)
        ):
            raise Refusal("invalidPopulationSize")
        if (
            isinstance(seed, bool)
            or not isinstance(seed, int)
            or (not 0 <= seed <= 4294967295)
        ):
            raise Refusal("invalidSeed")
        budgets = {}
        for name, maximum in [
            ("max_neurons", 65536),
            ("max_connections", 10000000),
            ("neural_budget", 256000000),
        ]:
            value = data.get(name, getattr(simulation.args, name))
            if type(value) != int or not 1 <= value <= maximum:
                raise Refusal("invalidMemoryBudget")
            budgets[name] = value
        chosen = simulation.population_catalog.selected(data.get("population", []), fish, budgets)
        if not chosen:
            # Without a choice the run starts with the shipped example fish.
            chosen = [path.read_bytes() for path in simulation.example_genomes()]
        if not chosen:
            raise Refusal("chooseFounders")
        with simulation.lifecycle:
            simulation.close()
            simulation.initial_genomes = chosen
            simulation.offer_population = False
            for name, value in budgets.items():
                setattr(simulation.args, name, value)
            simulation.args.fish = fish
            simulation.args.seed = seed
            simulation.args.input = None
            simulation.args.empty_world = world == "empty"
            simulation.initial_energy = costs
            simulation.start(resume=False)
        return "Neuer Lauf wird gestartet."

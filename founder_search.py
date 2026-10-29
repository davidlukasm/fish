"""Lifecycle of the resumable founder search process."""

import json
from collections import deque
import shlex
import subprocess
import threading
from viewer_paths import ROOT
from pool_anatomy import read as read_anatomy


class FounderSearch:
    def __init__(self):
        self.lock = threading.RLock()
        self.process = None
        self.progress = {}
        self.error = ""

    def state(self):
        with self.lock:
            entries = []
            try:
                lines = (ROOT / "genomes/pool/index.pool").read_text().splitlines()
                for line in lines[1:]:
                    (category, origin, name, senses, selection_group, funded, hatched,
                     feeding, parents_feeding, steps, seed, foraging, speed, turn,
                     eaten, samples, eye_score, nose_score, digested, exposure, *intake) = (
                        shlex.split(line)
                    )
                    (measured, attempts, hatches, hatch_steps, built, secreted, contracted,
                     dead, hatch_energy, hatch_health) = intake[-10:]
                    entries.append(
                        {
                            "id": "founder:" + name,
                            "file": name,
                            "name": name.removesuffix(".genome"),
                            "class": int(category),
                            "senses": int(senses),
                            "measured": bool(int(measured)),
                            "hatch_attempts": int(attempts),
                            "hatches": int(hatches),
                            "hatch_steps": int(hatch_steps),
                            "hatch_built": int(built), "hatch_secreted": int(secreted),
                            "hatch_contracted": int(contracted), "hatch_dead": int(dead),
                            "hatch_energy": float(hatch_energy), "hatch_health": float(hatch_health),
                            "foraging": float(foraging),
                            "foraging_speed": float(speed),
                            "foraging_turn": float(turn),
                            "foraging_eaten": int(eaten),
                            "foraging_samples": int(samples),
                            "sense_foraging": [float(v) if float(v) >= 0 else None
                                               for v in (eye_score, nose_score)],
                            "selection_group": int(selection_group),
                            "observed_diet": [float(v) for v in intake[:11]],
                            "observed_raw_diet": [float(v) for v in intake[11:22]],
                            "observed_digested": float(digested),
                            "observed_intake": 100 * sum(map(float, intake[:11])) / int(exposure)
                            if int(exposure) else None,
                            "diet_scope": "Zwei natürliche Fressgenerationen" if int(measured) else "Noch ungeprüft",

                            "funded_eggs": int(funded),
                            "hatched_offspring": int(hatched),
                            "feeding_offspring": int(feeding),
                            "feeding_parents": int(parents_feeding),
                            "trial_steps": int(steps),
                        }
                    )
                anatomy = read_anatomy()
                for entry in entries:
                    entry["sense_cells"] = anatomy.get(entry["file"], {}).get("sense_cells", {})
                    entry["anatomy"] = anatomy.get(entry["file"], {}).get("anatomy", {})
                    # The lifecycle trial stops at two feeding children and parents.
                    # Reward completing that same target promptly, not eggs in bulk.
                    life = (min(1, entry["feeding_offspring"] / 2)
                            * min(1, entry["feeding_parents"] / 2)
                            * 1000 / (1000 + entry["trial_steps"]))
                    entry["reproduction_score"] = life
                    entry["overall_score"] = None
                checked = int(
                    (ROOT / "genomes/pool/search.state")
                    .read_text()
                    .splitlines()[0]
                    .split()[1]
                )
            except FileNotFoundError:
                checked = 0
            except (OSError, ValueError, IndexError):
                checked = 0
            return {
                "running": self.process is not None and self.process.poll() is None,
                "candidates": self.progress.get("candidates", checked),
                "entries": entries,
                "ready": sum(e["measured"] and e["hatches"] > 0 and e["funded_eggs"] > 0
                             and e["hatched_offspring"] > 0 and e["feeding_offspring"] > 0
                             and e["feeding_parents"] > 0 and e["observed_digested"] > 0
                             for e in entries),
                "error": self.error,
            }

    def start(self, workers):
        ready = self.state()["ready"]
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                raise ValueError("Founder-Suche läuft bereits.")
            command = [
                str(ROOT / "bin/fish"),
                "--search-founders",
                "--founder-target", str(ready + 1),
                "--founder-candidates", "0",
                "--threads",
                str(workers),
            ]
            self.process = subprocess.Popen(
                command,
                cwd=ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            process = self.process
            self.error = ""
            self.progress = {}

            errors = deque(maxlen=20)

            def collect_errors():
                for line in process.stderr:
                    errors.append(line.rstrip())
                process.stderr.close()

            error_reader = threading.Thread(target=collect_errors, daemon=True)
            error_reader.start()

            def collect():
                for line in process.stdout:
                    try:
                        item = json.loads(line)
                        with self.lock:
                            if self.process is process:
                                self.progress.update(item)
                    except ValueError:
                        pass
                process.stdout.close()
                code = process.wait()
                error_reader.join()
                error = "\n".join(errors)
                with self.lock:
                    if self.process is process and code not in (0, 130):
                        self.error = error or f"Founder-Suche beendet ({code})."

            threading.Thread(target=collect, daemon=True).start()
        return "Founder-Suche gestartet."

    def stop(self):
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                self.process.terminate()
        return "Suche wird angehalten; der letzte vollständige Suchblock bleibt gespeichert."

    def close(self):
        self.stop()
        with self.lock:
            process = self.process
        if process is not None:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

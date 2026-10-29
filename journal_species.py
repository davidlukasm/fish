"""Species measurements, stable trait confirmation and lifecycle events."""

from dataclasses import dataclass
from protocol_schema import Fish
from species_traits import CATALOG, describe, summary_labels, profile_labels


@dataclass(frozen=True)
class Measurements:
    diet: list
    habitat: int
    bottom: float
    top: float
    ecology: dict


@dataclass(frozen=True)
class SpeciesResult:
    tasks: list
    confirmed: list
    catalog_changed: bool


def species_history(journal, s, step):
    key = str(s["id"])
    k = journal.known.setdefault(
        key,
        {
            "labels": [],
            "born": s["born"],
            "offspring": 0,
            "absent": 0,
            "announced": False,
            "alive": False,
        },
    )
    k["lineage"] = {
        name: s.get(name, 0)
        for name in (
            "id",
            "name",
            "mother",
            "father",
            "born",
            "origin",
            "extinct_at",
            "last_seen",
            "adults",
            "genus",
            "parent_genus",
            "genus_name",
            "epithet",
            "name_reason",
        )
    }
    if s.get("epithet") and (not k.get("named")):
        journal.milestone(
            "species-name-" + key,
            s["name"] + " benannt",
            step,
            s["id"],
            "species",
            s.get("name_reason", ""),
        )
        k["named"] = True
    if s.get("confirmed") and s.get("genus"):
        journal.milestone(
            "genus-" + str(s["genus"]),
            "Gattung " + s["genus_name"] + " bestätigt",
            step,
            s["id"],
            "species",
        )
    return (key, k)


def measure_species(members, traits):
    diet = [
        sum(
            (
                (list(traits.get(p[Fish.ID], {}).get("diet", [])) + [0] * 11)[i]
                for p in members
            )
        )
        for i in range(11)
    ]
    habitat = sum((traits.get(p[Fish.ID], {}).get("habitat_steps", 0) for p in members))
    bottom = sum(
        (
            traits.get(p[Fish.ID], {}).get("bottom", 0)
            * traits.get(p[Fish.ID], {}).get("habitat_steps", 0)
            for p in members
        )
    ) / max(1, habitat)
    top = sum(
        (
            traits.get(p[Fish.ID], {}).get("top", 0)
            * traits.get(p[Fish.ID], {}).get("habitat_steps", 0)
            for p in members
        )
    ) / max(1, habitat)
    ecology = {
        "samples": sum(
            (traits.get(p[Fish.ID], {}).get("ecology_steps", 0) for p in members)
        ),
        "drift_grass": sum(
            (traits.get(p[Fish.ID], {}).get("drift_grass", 0) for p in members)
        ),
    }
    for i, name in enumerate(("surface", "grass", "buried", "shadow", "light")):
        ecology[name] = sum(
            (
                (list(traits.get(p[Fish.ID], {}).get("ecology", [])) + [0] * 5)[i]
                for p in members
            )
        ) / max(1, ecology["samples"])
    return Measurements(diet, habitat, bottom, top, ecology)


def confirm_traits(journal, f, s, k, members, facts, step):
    key = str(s["id"])
    diet = facts.diet
    habitat = facts.habitat
    bottom = facts.bottom
    top = facts.top
    ecology = facts.ecology
    if s.get("profile_samples") and "initial_profile" not in k:
        k["initial_profile"] = list(s["profile"])
        k["initial_step"] = step
    features = describe(
        s.get("profile", []) if s.get("profile_samples") else [],
        diet,
        bottom,
        top,
        habitat,
        s.get("successful_offspring", 0),
        s.get("body_profile"),
        ecology,
    )
    k.pop("candidate", None)
    k.pop("candidate_since", None)
    known_details = k.setdefault("trait_details", {})
    previous = [word for word in k["labels"] if word in CATALOG]
    since = k.setdefault("trait_since", {})
    missing = k.setdefault("trait_missing", {})
    if f.get("environment") != k.get("environment"):
        since.clear()
        missing.clear()
        k["environment"] = f.get("environment")
    if members:
        raw = {item["name"]: item for item in features}
        for word in list(since):
            if word not in raw:
                since.pop(word)
        confirmed = []
        for word, item in raw.items():
            since.setdefault(word, step)
            missing.pop(word, None)
            if word in previous or step - since[word] >= 400:
                known_details[word] = {
                    name: value for name, value in item.items() if name != "name"
                }
                confirmed.append(word)
        for word in previous:
            if word not in raw:
                missing.setdefault(word, step)
                if step - missing[word] < 400:
                    confirmed.append(word)
        k["labels"] = confirmed
    else:
        k["labels"] = previous
    details = {
        word: known_details.get(word, {**CATALOG[word], "evidence": ""})
        for word in k["labels"]
    }
    # A rich catalogue must not turn every range crossing into an event burst.
    noteworthy = set(summary_labels(details))
    for word, item in details.items():
        if not members:
            continue
        if word not in noteworthy:
            continue
        evidence = item.get("evidence", "")
        note = item["note"]
        if word not in journal.announced:
            journal.announced.add(word)
            journal.milestone(
                "first-trait-" + word,
                "Erstmals " + word + ": " + s["name"],
                step,
                s["id"],
                "trait",
                note + " " + evidence,
            )
        elif k["announced"] and previous and (word not in previous):
            journal.event(
                "profile-" + key + "-" + word,
                s["name"] + ": jetzt " + word,
                step,
                s["id"],
                "trait",
                note + " " + evidence,
            )
    return details


def record_species(journal, s, k, members, facts, details, step):
    sid = journal.session.name
    catalog_changed = False
    diet = facts.diet
    habitat = facts.habitat
    bottom = facts.bottom
    top = facts.top
    ecology = facts.ecology
    shown = profile_labels(details)
    details = {word: details[word] for word in shown}
    compact = summary_labels(details)
    s = {
        **s,
        **{name: k[name] for name in ("initial_profile", "initial_step") if name in k},
        "labels": shown,
        "summary_labels": compact,
        "profile_labels": shown,
        "trait_details": details,
        "diet": diet,
        "ecology": ecology,
        "nutrition_steps": sum((p[Fish.NUTRITION_STEPS] for p in members)),
        "bottom": bottom,
        "top": top,
        "habitat_steps": habitat,
    }
    journal.species[s["id"]] = s
    for group in journal.catalog.values():
        for entry in group.values():
            if (
                entry["session"] == sid
                and entry["species_id"] == s["id"]
                and (
                    entry.get("name") != s["name"]
                    or entry.get("labels") != s["summary_labels"][:3]
                )
            ):
                entry["labels"] = s["summary_labels"][:3]
                entry["name"] = s["name"]
                catalog_changed = True
    trace = journal.traces.setdefault(s["id"], [])
    trace.append([step, s["adults"], s["nutrition_per_1000"] / 10])
    journal.traces[s["id"]] = trace[-32:]
    return (s, catalog_changed)


def species_lifecycle(journal, s, k, members, step):
    tasks = []
    alive_confirmed = []
    key = str(s["id"])
    sid = journal.session.name
    established = s.get("confirmed", False)
    if established and (s["alive"] or s.get("gametes")):
        alive_confirmed.append(s)
    if established and (not k["announced"]) and k["labels"]:
        journal.announced.update(k["labels"])
        k["announced"] = True
        journal.event(
            "species-" + key,
            s["name"]
            + " etabliert · "
            + str(s["adults"])
            + " Fische, "
            + str(s["successful_offspring"])
            + " Nachkommen",
            step,
            s["id"],
            "species",
            milestone=True,
        )
    current_alive = bool(s["alive"] or s.get("gametes"))
    if current_alive:
        k["absent"] = 0
    elif k["alive"]:
        if not k["absent"]:
            k["absent"] = step
        if step - k["absent"] >= 800:
            if k["announced"]:
                journal.event(
                    "extinct-" + key,
                    s["name"]
                    + " ausgestorben · "
                    + str(s["successful_offspring"])
                    + " Nachkommen",
                    step,
                    s["id"],
                    "extinction",
                    "Seit 800 Schritten verschwunden.",
                )
            k["alive"] = False
    if current_alive:
        k["alive"] = True
        k["last_adults"] = s["adults"]
    success = s["successful_offspring"]
    recent_key = sid + ":" + key
    if established and success > k["offspring"]:
        eligible = [
            p
            for p in members
            if p[Fish.OFFSPRING] > 0 and p[Fish.NUTRITION_STEPS] >= 80
        ]
        if eligible:
            p = max(
                eligible,
                key=lambda p: (
                    p[Fish.OFFSPRING],
                    p[Fish.NUTRITION] / max(1, p[Fish.NUTRITION_STEPS]),
                ),
            )
            tasks.append(("recent", recent_key, p, s, success))
    k["offspring"] = success
    deaths = s.get("replacement_deaths", 0)
    hatches = s.get("replacement_hatches", 0)
    if members and deaths >= 5 and (hatches >= deaths):
        if "sustain_since" not in k:
            k["sustain_since"] = step
        if step - k["sustain_since"] >= 1200:
            journal.milestone(
                "self-species-" + key,
                s["name"]
                + " ersetzt ihre Verluste · "
                + format(hatches / deaths, ".2f").replace(".", ",")
                + " Nachwuchs je Verlust",
                step,
                s["id"],
                "species",
                str(hatches)
                + " Schlupfe / "
                + str(deaths)
                + " Todesfälle · seit 1.200 Schritten",
            )
    else:
        k.pop("sustain_since", None)
    return (tasks, alive_confirmed)


def observe_species(journal, frame, s, members, traits):
    step = frame["step"]
    key, known = species_history(journal, s, step)
    facts = measure_species(members, traits)
    details = confirm_traits(journal, frame, s, known, members, facts, step)
    row, dirty = record_species(journal, s, known, members, facts, details, step)
    tasks, confirmed = species_lifecycle(journal, row, known, members, step)
    return SpeciesResult(tasks, confirmed, dirty)

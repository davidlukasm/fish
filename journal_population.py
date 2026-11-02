"""Birth, generation, viability and dominance observations."""

from protocol_schema import Fish, FishOrigin

# A notice of the same kind, a changed population state or a record waits NOTICE_STEPS steps.
NOTICE_STEPS = 1200

# Natural generations worth a milestone; generations count from GENERATIONS on. A population
# sustains itself once SUSTAINING_DEATHS deaths were replaced without help; it is in crisis below
# CRISIS of a peak of at least CRISIS_PEAK. A window without supply counts from SUPPLY_GENERATIONS
# generations on.
GENERATION_MILESTONES = (3, 5, 10, 15, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 80000, 100000)
GENERATIONS, SUSTAINING_DEATHS, CRISIS, CRISIS_PEAK, SUPPLY_GENERATIONS = 2, 5, 0.25, 20, 3


def record_births(journal, f, fish, step):
    if f.get("births") and (not journal.status.get("births")):
        journal.status["births"] = True
        journal.milestone("births", "births", step)
    if (
        f.get("hatches")
        and any((p[Fish.HATCHED] and p[Fish.GENERATION] >= GENERATIONS for p in fish))
        and (not journal.status.get("generations"))
    ):
        journal.status["generations"] = True
        journal.milestone("generations", "generations", step)
    deepest = max(
        (p for p in fish if p[Fish.HATCHED]),
        key=lambda p: p[Fish.GENERATION],
        default=None,
    )
    if deepest:
        name = journal.species.get(deepest[Fish.SPECIES], {}).get("name")
        for threshold in GENERATION_MILESTONES:
            if deepest[Fish.GENERATION] >= threshold:
                journal.milestone(
                    "natural-generation-" + str(threshold),
                    "naturalGeneration",
                    step,
                    {"name": name, "n": threshold},
                    deepest[Fish.SPECIES],
                )
    if any(
        (
            p[Fish.HATCHED]
            and p[Fish.ORIGIN] == FishOrigin.NATURAL
            and p[Fish.FATHER]
            and (p[Fish.FATHER] != p[Fish.PARENT])
            for p in fish
        )
    ):
        journal.milestone("sexual-birth", "sexualBirth", step)
    return deepest


def record_viability(journal, f, deepest, step):
    pop = f.get("hatched", 0)
    peak = max(pop, journal.status.get("peak", 0))
    journal.status["peak"] = peak
    perf = f.get("performance", {})
    help = f.get("assistance", {})
    sustaining = help.get("deaths", 0) >= SUSTAINING_DEATHS and help.get("need", 1) <= 0
    state = (
        "self"
        if sustaining
        else "crisis" if peak >= CRISIS_PEAK and pop < peak * CRISIS else "normal"
    )
    if state != journal.status.get("state"):
        if journal.status.get("candidate_state") != state:
            journal.status["candidate_state"] = state
            journal.status["since"] = step
        if step - journal.status.get("since", step) >= NOTICE_STEPS:
            before = journal.status.get("state")
            journal.status["state"] = state
            if state == "self":
                journal.milestone(
                    "self",
                    "selfSustaining",
                    step,
                    {"ratio": help.get("hatches", 0) / help["deaths"]},
                )
            elif state == "crisis":
                journal.event(
                    "crisis",
                    "crisis",
                    step,
                    {"adults": pop},
                    kind="warning",
                )
            elif before == "crisis":
                journal.event(
                    "recovery",
                    "recovery",
                    step,
                    {"adults": pop},
                )
    supplied = f.get("rescues", 0) + f.get("imports", 0)
    if journal.status.get("supplied") != supplied:
        journal.status["supplied"] = supplied
        journal.status["last_supply"] = step
    target = perf.get("window_target")
    if (
        deepest
        and deepest[Fish.GENERATION] >= SUPPLY_GENERATIONS
        and (help.get("deaths", 0) >= SUSTAINING_DEATHS)
        and (help.get("hatches", 0) >= help.get("deaths", 0))
        and (step - journal.status.get("last_supply", step) >= target)
    ):
        journal.milestone(
            "window-without-supply",
            "withoutSupply",
            step,
            {"steps": target},
        )


def record_dominance(journal, f, alive_confirmed, step):
    pop = f.get("hatched", 0)
    dominant = max(alive_confirmed, key=lambda s: s["adults"], default=None)
    if dominant and dominant["adults"] >= max(3, pop * 0.5):
        old = journal.status.get("dominant")
        if old != dominant["id"]:
            if journal.status.get("dominant_candidate") != dominant["id"]:
                journal.status["dominant_candidate"] = dominant["id"]
                journal.status["dominant_since"] = step
            elif step - journal.status["dominant_since"] >= 1200:
                journal.status["dominant"] = dominant["id"]
                if old:
                    journal.event(
                        "dominant",
                        "dominant",
                        step,
                        {"name": dominant["name"]},
                        dominant["id"],
                    )

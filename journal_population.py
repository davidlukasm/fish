"""Birth, generation, viability and dominance observations."""

from protocol_schema import Fish


def record_births(journal, f, fish, step):
    if f.get("births") and (not journal.status.get("births")):
        journal.status["births"] = True
        journal.milestone("births", "Erster natürlicher Nachwuchs geschlüpft", step)
    if (
        f.get("hatches")
        and any((p[Fish.HATCHED] and p[Fish.GENERATION] >= 2 for p in fish))
        and (not journal.status.get("generations"))
    ):
        journal.status["generations"] = True
        journal.milestone("generations", "Nachwuchs hat selbst Nachwuchs", step)
    deepest = max(
        (p for p in fish if p[Fish.HATCHED]),
        key=lambda p: p[Fish.GENERATION],
        default=None,
    )
    if deepest:
        group = journal.species.get(deepest[Fish.SPECIES], {})
        name = group.get("name", "Unbekannte Spezies")
        for threshold in (
            3,
            5,
            10,
            15,
            20,
            25,
            50,
            100,
            200,
            500,
            1000,
            2000,
            5000,
            10000,
            20000,
            50000,
            80000,
            100000,
        ):
            if deepest[Fish.GENERATION] >= threshold:
                journal.milestone(
                    "natural-generation-" + str(threshold),
                    name + " erreicht hilfsfreie Generation " + str(threshold),
                    step,
                    deepest[Fish.SPECIES],
                )
    if any(
        (
            p[Fish.HATCHED]
            and p[Fish.ORIGIN] == 1
            and p[Fish.FATHER]
            and (p[Fish.FATHER] != p[Fish.PARENT])
            for p in fish
        )
    ):
        journal.milestone("sexual-birth", "Erster Nachwuchs mit zwei Eltern", step)
    return deepest


def record_viability(journal, f, deepest, step):
    pop = f.get("hatched", 0)
    peak = max(pop, journal.status.get("peak", 0))
    journal.status["peak"] = peak
    perf = f.get("performance", {})
    help = f.get("assistance", {})
    sustaining = help.get("deaths", 0) >= 5 and help.get("need", 1) <= 0
    state = (
        "self"
        if sustaining
        else "crisis" if peak >= 20 and pop < peak * 0.25 else "normal"
    )
    if state != journal.status.get("state"):
        if journal.status.get("candidate_state") != state:
            journal.status["candidate_state"] = state
            journal.status["since"] = step
        if step - journal.status.get("since", step) >= 1200:
            before = journal.status.get("state")
            journal.status["state"] = state
            if state == "self":
                journal.milestone(
                    "self",
                    "Becken ersetzt seine Verluste · "
                    + format(help.get("hatches", 0) / help["deaths"], ".2f").replace(
                        ".", ","
                    )
                    + " Nachwuchs je Verlust",
                    step,
                )
            elif state == "crisis":
                journal.event(
                    "crisis",
                    "Bestand eingebrochen · " + str(pop) + " Erwachsene",
                    step,
                    kind="warning",
                )
            elif before == "crisis":
                journal.event(
                    "recovery",
                    "Bestand erholt sich · " + str(pop) + " Erwachsene",
                    step,
                )
    supplied = f.get("rescues", 0) + f.get("imports", 0)
    if journal.status.get("supplied") != supplied:
        journal.status["supplied"] = supplied
        journal.status["last_supply"] = step
    target = perf.get("window_target", 6000)
    if (
        deepest
        and deepest[Fish.GENERATION] >= 3
        and (help.get("deaths", 0) >= 5)
        and (help.get("hatches", 0) >= help.get("deaths", 0))
        and (step - journal.status.get("last_supply", step) >= target)
    ):
        journal.milestone(
            "window-without-supply",
            format(target, ",").replace(",", ".") + " Schritte ohne zugesetzte Eier",
            step,
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
                        dominant["name"] + " übernimmt den Bestand",
                        step,
                        dominant["id"],
                    )

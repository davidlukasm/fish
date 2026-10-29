"""Genome record candidates and species diversity milestones."""

from protocol_schema import Fish, Anatomy


def choose_records(journal, fish):
    tasks = []
    qualified = [p for p in fish if p[Fish.HATCHED] and p[Fish.NUTRITION_STEPS] >= 500]
    categories = {
        "nutrition": lambda p: 100
        * p[Fish.NUTRITION]
        / max(1, p[Fish.NUTRITION_STEPS]),
        "offspring": lambda p: p[Fish.OFFSPRING],
        "age": lambda p: p[Fish.AGE],
        "generation": lambda p: p[Fish.GENERATION] if p[Fish.OFFSPRING] > 0 else 0,
    }
    for category, score in categories.items():
        if not qualified:
            continue
        p = max(qualified, key=score)
        value = score(p)
        if value <= 0:
            continue
        old = journal.catalog["runs"].get(journal.session.name + ":" + category)
        if old and value <= old["value"]:
            continue
        s = journal.species.get(p[Fish.SPECIES])
        if s:
            tasks.append(("record", category, p, s, value))
    # Keep successful representatives of distinct genera and resource/sense niches.
    representatives = {}
    for p in qualified:
        if p[Fish.NUTRITION] <= 0:
            continue
        s = journal.species.get(p[Fish.SPECIES])
        if not s:
            continue
        genus = s.get("genus_name", s["name"].split()[0])
        organs = p[Fish.ORGANS]
        sense = "eyes" if organs[Anatomy.EYE_LEFT] + organs[Anatomy.EYE_RIGHT] > organs[Anatomy.SMELL_LEFT] + organs[Anatomy.SMELL_RIGHT] else "nose"
        diet = journal.intake_profiles.get(p[Fish.ID], {}).get("diet", [])
        food = max(range(len(diet)), key=lambda i: diet[i]) if diet else 0
        key = journal.session.name + ":" + genus + ":" + str(food) + ":" + sense
        score = p[Fish.OFFSPRING] + 100 * p[Fish.NUTRITION] / max(1, p[Fish.NUTRITION_STEPS])
        old = representatives.get(key)
        if old is None or score > old[-1]:
            representatives[key] = ("lineage", key, p, s, score)
    # Round-robin across genera gives each lineage a slot before any receives a second.
    groups = {}
    for task in sorted(representatives.values(), key=lambda t: t[-1], reverse=True):
        genus = task[3].get("genus_name", task[3]["name"].split()[0])
        groups.setdefault(genus, []).append(task)
    selected = []
    while groups and len(selected) < 16:
        for genus in list(groups):
            selected.append(groups[genus].pop(0))
            if not groups[genus]:
                del groups[genus]
            if len(selected) == 16:
                break
    for task in selected:
        old = journal.catalog["lineages"].get(task[1])
        if not old or (task[-1] > old["value"] and (
            task[2][Fish.ID] != old["fish_id"]
            or task[-1] >= old["value"] * 1.1
            or journal.last_step >= old["step"] + 1000
        )):
            tasks.append(task)
    return tasks


def record_diversity(journal, alive_confirmed, step):
    diversity = len(alive_confirmed)
    if diversity > journal.records.get("diversity", 0):
        journal.records["diversity"] = diversity
        if diversity >= 2:
            journal.event(
                "diversity",
                "Vielfaltsrekord: " + str(diversity) + " Arten",
                step,
                kind="record",
            )

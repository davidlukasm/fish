"""Species nicknames from measured senses, anatomy and behaviour."""

from protocol_schema import Fish
from dataclasses import replace
from trait_context import prepare_traits
from trait_rules_anatomy import RULES as ANATOMY_RULES
from trait_rules_ecology import RULES as ECOLOGY_RULES
from trait_rules_combined import RULES as COMBINED_RULES
from trait_metrics import RULES as MEASURED_RULES
from trait_combinations import RULES as EXTENDED_COMBINATIONS

BEHAVIOR_EVIDENCE = {"diet", "plants", "habitat", "bottom", "motion", "combat", "space",
                     "pulse", "turn", "reproduction", "offspring", "suction", "water_flow"}


def combination_basis(rule):
    keys = set(rule.evidence.split("+"))
    return "behavior" if keys <= BEHAVIOR_EVIDENCE else (
        "mixed" if keys & BEHAVIOR_EVIDENCE else "anatomy")


RULES = (ANATOMY_RULES
         + tuple(replace(r, basis="anatomy" if r.name in
                         ("Zwitter", "Rogner", "Milchner") else "behavior")
                 for r in ECOLOGY_RULES)
         + tuple(replace(r, basis=combination_basis(r)) for r in COMBINED_RULES)
         + MEASURED_RULES + EXTENDED_COMBINATIONS)
assert len({r.name for r in RULES}) == len(RULES), "Doppelte Merkmalsnamen"
CATALOG = {
    r.name: {"group": r.group, "note": r.note, "priority": r.priority,
             "facet": r.facet or r.name, "basis": r.basis} for r in RULES
}


def describe(
    profile=(),
    diet=(),
    bottom=0,
    top=0,
    habitat=0,
    offspring=0,
    body=None,
    ecology=None,
):
    context = prepare_traits(
        profile, diet, bottom, top, habitat, offspring, body, ecology
    )
    matches = (r.evaluate(context) for r in RULES)
    return sorted(
        (item for item in matches if item),
        key=lambda item: (item["priority"], item["name"]),
    )


def summary_labels(details, limit=4):
    ranked = sorted(details.items(), key=lambda pair: (pair[1]["priority"], pair[0]))
    combinations = [
        (word, item) for word, item in ranked if item["group"] == "Kombination"
    ]
    chosen, used = [], set()
    for word, item in combinations:
        if len(chosen) >= min(2, max(0, limit)):
            break
        facet = item.get("facet", word)
        if facet not in used:
            chosen.append(word)
            used.add(facet)
    groups = {"Kombination"} if chosen else set()
    for word, item in ranked:
        if len(chosen) >= max(0, limit):
            break
        facet = item.get("facet", word)
        if item["group"] in groups or facet in used:
            continue
        chosen.append(word)
        groups.add(item["group"])
        used.add(facet)
    return chosen


def profile_labels(details, limit=6):
    """Show several areas before filling spare places with further combinations."""
    ranked = sorted(details, key=lambda word: (details[word]["priority"], word))
    target = max(0, min(6, limit, len(ranked)))
    selected = summary_labels(details, min(4, target))
    used = {details[word].get("facet", word) for word in selected}
    counts = {}
    for word in selected:
        group = details[word]["group"]
        counts[group] = counts.get(group, 0) + 1
    if len(selected) >= target:
        return selected
    for per_group in (1, 2, 3):
        for word in ranked:
            item = details[word]
            group, facet = item["group"], item.get("facet", word)
            if word in selected or facet in used or counts.get(group, 0) >= per_group:
                continue
            selected.append(word)
            used.add(facet)
            counts[group] = counts.get(group, 0) + 1
            if len(selected) >= target:
                return selected
    return selected


def individual_profile(frame):
    selected = frame.get("selected")
    fish = next((p for p in frame.get("fish", []) if p[Fish.ID] == selected), None)
    body = frame.get("selected_body")
    if not fish or not fish[Fish.HATCHED] or not body:
        return None
    traits = next((t for t in frame.get("traits", []) if t["id"] == selected), {})
    behavior = next((b for b in frame.get("behavior", []) if b["id"] == selected), {})
    count = max(1, traits.get("ecology_steps", 0))
    values = traits.get("ecology", [0] * 5)
    ecology = {
        k: values[i] / count
        for i, k in enumerate(("surface", "grass", "buried", "shadow", "light"))
    }
    ecology.update(
        samples=traits.get("ecology_steps", 0), drift_grass=traits.get("drift_grass", 0)
    )
    features = describe(
        behavior.get("descriptor", []) if behavior.get("samples", 0) >= 80 else [],
        traits.get("diet", []),
        traits.get("bottom", 0),
        traits.get("top", 0),
        traits.get("habitat_steps", 0),
        fish[Fish.OFFSPRING],
        body,
        ecology,
    )
    details = {f["name"]: f for f in features}
    shown = profile_labels(details, limit=4)
    details = {word: details[word] for word in shown}
    return {
        "id": selected,
        "labels": shown,
        "summary_labels": summary_labels(details),
        "profile_labels": shown,
        "trait_details": details,
        "samples": behavior.get("samples", 0),
    }

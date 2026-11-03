"""A trait combines a measured predicate, evidence keys and how it is explained."""

from dataclasses import dataclass
from typing import Callable
from trait_context import CATALOGUE, FACTS, LIMITS
from trait_expression import Expression


@dataclass(frozen=True)
class TraitRule:
    name: str
    group: str
    predicate: Callable
    evidence: str
    priority: int = 50
    facet: str = ""
    basis: str = "anatomy"
    # How the interface explains the trait: its own note (default), a list of combined
    # parts, or a measured interval.
    explain: dict = None

    @property
    def note(self):
        return self.explain or {"key": "rule", "values": {}}

    def evaluate(self, context):
        if not self.predicate(context):
            return None
        return {
            "name": self.name,
            "group": self.group,
            "note": self.note,
            "priority": self.priority,
            "facet": self.facet or self.name,
            "basis": self.basis,
            "evidence": [context.proof[key] for key in self.evidence.split("+")],
        }


class Condition:
    """A catalogue condition with its own limits; the limits it reads explain the trait."""

    def __init__(self, entry):
        self.expression = Expression(entry["when"])
        self.limits = entry.get("limits", {})

    def __call__(self, context):
        return self.expression({**context.scope, **self.limits})

    def explained(self):
        """The limits the condition reads, its own and through derived facts."""
        seen, todo, used = set(), list(self.expression.names()), {}
        while todo:
            name = todo.pop()
            if name in seen:
                continue
            seen.add(name)
            if name in self.limits:
                used[name] = self.limits[name]
            elif name in LIMITS:
                used[name] = LIMITS[name]
            elif name in FACTS:
                todo += FACTS[name].names()
        return used


def catalogue_rules():
    """The catalogue's own rules and its combinations of parts."""
    rules, combinations = [], []
    for entry in CATALOGUE["rules"]:
        condition = Condition(entry)
        rules.append(TraitRule(entry["name"], entry["group"], condition, entry["evidence"],
                               entry["priority"], entry["facet"], entry["basis"],
                               {"key": "rule", "values": condition.explained()}))
    parts = {key: (Condition(part), part) for key, part in CATALOGUE["parts"].items()}
    for entry in CATALOGUE["combinations"]:
        chosen = [parts[key] for key in entry["parts"]]
        bases = {part["basis"] for _, part in chosen}
        evidence = "+".join(dict.fromkeys(
            key for _, part in chosen for key in part["evidence"].split("+")))
        values = {"parts": entry["parts"], "limits": {
            key: condition.explained() for key, (condition, _) in zip(entry["parts"], chosen)}}
        combinations.append(TraitRule(
            entry["name"], "Kombination",
            lambda c, conditions=[condition for condition, _ in chosen]: all(
                test(c) for test in conditions),
            evidence, entry["priority"], entry["facet"],
            bases.pop() if len(bases) == 1 else "mixed", {"key": "parts", "values": values}))
    return tuple(rules), tuple(combinations)

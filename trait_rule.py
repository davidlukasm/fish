"""A trait combines a measured predicate, evidence keys and how it is explained."""

from dataclasses import dataclass
from typing import Callable
from trait_context import TraitContext


@dataclass(frozen=True)
class TraitRule:
    name: str
    group: str
    predicate: Callable[[TraitContext], bool]
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

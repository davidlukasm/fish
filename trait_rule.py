"""A trait combines a measured predicate, explanation and evidence keys."""

from dataclasses import dataclass
from typing import Callable
from trait_context import TraitContext


@dataclass(frozen=True)
class TraitRule:
    name: str
    group: str
    predicate: Callable[[TraitContext], bool]
    note: str
    evidence: str
    priority: int = 50
    facet: str = ""
    basis: str = "anatomy"

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
            "evidence": " · ".join(
                context.proof[key] for key in self.evidence.split("+")
            ),
        }

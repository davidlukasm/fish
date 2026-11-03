"""Trait vocabulary for measured ranges (the bands of traits.json). Missing measurements never
mean zero."""

import math
from trait_context import CATALOGUE, SCALES
from trait_expression import Expression
from trait_rule import TraitRule

PRIORITY = CATALOGUE["bandPriority"]


class Band:
    """A measurement read from the context and named per interval between its cuts."""

    def __init__(self, entry):
        self.key = entry["key"]
        self.read = Expression(entry["read"])
        scale = SCALES[entry["scale"]] if "scale" in entry else 1
        self.edges = (0, *(scale * cut for cut in entry["cuts"]), math.inf)
        assert len(entry["names"]) == len(entry["cuts"]) + 1, self.key

    def value(self, context):
        return self.read(context.scope)


def band_rules(entry, band):
    names = entry["names"]
    for i, name in enumerate(names):
        if name is None:
            continue
        assert " " not in name, name
        lo, hi = band.edges[i:i + 2]
        assert lo < hi, (band.key, lo, hi)
        yield TraitRule(
            name, entry["group"],
            lambda c, k=band.key, a=lo, b=hi: c.values.get(k) is not None and a <= c.values[k] < b,
            band.key,
            entry.get("priority", PRIORITY["edge"] if i in (0, len(names) - 1) else PRIORITY["inner"]),
            entry["facet"], entry["basis"],
            {"key": "interval", "values": {"measure": band.key, "lo": lo,
                                           "hi": None if math.isinf(hi) else hi}})


BANDS = [Band(entry) for entry in CATALOGUE["bands"]]
RULES = tuple(rule for entry, band in zip(CATALOGUE["bands"], BANDS)
              for rule in band_rules(entry, band))


def measure(context):
    for band in BANDS:
        value = band.value(context)
        if value is None or not math.isfinite(value):
            continue
        context.values[band.key] = value
        context.proof[band.key] = {
            "key": "measure", "values": {"measure": band.key, "value": value}}

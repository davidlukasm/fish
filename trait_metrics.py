"""Trait vocabulary for measured ranges. Missing measurements never mean zero."""

from dataclasses import dataclass
import colorsys
import math
from trait_rule import TraitRule
from protocol_schema import BehaviorScale


@dataclass(frozen=True)
class Measurement:
    key: str
    read: object


MEASUREMENTS = []
RULES = []


def bands(key, group, read, cuts, names, basis="anatomy", start=0):
    """One label per measured interval; None leaves a range unnamed. Titles and units of the
    measurements are texts of the interface."""
    assert len(names) == len(cuts) + 1
    MEASUREMENTS.append(Measurement(key, read))
    edges = (start, *cuts, math.inf)
    for i, name in enumerate(names):
        if name is None:
            continue
        assert " " not in name, name
        lo, hi = edges[i:i + 2]
        assert lo < hi, (key, lo, hi)
        RULES.append(TraitRule(
            name, group,
            lambda c, k=key, a=lo, b=hi: c.values.get(k) is not None
            and a <= c.values[k] < b,
            key, 58 if key == "skin_hue" else 62 if group == "Farbe"
            else 54 if i in (0, len(names) - 1) else 70,
            {"behavior0": "speed", "behavior1": "turning", "behavior3": "ranging",
             "behavior5": "gliding", "behavior14": "suction"}.get(key, key), basis,
            {"key": "interval", "values": {"measure": key, "lo": lo,
                                           "hi": None if math.isinf(hi) else hi}}))


def body_ratio(c, a, b):
    x, y = c.body.get(a), c.body.get(b)
    return x / y if x is not None and y is not None and y > 0 else None


# Measured body proportions: key, interval cuts and a compact name per interval (None: unnamed).
BODY_BANDS = (
    ("jaw_length", (.2, .5, .8), ("Kurzkiefer", None, None, "Langkiefer")),
    ("gut_length", (.2, .5, .8), ("Kurzdarm", None, None, "Langdarm")),
    ("blunt_teeth", (.2, .5, .8), ("Spitzzahn", None, None, "Mahlgebiss")),
    ("undulation", (.2, .5, .8), ("schwanzbetont", None, None, "schlängelnd")),
    ("mass", (.5, 1.5, 4), ("Federgewicht", "Leichtgewicht", "Mittelgewicht", "Schwergewicht")),
    ("propulsion", (2, 8, 24), (None, None, None, "Kraftpaket")),
    ("armor", (1, 4, 12), (None, None, None, "gerüstet")),
    ("barbels", (.001, 2, 8), (None, None, None, "Bartelkranz")),
)
for key, cuts, names in BODY_BANDS:
    bands("body_" + key, "Körper", lambda c, k=key: c.body.get(k), cuts, names)

for key, a, b, cuts, names in (
    ("mouth_ratio", "aperture", "radius", (.36, .5, .63),
     ("spitzmäulig", "schmalmäulig", "breitmäulig", "weitmäulig")),
    ("drive_ratio", "propulsion", "mass", (2, 8, 24), (None, None, "antriebsbetont", "muskelbetont")),
    ("head_ratio", "head", "cord", (.5, 1, 2), ("strangbetont", None, "kopfbetont", None)),
):
    bands(key, "Körper", lambda c, a=a, b=b: body_ratio(c, a, b), cuts, names)

bands("internal_share", "Nervensystem", lambda c: c.body["internal"] / (c.body["internal"] + sum(c.senses))
      if "internal" in c.body and "senses" in c.body
      and c.body["internal"] + sum(c.senses) > 0 else None, (.25, .5, .75),
      ("rezeptorbetont", None, None, None))

BEHAVIOR_BANDS = (
    (0, (.05, .2, .45), ("träge", None, None, "rasant")),
    (1, (.01, .05, .15), ("geradlinig", None, None, None)),
    (3, (.08, .25, .5), ("platztreu", None, None, None)),
    (4, (.005, .02, .05), ("schlagarm", None, None, "schlagfreudig")),
    (5, (.1, .4, .75), (None, None, None, "Dauergleiter")),
    (12, (.0005, .002, .008), (None, None, None, "laichfreudig")),
    (13, (.0005, .002, .008), (None, None, None, "sprühend")),
    (14, (.005, .03, .1), ("saugzurückhaltend", None, "saugfreudig", "Dauersauger")),
    (15, (.005, .03, .15), (None, None, "angriffsfreudig", "aggressiv")),
    (16, (.05, .2, .5), (None, None, None, "abschirmend")),
)
for i, cuts, names in BEHAVIOR_BANDS:
    scale = (BehaviorScale.SPEED if i == 0 else BehaviorScale.TURN_DEGREES if i == 1 else 1)
    bands("behavior" + str(i), "Fortpflanzung" if i in (12, 13) else
          "Kampf" if i in (15, 16) else "Nahrung" if i == 14 else "Bewegung",
          lambda c, i=i, scale=scale: scale * c.d[i] if c.observed else None,
          tuple(v * scale for v in cuts), names, "behavior")

bands("habitat_buried", "Lebensraum",
      lambda c: c.ecology["buried"] if c.eco_known and "buried" in c.ecology else None,
      (.1, .35, .7), (None, None, None, "Dauergräber"), basis="behavior")
bands("water_clarity", "Lebensraum", lambda c: c.d[24] if c.observed else None, (.05, .2),
      ("Klarwasser", None, "Trübwasser"), basis="behavior")
bands("water_flow", "Lebensraum", lambda c: c.d[25] if c.observed else None, (.05, .2, .5),
      ("Stillwasser", None, None, "Strömung"), basis="behavior")
bands("habitat_light", "Lebensraum", lambda c: c.ecology.get("light") if c.eco_known else None,
      (.2, .45, .7), (None, None, None, None), basis="behavior")


def skin(c):
    return colorsys.rgb_to_hsv(*c.d[17:20]) if c.observed else None


bands("skin_brightness", "Farbe", lambda c: skin(c)[2] if c.observed else None, (.1, .25, .5, .8),
      ("schwarz", "dunkel", None, "hell", None), basis="behavior")
bands("skin_saturation", "Farbe", lambda c: skin(c)[1] if c.observed and skin(c)[2] > .03 else None, (.1, .35, .7),
      ("grau", None, None, None), basis="behavior")
bands("skin_hue", "Farbe", lambda c: (360 * skin(c)[0] + 7.5) % 360
      if c.observed and skin(c)[1] >= .15 and skin(c)[2] > .08 else None,
      tuple(range(15, 360, 15)),
      ("rot", "zinnoberfarben", "orange", "bernsteinfarben", "gelb", "limettenfarben",
       "gelbgrün", "grasgrün", "grün", "smaragdgrün", "mintgrün", "türkisgrün",
       "türkis", "eisblau", "himmelblau", "azurblau", "blau", "indigoblau",
       "violett", "purpurfarben", "magenta", "fuchsienfarben", "rosarot", "karminrot"),
      "behavior")


def measure(context):
    for measurement in MEASUREMENTS:
        value = measurement.read(context)
        if value is None or not math.isfinite(value):
            continue
        context.values[measurement.key] = value
        context.proof[measurement.key] = {
            "key": "measure", "values": {"measure": measurement.key, "value": value}}


RULES = tuple(RULES)

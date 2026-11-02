"""Measured inputs and evidence shared by species trait rules."""

import json
from viewer_paths import ROOT
from protocol_schema import (BehaviorScale, BodyUnit, RateWindow, BehaviorFeature as F,
                             SenseKind as S, FoodKind as K, OdorKind as O, Rgb, Tolerance)
from trait_expression import Expression, Fields, Named

# The trait catalogue: limits, derived facts, rules, parts and their combinations.
CATALOGUE = json.loads((ROOT / "traits.json").read_text())
LIMITS = CATALOGUE["limits"]
FACTS = {name: Expression(text) for name, text in CATALOGUE["facts"].items()}
# Behaviour readings in pixels and degrees per step.
SCALES = {"speedScale": BehaviorScale.SPEED, "turnScale": BehaviorScale.TURN_DEGREES}


def _names(group):
    return [name.lower() for name in vars(group) if name.isupper() and name != "COUNT"]


FEATURES, SENSES, FOODS, ODORS, CHANNELS = (
    _names(F), _names(S), _names(K), _names(O), _names(Rgb))


class TraitContext:
    """The names a condition reads (scope) and the measurements the interval rules read."""

    def __init__(self, scope, d, observed, body, senses, ecology, proof):
        self.scope, self.d, self.observed, self.body = scope, d, observed, body
        self.senses, self.ecology, self.proof = senses, ecology, proof
        self.eco_known = scope["eco_known"]
        self.values = {}


def prepare_traits(
    profile=(),
    diet=(),
    bottom=0,
    top=0,
    habitat=0,
    offspring=0,
    body=None,
    ecology=None,
):
    body = body or {}
    ecology = ecology or {}
    observed = len(profile) >= F.COUNT
    d = list(profile)[:F.COUNT] if observed else [0] * F.COUNT
    def array(key, count=S.COUNT, default=0):
        return (list(body.get(key, [])) + [default] * count)[:count]

    senses = array("senses")
    thresholds = array("thresholds", default=1)
    early, late = array("early"), array("late")
    span, directions = array("span"), array("directions")
    scents = (list(body.get("scents", [])) + [0] * O.COUNT)[:O.COUNT]
    calibrated = "thresholds" in body
    sight = array("vision", Rgb.COUNT)
    peak = max(sight)
    nose = senses[S.ODOR] >= LIMITS["noseCells"]
    # A broad nose detects all scents. Preference requires an above-average tuning.
    preferred = [nose and value > LIMITS["preferenceGain"] * sum(scents) / O.COUNT
                 and value >= LIMITS["preferencePeak"] * max(scents) for value in scents]
    sensitive = [calibrated and senses[i] >= LIMITS["sensitiveCells"]
                 and early[i] >= LIMITS["sensitiveEarly"] for i in range(S.COUNT)]
    present = [value >= LIMITS["presentCells"] for value in senses]
    mouth, radius = (body.get("mouth", 0), body.get("radius", BodyUnit.RADIUS))
    bite, aperture = (body.get("bite", 0), body.get("aperture", 0))
    barbels, smell_sites = (body.get("barbels", 0), body.get("smell_sites", 0))
    egg, sperm = (body.get("egg_organs", 0), body.get("sperm_organs", 0))
    food_total = sum(diet)
    shares = (
        [0] * K.COUNT
        if food_total < LIMITS["dietEnergy"]
        else [(list(diet) + [0] * K.COUNT)[i] / food_total for i in range(K.COUNT)]
    )
    meadow, buried, shadow = (ecology.get(k, 0) for k in ("grass", "buried", "shadow"))
    rock = ecology.get("surface", 0)
    drift = min(shares[K.PLANT], ecology.get("drift_grass", 0) / max(1, food_total))
    rooted = max(0, shares[K.PLANT] - drift)
    scope = {
        **LIMITS, **SCALES,
        "body_senses": Named(SENSES, body.get("senses", ())),
        "d": Named(FEATURES, d), "shares": Named(FOODS, shares), "senses": Named(SENSES, senses),
        "thresholds": Named(SENSES, thresholds), "early": Named(SENSES, early),
        "late": Named(SENSES, late), "span": Named(SENSES, span),
        "directions": Named(SENSES, directions), "present": Named(SENSES, present),
        "sensitive": Named(SENSES, sensitive), "preferred": Named(ODORS, preferred),
        "scents": Named(ODORS, scents), "sight": Named(CHANNELS, sight),
        "body": Fields(body), "ecology": Fields(ecology),
        "observed": observed, "calibrated": calibrated, "peak": peak, "radius": radius,
        "mouth": mouth, "bite": bite, "aperture": aperture, "barbels": barbels,
        "smell_sites": smell_sites, "egg": egg, "sperm": sperm, "offspring": offspring,
        "food_total": food_total, "habitat": habitat, "bottom": bottom, "top": top,
        "meadow": meadow, "buried": buried, "shadow": shadow, "rock": rock, "drift": drift,
        "rooted": rooted,
    }
    for name, fact in FACTS.items():
        scope[name] = fact(scope)
    # Evidence as wordings: a template key and raw values; the interface phrases and formats them.
    proof = {
        "vision": {"key": "vision", "values": {"peak": peak, "directions": directions[S.LIGHT]}},
        "color": {"key": "color", "values": {"sight": list(sight)}},
        "nose": {"key": "nose", "values": {"cells": senses[S.ODOR], "threshold": thresholds[S.ODOR]}},
        "diet": {"key": "diet", "values": {"shares": list(shares)}},
        "motion": {"key": "motion",
                   "values": {"speed": BehaviorScale.SPEED * d[F.TRAVEL], "slow": d[F.PAUSES],
                              "cruising": BehaviorScale.CRUISING_SPEED}},
        "turn": {"key": "turn", "values": {"turn": BehaviorScale.TURN_DEGREES * d[F.TURN]}},
        "space": {"key": "space", "values": {"cells": d[F.RANGE]}},
        "bottom": {"key": "bottom", "values": {"bottom": bottom, "top": top}},
        "combat": {"key": "combat", "values": {"aggression": d[F.AGGRESSION], "defense": d[F.DEFENSE]}},
        "pulse": {"key": "pulse", "values": {"strokes": RateWindow.DISPLAY_STEPS * d[F.PULSES],
                                             "glide": d[F.GLIDES]}},
        "reproduction": {"key": "reproduction",
                         "values": {"eggs": RateWindow.DISPLAY_STEPS * d[F.SPAWN],
                                    "clouds": RateWindow.DISPLAY_STEPS * d[F.SPERM]}},
        "body": {"key": "body", "values": {
            "radius": radius, "mouth": mouth, "bite": bite, "aperture": 2 * aperture,
            **{key: body[key] for key in ("jaw_length", "gut_length", "blunt_teeth",
                                          "undulation") if key in body}}},
        "offspring": {"key": "offspring", "values": {"n": offspring}},
        "gametes": {"key": "gametes", "values": {"egg": egg, "sperm": sperm}},
        "suction": {"key": "suction", "values": {"suction": d[F.MOUTH]}},
    }
    for i in range(len(senses)):
        proof["sense" + str(i)] = (
            {"key": "sense", "values": {"sense": i, "threshold": thresholds[i], "early": early[i]}}
            if senses[i] > 0 else {"key": "senseAbsent", "values": {"sense": i}})
    for i, value in enumerate(scents):
        proof["scent" + str(i)] = {
            "key": "scent", "values": {"scent": i,
                                     "share": value / max(Tolerance.NEGLIGIBLE, sum(scents))}}
    proof["habitat"] = {"key": "habitat", "values": {
        "meadow": meadow, "buried": buried, "shadow": shadow, "rock": rock}}
    proof["plants"] = {"key": "plants", "values": {
        "algae": shares[K.ALGAE], "rooted": rooted, "drift": drift}}
    result = TraitContext(scope, d, observed, body, senses, ecology, proof)
    from trait_metrics import measure
    measure(result)
    return result

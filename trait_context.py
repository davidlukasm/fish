"""Measured inputs and evidence shared by species trait rules."""

from dataclasses import dataclass, field
from protocol_schema import BehaviorScale, BehaviorFeature as F, Sense as S, FoodKind as K, OdorKind as O


@dataclass(frozen=True)
class TraitContext:
    aperture: object
    barbels: object
    bite: object
    blind: object
    body: object
    bottom_dweller: object
    buried: object
    calibrated: object
    colorselective: object
    d: object
    diet_known: object
    directions: object
    drift: object
    early: object
    eco_known: object
    ecology: object
    egg: object
    egg_eater: object
    fine_nose: object
    hunter: object
    keen_eye: object
    late: object
    meadow: object
    mouth: object
    nose: object
    observed: object
    offspring: object
    peak: object
    preferred: object
    present: object
    proof: object
    radius: object
    rock: object
    rooted: object
    scavenger: object
    scents: object
    seeing: object
    senses: object
    sensitive: object
    shadow: object
    shares: object
    sharp_eye: object
    sight: object
    smell_sites: object
    span: object
    sperm: object
    surface_dweller: object
    thresholds: object
    variety: object
    values: dict = field(default_factory=dict)


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
    sight = array("vision", 3)
    peak = max(sight)
    seeing = peak >= 0.001
    blind = "vision" in body and (not seeing)
    colorselective = seeing and peak >= 0.1 and (min(sight) < 0.15 * peak)
    nose = senses[S.ODOR] >= 1
    fine_nose = calibrated and nose and (thresholds[S.ODOR] <= 0.03)
    keen_eye = (
        seeing and peak >= 0.5 and (directions[S.LIGHT] >= 8) and (thresholds[S.LIGHT] <= 0.06)
    )
    sharp_eye = seeing and peak >= 0.3 and (directions[S.LIGHT] >= 5)
    # A broad nose detects all scents. Preference requires an above-average tuning.
    preferred = [nose and value > 1.3 * sum(scents) / O.COUNT
                 and value >= 0.7 * max(scents) for value in scents]
    sensitive = [calibrated and senses[i] >= 1 and (early[i] >= 0.3) for i in range(S.COUNT)]
    present = [value >= 2 for value in senses]
    mouth, radius = (body.get("mouth", 0), body.get("radius", 4))
    bite, aperture = (body.get("bite", 0), body.get("aperture", 0))
    barbels, smell_sites = (body.get("barbels", 0), body.get("smell_sites", 0))
    egg, sperm = (body.get("egg_organs", 0), body.get("sperm_organs", 0))
    food_total = sum(diet)
    shares = (
        [0] * 11
        if food_total < 100
        else [(list(diet) + [0] * 11)[i] / food_total for i in range(S.COUNT)]
    )
    diet_known = food_total >= 100
    variety = sum((value >= 0.15 for value in shares))
    hunter, egg_eater, scavenger = (
        shares[K.FISH] >= 0.3,
        shares[K.EGG] >= 0.3,
        shares[K.CARRION] >= 0.3,
    )
    bottom_dweller, surface_dweller = (
        habitat >= 500 and bottom > 0.7,
        habitat >= 500 and top > 0.7,
    )
    # Evidence as wordings: a template key and raw values; the interface phrases and formats them.
    proof = {
        "vision": {"key": "vision", "values": {"peak": peak, "directions": directions[S.LIGHT]}},
        "color": {"key": "color", "values": {"sight": list(sight)}},
        "nose": {"key": "nose", "values": {"cells": senses[S.ODOR], "threshold": thresholds[S.ODOR]}},
        "diet": {"key": "diet", "values": {"shares": list(shares)}},
        "motion": {"key": "motion",
                   "values": {"speed": BehaviorScale.SPEED * d[F.TRAVEL], "slow": d[F.PAUSES]}},
        "turn": {"key": "turn", "values": {"turn": BehaviorScale.TURN_DEGREES * d[F.TURN]}},
        "space": {"key": "space", "values": {"cells": d[F.RANGE]}},
        "bottom": {"key": "bottom", "values": {"bottom": bottom, "top": top}},
        "combat": {"key": "combat", "values": {"aggression": d[F.AGGRESSION], "defense": d[F.DEFENSE]}},
        "pulse": {"key": "pulse", "values": {"strokes": 100 * d[F.PULSES], "glide": d[F.GLIDES]}},
        "reproduction": {"key": "reproduction",
                         "values": {"eggs": 100 * d[F.SPAWN], "clouds": 100 * d[F.SPERM]}},
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
            "key": "scent", "values": {"scent": i, "share": value / max(1e-09, sum(scents))}}
    eco_known = ecology.get("samples", 0) >= 500
    meadow, buried, shadow = (ecology.get(k, 0) for k in ("grass", "buried", "shadow"))
    rock = ecology.get("surface", 0)
    drift = min(shares[K.PLANT], ecology.get("drift_grass", 0) / max(1, food_total))
    rooted = max(0, shares[K.PLANT] - drift)
    proof["habitat"] = {"key": "habitat", "values": {
        "meadow": meadow, "buried": buried, "shadow": shadow, "rock": rock}}
    proof["plants"] = {"key": "plants", "values": {
        "algae": shares[K.ALGAE], "rooted": rooted, "drift": drift}}
    result = TraitContext(
        aperture=aperture,
        barbels=barbels,
        bite=bite,
        blind=blind,
        body=body,
        bottom_dweller=bottom_dweller,
        buried=buried,
        calibrated=calibrated,
        colorselective=colorselective,
        d=d,
        diet_known=diet_known,
        directions=directions,
        drift=drift,
        early=early,
        eco_known=eco_known,
        ecology=ecology,
        egg=egg,
        egg_eater=egg_eater,
        fine_nose=fine_nose,
        hunter=hunter,
        keen_eye=keen_eye,
        late=late,
        meadow=meadow,
        mouth=mouth,
        nose=nose,
        observed=observed,
        offspring=offspring,
        peak=peak,
        preferred=preferred,
        present=present,
        proof=proof,
        radius=radius,
        rock=rock,
        rooted=rooted,
        scavenger=scavenger,
        scents=scents,
        seeing=seeing,
        senses=senses,
        sensitive=sensitive,
        shadow=shadow,
        shares=shares,
        sharp_eye=sharp_eye,
        sight=sight,
        smell_sites=smell_sites,
        span=span,
        sperm=sperm,
        surface_dweller=surface_dweller,
        thresholds=thresholds,
        variety=variety,
    )
    from trait_metrics import measure
    measure(result)
    return result

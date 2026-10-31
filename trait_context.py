"""Measured inputs and evidence shared by species trait rules."""

from dataclasses import dataclass, field
from protocol_schema import BehaviorScale


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
    observed = len(profile) >= 26
    d = (list(profile) + [0] * 26)[:26] if observed else [0] * 26
    def array(key, count=11, default=0):
        return (list(body.get(key, [])) + [default] * count)[:count]

    senses = array("senses")
    thresholds = array("thresholds", default=1)
    early, late = array("early"), array("late")
    span, directions = array("span"), array("directions")
    scents = (list(body.get("scents", [])) + [0] * 8)[:8]
    calibrated = "thresholds" in body
    sight = array("vision", 3)
    peak = max(sight)
    seeing = peak >= 0.001
    blind = "vision" in body and (not seeing)
    colorselective = seeing and peak >= 0.1 and (min(sight) < 0.15 * peak)
    nose = senses[1] >= 1
    fine_nose = calibrated and nose and (thresholds[1] <= 0.03)
    keen_eye = (
        seeing and peak >= 0.5 and (directions[0] >= 8) and (thresholds[0] <= 0.06)
    )
    sharp_eye = seeing and peak >= 0.3 and (directions[0] >= 5)
    # A broad nose detects all scents. Preference requires an above-average tuning.
    preferred = [nose and value > 1.3 * sum(scents) / 8
                 and value >= 0.7 * max(scents) for value in scents]
    sensitive = [calibrated and senses[i] >= 1 and (early[i] >= 0.3) for i in range(11)]
    present = [value >= 2 for value in senses]
    mouth, radius = (body.get("mouth", 0), body.get("radius", 4))
    bite, aperture = (body.get("bite", 0), body.get("aperture", 0))
    barbels, smell_sites = (body.get("barbels", 0), body.get("smell_sites", 0))
    egg, sperm = (body.get("egg_organs", 0), body.get("sperm_organs", 0))
    food_total = sum(diet)
    shares = (
        [0] * 11
        if food_total < 100
        else [(list(diet) + [0] * 11)[i] / food_total for i in range(11)]
    )
    diet_known = food_total >= 100
    variety = sum((value >= 0.15 for value in shares))
    hunter, egg_eater, scavenger = (
        shares[1] >= 0.3,
        shares[2] >= 0.3,
        shares[3] >= 0.3,
    )
    bottom_dweller, surface_dweller = (
        habitat >= 500 and bottom > 0.7,
        habitat >= 500 and top > 0.7,
    )
    percent = lambda value: str(round(100 * value)) + " %"
    number = lambda value: format(value, ".2f").replace(".", ",")
    sense_names = (
        "Sehen",
        "Geruch",
        "Anströmung",
        "Berührung",
        "Energie",
        "Nahrungsfluss",
        "Verletzung",
        "Tiefe",
        "Dehnung",
        "Schmerz",
        "Hormone",
    )
    proof = {
        "vision": "Sehfeld "
        + percent(peak)
        + " · "
        + number(directions[0])
        + " Blickrichtungen",
        "color": "Sehfeld Rot / Grün / Blau: "
        + " / ".join((percent(value) for value in sight)),
        "nose": "Wirksame Riechzellen "
        + number(senses[1])
        + " · Reizschwelle "
        + number(thresholds[1]),
        "diet": "Verwertbare Aufnahme · Futter / Fisch / Ei / Aas / Algen / Pflanzen / Plankton / Würmer / Krabben / Muscheln / Bodennahrung: "
        + " / ".join((percent(value) for value in shares)),
        "motion": "Tempo relativ zum Wasser " + number(BehaviorScale.SPEED * d[0])
        + " px/Schritt · unter 0,75 px/Schritt " + percent(d[2]),
        "turn": "Mittlere absolute Drehung " + number(BehaviorScale.TURN_DEGREES * d[1]) + "°/Schritt",
        "space": "Besuchte Rasterfelder im Beobachtungsfenster " + percent(d[3]),
        "bottom": "Unten " + percent(bottom) + " · oben " + percent(top),
        "combat": "Mittlere Aggressionsaktivität "
        + percent(d[15])
        + " · Abwehr "
        + percent(d[16]),
        "pulse": "Vortrieb "
        + number(100 * d[4])
        + " Schläge / 100 Schritte · Gleiten "
        + percent(d[5]),
        "reproduction": number(100 * d[12])
        + " Eier · "
        + number(100 * d[13])
        + " Wolken / 100 Schritte",
        "body": "Radius "
        + number(radius)
        + " px · Saugkraft "
        + number(mouth)
        + " · Bisskraft "
        + number(bite)
        + " · Maulbreite "
        + number(2 * aperture)
        + " px",
        "offspring": str(offspring) + " geschlüpfte Nachkommen",
        "gametes": "Ei-Organe " + percent(egg) + " · Spermienorgane " + percent(sperm),
        "suction": "Mittleres Saugsignal " + percent(d[14]),
    }
    proof["body"] += " · " + " · ".join(name + " " + percent(body[key]) for key, name in
        (("jaw_length", "Kieferlänge"), ("gut_length", "Darmlänge"), ("blunt_teeth", "Stumpfe Zähne"), ("undulation", "Schlängeln")) if key in body)
    for i, name in enumerate(sense_names):
        proof["sense" + str(i)] = name + (
            ": Reiz für halbe Antwort "
            + number(thresholds[i])
            + " · niedrig eingestellte Schwellen "
            + percent(early[i])
            if senses[i] > 0
            else ": keine Sinneszellen"
        )
    for i, name in enumerate(
        ("Futter", "Algen", "Gras", "Würmer", "Krebstiere", "Aas", "Eier", "Sperma")
    ):
        proof["scent" + str(i)] = (
            name
            + ": "
            + percent(scents[i] / max(1e-09, sum(scents)))
            + " der Duftempfindlichkeit"
        )
    eco_known = ecology.get("samples", 0) >= 500
    meadow, buried, shadow = (ecology.get(k, 0) for k in ("grass", "buried", "shadow"))
    rock = ecology.get("surface", 0)
    drift = min(shares[5], ecology.get("drift_grass", 0) / max(1, food_total))
    rooted = max(0, shares[5] - drift)
    proof["habitat"] = (
        "Im Gras "
        + percent(meadow)
        + " · im Sediment "
        + percent(buried)
        + " · im Schatten "
        + percent(shadow)
        + " · an Flächen "
        + percent(rock)
    )
    proof["plants"] = (
        "Algen "
        + percent(shares[4])
        + " · verwurzelte Blattpflanzen "
        + percent(rooted)
        + " · treibende Pflanzen "
        + percent(drift)
    )
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

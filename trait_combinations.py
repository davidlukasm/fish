"""Named combinations of independently evidenced anatomy and behaviour."""

from dataclasses import dataclass
from trait_rule import TraitRule


@dataclass(frozen=True)
class Part:
    test: object
    note: str
    evidence: str
    basis: str = "anatomy"


eye = Part(lambda c: c.sharp_eye,
    "mindestens fünf Blickachsen und breite Sehfeldabdeckung", "vision")
nose = Part(lambda c: c.fine_nose,
    "empfindliche Riechzellen", "nose")
lateral = Part(lambda c: c.sensitive[2],
    "viele niedrig eingestellte Seitenlinienzellen", "sense2")
touch = Part(lambda c: c.sensitive[3],
    "viele niedrig eingestellte Berührungszellen", "sense3")
food = Part(lambda c: c.diet_known and c.shares[0] >= .8,
    "mindestens 80 % Futterkost", "diet", "behavior")
prey = Part(lambda c: c.hunter,
    "mindestens 30 % Nahrung aus lebenden Fischen", "diet", "behavior")
eggs = Part(lambda c: c.egg_eater,
    "mindestens 30 % Eierkost", "diet", "behavior")
carrion = Part(lambda c: c.scavenger,
    "mindestens 30 % Aaskost", "diet", "behavior")
algae = Part(lambda c: c.diet_known and c.shares[4] >= .3,
    "mindestens 30 % Algenkost", "diet", "behavior")
drift = Part(lambda c: c.diet_known and c.drift >= .3,
    "mindestens 30 % Nahrung aus treibenden Pflanzen", "plants", "behavior")
bottom = Part(lambda c: c.bottom_dweller,
    "über 70 % Aufenthalt im unteren Fünftel", "bottom", "behavior")
meadow = Part(lambda c: c.eco_known and c.meadow >= .65,
    "mindestens 65 % Aufenthalt im Bewuchs", "habitat", "behavior")
buried = Part(lambda c: c.eco_known and c.buried >= .5,
    "mindestens 50 % der Zeit überwiegend eingegraben", "habitat", "behavior")
shadow = Part(lambda c: c.eco_known and c.shadow >= .65,
    "mindestens 65 % der Zeit unter 20 % Licht", "habitat", "behavior")
light = Part(lambda c: c.eco_known and c.ecology.get("light", 0) >= .75,
    "mittleres Umgebungslicht mindestens 75 %", "habitat_light", "behavior")
rock = Part(lambda c: c.eco_known and c.rock >= .8,
    "mindestens 80 % Aufenthalt an festen Flächen", "habitat", "behavior")
open_water = Part(lambda c: c.eco_known and c.rock < .15
         and c.meadow < .15 and c.buried < .05,
    "selten an Flächen, im Bewuchs oder im Sediment", "habitat", "behavior")
glide = Part(lambda c: c.observed and c.d[5] >= .65,
    "mindestens 65 % Gleiten ohne Vortriebsschlag", "pulse", "behavior")
local = Part(lambda c: c.observed and c.d[3] < .08 and c.d[0] > .01,
    "bewegt sich in weniger als 8 % der Rasterfelder", "space+motion", "behavior")
roam = Part(lambda c: c.observed and c.d[3] >= .45,
    "besucht mindestens 45 % der Rasterfelder im Beobachtungsfenster", "space", "behavior")
small = Part(lambda c: "radius" in c.body and c.radius < 5,
    "Körperradius unter 5 px", "body")
large = Part(lambda c: "radius" in c.body and c.radius >= 10,
    "Körperradius mindestens 10 px", "body")
mouth = Part(lambda c: c.radius > 0 and c.aperture >= .55 * c.radius,
    "Maulbreite mindestens 55 % des Körperdurchmessers", "body")
jaw = Part(lambda c: c.bite >= 12,
    "Bisskraft mindestens 12", "body")
suction = Part(lambda c: c.mouth >= 20,
    "Saugkraft mindestens 20", "body")
defense = Part(lambda c: c.observed and c.d[16] >= .3,
    "hohe mittlere Abwehraktivität", "combat", "behavior")
plankton = Part(lambda c: c.diet_known and c.shares[6] >= .3,
    "mindestens 30 % verwertbare Aufnahme aus Plankton", "diet", "behavior")
worms = Part(lambda c: c.diet_known and c.shares[7] >= .3,
    "mindestens 30 % verwertbare Aufnahme aus Würmern", "diet", "behavior")
shells = Part(lambda c: c.diet_known and sum(c.shares[8:10]) >= .3,
    "mindestens 30 % verwertbare Aufnahme aus Krabben oder Muscheln", "diet", "behavior")
mulm = Part(lambda c: c.diet_known and c.shares[10] >= .3,
    "mindestens 30 % verwertbare Aufnahme aus Bodennahrung", "diet", "behavior")
plants = Part(lambda c: c.diet_known and sum(c.shares[4:6]) >= .4,
    "mindestens 40 % verwertbare Aufnahme aus Pflanzen", "plants", "behavior")
long_gut = Part(lambda c: c.body.get("gut_length", 0) >= .7,
    "Darmlänge mindestens 70 %", "body")
short_gut = Part(lambda c: "gut_length" in c.body and c.body["gut_length"] <= .3,
    "Darmlänge höchstens 30 %", "body")
blunt = Part(lambda c: c.body.get("blunt_teeth", 0) >= .65,
    "mindestens 65 % stumpfer Zahnanteil", "body")
sharp = Part(lambda c: "blunt_teeth" in c.body and c.body["blunt_teeth"] <= .25,
    "höchstens 25 % stumpfer Zahnanteil", "body")
snake = Part(lambda c: c.body.get("undulation", 0) >= .7,
    "Schlängelanteil mindestens 70 %", "body")
fast = Part(lambda c: c.observed and c.d[0] >= .45,
    "schnelle mittlere Eigenbewegung", "motion", "behavior")
varied = Part(lambda c: c.diet_known and c.variety >= 4,
    "mindestens vier Nahrungsquellen tragen nennenswert bei", "diet", "behavior")

RULES = []


def combine(name, parts, facet, priority=26):
    assert len(parts) >= 2
    evidence = "+".join(dict.fromkeys(key for p in parts for key in p.evidence.split("+")))
    note = "; ".join(p.note for p in parts)
    RULES.append(TraitRule(name, "Kombination", lambda c, p=parts: all(x.test(c) for x in p),
                           note[0].upper() + note[1:] + ".", evidence, priority, facet,
                           next(iter({p.basis for p in parts}))
                           if len({p.basis for p in parts}) == 1 else "mixed"))


COMBINATIONS = (
    ("Patrouilleur", (meadow, roam, defense), "movement"),
    ("Gschrapp", (small, meadow, nose), "habitat-senses"),
    ("Entdecker", (open_water, eye, nose, roam), "movement"),
    ("Wachposten", (local, lateral, touch, eye), "perception"),
    ("Stammgast", (meadow, local, food), "foraging"),
    ("Bollwerk", (bottom, touch, defense), "defense"),
    ("Witterer", (glide, nose), "habitat-senses"),
    ("Kreuzer", (glide, roam, eye), "movement"),
    ("Flaneur", (light, open_water, glide), "movement"),
    ("Tachinierer", (glide, local, open_water), "movement"),
    ("Schweber", (glide, small, open_water), "movement"),
    ("Vagabund", (roam, open_water), "movement"),
    ("Floh", (small, fast), "movement"),
    ("Sprinter", (fast, eye), "movement"),
    ("Kriecher", (bottom, touch, local), "movement"),
    ("Einsiedler", (shadow, local), "habitat-senses"),
    ("lichtscheu", (shadow, bottom), "habitat-senses"),
    ("Lauscher", (lateral, local), "perception"),
    ("Klotz", (large, local), "movement"),
)
for name, parts, facet in COMBINATIONS:
    combine(name, parts, facet, 12)

for name, parts, facet in (
    ("Knacker", (jaw, blunt, shells), "foraging"),
    ("Schaber", (jaw, blunt, algae, rock), "foraging"),
    ("Reißer", (jaw, sharp, prey), "foraging"),
    ("Weider", (long_gut, plants), "foraging"),
    ("Sieber", (suction, plankton), "foraging"),
    ("Schlürfer", (suction, mulm), "foraging"),
    ("Rosinenpicker", (small, sharp, worms), "foraging"),
    ("Stöberer", (nose, touch, worms), "foraging"),
    ("Schlinger", (mouth, short_gut, prey), "foraging"),
    ("Knabberer", (small, blunt, plants), "foraging"),
    ("Verwerter", (long_gut, drift, carrion), "foraging"),
    ("Fechter", (jaw, defense, touch), "defense"),
    ("Raspler", (blunt, algae), "foraging"),
    ("Mäher", (blunt, plants, meadow, roam), "foraging"),
    ("Zupfer", (small, plants, meadow), "foraging"),
    ("Strudler", (suction, plankton, glide), "foraging"),
    ("Wühlmaus", (buried, worms), "foraging"),
    ("Schaufler", (buried, jaw), "foraging"),
    ("Pirscher", (meadow, prey, eye), "foraging"),
    ("Hetzer", (fast, prey, roam), "foraging"),
    ("Schlemmer", (varied, mouth), "foraging"),
    ("Herumtreiber", (varied, roam), "foraging"),
    ("Gfrast", (jaw, defense, roam), "defense"),
    ("Haudegen", (large, defense, jaw), "defense"),
):
    combine(name, parts, facet, 18)

RULES = tuple(RULES)

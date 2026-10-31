"""Named combinations of independently evidenced anatomy and behaviour."""

from dataclasses import dataclass
from trait_rule import TraitRule


@dataclass(frozen=True)
class Part:
    key: str
    test: object
    evidence: str
    basis: str = "anatomy"


eye = Part("eye", lambda c: c.sharp_eye,
    "vision")
nose = Part("nose", lambda c: c.fine_nose,
    "nose")
lateral = Part("lateral", lambda c: c.sensitive[2],
    "sense2")
touch = Part("touch", lambda c: c.sensitive[3],
    "sense3")
food = Part("food", lambda c: c.diet_known and c.shares[0] >= .8,
    "diet", "behavior")
prey = Part("prey", lambda c: c.hunter,
    "diet", "behavior")
eggs = Part("eggs", lambda c: c.egg_eater,
    "diet", "behavior")
carrion = Part("carrion", lambda c: c.scavenger,
    "diet", "behavior")
algae = Part("algae", lambda c: c.diet_known and c.shares[4] >= .3,
    "diet", "behavior")
drift = Part("drift", lambda c: c.diet_known and c.drift >= .3,
    "plants", "behavior")
bottom = Part("bottom", lambda c: c.bottom_dweller,
    "bottom", "behavior")
meadow = Part("meadow", lambda c: c.eco_known and c.meadow >= .65,
    "habitat", "behavior")
buried = Part("buried", lambda c: c.eco_known and c.buried >= .5,
    "habitat", "behavior")
shadow = Part("shadow", lambda c: c.eco_known and c.shadow >= .65,
    "habitat", "behavior")
light = Part("light", lambda c: c.eco_known and c.ecology.get("light", 0) >= .75,
    "habitat_light", "behavior")
rock = Part("rock", lambda c: c.eco_known and c.rock >= .8,
    "habitat", "behavior")
open_water = Part("open_water", lambda c: c.eco_known and c.rock < .15
         and c.meadow < .15 and c.buried < .05,
    "habitat", "behavior")
glide = Part("glide", lambda c: c.observed and c.d[5] >= .65,
    "pulse", "behavior")
local = Part("local", lambda c: c.observed and c.d[3] < .08 and c.d[0] > .01,
    "space+motion", "behavior")
roam = Part("roam", lambda c: c.observed and c.d[3] >= .45,
    "space", "behavior")
small = Part("small", lambda c: "radius" in c.body and c.radius < 5,
    "body")
large = Part("large", lambda c: "radius" in c.body and c.radius >= 10,
    "body")
mouth = Part("mouth", lambda c: c.radius > 0 and c.aperture >= .55 * c.radius,
    "body")
jaw = Part("jaw", lambda c: c.bite >= 12,
    "body")
suction = Part("suction", lambda c: c.mouth >= 20,
    "body")
defense = Part("defense", lambda c: c.observed and c.d[16] >= .3,
    "combat", "behavior")
plankton = Part("plankton", lambda c: c.diet_known and c.shares[6] >= .3,
    "diet", "behavior")
worms = Part("worms", lambda c: c.diet_known and c.shares[7] >= .3,
    "diet", "behavior")
shells = Part("shells", lambda c: c.diet_known and sum(c.shares[8:10]) >= .3,
    "diet", "behavior")
mulm = Part("mulm", lambda c: c.diet_known and c.shares[10] >= .3,
    "diet", "behavior")
plants = Part("plants", lambda c: c.diet_known and sum(c.shares[4:6]) >= .4,
    "plants", "behavior")
long_gut = Part("long_gut", lambda c: c.body.get("gut_length", 0) >= .7,
    "body")
short_gut = Part("short_gut", lambda c: "gut_length" in c.body and c.body["gut_length"] <= .3,
    "body")
blunt = Part("blunt", lambda c: c.body.get("blunt_teeth", 0) >= .65,
    "body")
sharp = Part("sharp", lambda c: "blunt_teeth" in c.body and c.body["blunt_teeth"] <= .25,
    "body")
snake = Part("snake", lambda c: c.body.get("undulation", 0) >= .7,
    "body")
fast = Part("fast", lambda c: c.observed and c.d[0] >= .45,
    "motion", "behavior")
varied = Part("varied", lambda c: c.diet_known and c.variety >= 4,
    "diet", "behavior")

RULES = []


def combine(name, parts, facet, priority=26):
    assert len(parts) >= 2
    evidence = "+".join(dict.fromkeys(key for p in parts for key in p.evidence.split("+")))
    RULES.append(TraitRule(name, "Kombination", lambda c, p=parts: all(x.test(c) for x in p),
                           evidence, priority, facet,
                           next(iter({p.basis for p in parts}))
                           if len({p.basis for p in parts}) == 1 else "mixed",
                           {"key": "parts", "values": {"parts": [p.key for p in parts]}}))


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

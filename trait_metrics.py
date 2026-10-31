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
        if name is None or " " in name:
            continue
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


def sense_value(c, key, i, present=False):
    values = c.body.get(key, ())
    return (values[i] if len(values) > i and (not present or c.senses[i] > .001)
            else None)


SENSES = (
    ("Sehen", "Sehzellen", "Augen"),
    ("Riechen", "Riechzellen", "Riechorgan"),
    ("Strömung", "Seitenlinienzellen", "Seitenlinie"),
    ("Berührung", "Berührungszellen", "Tastsinn"),
    ("Nähe", "Nähezellen", "Nähesinn"),
    ("Nahrungsfluss", "Nahrungsflusszellen", "Nahrungsflusssinn"),
    ("Verletzung", "Verletzungszellen", "Verletzungssinn"),
    ("Orientierung", "Tiefenzellen", "Tiefensinn"),
    ("Gonadendruck", "Gonadenfühler", "Gonadendruck"),
    ("Innendruck", "Innendruckzellen", "Innendruck"),
    ("Blut", "Blutfühler", "Blutsinn"),
)
COUNT_NAMES = (
    (None, None, None, None, None),
    ("ohne Geruchssinn", None, "kleines Riechorgan", None, None),
    ("ohne Seitenlinie", "spärliche Seitenlinie", "kleine Seitenlinie", "ausgebaute Seitenlinie", "dichte Seitenlinie"),
    ("ohne Tastsinn", None, "kleiner Tastapparat", None, "dicht betastet"),
    (None, None, None, "nahsichtig", None),
    ("ohne Nahrungsflusssinn", "wenige Zuflussfühler", "kleiner Zuflussfühler", "viele Zuflussfühler", None),
    ("ohne Verletzungssinn", "wenige Wundfühler", "kleiner Wundfühler", "viele Wundfühler", None),
    ("ohne Tiefensinn", "wenige Tiefenfühler", "kleiner Tiefenfühler", "viele Tiefenfühler", None),
    ("ohne Dehnungssinn", "wenige Füllungsfühler", "kleiner Füllungsfühler", "viele Füllungsfühler", None),
    (None, None, None, None, None),
    (None, None, None, None, None),
)
for i, (group, cells, organ) in enumerate(SENSES):
    bands(f"cells{i}", group, lambda c, i=i: sense_value(c, "senses", i),
          (.001, 2, 8, 24), COUNT_NAMES[i])
    bands(f"threshold{i}", group, lambda c, i=i: sense_value(c, "thresholds", i, True),
          (.001, .003, .01, .03) if i < 2 else (.1, .3, .6, .85),
          tuple(organ + " " + suffix for suffix in
                ("hochempfindlich", "fein abgestimmt", "mäßig empfindlich",
                 "robust abgestimmt", "schwer erregbar")))
    bands(f"span{i}", group, lambda c, i=i: sense_value(c, "span", i, True),
          (.005, .02, .05) if i < 2 else (.1, .3, .6),
          tuple(organ + " " + suffix for suffix in
                ("eng gestuft", "leicht gestuft", "breit gestuft", "weit gestuft")))
    bands(f"dominance{i}", group, lambda c, i=i: c.senses[i] / sum(c.senses)
          if len(c.body.get("senses", ())) > i and sum(c.senses) > 0 else None,
          (.5,), (None, organ + (" dominieren" if i == 0 else " dominiert")))
    bands(f"early_fraction{i}", group, lambda c, i=i: sense_value(c, "early", i, True), (.1, .4, .75),
          tuple(organ + " " + suffix for suffix in
                ("selten früh meldend", "teils früh meldend", "oft früh meldend", "meist früh meldend")))

for i, group, noun in ((0, "Sehen", "Blick"), (2, "Strömung", "Strömungsblick"),
                       (3, "Berührung", "Tastblick")):
    bands(f"directions{i}", group, lambda c, i=i: sense_value(c, "directions", i, True), (3, 6, 12),
          (noun + " gebündelt", noun + " aufgefächert", noun + " vielwinklig",
           noun + " fein aufgefächert"), start=1)

SCENTS = ("Futter", "Algen", "Gras", "Würmer", "Krebstiere", "Aas", "Eier", "Sperma")
for i, scent in enumerate(SCENTS):
    bands(f"scent_share{i}", "Riechen", lambda c, i=i: c.scents[i] / sum(c.scents)
          if c.nose and "scents" in c.body and sum(c.scents) > 0 else None,
          (.02, .10, .25),
          tuple(scent + " " + suffix for suffix in
                ("kaum riechend", "mitriechend", "gut riechend", "bevorzugt riechend")))
    bands(f"scent_threshold{i}", "Riechen", lambda c, i=i: c.body["scent_thresholds"][i]
          if c.nose and len(c.body.get("scent_thresholds", ())) > i and c.scents[i] > .001 else None,
          (.003, .02, .1),
          tuple(scent + " " + suffix for suffix in
                ("früh witternd", "fein witternd", "mäßig witternd", "erst stark witternd")))

for i, color in enumerate(("Rot", "Grün", "Blau")):
    bands(f"coverage{i}", "Sehen", lambda c, i=i: c.sight[i] if c.seeing else None,
          (.05, .25, .6),
          tuple(color + " " + suffix for suffix in
                ("kaum erfassend", "schmal erfassend", "breit erfassend", "großflächig erfassend")))

for i, organ in enumerate(("Darm", "Ei", "Spermien")):
    bands(f"filling{i}", "Dehnung", lambda c, i=i: c.body["fillings"][i]
          if len(c.body.get("fillings", ())) > i else None,
          (.001, 2, 8),
          (organ + " ohne Füllungsfühler", organ + " schwach erfühlt",
           organ + " gut erfühlt", organ + " dicht erfühlt"))

BODY_BANDS = (
    ("jaw_length", "Kieferlänge", (.2, .5, .8), ("Kurzkiefer", "kompakter Kiefer", "langer Kiefer", "Langkiefer"), ""),
    ("gut_length", "Darmlänge", (.2, .5, .8), ("Kurzdarm", "kompakter Darm", "langer Darm", "Langdarm"),
     ""),
    ("blunt_teeth", "Stumpfer Zahnanteil", (.2, .5, .8), ("Spitzzahn", "überwiegend spitz bezahnt", "überwiegend stumpf bezahnt", "Mahlgebiss"), ""),
    ("undulation", "Schlängelanteil", (.2, .5, .8), ("schwanzbetont", "leicht schlängelnd", "stark schlängelnd", "schlängelnd"), ""),
    ("mass", "Körpermasse", (.5, 1.5, 4), ("Federgewicht", "Leichtgewicht", "Mittelgewicht", "Schwergewicht"), ""),
    ("radius", "Körperradius", (4, 6, 10), (None, None, None, None), "px"),
    ("mouth", "Saugkraft", (2, 8, 20), (None, "sanfter Sauger", "kräftiger Sauger", None), ""),
    ("bite", "Bisskraft", (2, 6, 12), ("weicher Biss", "leichter Biss", "fester Biss", "harter Biss"), ""),
    ("aperture", "Maulhalbbreite", (1, 2, 4), ("enges Maul", "kleines Maul", "weites Maul", "riesiges Maul"), "px"),
    ("propulsion", "Anatomische Vortriebskapazität", (2, 8, 24), (None, "kleiner Antrieb", "starker Antrieb", "Kraftpaket"), ""),
    ("armor", "Abwehrkapazität", (1, 4, 12), ("zarte Abwehr", "leichte Abwehr", "kräftige Abwehr", "gerüstet"), ""),
    ("internal", "Wirksame innere Neuronen", (16, 64, 160), ("kleines Nervennetz", "kompaktes Nervennetz", "großes Nervennetz", "ausgedehntes Nervennetz"), "Zellanteile"),
    ("barbels", "Äußere Riechanteile mit Berührungsanteil im Bauplan", (.001, 2, 8), (None, "wenige Barteln", "mehrere Barteln", "Bartelkranz"), "Zellanteile"),
    ("smell_sites", "Besetzte Riechseiten", (.001, 1.25, 1.75), ("ohne Riechstelle", "einseitig riechend", "teilweise beidseitig riechend", "beidseitig riechend"), ""),
    ("egg_organs", "Anteil mit Ei-Organ", (.001, .5, .9), ("ohne Ei-Organ", "seltenes Ei-Organ", "verbreitetes Ei-Organ", "durchgängig Ei-Organ"), ""),
    ("sperm_organs", "Anteil mit Spermienorgan", (.001, .5, .9), ("ohne Spermienorgan", "seltenes Spermienorgan", "verbreitetes Spermienorgan", "durchgängig Spermienorgan"), ""),
    ("hermaphrodites", "Anteil mit beiden Fortpflanzungsorganen", (.001, .5, .9), ("getrennte Organausstattung", "vereinzelt zwittrig", "mehrheitlich zwittrig", "durchgängig zwittrig"), ""),
)
for key, title, cuts, names, unit in BODY_BANDS:
    group = ("Nervensystem" if key == "internal" else "Fortpflanzung"
             if key in ("egg_organs", "sperm_organs", "hermaphrodites") else "Körper")
    bands("body_" + key, group, lambda c, k=key: c.body.get(k),
          cuts, names)

for key, title, a, b, cuts, names in (
    ("mouth_ratio", "Maulhalbbreite relativ zum Körperradius", "aperture", "radius",
     (.36, .5, .63), ("spitzmäulig", "schmalmäulig", "breitmäulig", "weitmäulig")),
    ("drive_ratio", "Vortriebskapazität je Körpermasse", "propulsion", "mass",
     (2, 8, 24), ("schubarm gebaut", "gemächlich gebaut", "antriebsbetont", "muskelbetont")),
    ("head_ratio", "Vorderes Nervengewebe relativ zum Nervenstrang", "head", "cord",
     (.5, 1, 2), ("strangbetont", "strangnah gewichtet", "kopfbetont", "stark kopfbetont")),
):
    bands(key, "Körper", lambda c, a=a, b=b: body_ratio(c, a, b), cuts, names)

bands("sense_total", "Körper", lambda c: sum(c.senses) if "senses" in c.body else None, (8, 32, 96),
      ("spärlich sensorisch", "mäßig sensorisch", "reich sensorisch", None))
bands("sense_variety", "Körper", lambda c: sum(c.present) if "senses" in c.body else None, (2, 5, 8),
      ("wenige Sinnesarten", "mehrere Sinnesarten", "vielseitig ausgestattet", "breit ausgestattet"))
bands("internal_share", "Nervensystem", lambda c: c.body["internal"] / (c.body["internal"] + sum(c.senses))
      if "internal" in c.body and "senses" in c.body
      and c.body["internal"] + sum(c.senses) > 0 else None, (.25, .5, .75),
      ("rezeptorbetont", "sinnesbetontes Nervennetz", "innenbetontes Nervennetz", "stark innenbetont"))
bands("scent_variety", "Riechen", lambda c: sum(v >= .2 * max(c.scents) for v in c.scents)
      if c.nose and max(c.scents) > 0 else None, (2, 4, 6),
      ("dufteng abgestimmt", "wenige Düfte erfassend", "mehrere Düfte erfassend", "duftbreit abgestimmt"))

BEHAVIOR_BANDS = (
    (0, "Eigentempo", (.05, .2, .45), ("träge", "gemächliches Tempo", "flottes Tempo", "rasant")),
    (1, "Drehbewegung", (.01, .05, .15), ("geradlinig", "sanft wendend", "kräftig wendend", "heftig wendend")),
    (2, "Anteil unter 0,75 px/Schritt relativ zum Wasser", (.1, .4, .75), ("selten langsam", "gelegentlich langsam", "oft langsam", "überwiegend langsam")),
    (3, "Besuchte Rasterfelder im Beobachtungsfenster", (.08, .25, .5), ("platztreu", "lokal unterwegs", "weit unterwegs", "großräumig unterwegs")),
    (4, "Anteil der Schritte mit Vortriebsschlag", (.005, .02, .05), ("schlagarm", "gelegentlich schlagend", "regelmäßig schlagend", "schlagfreudig")),
    (5, "Anteil Gleiten ohne Vortriebsschlag", (.1, .4, .75), ("selten gleitend", "zeitweise gleitend", "häufig gleitend", "Dauergleiter")),
    (12, "Gelegte Eier je Schritt", (.0005, .002, .008), ("selten laichend", "gelegentlich laichend", "regelmäßig laichend", "laichfreudig")),
    (13, "Abgegebene Spermienwolken je Schritt", (.0005, .002, .008), ("Sperma selten abgebend", "Sperma gelegentlich abgebend", "Sperma regelmäßig abgebend", "sprühend")),
    (14, "Mittleres Saugsignal", (.005, .03, .1), ("saugzurückhaltend", "gelegentlich saugend", "saugfreudig", "Dauersauger")),
    (15, "Mittlere Aggressionsaktivität", (.005, .03, .15), (None, "gelegentlich angreifend", "angriffsfreudig", "aggressiv")),
    (16, "Mittlere Abwehraktivität", (.05, .2, .5), ("offen schwimmend", "gelegentlich abschirmend", "häufig abschirmend", "abschirmend")),
)
for i, title, cuts, names in BEHAVIOR_BANDS:
    scale, unit = ((BehaviorScale.SPEED, "px/Schritt") if i == 0 else
                   (BehaviorScale.TURN_DEGREES, "°/Schritt") if i == 1 else (1, ""))
    bands("behavior" + str(i), "Fortpflanzung" if i in (12, 13) else
          "Kampf" if i in (15, 16) else "Nahrung" if i == 14 else "Bewegung",
          lambda c, i=i, scale=scale: scale * c.d[i] if c.observed else None,
          tuple(v * scale for v in cuts), names, "behavior")

for key, title, names in (
    ("grass", "Zeitanteil zwischen Blattpflanzen", ("kaum im Bewuchs", None, None, None)),
    ("buried", "Zeitanteil überwiegend im Sediment", ("kaum eingegraben", "gelegentlich eingegraben", "oft eingegraben", "Dauergräber")),
    ("shadow", "Zeitanteil unter 20 % Licht", ("selten im Schatten", None, None, None)),
    ("surface", "Zeitanteil an festen Flächen", (None, None, None, None)),
):
    bands("habitat_" + key, "Lebensraum", lambda c, k=key: c.ecology[k] if c.eco_known and k in c.ecology else None,
          (.1, .35, .7), names, basis="behavior")
bands("water_clarity", "Lebensraum", lambda c: c.d[24] if c.observed else None, (.05, .2),
      ("Klarwasser", None, "Trübwasser"), basis="behavior")
bands("water_flow", "Lebensraum", lambda c: c.d[25] if c.observed else None, (.05, .2, .5),
      ("Stillwasser", None, None, "Strömung"), basis="behavior")
bands("habitat_light", "Lebensraum", lambda c: c.ecology.get("light") if c.eco_known else None, (.2, .45, .7),
      ("dunkel lebend", "dämmerig lebend", "mäßig hell lebend", "hell lebend"), basis="behavior")
for i, region, names in (
    (10, "unteren Fünftel", ("selten unten", None, None, None)),
    (11, "oberen Fünftel", ("selten oben", None, None, None)),
):
    bands("depth_time" + str(i), "Lebensraum", lambda c, i=i: c.d[i] if c.observed else None,
          (.1, .35, .7), names, basis="behavior")

for i, food, stem in ((0, "Futterstücken", "Futter"), (1, "lebenden Fischen", "Fisch"),
                      (2, "Eiern", "Ei"), (3, "Kadavern", "Aas"), (4, "Algen", "Algen"),
                      (5, "Blattpflanzen", "Blatt"), (6, "Plankton", "Plankton"), (7, "Würmern", "Wurm"),
                      (8, "Krabben", "Krabben"), (9, "Muscheln", "Muschel"), (10, "Bodennahrung", "Boden")):
    bands("diet" + str(i), "Nahrung", lambda c, i=i: c.shares[i] if c.diet_known else None, (.05, .3, .7),
          (stem + " selten aufnehmend", stem + " gelegentlich fressend",
           stem + " regelmäßig fressend", stem + " spezialisiert fressend"), basis="behavior")
for key, title, names in (
    ("rooted", "Energieanteil aus verwurzelten Blattpflanzen", ("kaum Halmkost", "gelegentlicher Halmweider", "regelmäßiger Halmweider", None)),
    ("drift", "Energieanteil aus treibenden Pflanzen", ("kaum Treibgutkost", "gelegentliche Treibgutkost", "regelmäßige Treibgutkost", None)),
):
    bands(key, "Nahrung", lambda c, k=key: getattr(c, k) if c.diet_known else None,
          (.05, .3, .7), names, basis="behavior")
bands("diet_variety", "Nahrung", lambda c: sum(v >= .1 for v in c.shares) if c.diet_known else None, (2, 3, 5),
      ("schmale Kost", "zweierlei Kost", "vielfältige Kost", "breite Mischkost"), basis="behavior")
bands("diet_concentration", "Nahrung", lambda c: max(c.shares) if c.diet_known else None, (.35, .55, .8),
      ("gleichmäßig gemischte Kost", "leicht bevorzugte Kost", "deutlich bevorzugte Kost", "einseitige Kost"), basis="behavior")


def skin(c):
    return colorsys.rgb_to_hsv(*c.d[17:20]) if c.observed else None


bands("skin_brightness", "Farbe", lambda c: skin(c)[2] if c.observed else None, (.1, .25, .5, .8),
      ("schwarz", "dunkel", "mittlere Helligkeit", "hell", "sehr hellhäutig"), basis="behavior")
bands("skin_saturation", "Farbe", lambda c: skin(c)[1] if c.observed and skin(c)[2] > .03 else None, (.1, .35, .7),
      ("grau", "blass gefärbt", None, "satt gefärbt"), basis="behavior")
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

#include "ecology.hh"
#include "physiology.hh"
#include <cmath>
#include <map>
#include <type_traits>
namespace fishsim {
// Adjustable evolution and food parameters (interactive "parameter", --param, current checkpoint).
namespace {
template <class Number> struct ParameterBinding {
  std::string name;
  Number *value;
  double lo, hi;
  bool integer;
  const char *group;
  double step = .1;
  const char *label = "", *help = "", *unit = "";
  bool initial = false;
};
}
class ParameterAccess {
public:
  template <class World> static auto bindings(World &world) {
    using Number = std::remove_reference_t<decltype((world.evo.yolk))>;
    auto &e = world.evo;
    auto &m = world.evo.rates;
    auto &f = world.field;
    auto &d = world.disease;
    auto &env = f.env_;
    std::vector<ParameterBinding<Number>> table = {
#define FISH_REGISTER_FOOD_PARAMETER(name, initial, minimum, maximum, label)                       \
  {#name,                                                                                          \
   &env.name,                                                                                      \
   minimum,                                                                                        \
   maximum,                                                                                        \
   false,                                                                                          \
   "foodweb",                                                                                      \
   initial >= 10     ? 1                                                                           \
   : initial >= 1    ? .1                                                                          \
   : initial >= .01  ? .001                                                                        \
   : initial >= .001 ? .0001                                                                       \
                     : .0000001,                                                                   \
   label,                                                                                          \
   label,                                                                                          \
   "",                                                                                             \
   false},
        FISH_FOOD_WEB_PARAMETERS(FISH_REGISTER_FOOD_PARAMETER)
#undef FISH_REGISTER_FOOD_PARAMETER
            {"max_bite_force", &world.physiology_.max_bite_force, .001, 10000, false, "body", 1,
             "Kraftmaßstab", "Rohkraft für halbe wirksame Kraft von Maul und Biss", "", false},
        {"gut_time", &world.physiology_.gut_time, 1, 100000, false, "body", .01, "Darmdurchgang",
         "Schritte bei mittlerer Darmlänge", "", false},
        {"fill_plant", &world.physiology_.fill_plant, 1, 10, false, "body", .01, "Pflanzenballast",
         "Füllung je Energie Pflanzennahrung", "", false},
        {"fill_sediment", &world.physiology_.fill_sediment, 1, 20, false, "body", .01,
         "Sandballast", "Füllung je Energie Bodennahrung", "", false},
        {"organ_mass_ref", &world.physiology_.organ_mass_ref, 0.01, 100, false, "body", .01,
         "Bezugsorganmasse", "Organmasse für Endgewebe 90", "", false},
        {"undulation_loss", &world.physiology_.undulation_loss, 0, 1, false, "body", .01,
         "Schlängeln im Wasser", "Schubverlust eines reinen Schlänglers im freien Wasser", "",
         false},
        {"embryo_fold", &world.physiology_.embryo_fold, 0, 2, false, "body", .01, "Faltung im Ei",
         "Körperradius-Anteil für die Beengung", "", false},
        {"embryo_crowding", &world.physiology_.embryo_crowding, 0, 2, false, "body", .01,
         "Hüllkontakt", "Belegung ab der Hülldruck entsteht", "", false},
        {"embryo_flow_decay", &world.physiology_.embryo_flow_decay, 0, 1, false, "body", .01,
         "Innere Strömung: Erhalt", "Verbleibender Flussanteil je Schritt", "", false},
        {"embryo_flow_gain", &world.physiology_.embryo_flow_gain, 0, 10, false, "body", .01,
         "Innere Strömung: Kopplung", "Fluss je bezahltem Muskelimpuls", "", false},
        {"embryo_touch_gain", &world.physiology_.embryo_touch_gain, 0, 10, false, "body", .01,
         "Hüllberührung: Kopplung", "Berührung je bezahltem Muskelimpuls", "", false},
        {"embryo_pressure_damage", &world.physiology_.embryo_pressure_damage, 0, 1, false, "body",
         .01, "Druckschaden", "Schaden durch Beengung", "", false},
        {"embryo_reserve_damage", &world.physiology_.embryo_reserve_damage, 0, 1, false, "body",
         .01, "Reservemangelschaden", "Schaden nahe der Restenergiegrenze", "", false},
        {"embryo_damage_power", &world.physiology_.embryo_damage_power, 1, 10, false, "body", .01,
         "Schadensexponent", "Anstieg von Druck- und Reservemangelschaden", "", false},
        {"embryo_defense_damage", &world.physiology_.embryo_defense_damage, 0, 1, false, "body",
         .01, "Abwehrreibung im Ei", "Schaden durch Abwehr bei Hüllkontakt", "", false},
        {"hatch_shell_limit", &world.physiology_.hatch_shell_limit, 0, 1, false, "body", .01,
         "Schlupf: Hüllenfestigkeit", "Höchste Restfestigkeit für mechanischen Schlupf", "", false},
        {"hatch_force_base", &world.physiology_.hatch_force_base, 0, 10, false, "body", .01,
         "Schlupf: Grundwiderstand", "Erforderlicher Impuls pro Masse bei aufgelöster Hülle", "",
         false},
        {"hatch_force_shell", &world.physiology_.hatch_force_shell, 0, 100, false, "body", .01,
         "Schlupf: Hüllenwiderstand", "Zusätzlicher Widerstand je Restfestigkeit", "", false},
        {"hatch_mass_floor", &world.physiology_.hatch_mass_floor, 0.001, 10, false, "body", .01,
         "Schlupf: Mindestmasse", "Massenuntergrenze der Schlupfmechanik", "", false},
        {"embryo_nutrient_gain", &world.physiology_.embryo_nutrient_gain, 0, 10, false, "body", .01,
         "Gewebeversorgungssignal", "Nährstoffzufluss je Gewebeaufbau", "", false},
        {"resting_spines", &world.physiology_.resting_spines, 0, .85, false, "body", .01,
         "Ruhestacheln", "Größte Ruhehöhe der Stacheln", "", false},
        {"resting_spines_half", &world.physiology_.resting_spines_half, .001, 10000, false, "body",
         1, "Stachelkapazität", "Kapazität für halbe Ruhehöhe", "", false},
        {"pigment_half", &world.physiology_.pigment_half, .001, 10000, false, "body", 1,
         "Pigmentsättigung", "Kapazität für halbe Farbsättigung", "", false},

        {"vision_range", &env.vision_range, 8, 1000, false, "vision", 0.1, "Sehreichweite",
         "Höchste Sehentfernung ab dem jeweiligen Augenpunkt, in Pixeln.", "px", false},
        {"vision_inhibition", &env.vision_inhibition, 0, 2, false, "vision", 0.1,
         "Laterale Hemmung",
         "Zieht den mittleren Reiz der Sehzellen desselben Auges im Adaptationsumfeld vor der "
         "Antwortkurve ab. 0 schaltet die Hemmung aus.",
         "", false},
        {"vision_opponent", &env.vision_opponent, 0, 1, false, "vision", 0.01, "Farbgegensatz",
         "Stärke des Farbgegensatzes. 0 schaltet ihn aus. Die Stärke jeder Sehzelle ist erblich.",
         "", false},
        {"vision_ambient", &env.vision_ambient, 0, 2, false, "vision", 0.1, "Streulicht",
         "Licht, das im Wasser gestreut wird. 0 schaltet es aus. Lokale Adaptation erhält den "
         "Objektkontrast.",
         "", false},
        {"vision_adaptation", &env.vision_adaptation, 0, 1, false, "vision", 0.01,
         "Lokale Adaptation",
         "Kontrast relativ zum Umfeld jeder Blickrichtung. 0: absolute Helligkeit; 1: volle lokale "
         "Adaptation.",
         "", false},
        {"vision_adaptation_angle", &env.vision_adaptation_angle, 1, 90, false, "vision", 0.1,
         "Adaptationsumfeld", "Adaptationsumfeld", "°", false},
        {"vision_water_red", &env.vision_water_red, 0, 1, false, "vision", 0.01, "Wasserfarbe Rot",
         "Wasserfarbe Rot", "", false},
        {"vision_water_green", &env.vision_water_green, 0, 1, false, "vision", 0.01,
         "Wasserfarbe Grün", "Wasserfarbe Grün", "", false},
        {"vision_water_blue", &env.vision_water_blue, 0, 1, false, "vision", 0.01,
         "Wasserfarbe Blau", "Wasserfarbe Blau", "", false},
        {"vision_eye_offset", &env.vision_eye_offset, 0, 4, false, "vision", 0.1,
         "Seitliche Augenlage",
         "Seitliche Lage innerhalb der Kopfkontur; der Schwerpunkt der Sehzellen bestimmt den "
         "Abstand zur Körperachse.",
         "", false},
        {"vision_binocular_angle", &env.vision_binocular_angle, 0, .5, false, "vision", 0.01,
         "Binokularer Winkel", "Halber Winkel des gemeinsamen Blickfelds beider Augen, in Radiant.",
         "rad", false},
        {"vision_ink_scatter", &env.vision_ink_scatter, 0, 1, false, "vision", 0.01,
         "Wolkenstreulicht", "Wolkenstreulicht", "", false},
        {"vision_burial", &env.vision_burial, 0, 1, true, "vision", 1,
         "Augen durch Sediment dämpfen", "Augen durch Sediment dämpfen", "", false},
        {"lateral_connection", &m.lateral_connection, 0, 1, false, "evolution", 0.001,
         "Asymmetrische Verbindungen", "Asymmetrische Verbindungen", "", false},
        {"nutrient_egg_threshold", &e.nutrient_egg_threshold, .5, 2, false, "evolution", 0.1,
         "Nährei-Finanzierungsgrenze",
         "Dotter relativ zum eigenen Entwicklungsbedarf. Darunter wird das Ei zum Nährei.", "",
         false},
        {"recruitment_target", &e.recruitment_target, 0, 2000, false, "evolution", 0.1,
         "Zielbestand für Rekrutierung",
         "Bei diesem Bestand beginnen etwa 50 Prozent natürlicher Eier die Entwicklung. 0: keine "
         "Dichtebegrenzung.",
         "", false},
        {"assist_min_population", &e.assist_min_population, 0, 2000, true, "evolution", 1,
         "Globaler Mindestbestand",
         "Unter dieser Gesamtzahl füllt die Hilfe mit versorgten Eiern auf. Geschlüpfte Fische "
         "und versorgte Hilfe-Eier zählen mit. Unabhängig von der Eignung für Artenschutz. 0: aus.",
         "", false},
        {"assist_species_minimum", &e.assist_species_minimum, 0, 2000, true, "evolution", 1,
         "Artenschutz unter Bestand",
         "Je Art: mindestens zwei natürliche, selbst fressende Nachwuchsgenerationen und ein "
         "geeigneter Archivfisch. Darunter höchstens drei Rettungsgruppen, jeweils bis zu drei "
         "versorgte Eier, mindestens 600 Schritte Abstand. Lebensfähige Eier zählen zum Bestand. "
         "Erneute Ansiedlung nach Aussterben erlaubt wieder drei Gruppen. 0: aus.",
         "", false},
        {"founder_sense_quotas", &e.founder_sense_quotas, 0, 1, true, "evolution", 1,
         "Sinnesvielfalt beim Start",
         "Startauswahl mischt Augen, Nase, gemeinsames Sehen und Riechen sowie andere Strategien. "
         "Die Pool-Aufnahme verlangt lebensfähigen, fressenden Nachwuchs.",
         "", false},

        {"day_period", &env.day_period, 0, 1000000, true, "light", 1, "Taglänge (0: aus)",
         "Länge eines vollständigen Tag-Nacht-Zyklus in Schritten. 0 schaltet den Zyklus aus.",
         "Schritte", false},
        {"night_light", &env.night_light, 0, 1, false, "light", 0.01, "Nachtlicht",
         "Verbleibender Lichtanteil zur dunkelsten Nachtzeit.", "", false},
        {"algae_rate", &env.algae_rate, 0, 0.1, false, "plants", 2.5e-05, "Algenwachstum",
         "Anteil der freien Algenkapazität, der je Schritt bei vollem Licht nachwächst.", "",
         false},
        {"grass_rate", &env.grass_rate, 0, 0.1, false, "plants", 2.5e-05, "Pflanzenwachstum",
         "Anteil der freien Pflanzenkapazität, der je Schritt bei vollem Licht nachwächst.", "",
         false},
        {"algae_capacity", &env.algae_capacity, 2, 16000, false, "plants", 0.1,
         "Algenenergie je 16 px",
         "Speicherkapazität eines 16 px langen bewachsenen Oberflächenstücks.", "", false},
        {"grass_capacity", &env.grass_capacity, 2, 16000, false, "plants", 0.1,
         "Pflanzenenergie je Wurzelplatz",
         "Speicherkapazität je Wurzelplatz; Licht, Platz und Nachbarn begrenzen den Bestand.", "",
         false},
        {"algae_thickness", &env.algae_thickness, 0.1, 12, false, "plants", 0.1, "Max. Algendicke",
         "Dicke eines voll gewachsenen Algenbelags.", "px", false},
        {"grass_length", &env.grass_length, 16, 128, false, "plants", 0.1,
         "Basislänge der Pflanzen",
         "Größe ausgewachsener Pflanzen; Form und verfügbarer Platz bestimmen die tatsächliche "
         "Länge.",
         "px", false},
        {"light_bottom", &env.light_bottom, 0, 1, false, "light", 0.01,
         "Licht am Boden für Fische und Pflanzen", "Licht am Boden für Fische und Pflanzen", "",
         false},
        {"light_shadow", &env.light_shadow, 0, 1, false, "light", 0.01,
         "Restlicht im Schatten für Fische und Pflanzen",
         "Restlicht im Schatten für Fische und Pflanzen", "", false},
        {"sediment_half_life", &env.sediment_half_life, 1, 10000, false, "sediment", 0,
         "Absetzhalbwertszeit", "Absetzhalbwertszeit", "Schritte", false},
        {"sediment_path", &env.sediment_path, 1, 1000, false, "sediment", 0.1,
         "Schlamm: Halbierung je Weg", "Schlamm: Halbierung je Weg", "px", false},
        {"sediment_reach", &env.sediment_reach, 1, 100, false, "sediment", 0.1,
         "Aufwirbelreichweite", "Aufwirbelreichweite", "px", false},

        {"disease_food", &d.food, 0, 1, false, "disease", 0.001, "Ansteckung durch Futter",
         "Höchste Ansteckungswahrscheinlichkeit je Futtermahlzeit; nach einer Futter-Halbwertszeit "
         "halb so hoch.",
         "", false},
        {"disease_rate", &d.rate, 0, .1, false, "disease", 1e-05, "Spontane Erkrankung",
         "Spontane Erkrankungswahrscheinlichkeit je geschlüpftem Fisch und Schritt.", "", false},
        {"disease_carrion", &d.carrion, 0, 1, false, "disease", 0.01, "Ansteckung durch Aas",
         "Höchste Ansteckungswahrscheinlichkeit je Aasmahlzeit; bei 600 Schritten Aasalter halb so "
         "hoch.",
         "", false},
        {"disease_reach", &d.reach, 0, 500, false, "disease", 0.01, "Ansteckungsreichweite",
         "Abstand zwischen den Körperrändern in Pixeln; verbundene Seitenränder zählen mit.", "px",
         false},
        {"disease_spread", &d.spread, 0, 1, false, "disease", 0.01, "Übertragung je Nachbar",
         "Ansteckungswahrscheinlichkeit je krankem Nachbarn und Schritt bei gleichen Genomen; "
         "nimmt mit genetischem Abstand ab.",
         "", false},
        {"disease_duration", &d.duration, 1, 100000, true, "disease", 1, "Krankheitsdauer",
         "Dauer einer Erkrankung in Schritten; danach ist der Fisch wieder gesund.", "Schritte",
         false},
        {"disease_harm", &d.harm, 0, .1, false, "disease", 0.0001, "Gesundheitsverlust je Schritt",
         "Gesundheitsverlust pro Krankheitsschritt auf der Skala 0 bis 1.", "", false},
        {"mutation", &e.mutation, 0, 1, false, "evolution", 0.01, "Normale Mutationsstärke",
         "Gewichtsbudget je Mutation, skaliert durch die erbliche Schrittweite.", "", false},
        {"broad_mutation", &m.broad_mutation, 0, 1, false, "evolution", .01, "Mehrere CPPN-Zweige",
         "Anteil der Mutationen über alle Zweige bei gleichem Gewichtsbudget.", "", false},
        {"branch_mutation", &m.branch_mutation, 0, 1, true, "evolution", 1, "Zweigweise Mutation",
         "Je Mutation einen der fünf Zweige wählen.", "", false},
        {"step_evolution", &m.step_evolution, 0, 1, true, "evolution", 1, "Erbliche Schrittweite",
         "Mutationsschrittweite zwischen 0,5 und 2 vererben und verändern.", "", false},
        {"neutral_structure", &m.neutral_structure, 0, 1, true, "evolution", 1,
         "Stille Strukturergänzungen",
         "Neue Verbindungen und Ausgänge von Kopien beginnen bei null.", "", false},
        {"selfing_delay", &e.selfing_delay, 0, 480, true, "evolution", 1,
         "Wartezeit für Selbstbefruchtung", "Wartezeit für Selbstbefruchtung", "Schritte", false},
        {"fertilisation_wait", &e.fertilisation_wait, 0, 10000, true, "evolution", 1,
         "Wartezeit bis zur klonalen Entwicklung", "Wartezeit bis zur klonalen Entwicklung",
         "Schritte", false},
        {"weight_share", &m.weight_share, 0, 1, false, "evolution", 0.01,
         "Anteil gestörter Gewichte im gewählten Zweig",
         "Anteil gestörter Gewichte im gewählten Zweig", "", false},
        {"add_node", &m.add_node, 0, 1, false, "evolution", 0.01, "Chance eines neuen CPPN-Knotens",
         "Chance eines neuen CPPN-Knotens", "", false},
        {"duplicate", &m.duplicate, 0, 1, false, "evolution", 0.01,
         "Chance einer Knotenverdopplung", "Chance einer Knotenverdopplung", "", false},
        {"add_connection", &m.add_connection, 0, 1, false, "evolution", 0.01,
         "Chance einer neuen CPPN-Verbindung", "Chance einer neuen CPPN-Verbindung", "", false},
        {"disable", &m.disable, 0, 1, false, "evolution", 0.01,
         "Chance einer abgeschalteten Verbindung", "Chance einer abgeschalteten Verbindung", "",
         false},
        {"node_edit", &m.node_edit, 0, 1, false, "evolution", 0.01, "Chance einer Knotenänderung",
         "Chance einer Knotenänderung", "", false},
        {"type_change", &m.type_change, 0, 1, false, "evolution", 0.01,
         "Chance einer neuen Knotenfunktion", "Chance einer neuen Knotenfunktion", "", false},
        {"gain_rate", &m.gain_rate, 0, 1, false, "evolution", 0.01,
         "Chance einer Frequenz-/Breitenmutation", "Chance einer Frequenz-/Breitenmutation", "",
         false},
        {"gain_step", &m.gain_step, 0, 1, false, "evolution", 0.01,
         "Relative Änderung der Frequenz/Breite", "Relative Änderung der Frequenz/Breite", "",
         false},

        {"breeder_slots", &e.breeder_slots, 1, 64, true, "evolution", 1,
         "Züchterarchiv: Mindestplätze",
         "Mindestens ein geeigneter Bauplan je Art bleibt erhalten; "
         "freie Plätze nehmen weitere erfolgreiche Baupläne auf.",
         "", false},
        {"breeder_offspring_weight", &e.breeder_offspring_weight, 0, 100, false, "evolution", 0.1,
         "Gewicht erfolgreicher Nachkommen",
         "Gewicht geschlüpfter Nachkommen im Hilfsrang. Der Rang kombiniert logarithmierte "
         "Fressrate pro Grundkosten und logarithmierte Nachkommenzahl; die "
         "Lebenszeit-Nahrungsmenge zählt nicht hinein.",
         "", false},
        {"yolk", &e.yolk, 0, 1000, false, "energy", 1, "Reserve der Hilfseier",
         "Energie nach der Entwicklung: davon werden mindestens 20 zu Schlupfgewebe, der Rest "
         "bleibt Reserve. Entwicklungskosten kommen hinzu; ohne Reserve wird kein Ei zugesetzt.",
         "", true},
        {"egg_fill_rate", &e.egg_fill_rate, .5, 100, false, "energy", 0.5, "Dotterfluss je Schritt",
         "Energie pro Schritt bei starkem Ei-Signal; Stärke und Dauer bestimmen den gesammelten "
         "Dotter.",
         "", true},
        {"egg_reserve", &e.egg_reserve, 0, 500, false, "energy", 1, "Mindestreserve der Mutter",
         "Reserve bei Gewebe 40; Mutterreserve und Ei-/Spermafüllschwelle wachsen mit "
         "sqrt(Gewebe / 40).",
         "", true},
        {"egg_capacity", &e.egg_capacity, 10, 1000, false, "energy", 1, "Obergrenze des Eierstocks",
         "Obergrenze des Dottervorrats, multipliziert mit Gewebe / 40.", "", true},
        {"egg_organ_capacity", &e.egg_organ_capacity, 0, 100, false, "energy", 0.01,
         "Dotterkapazität je Ei-Zelle",
         "Kapazität je funktionsfähiger Ei-Zelle, multipliziert mit Gewebe / 40 und begrenzt durch "
         "die Obergrenze. Abgabe ab 95 Prozent Füllung. 0: keine Dotterkapazität.",
         "", false},
        {"egg_overhead", &e.egg_overhead, 0, 100, false, "evolution", 0.1,
         "Zusätzliche Kosten eines Eies", "Zusätzliche Kosten eines Eies", "", false},
        {"mating_distance", &world.taxonomy_.mating_distance, .01, 4, false, "evolution", .0025,
         "Abstand für Artzugehörigkeit",
         "Genetischer Abstand für die Artzuordnung; bei diesem Abstand beträgt die "
         "Gametenverträglichkeit 50 Prozent.",
         "", false},
        {"egg_crowding_radius", &e.egg_crowding_radius, 0, 500, false, "evolution", 0.1,
         "Abstand zwischen Gelegen",
         "Umkreis um die Mutter in Pixeln; der verbundene Seitenrand zählt mit.", "px", false},
        {"egg_crowding_limit", &e.egg_crowding_limit, 1, 100, true, "evolution", 1,
         "Eier je Art und Gelegeplatz",
         "Ab dieser Zahl lebender Entwicklungseier der eigenen Art bleibt der Dotter im Bauch.", "",
         false},
        {"impact_damage", &world.physiology_.impact_damage, 0, 1, false, "energy", 0.01,
         "Aufprallschaden",
         "Gesundheitsverlust je Einheit Aufprallenergie; gilt für Wände und Fischstöße.", "", true},
        {"senescence_start", &world.physiology_.senescence_start, 0, 100000, true, "energy", 1,
         "Gesundheitsalterung ab",
         "Schritte seit dem Schlupf, ab denen die Gesundheit altersbedingt abnimmt.", "Schritte",
         true},
        {"senescence_rate", &world.physiology_.senescence_rate, 0, .001, false, "energy", 1e-06,
         "Gesundheitsalterung",
         "Zusätzlicher Gesundheitsverlust pro Schritt und Altersschritt über dem Beginn.", "",
         true},
        {"development_queries", &e.development_queries, 4096, 1048576, true, "evolution", 1,
         "CPPN-Abfragen für Eier",
         "Mindestzahl an CPPN-Abfragen für die Gehirnentwicklung aller Eier je Schritt. Warten "
         "viele Eier, steigt das Budget, bis ihre Entwicklung in etwa acht Schritten fertig ist.",
         "", false},
        {"development_query_limit", &e.development_query_limit, 4096, 8388608, true, "evolution",
         1, "Höchstbudget für Eier",
         "Obergrenze der CPPN-Abfragen je Schritt, auch wenn sehr viele Eier warten.", "", false},
        {"development_finalizations", &e.development_finalizations, 1, 64, true, "evolution", 1,
         "Fertige Gehirne je Schritt",
         "So viele Eier dürfen je Schritt ihr Gehirn fertig aufbauen (Synapsen anlegen).", "",
         false},
        {"bite_wound", &world.physiology_.bite_wound, .075, 1, false, "energy", 0.005,
         "Verletzung je vollem Biss", "Verlust an Gesundheit pro Biss von 3 Gewebe, von 0 bis 1.",
         "", false},
        {"wound_weakness", &world.physiology_.wound_weakness, 0, 1, false, "energy", 0.01,
         "Schwächung durch Verletzung",
         "Verringerung der Schwimmkraft bei Verletzung, von 0 bis 1.", "", false},
        {"size_physics", &world.physiology_.size_physics, 0, 1, true, "energy", 1,
         "Größenabhängige Bewegung",
         "1: Masse bestimmt Widerstand, Drehträgheit und Höchsttempo; 0: ausgeschaltet.", "",
         false},
        {"sperm_fill_rate", &e.sperm_fill_rate, .05, 10, false, "energy", 0.05,
         "Spermienfluss je Schritt", "Energie pro Schritt bei vollem Sperma-Signal.", "", true},
        {"sperm_capacity", &world.physiology_.sperm_capacity, 2, 500, false, "energy", 0.01,
         "Spermienvorrat",
         "Maximaler Spermienvorrat bei voller Körpergröße. Die Freigabe steuert das Gehirn.", "",
         true},
        {"sperm_portion", &e.sperm_portion, .1, 50, false, "energy", 0.01, "Spermien-Mindestvorrat",
         "Mindestens nötige Energie für eine Spermienabgabe.", "", true},
        {"sperm_mixing", &world.physiology_.sperm_mixing, .001, 5, false, "energy", 0.001,
         "Spermien: Durchmischung", "Grunddurchmischung in Quadratpixeln pro Schritt.", "", true},
        {"sperm_dilution", &world.physiology_.sperm_dilution, .00001, 1, false, "energy", 1e-05,
         "Spermien: Auflösungsdichte",
         "Örtliche Gesamtkonzentration in Energie pro Quadratpixel; darunter werden die Anteile "
         "aufgelöst.",
         "", true},
        {"sperm_opaque", &world.physiology_.sperm_opaque, .00001, 1, false, "energy", 1e-05,
         "Spermien: optische Referenzdichte",
         "Referenzkonzentration in Energie pro Quadratpixel für Färbung und Lichtfilterung.", "",
         true},
        {"water_clarity", &f.water_clarity, 10, 1000, false, "energy", 0.01, "Wasserklarheit",
         "Entfernung, nach der die Helligkeit im klaren Wasser auf die Hälfte sinkt.", "px", true},
        {"ink_density", &f.ink_density, 0, 1, false, "energy", 0.01, "Spermien: Farbdichte",
         "Farbabhängige Filterstärke bei Referenzkonzentration und 16 Pixel Weglänge.", "", true},
        {"sinking", &world.physiology_.sinking, 0, .02, false, "energy", 0.0001,
         "Natürlicher Sinktrieb", "Schwacher natürlicher Sinktrieb ohne gefüllte Schwimmblase.", "",
         true},
        {"bladder_strength", &world.physiology_.bladder_strength, 0, .05, false, "energy", 0.0001,
         "Auftrieb der Schwimmblase", "Auftrieb einer gefüllten Schwimmblase.", "", true},
        {"bladder_rate", &world.physiology_.bladder_rate, .0001, .05, false, "energy", 0.0001,
         "Blase: Fülltempo", "Füll- und Entleerungsrate je aktiver Gewebestärke und Schritt.", "",
         true},
        {"bladder_cost", &world.physiology_.bladder_cost, 0, 1, false, "energy", 0.001,
         "Blase: Energieaufwand", "Energie je Füllstandsänderung.", "", true},
        {"touch_rest", &world.physiology_.touch_rest, 0, 1, false, "senses", 0.01, "Ruheberührung",
         "Grundreiz einer Berührung ohne Stoß.", "", true},
        {"stroke_threshold", &world.physiology_.stroke_threshold, 0, 10, false, "body", 0.01,
         "Schlagschwelle", "Mindestwert der geglätteten Muskelansteuerung für einen Schlag.", "",
         true},
        {"drag_along", &world.physiology_.drag_along, 0, 2, false, "body", 0.001,
         "Widerstand längs", "Wasserwiderstand entlang des Körpers.", "", true},
        {"drag_across", &world.physiology_.drag_across, 0, 2, false, "body", 0.001,
         "Widerstand quer",
         "Wasserwiderstand quer zum Körper und Dämpfung der Drehgeschwindigkeit.", "", true},
        {"turn_cost", &world.physiology_.turn_cost, 0, 1, false, "energy", 0.0001, "Wendekosten",
         "Energie je Einheit Wendeschlagarbeit.", "", true},
        {"transfer_cost", &world.physiology_.transfer_cost, 0, 1, false, "energy", 0.0001,
         "Gonadentransfer", "Energieaufwand für den Transport in die Gonaden.", "", true},
        {"pigment_cost", &world.physiology_.pigment_cost, 0, 1, false, "energy", 0.0001,
         "Pigmentkosten", "Energie je aktiver Pigmentstärke.", "", true},
        {"bite_cost", &world.physiology_.bite_cost, 0, 1, false, "energy", 0.0001, "Bisskosten",
         "Energie je Einheit Schließarbeit; einmal am Beginn des Bisses.", "", true},
        {"defense_cost", &world.physiology_.defense_cost, 0, 1, false, "energy", 0.001,
         "Abwehrkosten", "Energie je Einheit aufrechterhaltener Abwehrleistung.", "", true},
        {"spine_rate", &world.physiology_.spine_rate, 0, 1, false, "body", 0.001,
         "Stacheln: Aufrichten", "Zunahme je bezahlter Abwehrleistung.", "", true},
        {"spine_max", &world.physiology_.spine_max, 0, 1, false, "body", 0.01,
         "Stacheln: Ausschlag", "Maximaler aktiver Ausschlag der Stacheln.", "", true},
        {"pigment_rate", &world.physiology_.pigment_rate, 0, 1, false, "body", 0.001,
         "Pigmente: Aktivierung", "Pigmentzunahme je aktiver Gewebestärke.", "", true},
        {"wall_restitution", &world.physiology_.wall_restitution, 0, 1, false, "body", 0.01,
         "Rückprall", "Erhalt der Normalgeschwindigkeit beim Aufprall.", "", true},
        {"spine_abrasion", &world.physiology_.spine_abrasion, 0, 1, false, "body", 0.0001,
         "Stachelabrieb", "Schaden durch Bewegung mit Stacheln im Sediment.", "", true},
        {"stroke_turn", &world.physiology_.stroke_turn, 0, 180, false, "energy", 0.1,
         "Drehwirkung je Schlag",
         "Zuwachs der Drehgeschwindigkeit je Schlagarbeit bei Masse 1; Wasserwiderstand dämpft das "
         "Weiterdrehen.",
         "°", true},
        {"stroke_push", &world.physiology_.stroke_push, 0, 10, false, "energy", 0.0001,
         "Schub je Schlag",
         "Geschwindigkeitszuwachs je Vortriebsimpuls bei Masse 1, in Pixeln pro Schritt.", "",
         true},
        {"swimming_cost", &world.physiology_.swimming_cost, 0, 2, false, "energy", 0.00001,
         "Schwimmkosten",
         "Energie je Einheit Vortriebsimpuls; zwischen Schlägen fallen keine "
         "Vortriebsarbeitskosten an.",
         "", true},
        {"suction_cost", &world.physiology_.suction_cost, 0, 2, false, "energy", 0.0001,
         "Saugkosten",
         "Energie je Schritt Wassertransport, gewichtet mit Pumpstärke und Maulöffnung.", "", true},
        {"suction_range", &world.physiology_.suction_range, .25, 4, false, "energy", 0.01,
         "Saugreichweite ×",
         "Faktor auf die Reichweite am Maul. Doppelte Reichweite kostet beim Pumpen viermal so "
         "viel Energie.",
         "", false},
        {"basal_metabolism", &world.physiology_.basal_metabolism, .1, 2, false, "energy", 0.01,
         "Grundumsatz", "Grundumsatz", "", false},
        {"novelty_strength", &world.novelty_strength, 0, 1, false, "evolution", 0.01,
         "Neuheitsbonus bei natürlicher Fortpflanzung",
         "Gewichtet Neuheit bei Eiablage und Spermienwahl. 0: ohne zusätzlichen Neuheitsbonus; 1: "
         "volle Gewichtung. Neue Welten starten bei 0. Bestandshilfe und Neuheitsmessung bleiben "
         "unabhängig davon aktiv.",
         "", false},
        {"novelty_neighbors", &e.novelty_neighbors, 1, 50, true, "evolution", 1,
         "Nachbarn im Neuheitsabstand", "Nachbarn im Neuheitsabstand", "", false},

        {"food_min", &f.feeding_.food_min, 1, 200, false, "food", 0.1,
         "Energie des kleinsten Futterstücks", "Untere Energiegrenze neuer Futterstücke.", "",
         false},
        {"food_max", &f.feeding_.food_max, 1, 400, false, "food", 0.1,
         "Energie des reichsten Futterstücks",
         "Obere Energiegrenze neuer Futterstücke; der Mittelwert liegt näher am Minimum.", "",
         false},
        {"food_bright", &f.feeding_.food_bright, 1, 1000, false, "food", 0.1,
         "Kadaver: Energie bei voller Helligkeit", "Kadaver: Energie bei voller Helligkeit", "",
         false},

        {"food_cluster", &f.feeding_.food_cluster, 1, 20, true, "food", 1, "Stücke je Futterwolke",
         "Bündelt die eingestellte Zufuhr in größere Wolken; die Energiezufuhr je Quelle bleibt "
         "gleich.",
         "", false},
        {"food_spread", &f.feeding_.food_spread, 0, 1000, false, "food", 0.1,
         "Breite der Futterstrahlen", "Breite der Futterstrahlen", "px", false},
        {"source_motion", &f.feeding_.source_motion, 0, 1000, false, "food", 1,
         "Wanderung der Futterwolken",
         "Die Futterquellen wandern unabhängig mit zufälligen Kursänderungen durch das freie "
         "Wasser. "
         "0 hält sie an. Von Hand gesetzte Quellen bleiben fest.",
         "px / 1.000 Schritte", false},
        {"food_sink", &f.feeding_.food_sink, .05, 4, false, "food", 0.05,
         "Absinkgeschwindigkeit des Futters", "Absinkgeschwindigkeit des Futters", "px/Schritt",
         false}};
    auto burst = [&](auto &b, const char *prefix, const char *group, double maximum) {
      struct Entry {
        const char *suffix;
        Number *value;
        double lo, hi;
        bool integer;
      };
      for (auto e : std::initializer_list<Entry>{{"gap", &b.gap, 1, 100000, true},
                                                 {"duration", &b.duration, 1, 10000, true},
                                                 {"strength", &b.strength, 0, maximum, false}}) {
        auto name = std::string(prefix) + e.suffix;
        table.push_back({name, e.value, e.lo, e.hi, e.integer, group});
      }
    };
    burst(world.food_burst, "burst_food_", "burst-food", 9);
    burst(world.mutation_burst, "burst_mutation_", "burst-mutation", 1);
    return table;
  }
};
std::vector<ParameterInfo> Ecosystem::parameters() const {
  static const auto defaults = [] {
    const Ecosystem world(0);
    std::map<std::string, double> values;
    for (const auto &p : ParameterAccess::bindings(world))
      values[p.name] = *p.value;
    return values;
  }();
  std::vector<ParameterInfo> result;
  for (const auto &p : ParameterAccess::bindings(*this))
    result.push_back({p.name, *p.value, p.lo, p.hi, p.integer, p.group, p.step, defaults.at(p.name),
                      p.label, p.help, p.unit, p.initial});
  return result;
}
void Ecosystem::set_neural_cost(double value) {
  if (!std::isfinite(value))
    throw std::invalid_argument("invalid neural cost");
  physiology_.neural_cost = std::clamp(value, .01, 100.);
}
bool Ecosystem::set_parameter(const std::string &name, double value) {
  placement_notice.clear();
  if (!std::isfinite(value))
    return false;
  auto table = ParameterAccess::bindings(*this);
  for (auto &p : table)
    if (name == p.name) {
      value = std::clamp(value, p.lo, p.hi);
      if (p.integer)
        value = std::round(value);
      if (name == "food_supply_share" || name == "plankton_supply_share" ||
          name == "benthic_supply_share") {
        const auto &e = field.env();
        if (e.food_supply_share + e.plankton_supply_share + e.benthic_supply_share - *p.value +
                value >
            1 + 1e-12)
          return false;
      }
      *p.value = value;
      if (name == "organ_mass_ref")
        for (auto &fish : this->fish)
          fish.body.organ_mass_ref = physiology_.organ_mass_ref;
      if (name == "sperm_capacity")
        for (auto &fish : this->fish)
          fish.body.reproduction_.sperm_limit =
              organ_capacity(fish.body, fish.genome, 5, physiology_.sperm_capacity);
      if (name == "egg_capacity" || name == "egg_organ_capacity")
        for (auto &fish : this->fish)
          fish.body.reproduction_.egg_limit =
              ovary_capacity(fish.body, fish.genome, evo.egg_capacity, evo.egg_organ_capacity);
      for (auto &other : table) {
        if (name == "food_min" && other.name == "food_max")
          *other.value = std::max(*other.value, value);
        if (name == "food_max" && other.name == "food_min")
          *other.value = std::min(*other.value, value);
      }
      refresh_food_allowance();
      if (name.rfind("burst_food_", 0) == 0)
        food_pulse = {};
      if (name.rfind("burst_mutation_", 0) == 0)
        mutation_pulse = {};
      return true;
    }
  return false;
}
void Ecosystem::advance_bursts() {
  auto draw = [&](double a, double b) {
    return std::uint64_t(std::max(1., std::round(rng.uniform(std::min(a, b), std::max(a, b)))));
  };
  auto advance = [&](const BurstParameters &config, BurstState &state, bool food) {
    if (state.active(ticks))
      return;
    if (config.strength <= 0) {
      state = {};
      return;
    }
    if (!state.next) {
      state.next = ticks + draw(config.gap * .7, config.gap * 1.3);
      return;
    }
    if (state.until) {
      if (ticks < state.until)
        return;
      state.until = 0;
      state.manual_strength = 0;
      state.next = ticks + draw(config.gap * .7, config.gap * 1.3);
      return;
    }
    if (ticks < state.next)
      return;
    state.until = ticks + draw(config.duration * .7, config.duration * 1.3);
    if (food) {
      state.size = rng.uniform(.6, 1.4);
      state.cluster = double(draw(std::max(1., field.feeding().food_cluster * .5),
                                  std::min(20., field.feeding().food_cluster * 2)));
    }
  };
  advance(food_burst, food_pulse, true);
  advance(mutation_burst, mutation_pulse, false);
}
bool Ecosystem::trigger_burst(const std::string &name) {
  BurstParameters *config = nullptr;
  BurstState *pulse = nullptr;
  if (name == "food") {
    config = &food_burst;
    pulse = &food_pulse;
  } else if (name == "mutation") {
    config = &mutation_burst;
    pulse = &mutation_pulse;

  } else
    return false;
  pulse->next = ticks;
  pulse->until = ticks + std::uint64_t(std::max(1., config->duration));
  pulse->manual_strength = config->strength > 0 ? config->strength : name == "mutation" ? .25 : 1;
  if (name == "food") {
    pulse->size = 1;
    pulse->cluster = field.feeding().food_cluster;
  }
  return true;
}
double Ecosystem::mutation_strength(bool) {
  double strong = 0;
  if (mutation_pulse.active(ticks))
    strong = std::max(strong, std::max(mutation_burst.strength, mutation_pulse.manual_strength));
  return rng.uniform() < std::clamp(strong, 0., 1.) ? std::min(1., 2.5 * evo.mutation)
                                                    : evo.mutation;
}
void Ecosystem::feed_burst() {
  auto supply = field.food_supply();
  const double rate = supply.rate, lo = supply.minimum, hi = supply.maximum, limit = supply.limit;
  const double strength = std::max(food_burst.strength, food_pulse.manual_strength);
  bool enabled = food_burst.strength > 0 && food_pulse.next;
  bool active = food_pulse.active(ticks);
  supply.factor = active ? 1 + strength
                  : enabled
                      ? std::max(0., 1 - food_burst.strength * food_burst.duration / food_burst.gap)
                      : 1;
  const auto effective = breeding_food();
  supply.rate = effective.rate * supply.factor;
  supply.limit = effective.limit;
  supply.minimum = effective.minimum;
  supply.maximum = effective.maximum;
  if (support_.breeding_help.enabled) {
    supply.factor = std::min(100., supply.factor * support_.breeding_help.scale);
    supply.rate = std::min(supply.rate, 100 * std::max(1., rate));
  }
  if (active) {
    supply.limit = support_.breeding_help.enabled
                       ? std::min(100 * limit, std::floor(effective.limit * (1 + strength)))
                       : std::min(20000., std::floor(limit * (1 + strength)));
    if (!support_.breeding_help.enabled) {
      supply.minimum = std::clamp(lo * food_pulse.size, 1., 200.);
      supply.maximum = std::clamp(hi * food_pulse.size, supply.minimum, 200.);
    }
    supply.cluster = food_pulse.cluster;
  }
  field.top_up(supply);
}
std::uint64_t Ecosystem::performance_window() const {
  double cycle = 0;
  for (const auto *b : {&food_burst, &mutation_burst})
    if (b->strength > 0)
      cycle = std::max(cycle, b->gap + b->duration);
  return std::uint64_t(std::max(1000., cycle > 0 ? std::ceil(3 * 1.3 * cycle) : 6000.));
}
void Ecosystem::record_performance() {
  metrics_.record(ticks, performance_window());
  for (auto &s : taxonomy_.species) {
    if (ticks % 100 == 0)
      s.replacement_history.push_back({ticks, s.replacement_hatches, s.replacement_deaths});
    while (s.replacement_history.size() > 1 &&
           s.replacement_history[1].tick <= metrics_.performance_history.front().tick)
      s.replacement_history.pop_front();
    while (s.replacement_history.size() > 8192)
      s.replacement_history.pop_front();
  }
}
PerformanceSample Ecosystem::performance() const {
  return metrics_.performance(ticks);
}

}

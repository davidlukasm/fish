# Modell 19: das Gehirn von v018b

Einzige Beschreibung des Modells. Jede Änderung erst hier, dann im Code. Keine Altpfade, keine
Altformate.

## Grundsätze
- Das Genom ist die Anleitung für das CPPN. Das CPPN legt fest, wo welche Zellen entstehen und mit
  welcher Wahrscheinlichkeit sie sich verbinden, aber keine einzelnen Gewichte.
- Gehirnentwicklung und Lernen sind ein Vorgang: Dieselben lokalen Regeln laufen vom Ei bis zum Tod.
- Eine Zelle lernt nur aus dem, womit sie verbunden ist, und aus den Hormonen. Sie reagiert auf
  Abweichungen von ihren eigenen Vorhersagen.
- Was belohnt, entscheidet die Evolution: Hormondrüsen, Modulatorzellen, Rezeptoren.
- Kein Sinn ist direkt mit einem Effektor verbunden.

## Genom
- **CPPN** mit 15 Eingängen und 26 Ausgängen.
  - Eingänge: die Lagen beider Punkte, ihr Abstand, ihre Differenzen, das Seitenprodukt
    x(Quelle)·x(Ziel), die Summe der Seitenbeträge sowie zwei Sender(Quelle)·Empfänger(Ziel)-Produkte.
  - Fünf fest getrennte Zweige: Bauplan, Zelleigenschaften sowie je eine Verbindungsart
    (Sinn → Nerv, Nerv → Nerv, Nerv → Effektor). Verbindungen zwischen Zweigen sind ausgeschlossen.
- **Entwicklungs-Seed** (vererbt, entscheidet die Partnerzüge), **Variations-Seed** (neu für jedes
  Neugeborene, für die Streuung der Kopien), erbliche Mutationsschrittweite.
- Zufallsgenome erhalten je Zweig unabhängig gezogene Tiefe und Breite. Zellabfragen verwenden
  unabhängige, spiegelgerade Lageeingänge; Verbindungsabfragen zusätzlich Abstand, Längs-/Tiefendifferenz
  und Markerprodukte. Jeder Zwischenknoten erreicht einen Ausgang; Gewichte skalieren mit der
  Eingangszahl. Ein Viertel startet ohne zusätzliche Verbindungsmuster, die übrigen mischen freie,
  räumliche, marker- und seitenabhängige Regeln als gewöhnliche Gene. Zellarten und Verhalten bleiben
  vollständig durch das CPPN bestimmt; spätere Mutationen können Asymmetrie einführen.
- Neue Zufallsgenome werden nach notwendigen Organanlagen sowie physikalisch erreichbarer
  Sekretabgabe und Schlupfkraft geprüft. Inaktivität am Anfang ist kein Ausschluss.
- Das CPPN wird an 8×8×8 Rasterpunkten gefragt. Jeder Punkt mit Ausdruck > 0 wird eine
  **Zellgruppe**. Nur dort wird das Lagefeld an sieben Punkten abgefragt: Mitte und ±¼ Rasterweite
  je Achse. Die Parabelscheitel bestimmen den auf ±¼ Rasterweite begrenzten Versatz. Die Zellwerte
  stammen aus der abschließenden Abfrage dort, die Ausdrucksstärke vom ursprünglichen Rasterpunkt.
  Leere Punkte benötigen eine Abfrage, belegte neun (Ausdruck, sieben Lageproben, Zellwerte).
- Zellausgänge:

  | Nr. | Ausgang |
  |---|---|
  | 0 | Lagefeld |
  | 1 | Ausdruck |
  | 2–6 | Identität |
  | 7 | Schwelle |
  | 8 | Dendriten |
  | 9 | Kapazität |
  | 10/11 | Qualität 1/2 |
  | 12 | Qualitätsbreite |
  | 13 | Feldbreite |
  | 14 | Zeitkonstante |
  | 15 | Plastizität |
  | 16/17 | Sendermarker 1/2 |
  | 18/19 | Empfängermarker 1/2 |

- **Rolle** aus Identität 0: Sinn, Nerv oder Effektor.
- **Sinneszelle:** Sie hat genau einen Sinn, die Ecke des Hyperkubus (Identität 1–4) mit dem
  größten Anteil.
- **Effektorzelle:** Sie kann mehrere Organe anteilig bedienen.
- **Nervenzelle**, Klasse aus Identität 1–4:
  - Vorzeichen;
  - Lernart (ordnen > 0 / auslöschen < 0);
  - Taktgeber;
  - Modulator.
- **Bedeutung der übrigen Ausgänge je Rolle:**
  - Sinn: Schwelle = Antwortschwelle; Qualität = Farbton/Gegensatz/Duftrichtung; Breiten.
    Bei Riechzellen bestimmt τ = 4·12^t (4–48 Schritte) die Adaptation an die lokale
    Konzentration c: Antwort = c/(c + Schwelle + Mittelwert), danach
    Mittelwert += (c − Mittelwert)/τ. Beide Nasen lesen das mitströmende Geruchsfeld;
    Pflanzen, Nahrung, Tiere und Plankton geben dort Duft ab. Sperma wird aus seinem
    transportierten Konzentrationsfeld gelesen. Inspektion verändert die Adaptation nicht.
  - Nerv:
    - Schwelle = Ruheaktivität (−0,3·t);
    - Dendriten = 4·128^d Eingangsplätze;
    - Hormonrezeptoren aus getrennten Funktionsabfragen (siehe unten);
    - Zeitkonstante τ = 4·12^t (Spur τ/2, Taktgeberperiode max(8, τ));
    - Plastizität = Lerngewinn.
  - Effektor: Schwelle = Ruheaktivität; Kapazität = Organgröße; Qualität = Farbe, Drüsenart.
- **Kopien:** Sinnes- und Nervengruppen haben round(8·Kapazität) Zellen (1–16), Effektorgruppen
  eine.
  - Kopien streuen nach dem Variations-Seed: Lage ±¼ Rasterweite, Seite und Tiefenzeichen bleiben;
    Ruheaktivität ±0,05.
  - Höchstens max_nodes Zellen.

## Regionen
- Zwei benachbarte Gruppen (Rasternachbarn) gehören zur selben Region, wenn sich alle vier
  Marker um weniger als 0,2 unterscheiden.
- Regionen sind damit zusammenhängende Gebiete; die Zahl ist nicht vorgegeben. Eine Region kann
  Sinnes-, Nerven- und Effektorgruppen enthalten.

## Verbindungen
- **Arten:** Sinn → Nerv, Nerv → Nerv, Nerv → Effektor. Sinne senden nur, Effektoren empfangen nur.
- **Wahrscheinlichkeit** eines Paars:
  - E = Verbindungsausdruck aus Lage und den beiden Produkten Sender(Quelle)·Empfänger(Ziel);
  - p = clamp(E/0,05; 0; 1).
- **Bindungsstärke** eines Paars = |Gewichtsausgang|·1,4·p.
- **Vorwahl:** Innerhalb einer Region wird jedes Gruppenpaar abgefragt. Zwischen zwei Regionen
  wird p je Verbindungsart und Körperseitenpaar an den Mittelpunkten der beteiligten Gruppen
  mit ihren mittleren Markern berechnet; nur bei p > 0 werden ihre Gruppenpaare abgefragt. Hat jede Seite nur eine Gruppe,
  entscheidet direkt die Gruppenabfrage.
- **Plätze je Zelle:** Nerv = Dendriten, Effektor 32; zusammen höchstens max_edges.
  - Die Plätze werden auf die Partnergruppen im Verhältnis ihrer Bindungsstärke verteilt (größte
    Reste).
  - Bei gleichem Rest entscheidet der Entwicklungs-Seed.
- **Wahl der Partner in einer Gruppe:** Jede Zelle der Partnergruppe wird mit p gezogen
  (Überschuss); davon behält die Zelle so viele, wie Plätze zugeteilt sind, zufällig nach dem
  Entwicklungs-Seed.
- **Stärke bei Geburt** = Vorzeichen der Quelle × Vorrat × Anteil der Partnergruppe / Zahl ihrer
  Synapsen.
  - Vorrat = Verstärkung × √(Zahl der Synapsen bei Geburt); Verstärkung = mittlere Bindungsstärke
    der möglichen Partnergruppen.
  - Das ist die Skalierung balancierter Netze (jede Synapse ~ Verstärkung/√n): Der Eingang einer
    Zelle bleibt im Arbeitsbereich, egal wie viele Eingänge und mögliche Partner sie hat. Eine Summe
    über die möglichen Partner trieb jede Zelle in die Sättigung, ein Mittel ließ sie fast stumm.
  - Vorzeichen: Sinne +, Nerven nach ihrer Klasse.
- Modulatorzellen verbinden sich nur mit lernenden Nervenzellen.
- Zellen ohne Weg zu einem Effektor werden entfernt.

## Aktivität
- Jede Synapse wirkt mit einem Schritt Verzögerung.
- Nervenzelle: y = tanh(Ruheaktivität + Hormonantrieb + Rhythmus + Σ w·x).
- Effektor: y = tanh(Ruheaktivität + Σ w·x).
- Die Aktivität einer Nervenzelle ist ihre Abweichung von der Ruherate und hat deshalb ein
  Vorzeichen. Das Vorzeichen einer Synapse (Botenstoff) kippt nie.

## Lernen und Umbau
Jede Zelle führt übliche Werte (gleitende Mittel über 500 Schritte) ihrer Eingänge (x̄), ihrer
Reaktion und ihres Lehrsignals. x̃ = x − x̄. Das wirksame Gewicht ist das Geburtsgewicht plus die
gelernte Änderung.

**Nervenzellen (nur treibende Eingänge; Synapsen von Taktgebern und Modulatoren lernen nicht):**
- **Spur:** e = ρe + (1−ρ)·x̃·(a − ā).
  - ρ aus der Zeitkonstante.
  - a = (1−L)·Taktgebereingang + L·eigene Reaktion; L ist die hormonell geregelte Spurmischung.
- **Lehrsignal:** D = Hormonantrieb (nach den Rezeptoren) + Eingänge von Modulatorzellen.
- **Bewertung:**
  - Vorhersage P = Σ v·x̃, mit einem eigenen Vorhersagewert v je Synapse;
  - Überraschung δ = (D − D̄) − P;
  - Δv = g·δ·x̃/(1+Σx̃²);
  - Δw = g·δ·e/(1+Σe²).
- **Ordnen** (Lernart > 0): Δw = g·C·y·(x̃ − w·y), mit y = Reaktion − ihr üblicher Wert.
- **Auslöschen** (Lernart < 0): Δw = −0,02·g·y·x̃, nur für Nervenquellen.
- **Vorrat:** Beim Ordnen und bei neutralen Zellen bleibt Σ|w| gleich dem Vorrat bei Geburt; beim
  Auslöschen ist er eine Obergrenze.

**Synapsen auf Effektoren** lernen nach der Bewertung ihrer sendenden Nervenzelle:
- Spur e = ρ·e + (1−ρ)·x̃·(y − ȳ), mit ρ der Quelle und y der Aktivität des Effektors.
- Δw = g·δ·e/(1+Σe²), mit g und δ der Quelle.
- Vorrat fest.

**Umbau (alle lernenden Zellen und Effektoren), Abbau und Aufbau nach denselben Regeln:**
- **Abbau:** Eine Synapse unter 5 % der mittleren Geburtsstärke ihrer Zelle verschwindet, und ihr
  Platz wird frei.
- **Aufbau:** Eine Zelle mit freiem Platz prüft je Schritt einen möglichen Partner.
  - Partnergruppe nach Bindungsstärke, darin eine zufällige Zelle, die treiben kann, angenommen
    mit p; keine doppelte Synapse.
  - Die Zelle behandelt ihn wie eine Synapse der Stärke 0. Würden ihre Lernregeln diese Synapse in
    Richtung des Vorzeichens der Quelle stärken, entsteht sie mit 10 % der mittleren Geburtsstärke.
  - Bei Nervenzellen zählen dafür Ordnen, Auslöschen und Bewertung mit x̃ des Partners; bei
    Effektoren die Bewertung der sendenden Zelle.
  - Grundbildung: 1 von 50 Versuchen bildet die Synapse ohne diese Prüfung. So können auch Zellen
    wieder angeschlossen werden, deren Aktivität sich nicht ändert (die Prüfung lehnt dort jeden
    Partner ab). Biologisch: Kontakte entstehen auch ohne Aktivität, die Aktivität entscheidet,
    welche bleiben.
- Wahrscheinlichkeiten und Bindungsstärken werden beim Bau abgelegt; das CPPN wird danach nicht mehr
  gefragt.

## Vier Hormone und lokale Steuerung
- H1…H4 liegen an den Ecken (−1,−1), (+1,−1), (−1,+1), (+1,+1).
  Qualität 1/2 wählen die Identität; Qualitätsbreite w bestimmt σ=0,15+1,85w.
  Affinität ist exp(−Abstand²/(2σ²)). Drüsenanteile werden auf Summe 1 normiert;
  Sinneszellen und funktionelle Rezeptoren können mehrere Hormone zugleich erkennen.
- Jede Zellgruppe erhält sechs zusätzliche CPPN-Abfragen, dieselben 15 Eingänge und 26 Ausgänge.
  Quelle ist der Zellort, Ziel (sign(x)·(2+k),0,0), bei x=0 positiv; Markerprodukte null.
  Ziel und Zelle liegen auf derselben Seite: Seitenprodukt, Betragsumme und Abstand sind spiegelgerade. k=0…5 bezeichnet
  Erregung, Lerngewinn, Konkurrenz, Spurmischung, Rhythmus, Sinneseigenaktivität.
  Diese Zielorte liegen außerhalb des Körpers. Qualität 1/2/Breite liefern Affinitäten;
  Kapazität liefert Grundwirkung b, Plastizität die Empfindlichkeit s (je −1…1),
  Schwelle t die Halbkonzentration K=0,0003·333,333333^((t+1)/2).
- Antwort R=clamp(b+s·c/(c+K),−1,1), c=Σ Affinität·Hormonkonzentration.
  Erregung verwendet R; Lerngewinn g=g_gen·(1+R); Konkurrenz C, Spurmischung L,
  Rhythmusstärke und Netzhautwellenstärke verwenden (1+R)/2. g_gen=0 bleibt null.
  Modulatorzellen wirken weiterhin über das lokale Lehrsignal.
- Drüsen verwenden ausschließlich ihre gewöhnliche, schwellenabhängige Aktivität für bezahlte
  Ausschüttung und Bindung. Ihr Gleichgewicht mit dem erblichen Abbau ergibt den Ruhepegel.
  Es gibt keinen zusätzlichen Produktionsweg und keinen vorausberechneten Ruhepegelmarker.
- Dynamik je Kanal: Quelle=rate·bezahlte Ausschüttung, Senke=1/τ+rate·bezahlte Bindung;
  exakte Integration über einen Schritt, Konzentration begrenzt auf 0…1. Der Hormonsinn
  verwendet dieselben vier Identitäten und behält die genetische Rezeptoradaptation.
- Alle sechs Wirkungen werden während des Lebens ausgewertet. Schlupf schaltet weder Lernen,
  Konkurrenz, Spuren noch Schrittmacher ab. Kein besonderer embryonaler Lernmodus;
  keine zusätzliche Neuronenkategorie und kein pauschaler Zelltod bei Geburt.

Die genetischen Hormon-Rezeptorgrenzen sind in `field/hormones.hh` benannt
(`HORMONE_SIGMA_MIN/MAX`, `HORMONE_HALF_MIN/MAX`). Suchreserve und pauschale
Start-Unterhaltszulage sind in `physiology.hh` benannt (`HATCH_RESERVE_FRACTION`,
`FOUNDER_UPKEEP_ALLOWANCE`); sie bleiben gemeinsame Modellkonstanten.

## Ei, Schlupf und Geburt
- Bauzeit folgt der vorhandenen Gewebearbeit (mindestens 100 Schritte). Sie bezeichnet die
  körperliche Bauphase. Der Organismus kann danach weiter im Ei bleiben.
- Körpergewebe entsteht anteilig während des Baus, finanziert aus der vorhandenen Energie.
  Zielgröße folgt der bisherigen hatch_tissue-Regel. Energieübertrag in Gewebe zählt nicht als
  Verbrauch. Gehirn, Hormone, Muskeln, Pigment, Maul, Blase und Abwehr laufen in jedem Schritt;
  Baukosten, Unterhalt und Aktivitätskosten werden jeweils einmal berechnet.
- Das Ei driftet als Hülle. Eigene Muskeln bewegen den Embryo innerhalb dieser Hülle.
  Erste mechanische Näherung: 16 Körpersektoren; Schwanz wirkt hinten und abwechselnd seitlich,
  Wenden seitlich, Maul/Pumpe/Biss vorne. Bezahlte Schlagimpulse werden mit Baufortschritt skaliert.
  Seitenlinienfluss klingt je Schritt mit Faktor 0,6 ab; Berührung enthält anhaltenden Hülldruck.
- Beengung: max(0, embryo_fold·Körperradius/Hüllradius−embryo_crowding).
  Übermäßige Beengung und Reservemangel schädigen mit vierter Potenz; ausgefahrene Abwehr
  erzeugt zusätzliche Reibungsschäden. Faltung (0,55), Kontaktschwelle (0,65), Flussabklingen (0,6),
  Fluss-/Berührungskopplung (je 0,1), Schadenskoeffizienten (0,002/0,004/0,002), Exponent (4),
  Schlupfwiderstände (0,2/4), Festigkeitsgrenze (0,95), Massenuntergrenze (0,2) und
  Gewebeversorgungssignal (0,2) sind benannte, pro Welt einstellbare Physiologieparameter.
  Die Standardwerte sind experimentell; die Kontaktschwelle ist noch nicht kalibriert.
- Sehen: nur örtliches Außenlicht, durch Pigment gefiltert. Nase: beidseitig dasselbe
  Geruchsgemisch. Seitenlinie: ausschließlich innere Bewegung; äußere Strömung bleibt draußen.
  Berührung: Hülldruck und Zuckungen. Tiefe und Innenfüllung behalten ihre Bedeutung.
  Nährstoffzufluss zeigt Gewebeversorgung und klingt nach Bauende ab; Reservemangel erzeugt
  Verletzung/Schmerz. Energie misst den tatsächlichen Vorrat.
- Zusätzliche Eigenaktivität: örtliche Netzhautwellen je Auge, Periode aus den genetischen
  Zeitkonstanten der Sehzellen (4…48 Schritte). Diese Wellen laufen lebenslang und können ohne
  hormonelle Dämpfung das Außenbild häufig überlagern. Stärke aus deren Hormonrezeptor. Keine künstlichen Geruchs-,
  Berührungs- oder Seitenlinienmuster in dieser Fassung.
- Das Spermaorgan produziert und entleert im Ei mit denselben Transfer-/Schlagregeln Sekret.
  Es schwächt die Hülle um Sekretmenge/max(1,Hüllradius). Die austretende Wolke hat die
  vorhandene Geruchs-/Tintenphysik, ist ausdrücklich nicht befruchtungsfähig. Eiablage bleibt
  gesperrt. Unverbrauchtes embryonales Sekret bleibt auch nach Geburt nicht befruchtungsfähig.
  Embryonale Sekretion läuft auch bei abgeschalteter Fortpflanzung im Testtank.
- Schlupf: Bau fertig, mindestens 20 Gewebe, ausreichende Suchreserve; Hüllenfestigkeit <0,95
  und bezahlter Vortriebs-/Wendeimpuls pro Körpermasse >0,2+4·Hüllenfestigkeit.
  Ein Sekretstoß allein und ein Muskelstoß gegen die intakte Hülle reichen nicht.
- Künstliche Startfinanzierung berücksichtigt Mindestgewebe, Suchreserve und Bauzeit-Unterhalt.
  Natürliche Eier erhalten weiterhin ausschließlich das tatsächlich eingezahlte Material.
- Suchreserve=20 % der größenabhängigen Reservekapazität der Zielgröße. Ein lebendes Ei stirbt,
  sobald Energie minus noch nötigem Körpergewebe darunter fällt. Keine Notgeburt durch Hunger.
- Jeder Rezeptor blendet über sein eigenes erbliches τ (4…48 Schritte):
  Anteil=min(1,(Alter−Schlupfalter)/τ). Lichtbilder, Geruchsrichtung und äußere Mechanik werden
  eingeblendet; innere Mechanik ausgeblendet. Dafür wird kein eigener Fortschrittszustand gespeichert. Der Schlupf
  erhält vorhandenes Gewebe, Energie, Gewichte, Spuren, Hormone und Rhythmusphasen vollständig.
- Zustände einschließlich Hülle, Sekret, Schlupfalter und vier Hormonen werden gespeichert.
  v018b verlangt frische Daten. Tests prüfen Mechanik und Erhaltung; erfolgreiche Evolution
  dieses neuen Schlupfverhaltens ist damit noch nicht belegt. Die mitgelieferten Gene bleiben
  als Vergleichspool erhalten; frühere Fress-/Nachwuchsmessungen sind gelöscht und als ungeprüft
  markiert. Schlupferfolge allein sind keine freigegebenen Startgründer.

## Sinne
- Intensitäten (Licht, Duft, Relativströmung, Hormone): x/(x+K). Begrenzte Körperanteile:
  bounded_response(x, Schwelle). Schwellen stammen aus der jeweiligen Sinneszelle.
- Auge: Umfeldkontrast mit der Antwortschwelle K, erblicher Farbgegensatz, lokale Hemmung.
  Der Winkel des Umfelds gehört zum Netzhaut-Netz und bleibt ein Weltparameter.
- Nase: örtliche Konzentration aus dem mitströmenden Geruchsfeld, gedämpft durch Sedimentkontakt.
  Nase, Seitenlinie und Hormonsinn führen je Rezeptor ein Mittel m mit τ = 4·12^time_constant; Antwort
  x/(x+K+m), dann m += (x−m)/τ. Seitenvergleiche entstehen im Gehirn. Inspektion ändert m nicht.
- Seitenlinie: gerichtete Wasserbewegung relativ zur Haut, einschließlich eigener Bewegung und
  fremdem Kielwasser; kein Abschneiden am Schwimmtempo.
- Berührung: Grunddruck plus Stoßantwort mit zelleigenem K, danach die begrenzte Kennlinie.
  Sedimentkontakt und Berührung liefern den stärkeren örtlichen Reiz.
- Hormone: gewichtete örtliche Konzentrationen ohne zusätzlichen Skalierungsfaktor.

## Schlagorgane und Bewegung
- Schwanz, beide Wenden, Pumpe, Ei-/Spermaabgabe, Kiefer und Abwehr verwenden denselben
  gleitenden Mittelwert und dieselbe Erholungsregel. τ ist das kapazitätsgewichtete Mittel der
  zugehörigen Effektorzellen; bei Gonaden zählt das Abgabegewebe. Mittelwert ≥ Schlagschwelle
  und Erholung beendet: Arbeit = Mittelwert·τ, Mittelwert auf null, Erholung = gerundetes τ.
- Vortrieb und Wende erhalten die Schlagarbeit als Impuls. Drehgeschwindigkeit bleibt zwischen
  Schlägen erhalten und wird durch Querwiderstand gedämpft. Die Seitenlinie misst die tatsächlich
  ausgeführte Drehung, einschließlich Sedimentwiderstand.
- Pumpen verteilt seine begrenzte Leistung und Transportmenge über den Arbeitszyklus. Ein
  Kieferschlag startet genau eine Schließbewegung. Die Kraft bleibt anatomisch begrenzt;
  Schlagarbeit vervielfacht keine Beißkraft. Auch mit vollem Darm können Muskeln arbeiten.
- Mundöffnung, Pumpfluss und Schließphase sind die gemeinsamen Zustände für Fraß und Darstellung.
  Die Darstellung interpoliert nur innerhalb derselben tatsächlich ausgeführten Schließbewegung.
- Benannte Körperparameter regeln Widerstand, Impulswirkung, Energiekosten, Pigment- und
  Stachelentspannung sowie Aufprall und Abrieb. Mittelwerte, Erholung, Pump-/Kieferleistung und
  Drehgeschwindigkeit werden vollständig gespeichert.

## Kosten
Zellkosten × neuron_budget/max_nodes. Bauarbeit über Maturation; laufender Unterhalt
in Ei und freiem Leben über dieselbe Körperabrechnung.

Hormonabbau und Pigmentrückgang verwenden je Kanal das nach Gewebestärke und Kanalanteil gewichtete τ ihrer Effektorzellen. Stacheln entspannen mit dem τ des Abwehrorgans. Die Zeitwerte werden beim Anatomieaufbau abgeleitet.

## Manueller Jäger: reproduzierbare Kurzprüfung

`genomes/manual-hunter.genome` ist ein neu zusammengesetztes CPPN mit 74 Knoten.
Der Generator erstellt den Genotyp; die normale Entwicklung bildet daraus das
Gehirn. Plastizität, Hormone, Eiphase und sämtliche Kosten bleiben aktiv.
Augen treiben vergleichende Steuerung; der Geruchsweg hemmt Fressen und
Vortrieb. Der genetische Rezeptor für Netzhautwellen ist gedämpft.

```sh
make -j2 bin/manual_hunter-tests bin/hunter_probe-tests
bin/manual_hunter-tests /tmp/manual-hunter.genome
bin/hunter_probe-tests genomes/manual-hunter.genome 0.2
bin/hunter_probe-tests genomes/manual-hunter.genome 0.2 0 0
bin/hunter_probe-tests genomes/manual-hunter.genome 0.2 3
bin/hunter_probe-tests genomes/manual-hunter.genome 0.2 3 1
```

Argumente der Probe: Genom, Fluchtgeschwindigkeit, Futterherkunft, ausgeschalteter
Sinn (0 Auge, 1 Nase; ohne Argument alle aktiv). Drei Entwicklungsvarianten
werden jeweils mit vier Anfangswinkeln geprüft. Pro Versuch gibt es ein
schwebendes Stück mit Energie 120 in Abstand 40; ab Abstand 30 flieht es
radial. Strömung 0,3; höchstens 500 Schritte, nach Fang weitere 100 Schritte
für Verdauung. CSV enthält Ausrichtung, Fangzeit, Verdauung, Energie und Leben.
Dies ist eine begrenzte Funktionsprobe, kein Nachweis dauerhafter Ernährung.

Die vorhandene Simulation hat keine Gift-Eigenschaft für Futter. Herkunft 3
trägt hier Aasgeruch (Kanal 5), bleibt aber essbar; der Entwurf meidet diesen
Geruch. Der ursprüngliche Jägertank ist nicht enthalten. Seine Gift- und
Fluchtregeln müssen für einen entsprechenden Nachweis noch angebunden werden.

### Ernährung und Zufuhr

Die Darmlänge L bestimmt die Verwertung: Tierisches `1−0,5L−0,4L²`,
Pflanzliches dieselbe Kurve mit `1−L`. Spezialisten verwerten 100 % ihrer
bevorzugten und 10 % der anderen Nahrung; mittlere Därme jeweils 65 %.
Kunstfutter und Bodennahrung werden unabhängig von der Darmlänge zu 80 % verwertet. Füllfaktoren:
Tierisches und Kunstfutter 1, Pflanzen 2, Bodennahrung 3.
Darmfassung `R·(1+L)/1,5`, Durchgangszeit `400·(1+L)/1,5` Schritte.
Energie, verdauliche Energie und Füllung verlassen den Darm proportional.
12 % der verdauten Energie werden verbraucht, 88 % erreichen die Reserve;
unverdaute Energie wird Bodennahrung. Wachstum verwendet den Nettoüberschuss.

Die flächenabhängige Zufuhr teilt sich in maximal 50 % Kunstfutter,
12 % Plankton und 18 % Bodentiere. Pflanzen und Algen erhalten den Rest,
auch den durch Naturverzehr eingesparten Kunstfutteranteil. Die drei Anteile
sind einstellbar, ihre Summe darf 1 nicht überschreiten. Bodentiere teilen
ihren Anteil nach relativen Kapazitätslücken; nur tatsächlicher Zuwachs wird
gebucht. Nicht genutzte Zufuhr verfällt. Fraß und Kot sind interne Transfers.
Lose Stücke haben Radius `4·√(E/100)`, ohne Größenbegrenzung. Kunstfutter
entsteht mit 25–400 Energie. Aus Körpern oder Pflanzenorganen geschnittene
Stücke behalten die flächenproportionale Dichte ihrer Quelle. Darstellung,
Retina und Maulpassung verwenden denselben übertragenen Radius.
Lose Reste unter 25 Energie gehen über den bestehenden Detritusweg zurück.
Nur Fischbisse markieren Stück und Rest als angebissen; für sie gilt 12,5 Energie.
Die Markierung wird gespeichert. Beim Zerfall und Fraß schrumpft die Fläche
proportional zur verbleibenden Energie. Pflanzenstücke behalten ihre Farbe.

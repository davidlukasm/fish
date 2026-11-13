# Fakten aus dem Code zu AUFTRAG-1311, Abschnitt 5 (Fable, 13.11.)

Zeilenangaben: Produktzweig `feature/v019-design-studio`, Stand `3146dfc`; Entwurf `entwuerfe/inspektoren.html`, Stand `916aeda`. Alles ist aus dem Code gelesen. Kein Lauf an einem Fisch. Wo ich gerechnet habe, steht es dabei.

## 1. Lenkt der Schwanz?

**Ja, die Engine lässt den Schwanz lenken. Ob er es tut, entscheidet die Schlagfolge der beiden Flanken.**

- **Zwei Flanken:** `StrokeTailLeft` und `StrokeTailRight` (`motor_state.hh:33`). Eine Muskelzelle auf der Mittellinie zieht an beiden Flanken je zur Hälfte, jede andere nur an ihrer Seite (`body_plan.cc:88-89`). Ihr Hebel kommt aus ihrer Lage im Körper (`body_plan.cc:405-407`).
- **Was eine Flanke je Schritt tut** (`body_plan.cc:1581-1583`): Von ihrer Kraft zählt, was die Gegenflanke nicht aufhebt. Davon geht der Anteil `sweep` in den Vortrieb, der Rest `1 − sweep` biegt den Körper und dreht ihn, mal dem mittleren Hebel der Flankenzellen (`tail_lever`, `body_plan.cc:100-105, 130`).
- **`sweep`** (`body_plan.cc:1554-1556, 1566`; Werte `protocol_schema.json:2231-2232`):
  - 1, wenn zuvor die andere Flanke schlug (Wechselschlag): nur Vortrieb.
  - 0,5 aus der Ruhe: halb Vortrieb, halb Drehung.
  - 0,3, wenn dieselbe Flanke noch einmal schlägt: 30 % Vortrieb, 70 % Drehung.
- **Die Drehung wirkt wie die der Flossen:** Schwanz und Flossen gehen in dieselben Größen `drive_left`/`drive_right` ein (`body_plan.cc:1583, 1585-1596`); gedreht wird mit deren Differenz (`movement.cc:84-88`).
- **Ein Schwanzmuskel nur auf der Mittellinie kann nie lenken** (Hebel 0).
- **Region Wirbelsäule** (`ui/studio/model/spine_region.js`): je Körperseite ein Taktgeber (`:25`). Die Gegenseite hemmt ihn über Kreuz (`:28, :53`), mit der Einstellung `alternation`, Vorgabe 1 (`region_catalog.js:27`). Der Lenkeingang `steer` hat 2 Zellen mit Ausgang × 0,25 und geht auf den Taktgeber der eigenen Seite (`:30, :47`). `escape` hat 4 Zellen mit vollem Ausgang (`:30, :47`).
- **Beispielfisch** (`ui/studio/model/example.js`): Das Lenksignal der Bewegungsregion geht gekreuzt an die Flossenmuskeln (`:59`) und zusätzlich an `steer` der Wirbelsäule (`:61`); der Vortriebsbefehl an `urge` (`:60`); die Wirbelsäule treibt den Schwanz (`:63`).
- **Nicht gemessen:** wie weit `steer` mit × 0,25 den strengen Wechsel der Flanken stört. Aus dem Code folgt nur: Solange streng gewechselt wird, ist `sweep` = 1 und der Schwanz schiebt nur. Der Satz in `README.md:30` („Der Schwanz schiebt, die Brustflossen drehen“) beschreibt diesen Fall, nicht die ganze Mechanik.

## 2. Bauchweh im Darm-Entwurf

### a) Woher der Buckel in der Meldung kommt (`david_darm-schmerzzellen-bump.png`)

Im Foto steht die Schwelle der Gruppe am oberen Anschlag (0,97) und das Bauchweh auf voll. Der Buckel hat drei Ursachen, alle so auch in der Engine:

1. **Bei vollem Reiz meldet jede Zelle voll, wie hoch ihre Schwelle auch ist.** Formel: `x = (Reiz − Gewohntes − Schwelle) / (1 − Schwelle)`, Meldung `x / (x + Schwelle·(1 − x))` (`body_plan.cc:987-992`; Entwurf `:773`). Bei Reiz 1 und Gewohntem 0 ist x = 1. Das ist der Anfang oben.
2. **Eine Einstellung „keine Gewöhnung“ gibt es nicht.** Die längste Gewöhnungszeit ist 1024 Schritte (`substrate.hh:32`; Entwurf `:764`). Das Gewohnte folgt dem Reiz mit 1/1024 je Schritt (`cppn_brain.cc:259-262`) und ist nach 31 Schritten bei 0,03. Genau so viel Abstand hat eine Zelle mit Schwelle 0,97 zum vollen Reiz. Sie verstummt also nach 31 Schritten.
3. **Vier der sieben Zellen sitzen auf derselben Schwelle 0,97**, weil die Streuung am Ende des Gens hart begrenzt wird (Entwurf `:783`; Engine `distribution.hh:27-32`). Sie fallen gleichzeitig aus: der Knick bei Schritt 31–36. Die übrigen drei (bei Streuung 0,3: Schwellen 0,69 / 0,78 / 0,88) fallen später einzeln aus: die Schulter bis zum Ende des Bauchwehs.

Nachgerechnet mit den Formeln des Entwurfs (Schwelle 0,97, Streuung 0,3, Bauchweh 1): Meldung 0,98 bei Schritt 2, 0,42 bei 30, 0,36 bei 36, 0,34 bei 50, 0,24 bei 100, 0,11 bei 200.

Unterschied zur Engine: Dort zieht jede Zelle ihre Schwelle zufällig gleichverteilt um die Gruppenschwelle (`distribution.hh:27-32`), der Entwurf verteilt sieben Zellen gleichmäßig (`:783`). Der Knick wäre in der Engine weicher, die Häufung am Anschlag gibt es dort ebenso.

**Was daran eine Frage an das Modell ist:** Eine Zelle mit hoher Schwelle reagiert auf kleinste Gewöhnung, weil nur der Überschuss über der Schwelle zählt und das Gewohnte vom Reiz abgezogen wird (`body_plan.cc:989`). Das stammt aus meiner Änderung vom 13.11. früh (`41e368e`, `f1d90c9`).

### b) Warum das Ertragsbild Bauchschmerzen bei Blatt zeigt, das Bauchwehbild aber nicht

- **Engine:** Bauchweh = Füllung × `gut_ache` der ganzen Mahlzeit bei der Verweildauer **in diesem Schritt** (`physiology.cc:235-237`; `physiology.hh:374-379`). Der Darmmuskel verkürzt die Verweildauer, solange er zuckt (`physiology.hh:363-371`). Grenzen: Blatt schmerzt unter 180 Schritten, Alge unter 108, Fleisch über 375, Plankton über 750, Flocken nie. Im Ei und bei leerem Darm ist das Bauchweh 0 (`physiology.cc:233-234`).
- **Entwurf:** Das Ertragsbild rahmt ein Futter, wenn es **irgendwo** zwischen der schnellsten und der ruhenden Verweildauer schmerzt (`:733`, `hurts` `:596`). Das Bauchwehbild rechnet nur mit der ruhenden Verweildauer (`:890-891`, `acheMarks(restOf())`).
- Im guten Beispielbild reicht der Darm von etwa 135 bis 297 Schritten. Blatt schmerzt nur am schnellen Ende (unter 180), in Ruhe (297) nicht. Beide Bilder rechnen richtig, zeigen aber verschiedene Zustände desselben Darms.
- **Gemeinsame Aussage wäre:** Dieses Futter schmerzt in diesem Darm nur, während der Darmmuskel treibt.

## 3. Unsicherheit der Sinneszellen in Darm und Blut

**Es gibt in keiner Sinneszelle ein Rauschen und kein Gen dafür** (`body_plan.cc:1084-1217`, `cppn_brain.cc:254-264, 385`). Was es gibt:

- **Darmmuskel:** Jede Zuckung ändert die Verweildauer (`body_plan.cc:1475`, `physiology.hh:369-371`).
  - Das Bauchweh schwankt im Takt mit (`physiology.cc:235-237`), also auch der Reiz der Schmerzzellen.
  - Der Wert eines Bissens für die Futterzellen wird mit der Verweildauer im Augenblick des Schluckens gerechnet (`physiology.hh:392-394`, `physiology.cc:207, 219`). Derselbe Bissen zählt weniger oder mehr, je nachdem ob der Darmmuskel gerade treibt.
- **Reife und andere Auslöser:** Die Meldung jeder Sinneszelle wird mit ½·(1 + Antwort „Ausgabe“) gewichtet (`substrate.cc:742-744`). Eine noch nicht gebaute Zelle meldet 0. Auslöser dieser Antwort können Reife, Reserve, Erschöpfung oder ein Botenstoff sein. Das ist eine Einstellung der Zelle, keine Unsicherheit.
- **Einblenden nach dem Schlupf** (`physiology.hh:424-428`) gibt es nur für Auge, Nase, Barteln und die Hautsinne außen (`cppn_brain.cc:361, 408`; `body_plan.cc:1187-1188`), nicht für Darm- und Blutzellen.
- **Zellen einer Gruppe sind verschieden**, wenn die Gruppe streut (`distribution.hh:20-35`): fest je Zelle, nicht von Schritt zu Schritt.

## 4. Was Futterzellen, Füllzellen und der Blutsinn messen

- **Futterzellen** (`organs.js:161`): Reiz = F / (F + Ruhebedarf) (`physiology.hh:221-223`, `body_plan.cc:1051, 1143`).
  - F steigt bei jedem Schlucken um 0,2 × Menge × Ertrag dieses Futters in diesem Darm bei der jetzigen Verweildauer (`physiology.cc:206-207, 219`; `physiology.hh:392-394`).
  - F fällt je Schritt auf 0,8 (`physiology.cc:408`, `physiology_parameters.hh:31`). Zehn Schritte nach dem letzten Bissen ist es bei einem Zehntel.
  - Sie melden also, was das gerade Geschluckte diesem Darm bringen wird, gemessen am Ruhebedarf: eine Vorhersage im Augenblick des Fressens.
  - **Im Ei** steigt F mit dem Gewebeaufbau aus dem Dotter (`physiology.cc:475`, `physiology_parameters.hh:22`). Futterzellen melden im Ei also das eigene Wachsen.
  - Sie gewöhnen sich (`brain_interface.hh:18-20`).
- **Füllzellen** (`organs.js:162`): Raumbedarf des Darminhalts ÷ Fassungsvermögen (`physiology.cc:123-125`, `body_plan.cc:1052, 1179`), gleich was im Darm ist. Keine Gewöhnung.
- **Blutsinn** (`organs.js:154`): Reiz = Summe aus Gewicht × Pegel über neun Blutgrößen (`hormones.hh:20-24, 47-54`; `body_plan.cc:1181-1183`): die sechs Botenstoffe der Drüsen, dazu Reife, Reserve (gespeicherte Energie ÷ Speichervermögen, `body_plan.cc:1050`) und Erschöpfung der Muskeln (`body_plan.cc:1531`). Welche Größen eine Zelle liest, bestimmt ihre Abstimmung (`body_plan.cc:346`). Keine Gewöhnung.
- **Der Unterschied in einem Satz:** Futterzellen melden, was gerade geschluckt wird und was es wert sein wird; Füllzellen, wie voll der Darm ist; der Blutsinn, was schon verdaut und gespeichert ist, und dazu alles andere, was im Blut steht.
- **Beispiel aus den Formeln:** Ein Räuber mit kurzem Darm frisst Blätter. Die Füllzellen melden „voll“, die Futterzellen fast nichts (Ertrag von Blatt bei 100 Schritten ist 0), die Reserve im Blut steigt nicht.

## 5. Druckzellen der Schwimmblase und Füllzellen des Magens

**Es ist dieselbe Zellart. Was eine Zelle misst, entscheidet allein, wo sie sitzt.**

- Im Atelier sind alle vier Sinn „inner_pressure“: Darm `fullness` (`organs.js:162`), Schwimmblase `pressure` (`:191`), Eier (`:232`), Samen (`:247`); Zuordnung `organs.js:352-357`.
- Beim Bau sucht die Engine für jede solche Zelle das Nächstgelegene: den Darm oder eine Organzelle (`assign_pressure`, `body_plan.cc:785-822`). Danach misst sie:
  - beim Darm: die Darmfüllung (`body_plan.cc:1179`);
  - am Eiorgan: dessen Füllung (`:1158`); am Samenorgan: dessen Füllung (`:1160`);
  - **an der Schwimmblase: die Wassertiefe** des Fischs, 0 an der Oberfläche bis 1 am Grund (`:1062, :1162`), nicht die Füllung der Blase;
  - an jedem anderen Muskel: dessen Kraft in diesem Schritt ÷ Zuckschwelle (`:1164-1177`), also eine Dehnungszelle des Muskels. In einer Flosse spürt sie beide Flossenmuskeln.
- **Gene, die wirken:** die Schwelle (beschränkte Kurve, `body_plan.cc:987-992, 1212-1217`), die Zellzahl, die Streuung in der Gruppe, die Antworten des Lebenszyklus (Bildung, Ausgabe, Tod) und die Kontakte.
- **Gene ohne Wirkung bei dieser Zellart:** die Zellzeit als Gewöhnung (Drucksinne gewöhnen nicht, `brain_interface.hh:18-20`) und als Einblendzeit nach dem Schlupf (nur Außensinne, siehe 3). Feldbreite und Abstimmung kommen in der Reizberechnung dieser Zellen nicht vor (`body_plan.cc:1150-1180`).

## 6. Drüse (Befund 7): Lösungsvorschläge, Vor- und Nachteile, Empfehlung

Nichts davon ist umgesetzt. Bilder: `bilder/2026-11-13_druese_vorschlaege.png` (die zwei Vorschläge nebeneinander) und `bilder/2026-11-13_druese_pegelformeln.png` (heute und die verworfenen Formen). Jede Kurve ist `HormoneState::advance` der Engine (`src/hormone_state.cc:37-53`), für die Vorschläge in einer Kopie außerhalb des Produkts mit einer geänderten Zeile.

**Ziel (Davids Richtung):** Ein Stoff steigt schnell über mehr Zellen und Knoten, sinkt langsam, und jede Drüse kann ihn durch Binden aktiv abbauen. Wie lange er bleibt, ist eine Einstellung der Drüse, von 4 bis 1024 Schritten.

**Was heute im Weg steht** (`hormone_state.cc:44-49`): `Pegel' = 0,01 · Abgabe − Pegel / Zellzeit`. Höhe und Verweilzeit hängen an derselben Zahl (Dauerpegel = 0,01 × Abgabe × Zellzeit), Auf und Ab dauern gleich lang, und die Zellzeit ist bei 48 Schritten gekappt (`motor_state.hh:54-59`).

### Vorschlag A: Gießen bis zur Decke (empfohlen)
Die Drüse gießt je Schritt `Abgabe ÷ 32` ins Blut, aber nie über die Decke `0,5 × Abgabe`. Was im Blut ist, klingt mit der Verweilzeit ab. Binden baut je Schritt `Bindung ÷ 32 × Pegel` ab.
- **Hinauf:** Jede Drüse braucht 16 Schritte bis zu ihrer Decke. Mehr Zellen oder Knoten steigen steiler und höher: Abgabe 2 ist nach 3 Schritten so hoch wie Abgabe 0,5 nach 12.
- **Hinunter:** mit der Verweilzeit. Bei 1024 Schritten ist der Stoff nach 710 Schritten halbiert.
- **Binden:** Eine gleich starke Bindung baut so schnell ab, wie gegossen wurde (Bindung 1 halbiert in 22 Schritten). Bei langer Verweilzeit ist Binden der einzige schnelle Weg hinunter; ein halbierter Befehl senkt den Pegel nicht.
- **Die Verweilzeit wird eine echte Wahl mit drei Nischen:**
  - *Flüchtig (4–8 Schritte):* an und aus in wenigen Schritten, ganz ohne Binden. Dafür erreicht der Stoff nur ein Viertel bis die Hälfte der Decke; für denselben Pegel braucht die Drüse zwei- bis viermal so viele Zellen.
  - *Mittel (16–64):* volle Höhe, klingt in einer Mahlzeit oder Flucht von selbst ab.
  - *Dauerhaft (250–1024):* volle Höhe mit wenigen Zellen, hält über Mahlzeiten und Laichzeiten, kostet fast nichts zu halten. Dafür wird man ihn nur durch Binden wieder los, und auf „weniger“ reagiert er nicht.
- **Vorteile:** Tempo und Höhe werden beide durch Zellen verdient, wie David es beschreibt. Der Preis bleibt wie heute an der gegossenen Menge. Eine Zeile Änderung in `hormone_state.cc`, dazu eine eigene Abbildung des Gens auf 4–1024 Schritte an der Stelle `body_plan.cc:159-167` (das Gen dient sonst weiter der Bauzeit der Zelle, `substrate.cc:610`).
- **Nachteile:** Unter 16 Schritten hängt die Höhe noch an der Verweilzeit; das ist die Nische „flüchtig“ und so gewollt, aber es ist keine vollständige Trennung. Die Rampe von 16 Schritten ist für alle gleich.

### Vorschlag B: Der Pegel folgt dem Ziel
Das Ziel ist `0,5 × Abgabe`. Liegt der Pegel darunter, läuft er in 4 Schritten hinauf; liegt er darüber, klingt er mit der Verweilzeit ab. Binden wie bei A.
- **Vorteile:** Die sauberste Form von (c). Die Höhe hängt bei jeder Verweilzeit nur an Zellen und Knoten, die Verweilzeit nur am Gen. Am schnellsten. Am einfachsten zu zeichnen: drei unabhängige Einstellungen.
- **Nachteile:**
  - Das Tempo bekommt jede Drüse geschenkt; Zellen bringen nur Höhe.
  - Ein flüchtiger Stoff kostet keine Zellen mehr. Es gibt keinen Grund, nicht immer „flüchtig“ zu wählen und bei Bedarf weiterzugießen, außer dem Energiepreis, und der ist bei Drüsen winzig (`hormone_state.hh:8`).
  - Der Preis muss neu geregelt werden: Heute wird je Schritt Abgabe bezahlt (`hormone_state.cc:25-36`). Bei B setzt ein Befehl von vier Schritten den Pegel für tausend Schritte. Bezahlt werden müsste dann, was wirklich ins Blut kommt.

### Verworfen, mit Grund
- **Nur die Spanne verlängern, Formel wie heute (b):** Der Dauerpegel wächst mit der Verweilzeit und stößt bei 1 an. Schon eine kleine Drüse füllt das Blut, Zellen bedeuten nichts mehr (Bild 2 in `…pegelformeln.png`).
- **(c) in der einfachen Form** (`Pegel' = (0,5 · Abgabe − Pegel) / Verweilzeit`): Was lange bleibt, steigt auch lange. Bei 1024 Schritten sind nach 200 Schritten Befehl erst 17 % der Höhe erreicht, ein kurzer Befehl hinterlässt nichts (Bilder 3 und 7).

### Empfehlung: A
A erfüllt alle vier Punkte von Davids Richtung wörtlich und macht aus der Verweilzeit eine Einstellung mit drei klar verschiedenen Nischen, jede mit eigenem Vor- und Nachteil. B trennt sauberer, verschenkt aber das Tempo und macht „flüchtig“ zur stets besten Wahl. Die Zahlen bei A (16 Schritte bis zur Decke, Decke 0,5 × Abgabe, Spanne 4–1024) sind Vorschläge; sie gehören als benannte Werte ins Schema.

### Was sich mit A für alle ändert, die Pegel lesen
- **Rezeptoren jeder Zelle** (`substrate.cc:502-516`, `hormones.hh:77-89`): Ihre Antwort hält so lange wie der Stoff. Halbwerte der Rezeptoren müssen zur neuen Höhe (bis 0,5 × Abgabe) passen.
- **Lehre** (`substrate.cc:834-836, 877`): Gelernt wird mit der Abweichung vom laufenden Mittel. Ein Lehrstoff sollte deshalb flüchtig bis mittel sein; ein dauerhafter lehrt nur beim Anstieg. Das berührt Befund 17.
- **Festigung, Erregung, Ausgabe einer Zelle:** bleiben an, solange der Stoff steht. Für Festigung und Reifesignale ist „dauerhaft“ damit erstmals möglich.
- **Zelltod** (`substrate.cc:512-515`): Eine Zelle stirbt, sobald ihre Tod-Antwort über ½ steigt, unumkehrbar. Ein dauerhafter Stoff als Auslöser wirkt sicher, ein flüchtiger nur bei genug Zellen.
- **Zellbildung und Körperwachstum** (`substrate.cc:607-612`, `physiology.hh:98-100`, `physiology.cc:336`): laufen, solange der Stoff da ist. Ein dauerhafter Wachstumsstoff überbrückt die Pausen zwischen Mahlzeiten.
- **Blutsinn** (`body_plan.cc:1181-1183`): meldet den Stoff, solange er steht.
- **Kosten** (`hormone_state.cc:25-36`, `body_plan.cc:1504`): Bezahlt wird das Gießen und das Binden, nie der Pegel. Dauerhaft halten ist billig, aktiv abbauen kostet.
- **Bausteine und Vorlagen:** Die Drüse der Bibliothek (`organs.js:256-260`) und die vier Vorlagen Belohnung, Wachstum, Festigung, Alarm (`systems.js:18-64, 120`) bekommen neue Verweilzeiten nach ihrer Aufgabe: Belohnung und Alarm flüchtig bis mittel, Wachstum und Festigung dauerhaft.

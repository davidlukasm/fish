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

## 6. Drüse (Befund 7): Pegelformeln, nicht umgesetzt

Bild: `bilder/2026-11-13_druese_pegelformeln.png`. Jede Kurve ist `HormoneState::advance` der Engine (`src/hormone_state.cc`), in den Bildern 3 bis 8 als Kopie außerhalb des Produkts mit einer geänderten Zeile. Abgabe 1 heißt: die Drüsenzellen geben zusammen 1 ab (Befehl × Zellstärke × Stoffanteil, `body_plan.cc:1314-1341`).

### Heute (`hormone_state.cc:37-53`)
`Pegel' = 0,01 · Abgabe − Pegel / Zellzeit − 0,01 · Bindung · Pegel`
- Dauerpegel = 0,01 × Abgabe × Zellzeit. Höhe und Verweilzeit hängen an derselben Zahl.
- Auf und Ab haben dieselbe Zeit (Bild 1).
- Die Zellzeit ist das nach Stärke und Stoffanteil gewichtete Mittel der Drüsenzellen (`body_plan.cc:159-167, 191-196`), begrenzt auf 4–48 Schritte (`motor_state.hh:54-59`).

### Welche Formel Höhe und Verweilzeit trennt
- **(c) einfach:** `Pegel' = (0,48 · Abgabe − Pegel) / Zellzeit − Binden`. Die Höhe hängt nur an der Abgabe. Aber ein Stoff, der lange bleibt, steigt auch lange (Bild 3): bei 1024 Schritten Zellzeit sind nach 200 Schritten Befehl erst 0,08 erreicht, ein kurzer Befehl hinterlässt nichts (Bild 7).
- **(c) mit Decke**, das ist Davids Richtung: gegossen wird wie heute mit 0,01 × Abgabe je Schritt, aber nie über die Decke 0,48 × Abgabe; darüber klingt der Pegel nur mit der Zellzeit ab. Eine Zeile mehr gegenüber heute.
  - Hinauf über Zellen und Knoten: doppelte Abgabe steigt doppelt so steil und doppelt so hoch (Bild 5). Bis zur Decke dauert es 48 Schritte, gleich bei welcher Abgabe.
  - Hinunter mit der Zellzeit: bei 1024 Schritten ist der Pegel nach 710 Schritten halbiert (Bild 4).
  - **Bis 48 Schritte Zellzeit ist diese Formel beim Einschalten, Halten und Abschalten Zahl für Zahl die heutige** (nachgerechnet für 4, 14 und 48 Schritte, Abweichung 0). Die 0,48 sind gerade so gewählt: 0,01 × 48.
  - **Eine Abweichung gibt es auch bei kurzer Zellzeit:** Wird der Befehl nur verringert, fällt der Pegel schneller als heute auf den neuen Wert, weil über der Decke nichts nachgegossen wird. Bei 48 Schritten und halbiertem Befehl: 30 Schritte danach 0,25 statt heute 0,36.
  - Ein kurzer Befehl von 10 Schritten hinterlässt 0,1 × Abgabe, wie heute, nur bleibt es stehen (Bild 7).

### Schnell hinauf, langsam hinunter, zusammen mit dem Binden (Bild 6)
- Bindet dieselbe Drüse (Befehl negativ, `body_plan.cc:1338-1341`), baut sie je Schritt 0,01 × Bindung × Pegel ab. Bindung 2 halbiert den Pegel in 33 Schritten, Bindung 0,5 in 116. Ohne Binden dauert es bei 1024 Schritten Zellzeit 710.
- Binden wird damit die einzige schnelle Art, einen lange bleibenden Stoff loszuwerden. Heute ist es bei kurzen Zellzeiten fast überflüssig, weil der Stoff von selbst schneller verschwindet.
- **Halber Befehl senkt den Pegel nicht schnell** (Bild 8): Die Decke fällt auf die Hälfte, der Pegel darüber klingt nur mit der Zellzeit ab und bleibt dann auf der neuen Decke stehen.

### Was sich für alle ändert, die Pegel lesen
Mit der Decke und unveränderter Spanne 4–48 ändert sich nur der eine Fall oben (verringerter Befehl). Alle übrigen Folgen kommen erst mit der längeren Spanne:
- **Rezeptoren jeder Zelle** (`substrate.cc:502-516`, `hormones.hh:77-89`): Die Antwort hängt am Pegel. Ein lange bleibender Stoff hält jede Antwort entsprechend lange. Die Pegelhöhen bleiben wie heute, die eingestellten Halbwerte passen also weiter.
- **Lehre** (`substrate.cc:834-836, 877`): Gelernt wird mit der Abweichung der Lehr-Antwort von ihrem laufenden Mittel. Ein Stoff, der lange steht, zieht das Mittel nach und lehrt dann nichts mehr; sein Ende wirkt als lange, flache Gegenlehre statt als kurzer Gegenpuls. Das berührt Befund 17.
- **Festigung, Erregung, Ausgabe:** bleiben so lange an, wie der Stoff steht.
- **Zelltod** (`substrate.cc:512-515`): Eine Zelle stirbt, sobald ihre Tod-Antwort über ½ steigt. Das ist nicht umkehrbar; ein lange stehender Stoff lässt mehr Zeit, in der das geschehen kann.
- **Zellbildung** (`substrate.cc:607-612`) und **Körperwachstum** (`physiology.hh:98-100`, `physiology.cc:336`): Sie laufen, solange der Stoff da ist. Ein Wachstumsstoff, der lange bleibt, überbrückt die Pausen zwischen Mahlzeiten.
- **Blutsinn** (`body_plan.cc:1181-1183`): liest den Pegel direkt, ohne Gewöhnung, und meldet einen lange stehenden Stoff entsprechend lange.
- **Kosten** (`hormone_state.cc:25-36`, `hormone_state.hh:8`, `body_plan.cc:1504`): Bezahlt wird je Schritt für das, was abgegeben oder gebunden wird, nie für den Pegel. Heute kostet ein gehaltener Pegel dauernde Abgabe. Mit langer Zellzeit steht der Pegel nach 48 Schritten Abgabe ohne weitere Kosten und ist bei 1024 Schritten Zellzeit erst nach 710 Schritten halbiert. Ein Pegel wird also viel billiger zu halten; aktives Abbauen durch Binden kostet dagegen.

### Welche Drüsen der heutigen Bausteine und Vorlagen sich anders verhalten
- **Mit der Decke allein:** keine beim Ein- und Abschalten; alle heutigen Drüsen haben höchstens 48 Schritte. Nur bei verringertem Befehl fallen sie schneller (siehe oben).
- **Sobald die Spanne verlängert wird, hängt alles daran, wie das Gen auf Schritte abgebildet wird.** Das Zellzeit-Gen der Drüsenzelle dient heute auch der Bauzeit der Zelle (`substrate.cc:610`) und der Spurdauer beim Lernen (`substrate.cc:851`). Die Verweilzeit braucht also eine eigene Abbildung nur an der Stelle `body_plan.cc:159-167`, wie die Gewöhnungszeit der Sinneszellen (`substrate.hh:32`).
- Mit der Abbildung 4 · 256^t (4–1024):
  - **Neue Drüse aus der Bibliothek** (`organs.js:256-260`, Zellzeit-Vorgabe 0,5, `document.js:432`): 14 → 64 Schritte.
  - **Die vier Vorlagen Belohnung, Wachstum, Festigung, Alarm** (`systems.js:18-62`): Ihre Drüse wird mit Zellzeit 1 gesetzt (`systems.js:64, 120`): 48 → 1024 Schritte. Belohnung würde 1000 Schritte nach dem Bissen noch lehren, Alarm die Muskeln 1000 Schritte nach dem Schmerz noch erregen. Sollen sie bleiben wie heute, müsste ihr Wert auf 0,45 gesetzt werden (4 · 256^0,45 = 48).
  - **Beispielfisch:** Er bekommt die Vorlage Wachstum (`example.js:84`), ist also betroffen.

### Offen für Davids Entscheidung
- Ist „48 Schritte bis zur Decke“ schnell genug? Schneller ginge nur mit mehr Stoff je Arbeit (die 0,01), das ändert dann auch alle heutigen Drüsen.
- Soll halber Befehl den Pegel schnell senken dürfen (Bild 8), oder ist „nur Binden baut schnell ab“ gewollt?
- Welche Spanne: 4–1024 wie die Gewöhnung?

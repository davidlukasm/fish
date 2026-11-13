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

## 5a. Was die Zellzahl einer Sinnesgruppe bewirkt (Davids Frage 18:58, nach seiner Korrektur 19:06 neu)

Meine erste Fassung sprach von „einer Zielzelle“ und von Gewichten an der Grenze. Beides war zu kurz: Zuhörer ist ein Knoten aus 1 bis 16 Zellen, und ein neuer Kontakt hat die Stärke 0.

### 1. Wie eine Sinneszelle ihre Zielzellen findet

- **Eine Wahrscheinlichkeit je Gruppenpaar.** Sinnesgruppe und Knoten sind je eine Gruppe mit 1 bis 16 Zellen (`substrate.hh:131-132`, `development.cc:133-138`). Für jedes Paar aus sendender und empfangender Gruppe rechnet die Engine eine Wahrscheinlichkeit p (`development.cc:625-645`, `contacts.hh:124-150`):
  - **Adresse:** Abstand zwischen der Sendeadresse der Sinnesgruppe und einer Empfangsadresse des Knotens, gemessen an dessen Suchweite. Innerhalb des Kerns zählt er voll (1), weiter außen fällt er glatt auf 0 (`contacts.hh:40, 47-54, 129-138`). Ein Knoten hat mehrere Empfangsfelder, das beste zählt.
  - **Seite:** gleiche oder gekreuzte Körperseite, nach `crossing` (`contacts.hh:141-143`).
  - **Weg:** `exp(−Abstand ÷ Reichweite)`, Abstand in Körperlängen (`contacts.hh:146-149`).
  - Das Atelier legt die Adressen so, dass gezeichnete Verbindungen im Kern liegen und nicht gezeichnete außerhalb (`werkzeug/atelier_connections.hh:224-253, 552-590`). Bei einer gezeichneten Verbindung bleibt also Seite × Weg.
- **Gewürfelt wird je Zellpaar.** Jede Zelle des Knotens würfelt für jede Zelle der Sinnesgruppe einzeln mit p (`development.cc:336-343`). Von n Sinneszellen bekommt eine Knotenzelle im Mittel n × p Vorschläge. Bei p = 1 hört jede Knotenzelle jede Sinneszelle.
- **Eingänge sind begrenzt.** Eine Nervenzelle hat 4 bis 512 Eingänge (`4 × 128^field_width`), Muskel- und Drüsenzellen 32 (`contacts.hh:18-33`, `development.cc:293-297`). Hat eine Knotenzelle aus allen ihren Quellen mehr Vorschläge als Eingänge, bleibt eine zufällige Auswahl (`development.cc:349-355`).

### 2. Start-Stärke

- **Jeder neue Kontakt beginnt mit Stärke 0**, ohne Ausnahme (`substrate.cc:548`; beim Start aller Vorschläge `:397-403`, beim Wachsen `:630-641`). Es gibt im Code keine zweite Stelle, die eine Stärke setzt. Geändert wird sie nur durch die Lernregel (`substrate.cc:959`).
- **Erblich ist die Obergrenze**, nicht der Start: die Kontaktgrenze der Zielzelle (`synapse_strength`, Vorgabe 0,5; für lehrende Kontakte eine eigene; `substrate.hh:62, 123-126`, `development.cc:76, 185`). Der Vorschlag trägt diese Grenze mit (`development.cc:343, 372`), das Netz liest davon nur Quelle und Ziel (`substrate.cc:400-401`).
- **Probezeit:** Der Kontakt bekommt 4 × Lernzeit der lernenden Zelle (`substrate.cc:550-551`, `dynamics.hh:13`). Jeder Kontakt kostet Bau, nach Länge (`substrate.cc:541-546`).

### 3. Was Entwicklung und Lernen ändern

- **Wachsen der Stärke** (`substrate.cc:905-939`): Jeder Kontakt hat seine eigene Stärke, zwischen 0 und der Kontaktgrenze.
  - Gewöhnliche Kontakte wachsen, wenn Sinneszelle und Knotenzelle zugleich von ihrem Üblichen abweichen, und durch Überraschung (Lehrsignal). Die Knotenzelle muss dafür selbst aktiv sein: durch Grundantrieb, Takt, Hormon oder andere Eingänge (`substrate.cc:799-803, 827-833`).
  - Lehrende Kontakte wachsen mit ihrer Benutzung auf die Grenze zu (`substrate.cc:929`).
  - Tempo: Lernrate der Zelle × Lernhormon (`substrate.cc:338-342`).
- **Verdrängen:** Eine aktive Knotenzelle schwächt ihre stillen Eingänge (`substrate.cc:911-912`). Sinneszellen einer Gruppe, die selten melden, verlieren gegen die, die oft melden.
- **Vergessen:** Jede Stärke fällt mit Halbwertszeit 500 Schritte, unbenutzt schneller (`substrate.cc:343-348`, `dynamics.hh:12, 14`).
- **Festigung** bremst Verdrängen und Vergessen bis auf null (`substrate.cc:930-932, 943-955`, `:343-346`).
- **Abbau:** Nach der Probezeit verschwindet ein Kontakt, wenn seine Stärke unter 0,005 liegt und er weniger als halb gefestigt ist (`substrate.cc:962-970`, `:337`, `dynamics.hh:10, 17`). Stirbt die Sinneszelle, verschwindet er sofort (`substrate.cc:771-773`).
- **Neubildung über das ganze Leben** (`substrate.cc:655-693`, Aufruf `:975-976`): Jede Knotenzelle mit freiem Eingang wählt je Schritt eine ihrer Quellgruppen, würfelt mit demselben p, nimmt daraus eine zufällige Zelle und knüpft den Kontakt mit Wahrscheinlichkeit 1/50, oder sicher, wenn das Lernen ihn gerade stärken würde. Auch dieser Kontakt beginnt bei 0.
  - Die Quellgruppe wird gleichverteilt gewählt (`:664-665`). Eine Gruppe mit mehr Zellen wird dabei nicht öfter gewählt.

### 4. Was daraus für die Zellzahl folgt

- **Bei p = 1** (gezeichnete Verbindung, nah, gleiche Seite): mehr Kontakte je Knotenzelle, nicht mehr erreichte Knotenzellen. Jede Knotenzelle hört ohnehin alle.
- **Bei p < 1: beides.** Der Anteil der Knotenzellen ganz ohne Kontakt zur Gruppe ist `(1 − p)^n`:

  | p | 2 Zellen | 8 Zellen | 16 Zellen |
  |---|---|---|---|
  | 0,1 | 81 % | 43 % | 19 % |
  | 0,3 | 49 % | 6 % | 0,3 % |
  | 0,6 | 16 % | 0,1 % | 0 % |

- **Die Eingänge der Knotenzelle deckeln.** Bei `field_width` 0 hat sie 4 Eingänge für alle Quellen zusammen. Dann finden von 16 Sinneszellen höchstens 4 Platz, und sie verdrängen andere Quellen.
- **Am Anfang bewirkt die Zellzahl nichts**, weil alle Stärken 0 sind. Was mehr Zellen bringen, entsteht erst durch Lernen:
  - mehr Kontakte, die einzeln bis zur Grenze wachsen können. Die Knotenzelle addiert Meldung × Stärke über alle Kontakte und teilt durch nichts (`substrate.cc:776-786`), ihre Antwort sättigt mit tanh (`substrate.cc:801-803`). Mit gelernten Stärken reicht bei 16 Zellen ein Achtel der Meldung für dieselbe Wirkung wie bei zwei;
  - bei gestreuten Schwellen mehr Stufen: Jede Sinneszelle hat ihre eigene Schwelle (`distribution.hh:20-35`) und ihre eigene gelernte Stärke. Der Knoten kann so lernen, auf „halb voll“ anders zu antworten als auf „ganz voll“. Mit 2 Zellen hat er dafür zwei Stufen, mit 16 fast eine Rampe;
  - Reserve: Jede Zelle wird einzeln gebaut und kann einzeln sterben (`substrate.cc:502-516, 607-612`).
- **Kosten je Sinneszelle, alle klein:** Bau 0,00125 Energie, Unterhalt 0,0000016 je Schritt (`maturation.hh:9-12, 23-29`, `body_plan.cc:826-835`), Masse 0,001 × Zellstärke (`body_plan.cc:15, 369-370`). Dazu der Bau jedes Kontakts.
- **Keine Normierung:** Der Anteil `gain` einer Zelle wird nur für Übersichten gezählt (`body_plan.cc:661, 912, 959`).

## 6. Drüse (Befund 7): Lösungsvorschlag, mit Claude abgestimmt (13.11. 19:02)

Nichts davon ist umgesetzt. Bild zum Vorschlag: `bilder/2026-11-13_druese_b_zwei_zeiten.png`. Zum Vergleich: `…druese_vorschlaege.png` (A gegen B) und `…druese_pegelformeln.png` (heute und die verworfenen Formen). Jede Kurve ist `HormoneState::advance` der Engine (`src/hormone_state.cc:37-53`), für die Vorschläge in einer Kopie außerhalb des Produkts mit einer geänderten Zeile.

**Ziel (Davids Richtung):** Ein Stoff steigt schnell über mehr Zellen und Knoten, sinkt langsam, jede Drüse kann ihn durch Binden aktiv abbauen, und es soll jede Kombination möglich sein.

**Was heute im Weg steht** (`hormone_state.cc:44-49`): `Pegel' = 0,01 · Abgabe − Pegel / Zellzeit`. Höhe und Verweilzeit hängen an derselben Zahl, Auf und Ab dauern gleich lang, und die Zellzeit ist bei 48 Schritten gekappt (`motor_state.hh:54-59`).

### Vorschlag B mit zwei Zeiten (empfohlen)
Das Ziel des Pegels ist `0,5 × Abgabe`. Liegt der Pegel darunter, läuft er mit der **Anstiegszeit** hinauf; liegt er darüber, klingt er mit der **Verweilzeit** ab. Binden baut je Schritt `Bindung ÷ 32 × Pegel` ab.
- **Höhe:** nur aus Zellen und Knoten, bei jeder Einstellung der Zeiten (Bild 2). Eine größere Drüse erreicht eine bestimmte Wirkung auch früher, weil ihr Ziel höher liegt.
- **Anstiegszeit:** die Zellzeit der Drüsenzelle, 4–48 Schritte wie heute (`time_constant`). Sie bleibt zugleich Bauzeit und Spurdauer der Zelle; dort ändert sich nichts.
- **Verweilzeit:** ein eigenes Gen, 4–1024 Schritte. Frei dafür ist `field_width`: Bei Drüsenzellen liest es die Engine nicht. Gelesen wird es nur bei Sinneszellen (`body_plan.cc:308-350`), bei Nervenzellen für die Zahl der Eingänge (`contacts.hh:25-33`; Effektoren haben eine feste Zahl) und bei Abwehrzellen für die Breite der Stacheln (`body_plan.cc:857-874`). Der Compiler schreibt es für jede Zelle (`atelier_compiler.hh:272`), das Atelier setzt 0,3 vor (`document.js:432, 451`) und zeigt es bei Drüsen nirgends.
- **Alle vier Kombinationen sind möglich und verschieden** (Bild 1):
  - *schnell hinauf, langsam hinunter:* Ein kurzer Befehl genügt, der Stoff bleibt; los wird man ihn nur durch Binden.
  - *schnell hinauf, schnell hinunter:* Der Stoff folgt dem Befehl in beide Richtungen und hält nichts; für einen gehaltenen Pegel muss dauernd gegossen werden.
  - *langsam hinauf, langsam hinunter:* Kurze Befehle hinterlassen wenig, aber es bleibt; wiederholte Befehle sammeln sich an.
  - *langsam hinauf, schnell hinunter:* Nur ein anhaltender Befehl wirkt; kurze gehen unter.
- **Binden** (Bild 3): Bindung 1 halbiert den Pegel in 22 Schritten. Ein halbierter Befehl senkt einen dauerhaften Stoff nicht schnell; das tut nur Binden.
- **Preis: keiner, der zählt** (korrigiert 19:35). Abgabe und Bindung kosten je Schritt `0,000025 × (Abgabe + Bindung)` (`hormone_state.hh:8`, `maturation.hh:10`, `hormone_state.cc:25-34`). Ein Drüsenknoten des Ateliers (5/16) kostet bei vollem Befehl 0,0000078 je Schritt, das sind 0,02 % des Ruhebedarfs von 0,0333 (`physiology.hh:42-46`, `physiology_parameters.hh:27, 34`, `physiology_parameters.cc:8, 20`). Meine frühere Abwägung „flüchtig halten heißt dauernd bezahlen“ trägt deshalb nicht. Der Unterschied liegt in der Verdrahtung: Wer einen flüchtigen Stoff halten will, muss ihn dauernd ansteuern; wer einen dauerhaften loswerden will, muss aktiv binden.
- **Das Gen sitzt in der Drüsenzelle** (korrigiert 19:35; Erbanlagen gibt es nur für Zellen). Die Verweilzeit eines Stoffs ist das Mittel über alle Zellen, die ihn abgeben, gewichtet mit Stärke × Stoffanteil, genau wie heute die Anstiegszeit (`body_plan.cc:157-168, 191-196`). Der Griff sitzt im Atelier am Drüsenknoten wie die Zellzeit. Gießen zwei Knoten denselben Stoff mit verschiedener Einstellung, gilt das Mittel, und das Bild zeigt dieses Mittel. Meine frühere Fassung („gehört zum Stoff, der Compiler schreibt sie in alle Zellen“) entfällt.
- **Mischungen:** Eine Drüsenzelle gibt mehrere Stoffe im festen Verhältnis ihrer Abstimmung ab (`body_plan.cc:422-428, 1338-1341`). Sie trägt ein Gen, also haben alle ihre Stoffe dieselbe Verweilzeit. Verschiedene Zeiten brauchen verschiedene Zellen. Mein früherer Satz „ein Befehl hinterlässt einen kurzen und einen langen Stoff zugleich“ war falsch; ich hatte ihn nicht gegen die Zeilen gehalten, die ich daneben zitiert habe.
- **Umfang der Änderung:** eine Zeile in `hormone_state.cc`, die zweite Zeit an der Stelle `body_plan.cc:159-167, 191-196`, zwei benannte Werte im Schema (Höhe 0,5, Spanne der Verweilzeit), im Atelier der Griff am Stoff.

### Geprüft und nicht empfohlen
- **A, Gießen bis zur Decke:** Gegossen wird mit einer Rate, nie über 0,5 × Abgabe. Flüchtige Stoffe bleiben dabei niedrig (bei 4 Schritten ein Viertel der Höhe). Das trennt Höhe und Verweilzeit nicht vollständig, und in B mit zwei Zeiten ist A als Sonderfall enthalten (Anstieg 16).
- **Nur die Spanne verlängern, Formel wie heute:** Der Dauerpegel wächst mit der Verweilzeit und stößt bei 1 an; schon eine kleine Drüse füllt das Blut, Zellen bedeuten nichts mehr.
- **(c) in der einfachen Form** (eine Zeit für Auf und Ab): Was lange bleibt, steigt auch lange. Bei 1024 Schritten sind nach 200 Schritten Befehl erst 17 % der Höhe erreicht.

### Was sich für alle ändert, die Pegel lesen
- **Rezeptoren jeder Zelle** (`substrate.cc:502-516`, `hormones.hh:77-89`): Ihre Antwort hält so lange wie der Stoff. Die Halbwerte der Rezeptoren müssen zur Höhe 0,5 × Abgabe passen.
- **Lehre** (`substrate.cc:834-836, 877`): Gelernt wird mit der Abweichung vom laufenden Mittel. Ein dauerhafter Lehrstoff lehrt nur beim Anstieg. Das berührt Befund 17.
- **Festigung, Erregung, Ausgabe einer Zelle:** bleiben an, solange der Stoff steht. Für Festigung und Reifesignale wird „dauerhaft“ damit erstmals möglich.
- **Zelltod** (`substrate.cc:512-515`): Eine Zelle stirbt, sobald ihre Tod-Antwort über ½ steigt, unumkehrbar.
- **Zellbildung und Körperwachstum** (`substrate.cc:607-612`, `physiology.hh:98-100`, `physiology.cc:336`): laufen, solange der Stoff da ist. Ein dauerhafter Wachstumsstoff überbrückt die Pausen zwischen Mahlzeiten.
- **Blutsinn** (`body_plan.cc:1181-1183`): meldet den Stoff, solange er steht.
- **Bausteine und Vorlagen:** Die Drüse der Bibliothek (`organs.js:256-260`) und die vier Vorlagen Belohnung, Wachstum, Festigung, Alarm (`systems.js:18-64, 120`) bekommen Zeiten nach ihrer Aufgabe: Belohnung und Alarm schnell hinauf und nicht lange bleibend, Wachstum und Festigung dauerhaft.

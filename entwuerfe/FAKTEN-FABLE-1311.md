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

**Berichtigt, siehe 5b:** Punkt 3 gilt für den Entwurf, nicht für die Engine. Im Aquarium melden alle Zellen einer Gruppe die Antwort der ersten Zelle.

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
  - ~~bei gestreuten Schwellen mehr Stufen~~: gilt im Aquarium nicht, siehe 5b. Alle Zellen einer Gruppe melden die Antwort der ersten;
  - Reserve: Jede Zelle wird einzeln gebaut und kann einzeln sterben (`substrate.cc:502-516, 607-612`).
- **Kosten je Sinneszelle, alle klein:** Bau 0,00125 Energie, Unterhalt 0,0000016 je Schritt (`maturation.hh:9-12, 23-29`, `body_plan.cc:826-835`), Masse 0,001 × Zellstärke (`body_plan.cc:15, 369-370`). Dazu der Bau jedes Kontakts.
- **Keine Normierung:** Der Anteil `gain` einer Zelle wird nur für Übersichten gezählt (`body_plan.cc:661, 912, 959`).

## 5b. Die Zellen einer Sinnesgruppe melden im Aquarium alle dasselbe (Astras Fund 19:41, nachgemessen 19:44)

**Das berichtigt meine Abschnitte 2a und 5a.** Dort habe ich geschrieben, jede Zelle einer Gruppe melde mit ihrer eigenen, gestreuten Schwelle. Die Schwellen sind je Zelle verschieden, gemeldet wird aber nur die Antwort der ersten Zelle.

- **Code:** Beim Bau bekommt jede weitere Zelle derselben Gruppe den Verweis auf die erste (`src/body_plan.cc:315-317`). Im Sinnesweg mit Wasser übernimmt sie deren Meldung und deren Gewöhnungsstand, solange die erste Zelle lebt und nicht stummgeschaltet ist (`src/cppn_brain.cc:339-348`, `colony-core/field/substrate.hh:250, 310`). Das gilt für alle Sinne außer Licht und Nähe.
- **Diesen Weg geht das Aquarium** (`src/movement.cc:52-58`). Im Atelier gehen ihn die Proben für Geruch, Berührung und Verletzung (`werkzeug/atelier.cc:161-180`). **Die Darm- und die Strömungsprobe des Ateliers rechnen dagegen jede Zelle für sich** und zeigen den Mittelwert der Gruppe (`werkzeug/atelier.cc:138-159, 182-205`; berichtigt 19:58 nach Astra 19:58, ich hatte nur die Zeilen 177 und 229 gelesen). ~~Das Atelier zeigt bei Darm und Seitenlinie also eine gestaffelte Antwort, die der Fisch im Aquarium nicht hat.~~ **Falsch, berichtigt 20:03 nach Astra 20:02:** Der Bericht des Ateliers baut die Zellen ohne Streuung, alle Kopien einer Gruppe sind dort gleich (`werkzeug/atelier.cc:788-791`, `werkzeug/atelier_compiler.hh:291-314`; nur die Lichtvorschau zieht gestreute Werte, `:325-355`). Die Proben zeigen deshalb je Gruppe eine Antwort, auf beiden Rechenwegen. Gestaffelt wird im heutigen Atelier nichts angezeigt. Ohne Wasser rechnet auch die Engine je Zelle (`src/cppn_brain.cc:855-871`).
- **Nachgemessen mit der Engine** (drei Füllzellen einer Gruppe, Schwellen 0,2 / 0,5 / 0,8, `sense_generated`):

  | Darmfüllung | wie gebaut | jede Zelle für sich |
  |---|---|---|
  | 0,10 | 0 / 0 / 0 | 0 / 0 / 0 |
  | 0,35 | 0,54 / 0,54 / 0,54 | 0,54 / 0 / 0 |
  | 0,60 | 0,83 / 0,83 / 0,83 | 0,83 / 0,33 / 0 |
  | 0,90 | 0,97 / 0,97 / 0,97 | 0,97 / 0,89 / 0,56 |

- **Was in einer Sinnesgruppe deshalb keine Wirkung auf die Meldung hat:** die Streuung von Schwelle, Gewöhnungszeit und Abstimmung zwischen ihren Zellen. Es zählt die erste Zelle. Auch sie zieht ihre Werte mit der Streuung um den eingestellten Wert (`colony-core/field/development.cc:161-175`). Die Streuung verschiebt also, zufällig je Fisch, die Schwelle der ganzen Gruppe; eine Staffelung innerhalb der Gruppe macht sie nicht. Stirbt die erste Zelle, melden die übrigen ab da jede für sich.
- **Was die Zellzahl einer Sinnesgruppe dann noch bewirkt:** Jede Zelle bleibt eine eigene Nervenzelle mit eigenen Kontakten und eigenen gelernten Stärken (Abschnitt 5a, 1 bis 3). Mehr Zellen heißt also dieselbe Meldung über mehr Kontakte, nicht mehr Stufen. Dazu Reserve, und bei den Barteln die Länge (Astra 19:39).
- **Abstufungen brauchen getrennte Gruppen.** Zwei Gruppen mit verschiedener Schwelle melden verschieden.
- **Entstehung:** Das Teilen ist älter als der Git-Verlauf (vor 06.11.). Die Streuung je Zelle kam am 07.11. dazu (`7fede91`, „Plastische Entwicklung mit genetischer Streuung“). Seitdem zieht jede Zelle eigene Werte, und der Sinnesweg liest nur die der ersten. Ob das Teilen bleiben soll, ist eine frühere Entscheidung, deren Abwägung ich noch nicht kenne (Suche in den alten Chats läuft). Ich empfehle nichts.
- **Folgen für meine früheren Aussagen:**
  - 2a: Der Buckel entsteht im Entwurf, weil er die Zellen einzeln rechnet. In der Engine fallen nicht mehrere Zellen nacheinander aus, die Gruppe folgt der ersten Zelle.
  - 5a, Punkt 4: „mehr Stufen bei gestreuten Schwellen“ gilt im Aquarium nicht.
  - Mein Vorschlag „Spiegeln am Gen-Ende“ (19:07) ist zurückgezogen. Die Häufung hat im Aquarium keine Wirkung auf die Meldung.

## 5c. Jede Sinneszelle mit eigener Antwort: was je Zelle streut (Davids Entscheidung 20:11, geklärt 20:19)

**Die Zelle braucht keinen eigenen Blick in die Welt. Alle Rohwerte liegen schon je Fisch, je Nasenloch, je Hautsektor oder je Bartelspitze vor; je Zelle kommt nur die Gewichtung dazu.**
  - **Was je Zelle gezogen wird** (`colony-core/field/development.cc:161-178`, `distribution.hh:14-35`): Schwelle, Zellzeit, Feldbreite, Abstimmung (`quality1`, `quality2`, `quality_width`), dazu Grundantrieb, Lernwerte und Kontaktgrenze. **Nicht je Zelle:** der Ort. Alle Zellen einer Gruppe sitzen am selben Platz („Anatomy and contact fields are shared by a centre“, `development.cc:167`).
  - **Was das je Sinn im Reiz ändert:**

    | Sinn | je Zelle verschieden | Rohwert, einmal geholt |
    |---|---|---|
    | Füllung, Bauchweh, Nährwert, Tiefe, Ei- und Samendruck, Muskeldehnung | nichts außer Schwelle und Gewöhnung | je Fisch (`body_plan.cc:1046-1067, 1154-1180`) |
    | Geruch | Passung zu den acht Gerüchen | je Nasenloch, vor der Schleife (`cppn_brain.cc:308-325, 364-372`) |
    | Geschmack (Barteln) | Passung und Anteil Tasten | je Bartelspitze; **heute in der Schleife** (`cppn_brain.cc:375-378`) |
    | Tasten, Hautschmerz, Seitenlinie | Breite über die 16 Sektoren; die Richtung nicht, sie kommt vom Ort | je Sektor im Fisch (`body_plan.cc:346-359, 1101-1152`) |
    | Gleichgewicht | Haarrichtung (`quality1`) | Lage des Fischs (`body_plan.cc:330-331, 1098-1100`) |
    | Blutsinn | Passung zu den Stoffen | Pegel je Fisch (`body_plan.cc:1181-1185`) |

  - **Umbau:** Der Zweig, der die Antwort der ersten Zelle kopiert, fällt weg (`src/cppn_brain.cc:341-348`). Die Schleife dahinter rechnet schon heute jede Zelle vollständig, mit eigenem Gewöhnungsstand (`:254-262, 385`). Dazu den Bartelkontakt einmal je Seite vor die Schleife holen (Astra 19:49), sonst sucht jede Geschmackszelle die Gitter selbst ab.
  - **Kosten, gemessen** (160 Zellen in 10 Gruppen, `sense_generated`, ohne anliegenden Reiz): je zusätzlicher Zelle und Schritt 7 ns bei Füllzellen, 12 ns bei Hautschmerz, 18 ns bei Tasten, 29 ns bei der Seitenlinie. Tasten mit anliegendem Kontakt und Geschmack habe ich nicht gemessen.
  - **Das Atelier** baut seine Proben ohne Streuung (`werkzeug/atelier_compiler.hh:309-314`). Soll es die Staffelung zeigen, muss es die Zellen wie für die Lichtvorschau mit Streuung ziehen (`:325-355`).

## 6. Drüse (Befund 7): Lösungsvorschlag, mit Claude abgestimmt (13.11. 19:02)

Nichts davon ist umgesetzt. Bild zum Vorschlag: `bilder/2026-11-13_druese_b_zwei_zeiten.png`. Zum Vergleich: `…druese_vorschlaege.png` (A gegen B) und `…druese_pegelformeln.png` (heute und die verworfenen Formen). Jede Kurve ist `HormoneState::advance` der Engine (`src/hormone_state.cc:37-53`), für die Vorschläge in einer Kopie außerhalb des Produkts mit einer geänderten Zeile.

**Ziel (Davids Richtung):** Ein Stoff steigt schnell über mehr Zellen und Knoten, sinkt langsam, jede Drüse kann ihn durch Binden aktiv abbauen, und es soll jede Kombination möglich sein.

**Was heute im Weg steht** (`hormone_state.cc:44-49`): `Pegel' = 0,01 · Abgabe − Pegel / Zellzeit`. Höhe und Verweilzeit hängen an derselben Zahl, Auf und Ab dauern gleich lang, und die Zellzeit ist bei 48 Schritten gekappt (`motor_state.hh:54-59`).

### Vorschlag B mit zwei Zeiten (empfohlen)
Das Ziel des Pegels ist `0,5 × Abgabe`. Liegt der Pegel darunter, läuft er mit der **Anstiegszeit** hinauf; liegt er darüber, klingt er mit der **Verweilzeit** ab. Binden baut je Schritt `Bindung ÷ 32 × Pegel` ab.
- **Höhe:** nur aus Zellen und Knoten, bei jeder Einstellung der Zeiten (Bild 2). Das gilt ohne gleichzeitiges Binden; Binden drückt den gehaltenen Pegel darunter. Eine größere Drüse erreicht eine bestimmte Wirkung auch früher, weil ihr Ziel höher liegt.
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
- **Umfang der Änderung:** eine Zeile in `hormone_state.cc`, die zweite Zeit an der Stelle `body_plan.cc:159-167, 191-196`, zwei benannte Werte im Schema (Höhe 0,5, Spanne der Verweilzeit), im Atelier der Griff am Drüsenknoten, dazu je Stoff die Anzeige der Zeit, die sich aus seinen Zellen ergibt.

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

## 6a. Drüse B, kleinster Fall vor dem Bau (20:19)

Gerechnet mit der Mittelung der Engine (`src/body_plan.cc:157-168, 191-196`: je Stoff über die Zellen, die ihn abgeben, gewichtet mit Stärke × Stoffanteil) und der Formel B in einer Kopie von `hormone_state.cc`. Jeweils Befehl 1 für 20 Schritte, Anstieg 4 Schritte. Spalten: Pegel bei Schritt 20 / 30 / 60 / 120 / 300.

  | Fall | Pegel | Befund |
  |---|---|---|
  | 1a. Eine Zelle (Stärke 1), ein Stoff, Abklingen 256 | 0,50 / 0,48 / 0,43 / 0,34 / 0,17 | in Ordnung |
  | 1b. Drüsenknoten des Ateliers (5/16), sonst gleich | 0,16 / 0,15 / 0,13 / 0,11 / 0,05 | **Höchstpegel ist die halbe Stärke**, hier 0,16 |
  | 2. Eine Mischzelle 60 % / 40 %, Abklingen 256 | Stoff 0: 0,30 … 0,10; Stoff 1: 0,20 … 0,07 | gleiche Zeit, festes Verhältnis, wie vorhergesagt |
  | 3. Zwei Zellen, je ein Stoff, Abklingen 8 und 512 | Stoff 0: 0,50 / 0,14 / 0,00; Stoff 1: 0,50 / 0,49 / 0,46 / 0,41 / 0,29 | unabhängig |
  | 4a. Zelle A gibt Stoff 0 ab (Abklingen 8). Zelle B mischt beide (Abklingen 512) und **schweigt** | Stoff 0: 0,50 / 0,47 / 0,40 / 0,28 / 0,10 | **Schwachstelle**, siehe unten |
  | 4b. Dasselbe ohne Zelle B | Stoff 0: 0,50 / 0,14 / 0,00 | |
  | 5a. Eine Zelle, Abklingen 512, bindet von Schritt 60 bis 120 | 0,50 / 0,49 / 0,46 / 0,06 / 0,04 | Halbwertszeit beim Binden 22 Schritte |
  | 5b. Drüsenknoten des Ateliers, sonst gleich | 0,16 / 0,15 / 0,14 / 0,07 / 0,05 | Halbwertszeit 71 Schritte: **Binden hängt an der Stärke** |
  | 6a. Zelle A gibt dauernd ab, Zelle B bindet denselben Stoff ab Schritt 60, Anstieg 4 | 0,50 → 0,44 | Binden senkt nur um 13 % |
  | 6b. Dasselbe mit Anstieg 48 | 0,36 → 0,20 (Ziel 0,50) | Binden hält den Pegel auf 39 % |
  | 7. Mischzelle 60 % / 40 % bindet | 0,28 : 0,18 → 0,08 : 0,08 | der größere Anteil wird schneller abgebaut, die Mischung verschiebt sich |

  - **Schwachstelle (Fall 4):** Die Abklingzeit eines Stoffs ist ein fester Mittelwert über alle Zellen, die ihn abgeben können, auch über die, die gerade schweigen. Zelle A allein gibt einen flüchtigen Stoff ab (8 Schritte); nur weil es Zelle B gibt, bleibt er mit 176 Schritten. Das Mittel wird in Schritten gebildet, die lange Zeit überwiegt also. Dieselbe Eigenschaft hat heute schon die Anstiegszeit.
    - **Weg a, so lassen:** + einfach, gleich wie die Anstiegszeit, ein Wert je Stoff, den das Atelier anzeigen kann. − eine flüchtige und eine dauerhafte Drüse für denselben Stoff gibt es nicht; die dauerhafte gewinnt.
    - **Weg b, gewichten mit dem, was jede Zelle wirklich abgegeben hat:** + was Zelle A abgibt, bleibt so lange, wie Zelle A sagt. − ein gespeicherter Wert je Stoff mehr (im Speicherstand), eine Regel mehr.
    - **Meine Empfehlung: Weg a.** Im Atelier gibt jeder Drüsenknoten seinen eigenen Stoff ab (`ui/studio/model/organs.js:254-260`), der Fall entsteht dort nur, wenn jemand zwei Knoten für denselben Stoff verschieden einstellt, und dann zeigt die Anzeige je Stoff das Mittel. Weg b ist die Antwort, falls David genau das will.
  - **Binden schaltet eine laufende Drüse nicht ab (Fall 6).** Es räumt Reste weg. Gegen eine schnell ansteigende Drüse wirkt es kaum. Das ist eine Eigenschaft der Formel, kein Rechenfehler; David sollte sie kennen.
  - **Für den Bau, damit nichts vergessen wird:**
    1. Zweite Zeit je Stoff neben `hormone_timing` (`src/brain_interface.hh:106`), gefüllt in derselben Schleife (`body_plan.cc:157-168`), gesetzt bei `:191-196`, übergeben bei `:1640-1643`.
    2. Eine benannte Funktion Feldbreite → Abklingzeit, 4 bis 1024 Schritte. Die Vorgabe des Ateliers 0,3 (`document.js:432, 451`) ergibt 21 Schritte.
    3. `hormone_state.cc:36-53`: Auch `integrated_` muss mit der neuen Abklingzeit rechnen, sonst zeigen `ecology_step.cc:339` und `hormone_view.cc:111` falsche Werte.
    4. `parameters.rate` (`hormone_state.hh:8`) ist danach nur noch die Bindungsrate (1/32). Die Höhe 0,5 und die Rate kommen benannt ins Schema.
    5. Abwehrzellen lesen `field_width` für die Stachelbreite (`body_plan.cc:857-874`). Eine Zelle hat genau eine Ausgabe (`development.cc:60-61`), es gibt also keine Zelle, die beides ist.

## 7. Frühere Entscheidungen aus den alten Chats (Suche 19:47, nach Leitlinie 5)

**Quellen:** Hauptchat „Code-Review und Dichte“ (Claude mit David, `https://claude.ai/chat/58ba3836-b004-4f65-951e-2b61c326a4e0`, 3062 Abschnitte, läuft bis heute) und „Performanceverbesserungen Faktor 10“ (Claude mit David, etwa 10.–20.10., `https://claude.ai/chat/c34b9422-2e36-43e5-bb2c-af28cb5ccf5a`). Die Suche erfasst den Hauptchat nur bis etwa 24.10.; alles danach ist nur blätterbar und wurde in Stichproben gelesen. Astras Chats liegen dort nicht. Zwei Zitate habe ich selbst nachgelesen (mit ✓ markiert), der Rest stammt aus dem Bericht des Agenten.
  - **Sinneszellen einer Gruppe (zu 5b). Frühere Entscheidung gefunden, sie spricht gegen das Teilen.** Oktober-Chat ✓: Der Befund damals war, dass in evolvierten Fischen ein Sinn 4–24 Zellen hat, die meisten aber „dasselbe Signal“ liefern. Claude schlug Rauschen vor. David: „Was ist mit den anderen Sinnen? Was ist da der Vorteil bei mehr Zellen? Rauschen finde ich hingegen nicht gut.“ Entschieden wurde: Jede Zelle hat einen begrenzten Arbeitsbereich, „mehrere Zellen mit versetzten Schwellen decken zusammen die ganze Skala ab“, ab 4–5 Zellen sinkt der Nutzen. Damals kam die Schwelle aus der Lage der Zelle, heute aus dem Gen mit Streuung.
    - Heute liefern die Zellen einer Gruppe im Aquarium wieder dasselbe Signal (5b). Ob das Teilen später bewusst entschieden wurde, etwa wegen der Rechenzeit, hat die Suche nicht gefunden. **Claude, das war dein Chat: Weißt du, wann und warum das Teilen kam?**
    - Zu Streuung in der Gruppe, Bereich 0,03–0,97, Häufung am Rand und „nie gewöhnen“ wurde kein Beschluss gefunden.
  - **Start-Stärke der Kontakte.** Bis mindestens 24.10. gab es angeborene Stärken („Angeborene Gewichte bleiben, erworbene Korrekturen gehören dem einzelnen Fisch“). Davids Annahme von heute entspricht also dem Stand bis v016. Der Wechsel steht im Commit `6d68166` vom 08.11. ✓: „New contacts begin at zero, learn locally throughout life … Remove obsolete role and initial-weight parameters.“ Die Abwägung dazu mit David wurde in den Claude-Chats nicht gefunden. **Astra, der Commit kommt aus deiner Arbeit: Gibt es dazu Davids Begründung?**
  - **Schwanz lenkt.** Hauptchat 11.11.; Davids Satz von 15:22 habe ich selbst nachgelesen ✓, das Weitere stammt vom Agenten. David, 15:22: „Was ist hier der Sinn von Gegenspielern? Hier müssten wir ein Hin- und Her simulieren, oder? Also richtige Fortbewegung, was einen Taktgeber nötig macht“. Danach: „Mit Gegenspielern schiebt nur der Wechsel. Eine einseitige Kontraktion lenkt“, und Davids „Bitte setze alle Vorschläge um“. Im Oktober war Drehung nach links minus rechts mehrfach Vorschlag; David wollte Pulse und Gleiten, kein Pendeln. Eine ausdrückliche Begründung gegen Drehen bei ungleichen Wechselschlägen wurde nicht gefunden, „Lenken ohne Brustflossen“ auch nicht. Mein Rückzug von 19:35 bleibt.
  - **Drüsenpegel (Ansteigen, Abklingen, Binden).** Nichts gefunden, mit sieben Abfragen. Für „B mit zwei Zeiten“ kenne ich also keine frühere Abwägung. Sie kann im nicht durchsuchbaren Teil des Hauptchats oder bei Astra liegen.

### Linksdrall und Schwanzlenkung, Nacht 11.→12.11. (Suche 19:53)

Nachtrag des Agenten zur Nacht 11.→12.11. (Hauptchat, Abschnitte 2632–2649 und 2727–2759 ganz gelesen, dazwischen nur Stichproben). Davids Satz aus 2633 habe ich selbst nachgelesen ✓, der Rest ist Agentenbericht.
  - **Wer fand es:** Claude selbst, 01:34 (Abschnitt 2632), gemessen an Brisa: „Nach jeder Pause beginnt der Schwanz mit einem einzelnen Schlag, und zwar immer links.“ Das Wort „Linksdrall“ kommt dort nicht vor. Um 04:43 (2729): Die Wirbelsäule allein beginnt nach 29 Pausen 15-mal links und 13-mal rechts; die Ursache liege im Zusammenspiel mit Brisas übrigen Taktgebern.
  - **Davids Antwort auf die drei Vorschläge** (2633 ✓): „Ja, bitte. Aber selbst ein Schwanzschlag aus der Ruhe lässt einen Fisch doch nicht *nur* kreiseln. Ich mein, solche Fischbewegungen wie diese GIBT ES DOCH GAR NICHT...“ Und 2635: „Bitte mach es nicht zu komplex! Es muss auch gut aussehen - Realismus ist zweitrangig irgendwann.“ Sein Einwand galt also auch dem Einzelschlag, der fast nur dreht. Daraus wurde a), der Schlag aus der Ruhe mit halb Schub.
  - **b) (`tail_yaw`):** 0,15 eingebaut, 0,05 probiert, samt Code entfernt. An David 01:50 (2642): „Es ließ lange Schläge im Zickzack schwimmen und warf die Faserbalance um.“ David wurde vorher nicht gefragt, eine Reaktion von ihm darauf wurde nicht gefunden. Deckt sich mit Claude 19:51.
  - **04:57, Leitung entfernt** (2743): David gegenüber als Korrektur dargestellt („zwei Punkte aus der Balancing-Liste“), nicht als Behelf. Er wurde nach dem Push informiert, nicht gefragt.
  - **05:16, Ursache** (2751/2755): „Das ist sehr wahrscheinlich die Ursache für ‚immer links‘ und das Kreiseln.“ Vom Wiederanschließen der Leitung ist danach in den gelesenen Abschnitten keine Rede.
  - **Fable-Chat:** keiner gefunden; die Suche reicht aber nur bis 24.10. In dem, was ich von meinem eigenen Verlauf noch einsehen kann, steht nichts zum Drall.

### Start-Stärke der Kontakte, Wechsel am 08.11. (20:01)

Astra 20:00: Der Nullstart war Astras Entscheidung bei der Umsetzung am 08.11.; einen Auftrag oder eine Billigung Davids dafür gibt es in den abgerufenen Nachrichten nicht, er wollte die Abwägung nach dem Push noch einmal sehen. Dazu aus dem Diff von `6d68166`, selbst gelesen:
  - **Vorher trug die Zielzelle die Start-Stärke als Gen:** `Neuron::initial_weight`, 0 bis 0,25, Vorgabe 0,125, aus dem Erbgut-Ausgang `initial_strength` (`colony-core/field/substrate.hh:36, 58` im Stand `6d68166~1`). Ein neuer Kontakt begann mit diesem Wert (`substrate.cc`, entfernte Zeile `gene_[free] = initial_contact_weight(source, target)`).
  - **Derselbe Ausgang ist heute die Obergrenze:** `initial_weight` wurde zu `electrical_limit` (0 bis 1, Vorgabe 0,5), `initial_teaching` zu `teaching_limit`, `initial_contact_weight` zu `contact_limit`. Der Ausgang heißt im Schema jetzt `synapse_strength`.
  - Davids Annahme von 19:06 („eine Start-Stärke“) beschreibt also den Stand bis 08.11. Die Regel „Gene nur für Zellen“ war dabei erfüllt: Das Gen saß in der Zielzelle.

## 8. Maul und Kiemen als Ablauf (21:28, für die nächste Fassung der Panels)

Nur gelesen, nichts gemessen. Produkt `e176af2`.

### Was es gibt
- **Drei Muskeln, je eigene Zellen:**
  - **Öffner** (Saugmuskel): Saugzellen am Maul (`MOTOR_KIND.suction`, nicht an der Flanke).
  - **Schließer** (Beißmuskel): Beißzellen. Nur sie tragen zwei Formwerte: `quality1` = stumpfe Zähne, `quality2` = Kieferlänge, gemittelt nach Kraft über alle Beißzellen (`src/body_plan.cc:434-435`, `ui/studio/model/organs.js:358-361`).
  - **Kiemendeckel** (Pumpe): Saugzellen an der Flanke des Kopfs (`src/body_plan.cc:41-43`). Ihr `quality1` ist die Reusendichte, gemittelt nach Kraft (`:448`). Ohne Kiemenzellen ist sie 0. Im Atelier ein eigenes Organ, 2 bis 8 Knoten, beidseitig, mit ausdauernden Fasern vorbelegt (`organs.js:196-206`).
- **Kieferlänge ist einstellbar** (Davids Frage). Sie macht zweierlei: Die größte Öffnung ist Körperradius × (0,28 + 0,44 × Kieferlänge) (`src/physiology.hh:261-263, 297-299`, `protocol_schema.hh:1935-1936`). Der Hebel sinkt im selben Maß: langer Kiefer = weites Maul, schwacher Biss (`physiology.hh:264-269, 286-290`).
- **Zähne:** scharf schneidet Fleisch und Blätter, stumpf mahlt Hartes; die Kraft zählt mit (Anteil der eigenen Form)². Halb und halb kann beides nur zu einem Viertel. Lose Stücke gehen mit jeder Form (`physiology.hh:270-280`).

### Der Ablauf, Schritt für Schritt (`src/physiology.cc:18-60`, `src/feeding.cc:561-609`)
1. **Ruhe:** Das Maul steht 35 % offen (`mouth_cycle::rest`, `protocol_schema.hh:1940`). Dorthin federt es von selbst zurück, mit 1/16 je Schritt (`physiology.cc:51`).
2. **Öffner zuckt:** Das Maul geht mit der Zuckung auf, Zugform sin², bis ganz offen bei vollem Zug (`physiology.cc:40-49`). Die Dauer ist die Zuckungsdauer der Öffnerfasern (`body_plan.cc:1483-1486`).
3. **Währenddessen saugt es.** Je Schritt entsteht Saugvorrat = Saugfläche × Reusendurchlass × Saugbefehl × Zug (`physiology.cc:58-59`). Saugfläche = 4 × größte Öffnung² × Saugkraft, und sie sinkt beim schnellen Schwimmen (`physiology.hh:318-323`).
4. **Was der Saugvorrat holt, in dieser Reihenfolge** (`feeding.cc:581-606`):
   - ganze Stücke, die durchs offene Maul passen und in Reichweite liegen: Futterbrocken, Algenflocken, kleine Fische, Eier (`:357-390, 404`);
   - dann Plankton aus dem Wasser, mit dem Anteil, den die Reusen halten (`:584-586`);
   - zuletzt, nur mit dem Maul im Boden, das Futter im Sediment (`:596-597`, siehe unten).
5. **Schließer zuckt = Biss.** Beim Beginn merkt sich der Kiefer, wie weit er offen war (`physiology.cc:28-34`). In der ersten Hälfte der Zuckung bleibt er offen und kann noch weiter aufgehen; in der Mitte, am Kraftgipfel, schnappt er zu (`physiology.hh:409-414`, `physiology.cc:44-47`). **Genau in diesem einen Schritt wird gebissen** (`feeding.cc:568-571`).
6. **Was der Biss trifft:** das Nächste in Reichweite (`feeding.cc:174-232`). Größer als die Öffnung beim Bissbeginn wird nichts abgebissen oder ganz geschluckt (`physiology.hh:303-313`). Je Ziel:
   - Fisch: ein Stück Fleisch, eine Wunde (`feeding.cc:263-286`); Ei: ganz, wenn es durch die Öffnung passt (`:287-297`);
   - Pflanze: ein Stück, Hartes mit Knacken (`:149-172`); Krabbe und Muschel: mahlende Kraft gegen die Schale (`:335-337`); lose Brocken und Aas: jede Zahnform (`:311`);
   - Maul im Boden vergraben: gräbt nach Krabben und Würmern (`:233-259`).
7. **Solange der Kiefer zuschnappt, strömt nichts:** kein Saugen, kein Pumpen durchs Maul (`physiology.cc:54-56`, `feeding.cc:573-576`).
8. **Öffnen und Schließen sind unabhängig befehlbar.** Wer nur den Öffner treibt, saugt ohne zu beißen. Wer nur den Schließer treibt, beißt aus der Ruheöffnung 35 %. Ein großer Biss braucht erst den Öffner.

### Kiemen
- **Alles Wasser, das das Maul saugt, pumpt oder beim Schwimmen trifft, geht durch die Kiemen hinaus** (`physiology.hh:324-333`). Die Reusen tun dabei drei Dinge:
  - **Durchlass des Wassers:** 1 − 0,6 × Dichte (`:340-342`). Er bremst **auch den Saugvorrat des Öffners** (`physiology.cc:59`) und erhöht den Widerstand des offenen Mauls beim Schwimmen (`src/movement.cc:118-122`).
  - **Rückhalt des Planktons:** 2 % ohne Reusen, steigt mit Dichte³ auf 100 % (`:334-338`).
  - **Sieben des Bodens:** (1 − 0,85 × (1 − Dichte)⁴) × (1 − Dichte⁴) (`:344-348`): ohne Reusen rutschen 85 % durch, bei mittlerer Dichte bleibt fast alles, bei dichten verstopft der Schlamm.
- **Zwei Wege, Wasser durch die Kiemen zu bekommen, beide ohne Öffner** (`physiology.hh:395-403`, `feeding.cc:536-549`):
  - **Pumpen:** Pumpfläche × 2 × Pumpbefehl × Maulöffnung. Pumpfläche wie die Saugfläche, nur mit der Kraft der Kiemendeckel (`physiology.hh:355-360`).
  - **Fahrt:** 2 × größte Öffnung × (Öffnung über Ruhe) × Tempo. Dafür muss das Maul weiter als in Ruhe offen stehen.
  - Beides fängt **nur Plankton**, mit Durchlass × Rückhalt.
- **Davids Frage, ob der Saugmuskel beim Pumpen mitwirkt:** Mittelbar ja. Die Pumpe zieht nur durch ein offenes Maul (× Maulöffnung). In Ruhe sind das 35 %, mit gezogenem Öffner bis 100 %. Der Öffner schafft außerdem seinen eigenen Sog. Im sichtbaren Wasserstrom am Maul stehen beide zusammen: Saugbefehl × Zug + Pumpbefehl × Öffnung (`physiology.cc:55-56`).

### „Bodenfutter“
- **In der Engine ist es das Futter, das im Sediment eines Bodenstücks liegt** (`detritus`): abgesunkene Flocken, Kot, gestorbene Würmer und verschüttete Muscheln (`src/small_animals.cc:1016-1042`, `src/food_web_step.cc:336-342, 1266-1271`). Es zerfällt mit der Zeit.
- **Der Fisch bekommt es nur so** (`src/small_animals.cc:1092-1109`, `feeding.cc:596-604`): Maul im Boden (ab 10 % eingesunken), das Sediment tief genug, und es ist noch Saugvorrat des **Öffners** übrig. Menge = Futter im Bodenstück × (Saugvorrat × Sieben ÷ Sedimentmenge) × Einsinken. Die Kiemenpumpe allein holt nichts aus dem Boden.
- **Im Darm ist es dasselbe wie Flocken:** 62 % Brei, 10 % Faser, der Rest unverdaulich (`physiology.hh:182-194`). Es braucht aber 1,5-mal so viel Platz, weil Sand mitkommt (`physiology_parameters.hh:24`). Eine eigene Futterart des Darms ist es also nicht, nur ein eigener Platzbedarf. Sand selbst wird nicht aufgenommen; Schlamm wirkt nur über das Sieben.

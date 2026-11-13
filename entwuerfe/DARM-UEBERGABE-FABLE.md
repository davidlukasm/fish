# Darm-Inspektor: Übergabe an Fable (13.11. 22:45)

David hat die Rollen getauscht. **Fable führt den Darm-Inspektor weiter und liefert David einen Vorschlag, der alle seine Wünsche und das komplette Feedback ohne Auslassung berücksichtigt und funktioniert.** Claude übernimmt Fables bisherige Rolle: Engine nachlesen, Code-Review, Gegenlesen. Astra prüft wie bisher.

- **Die Datei gehört jetzt Fable:** `entwuerfe/inspektoren.html`. Claude schreibt nicht mehr hinein.
- **Stand:** Version 16 (`0efb13b9`) mit Claudes Umbau nach 22:22. Bild: `bilder/2026-11-13_feedback4/v16_stand_uebergabe.png`.
  - David hat Version 16 noch nicht gesehen. Seine Rückmeldungen von 22:22 und 22:33 betreffen Version 15, das veröffentlichte Artefakt.
- **Alle früheren Punkte gelten weiter:**
  - die Abhakliste `DARM-ABNAHME.md`
  - `FEEDBACK-1311.md` (17:54)
  - `FEEDBACK-2115-ERKLAERT.md` (21:15)
  - KOORD 22:06
  - die Grundsätze in LEITLINIE 3 und 5

## Davids Rückmeldung 22:22 / 22:33 / 22:35, Punkt für Punkt

### Fischbild oben
1. **Füllstand des Magens:**
   - Früher war er besser: veränderlich mit den Sättigungssensoren.
   - Die Füllung soll sich bewegen, im Bezug zu den Schwellen der Füllzellen.
   - Version 16: Der Inhalt folgt der Füllungseingabe des Sättigungsgefühls, die Schwellenlinien leuchten, solange der Inhalt darüber ist. Bitte bewerten.
2. **Magen geschrumpft:** Er muss groß bleiben.
3. **Schlund zeigte in Version 15 nach oben:** Er muss zum Maul gehen.
4. **Animation:** Version 15 pumpte immer, das ist kaputt.
   - Gedacht war: Die Animation zeigt, dass der Muskel eventuell aktiv wird.
   - **David 22:39: Der Darm bewegt sich auch ohne Muskel.** In der Engine schiebt er im Ruhetempo weiter (200 × Darmlänge, `gut_pace` mit Befehl 0, `src/physiology.hh:366-370`).
   - Also: immer eine ruhige Grundbewegung, zeitweise stärkere und schnellere Muskelwellen.
   - Version 16 hat nur die Muskelphase, ohne Grundwellen.
5. **Unklar, dass hier ein Muskel ist, den man einstellen kann.**
6. **Muskeleinstellung oben (Knoten, Fasern) ist schlecht. Weg damit.**
   - Weitere Knoten bewirken im Bild nichts, Fasern auch nicht.
   - David will eine eigenständige Lösung.

### Ertrag
7. **Im Ausbeutediagramm muss man den Muskel einstellen können**, wie in der Grundfassung, die David gefiel (`bilder/2026-11-13_feedback/gut_darm-neben-schwanz.png`):
   - eine Mittellinie mit rundem Griff
   - ein Muskelbalken mit Griffen
8. **Die gestrichelte Linie zum Regler fehlte.**
9. **Achse:** Sie muss **„Verweildauer im Darm“** heißen, nicht „Zeit im Darm“. Sonst denkt man, der Darm nehme die Nahrung erst nach so viel Zeit auf. Das wurde schon früher besprochen. Version 16 ist schon geändert.

### Lebensbild
10. **Löschen.** Fleisch belegte wieder die halbe Fläche, und der Zweck war aus den Augen verloren.
    - **Zweck:** Ein Jungfisch frisst z. B. Plankton, bis er groß genug ist, um Blätter zu fressen. Über das Leben verschiebt sich, welches Futter sich lohnt.
    - David will eine **komplette Neulösung** dafür.
    - Version 16 zeigt einen jungen und einen erwachsenen Fisch je bei seiner mittleren Verweildauer unter der Achse. Der Lebensabschnitt des Muskels ist dort weggefallen (Behelf). Das reicht nicht für den Zweck.
    - Engine-Fakten dazu stehen unten.

### Sättigungsgefühl
11. **Die Regler mit dem (×) liegen viel zu eng.**
12. **Die Magenfüllung muss hier genauso beweglich sein wie oben.**
    - Davids Vorschlag: eine Animation, ein Strich, der durch beide Diagramme (Eingabe und Signal) läuft, und der Mageninhalt ändert sich dabei.
13. **Eingabegriffe sehen noch genau aus wie Einstellungsgriffe des Organs.** Das hat David schon vorher gestört (LEITLINIE 3: Eingabe gegenüber Einstellung). Sie müssen klar anders aussehen.
14. **Streuung:**
    - Der „Schlüssel“ für den Bereich um die gestrichelte Linie ist nur noch ein Schlüssel.
    - Vorher war es schön mit dem Bereich selbst als **schattiertem Band im Diagramm**. Das kommt zurück.

### Bauchweh
15. **Das Diagramm soll aufgebaut sein wie beim Sättigungsgefühl**, mit Strich und Animation.
16. **Drei verschiedene Schattierungen in der Bauchwehkurve:** Fläche, Muskelband darüber und darunter. Es soll eine Darstellung sein.
17. **„Halb gewöhnt“ ist unverständlich und zu nah an der Umsetzung.**
    - Der Effekt ist Anpassung: Das Signal klingt ab, die Zellen sind erschöpft.
    - Statt „Meldung an das Gehirn“ z. B. **„Signalverlauf bei konstantem Schmerz“**.
    - Statt „halb gewöhnt“: **„kein Signal mehr“**, bei dem Schritt, an dem das Signal ganz erschöpft ist. Nur das interessiert hier.
    - In der Engine erlischt das Signal, sobald Reiz minus Anpassung unter die Schwelle der Zellen fällt.
18. **Achsenbeschriftung:** Die Texte überlappten so, dass es nach „200 000 Schritte“ aussah. Fable hat das in `5365ec9` behoben. In Version 16 liegt der Erschöpfungsgriff noch auf „Schritte“.
19. **Log-Skala:** Sie wurde schon kritisiert, die Anstiegsrampe sieht darin falsch aus.
    - Die Sinne sind jetzt linear.
    - Bitte prüfen, wo David noch eine Log-Skala sieht. Der Ertrag ist logarithmisch.
20. **„je Futter, voller Darm“ und „je Futter, volle Mahlzeit“ sind Nullaussagen.**
    - Der Name muss sagen, was die Zeile zeigt und bewirkt.
    - Die Futterzeilen gehören **ganz nach unten**.
21. **Inkonsistenz:**
    - Die Muskelunsicherheit fehlt in der Bauchweh-Futterzeile, beim Nährgefühl steht sie da.
    - Bei der Eingabe ist es umgekehrt.
    - Es muss überall gleich sein. Fable hatte selbst angemerkt, dass `acheSwing` keine Herkunft hat.

### Nährgefühl
22. Für Nährgefühl gelten dieselben Punkte wie beim Bauchweh: 13, 14, 15, 17, 18, 20 und 21.
23. Der Name „Nährgefühl“ ist noch offen.

## Engine-Fakten aus Claudes Nachlesen 22:37–22:44

### Über das Leben
**Im Ei:**
- Kein Fressen und keine Verdauung (`src/feeding.cc:562`, `src/physiology.cc:233`).
- Darmzellen bekommen keinen Reiz.
- Kein Ei im Darmbild.

**Unverändert über das Leben:**
- Die Verweildauer in Ruhe ist 200 × Darmlänge.
- Die Darmlänge wird bei der Geburt aus allen Futterzellen des Bauplans gesetzt (`body_plan.cc:366`).

**Was sich mit dem Körper ändert:**
- Der Platz im Darm: 250 beim Jungfisch, 400 beim Erwachsenen, jeweils × Darmlänge (`physiology.hh:119-122, 210-212`).
- Die Muskelreichweite: `gut_speed = 1 + 3 · suction_share(Kraft · body_scale)²` (`physiology.hh:363-366`).
  - `body_scale` ist der Körperradius ÷ 4.
  - Der Radius geht von 4 beim Schlupf bis höchstens 32.
  - Der Jungfisch reicht also viel weniger weit.

**Der Muskel arbeitet nur auf Befehl des Gehirns** (`gut_motility` aus `StrokeGut`, `body_plan.cc:1479`):
- Das Fenster ist die Spanne, aus der das Gehirn wählen kann.
- Innerhalb einer Zuckung pendelt die Verweildauer zwischen Ruhe und dem doppelten Antrieb.
- Satt, ohne Muskelbefehl und ohne Bauchweh hält die Engine den Inhalt fest (`physiology.cc:248`).

**Davids Idee (Jungfisch Plankton, später Blatt):**
- Ein langer Darm (Blatt) ist vom Schlupf an da. Der Jungfisch müsste ihn mit dem Muskel beschleunigen. Gerade der junge Muskel ist aber schwach.
- In der Engine geht das nur so:
  - Der Muskel ist schon im kleinen Körper stark genug.
  - Er hört später auf: Seine Knoten sterben ab einer Reife (Todesantwort auf Reife), oder das Gehirn steuert ihn nicht mehr an.
- „Ab Reife“ und „bis Reife“ je Knoten sind echte Einstellungen (Ausgabe- und Todesantwort auf Reife, `ui/studio/model/document.js:1495-1526`).
- **Bitte gegen die Engine nachrechnen und David ehrlich sagen, was davon die Engine heute kann.**

### Reifung und Festigung der Zellen
- **Reifung:** Jede Zelle hat eine Bildungsantwort.
  - Die Vorgabe ist immer an (`document.js:467`).
  - Der Fortschritt wächst um Antwort ÷ Zellzeit. Ist er voll und reicht das Baubudget, wird die Zelle gebildet (`colony-core/field/substrate.cc:599-622`).
  - Darmzellen entstehen also im Ei. Gezählt werden nur aktive Zellen (`body_plan.cc:903-917`).
- **Retinalzellen haben zusätzlich spontane Wellen** (`substrate.cc:696-749`), die das Sehen vorverdrahten. Darmzellen haben das nicht.
- **Festigung:**
  - Es festigt immer die lernende Zelle (`substrate.cc:930-969`): bei Sinneszellen die empfangende Gehirnzelle, bei Muskeln die sendende (`substrate.cc:902`).
  - Der Darm hat keine eigene Festigung. Er ist aber der Auslöser des Systems „Festigung“: Satt behält der Fisch, was er gerade gelernt hat (`ui/studio/model/systems.js:40-50`).
- **Das Darmorgan** (`ui/studio/model/organs.js:158-183`):
  - 4 Nährzellen, 2 Füllzellen und 2 Schmerzzellen, alle innen.
  - Darmmuskel mit 2 bis 8 Knoten und ausdauernden Fasern.
  - Keine eigenen Einstellungen für Reifung oder Festigung.

## Davids Regeln für diese Arbeit

- **Neu schreiben, nicht flicken.**
- **Ein Modell als einzige Quelle** für alle Bilder und Zahlen.
- **Nur ändern, was kritisiert wurde.**
- **Nichts wieder einbauen, was David verworfen hat,** wenn sich die Umstände nicht geändert haben.
  - Vorher in alten Chats suchen, mit Agenten.
  - Die Entscheidung nach Pro und Contra treffen.
- **Darstellung:**
  - Eingaben sind Diagramme mit formbarer Kurve. Griffe am Organ sind nur Einstellungen.
  - Wirkung statt Anzahl.
  - Keine Sätze im Panel.
  - Nichts Ungültiges zeigen.
  - Kein Zittern und kein Stottern.
- **Ein Behelf wird als Behelf benannt.**
- **Tests:** Keine Tests und keine Messungen durch Fable oder Claude. Prüfen macht Astra.
- **Vor dem Zeigen:**
  - bei 320 px ansehen
  - `DARM-ABNAHME.md` abhaken
  - Astra prüfen lassen

# Code-Review der Diagramme (Fable, 13.11. 22:17)

Auftrag David 22:14/22:15. Nur gelesen, nichts ausgeführt. Teil 1 betrifft die alte Seite `entwuerfe/inspektoren_alt.html`: welche Gewohnheiten zu den Flicken geführt haben. Teil 2 folgt, sobald der neue Darm gepusht ist.

## Teil 1: Die Gewohnheiten in der alten Seite

### 1. Dieselbe Größe wird an mehreren Stellen verschieden gerechnet
Das ist die Ursache von Davids Bild 2 („Fleisch 5–80 %“, die Kurve im Fenster reicht nicht so weit).
- Das Fenster im Ertrag reicht von `fastOf()` bis `restOf()` (Zeile 718–723).
- Die Balken darunter nehmen einen anderen Bereich: alle Lebensalter, je Alter drei Verweildauern aus `swingAt` und `stayAt` (Zeile 811–814). `swingAt` geht bis zur doppelten Geschwindigkeit, also weiter hinaus als das Fenster.
- Das Lebensbild rechnet seinen Bereich ein drittes Mal (`low = T / gut.spread`).
- **Vorschlag:** Eine Funktion `reach()` im Modell gibt den Bereich der Verweildauer zurück, den dieser Fisch je erreicht. Fenster, Balken, Lebensbild und Bauchweh-Rahmen lesen nur sie. Kein Bild rechnet einen Bereich selbst.

### 2. Das Modell ist nicht vom Zeichnen getrennt
- `drawGut` schreibt abgeleitete Werte in den Zustand zurück (`gut.T = T; gut.fast = fast`, Zeile 657–658). Wer zuerst zeichnet, bestimmt, was die anderen lesen.
- Einstellungen sind in einer Form gespeichert, die niemand einstellt: `middle` und `spread`. Darmlänge und Muskel werden daraus zurückgerechnet (`restOf`, `fastOf`), und drei Griffe ändern je beide Werte.
- Zeichenfunktionen ändern Einstellungen nebenbei: Ein Klick auf ein Futter setzt die Höhe des Bauchwehs (Zeile 902), das Ziehen eines Griffs löscht die Futterwahl (`inp.food = null`).
- **Vorschlag:** drei Schichten in drei Abschnitten der Datei.
  - *Einstellungen:* genau die Werte, die der Spieler einstellt, in seinen Einheiten (Darmlänge, Muskelknoten, Schwellen).
  - *Modell:* reine Funktionen von Einstellungen auf Größen (`rest(s)`, `reach(s)`, `gain(food, t)`, `ache(food, t)`, `report(cells, input)`). Kein DOM, kein Zustand.
  - *Ansicht:* liest das Modell, zeichnet, ruft bei einem Griff genau einen Setzer auf. Sie rechnet nichts, was eine Zahl im Bild ergibt.

### 3. Zwei Rechenwerke für dieselbe Sache
- Die Sinnesbilder gibt es doppelt: `senseGroups` (Zeile 1021 ff.) für Haut, Nase und andere, `drawGutSense` (Zeile 851 ff.) für den Darm. Beide zeichnen Schwellen, Streuung, Meldung, Gewöhnung, (+) und (×), mit eigenen Maßen. Eine Korrektur in dem einen fehlt im anderen (die Gewöhnung der Füllzellen war so ein Fall).
- Ertrag und Bauchweh stehen als eigene Formeln in der Seite (`STUFFS`, `ache` mit 1,3 und 430 und 0,5), angepasst in einer Datei, die nicht im Repo liegt (`scratchpad/gutfit/fit.mjs`). Die Engine rechnet mit anderen Werten (1,5, 400, 0,55). Niemand kann aus der Seite sehen, welche Kurve ein Vorschlag ist und welche die Engine.
- **Vorschlag:** ein Sinnesbild, das alle Organe benutzen, mit den Unterschieden als Daten (gewöhnt sich oder nicht, begrenzt oder offen). Und oben in der Seite ein Block „Vorschlag an die Engine“ mit jedem abweichenden Wert, seinem heutigen Engine-Wert und der Fundstelle.

### 4. Zahlen ohne Namen, überall
- Maße des Bilds stehen als Ziffern in jeder Zeichenfunktion und wiederholen sich: `L = 28, R = 286` in zwei Funktionen, `L = 70, R = 290` in einer dritten, `x0 = 66, W = 150`, `296` als rechter Rand an vielen Stellen. Wer die Breite ändert, muss alle finden.
- 434 Farbangaben als Hex im Code, 70 verschiedene. Dieselbe Rolle (Achse, Griff, Hintergrund) hat keine Namen.
- Modellzahlen im Zeichencode: `.25`, `.8`, `4 * inp.size`, `/ 2`, `/ 3` in `SENSES` und `biteInput`.
- **Vorschlag:** ein Objekt `BOX` mit Rändern und Breiten, ein Objekt `COLOUR` mit Rollen, und jede Modellzahl als benannte Konstante neben ihrer Formel, mit der Fundstelle in der Engine.

### 5. Skalen, die sich während des Ziehens ändern
- `settle` (Zeile 277 ff.) lässt eine Skala über mehrere Frames nachgleiten und stößt dafür Neuzeichnen an. Das ist ein Flicken gegen Springen und die Quelle des Zitterns.
- `setAttribute('viewBox', …)` steht 43-mal am Ende von Zeichenfunktionen, oft mit einer Höhe, die vom Inhalt abhängt. Ändert sich der Inhalt, springt alles darunter.
- **Vorschlag:** feste Skalen und feste Bildhöhen je Bild, im Modell begründet (der größte Wert, den die Einstellungen überhaupt erlauben). Dann gibt es nichts nachzuführen.

### 6. Zustand und Neuzeichnen
- Jede Bewegung eines Griffs löscht das ganze Bild und baut es neu (`replaceChildren`, 46 Stellen), oft das ganze Panel (`drawGut()` zeichnet acht Bilder). Dabei entstehen alle Griffe und ihre Ereignisse neu; der gehaltene Griff wird über eine globale Variable `held` und seinen Namen wiedergefunden (Zeile 230 ff.).
- Der Name eines Griffs entsteht ohne Angabe aus der Zahl der Griffe im Bild (`'grip' + …length`). Kommt ein Griff dazu, heißen die folgenden anders, und der gehaltene springt.
- 13 Schleifen mit `requestAnimationFrame` laufen dauernd, auch wenn das Panel nicht zu sehen ist; eine setzt je Frame `innerHTML`.
- **Vorschlag:** Ein Bild wird einmal aufgebaut und hat eine Funktion `update(model)`, die nur Attribute setzt. Griffe bleiben dieselben Elemente. Animationen laufen nur, solange das Bild sichtbar ist.

### 7. Lesbarkeit
- Zeichenfunktionen mit 60 bis 90 Zeilen, viele Zeilen über 200 Zeichen mit mehreren Anweisungen. `drawGutSense` zeichnet Eingabe, Magen, Schwellen, Futterkästen, Regler, Streuung, Meldung, Gewöhnung und Knöpfe in einem Stück, mit Verzweigungen `bites`, `filling`, `!filling` quer durch.
- Namen aus einem Buchstaben für verschiedene Dinge im selben Block: `c` ist einmal ein Bild, einmal eine Zelle, einmal ein Index; `g` Gruppe, Element oder `gut.life`.
- Kommentare erzählen den Verlauf („Fable 21:29“, „Astra 21:38“, „David 13.11.“). Das gehört in den Commit. Im Code hilft nur das Warum.
- Vier Messreihen stehen als Zeilen mit bis zu 74 000 Zeichen mitten im Skript (Zeile 2594, 2645, 2689, 2723). Sie gehören in eigene Dateien.

### 8. Ränder
- `Math.max(...liste)` und `Math.min(...liste)` auf Listen, die leer sein können (`sore`, Gruppen nach dem Löschen). Das gibt ±Infinity und daraus NaN in Koordinaten.
- Division durch Werte, die 0 werden können, wird stellenweise mit `|| 1` oder `Math.max(1, …)` abgefangen, an anderen Stellen nicht. Es gibt keine eine Stelle, die Einstellungen auf ihren erlaubten Bereich bringt.
- **Vorschlag:** Die Setzer der Einstellungen begrenzen jeden Wert. Das Modell darf dann annehmen, dass alles gültig ist, und die Ansicht braucht keine Abfangstellen.

### 9. Bedienbarkeit ohne Maus
- Griffe sind SVG-Formen ohne Rolle, ohne Namen, ohne Tastatur. Im ganzen Skript gibt es dafür keine Angabe. Für einen Entwurf vertretbar; im Produkt braucht jeder Griff `role="slider"`, einen Namen, Wert und Pfeiltasten.

### Die Gewohnheit dahinter
Jede Kritik wurde an der Stelle behoben, an der sie sichtbar war, im Zeichencode. Dadurch wuchs dort Logik, die ins Modell gehört, und jedes Bild bekam seine eigene Fassung derselben Größe. Die nächste Korrektur traf dann nur eine der Fassungen. Ein Modell, das als einziges rechnet, macht diese Art Fehler unmöglich: Eine Zahl kann der Kurve nicht widersprechen, wenn beide aus demselben Aufruf kommen.

## Teil 2: Der neue Darm (`entwuerfe/inspektoren.html`, Stand `52407c4`), repariert (22:24)

Auftrag David 22:16: prüfen und selbst reparieren, was offensichtlich falsch ist oder Bildrate kostet. Ich habe die Datei gelesen, umgebaut und nur vom Parser auf Syntax lesen lassen. Im Browser geöffnet oder gezogen habe ich sie nicht; das ist Astras Teil. Das Aussehen sollte unverändert sein.

### Was schon gut war
Ein Modell oben, Einstellungen in den Einheiten des Spielers (`length`, `nodes`, `from`, `until`), ein Fenster `windowOf()` für Band, Balken und Zeilen, ein Sinnesbild für alle drei Sinne, feste Bildhöhen. Das sind genau die Punkte aus Teil 1.

### Was Bildrate gekostet hat, und was ich geändert habe
1. **Jeder Zug zeichnete alle sieben Bilder neu, und zwar je Mausereignis.** Mausereignisse kommen öfter als Bilder; bei schnellen Mäusen ein Vielfaches.
   - Jetzt: `draw(parts)` merkt nur vor, welche Bilder eine Einstellung zeigen, und zeichnet einmal im nächsten Frame. Ein Schwellengriff im Bauchweh zeichnet nur das Bauchweh, ein Muskelgriff alles außer dem Sättigungsgefühl, nur die Darmlänge alles.
2. **Das Modell wurde je Bild neu gerechnet, das Fenster rund zwanzigmal je Zug** (`windowOf()` in jedem `foodRange`, das fünfmal in den Balken, fünfmal in `kindOf`, je fünfmal in den zwei Futterzeilen), jedes Mal über 61 Lebensalter mit `drive()`.
   - Jetzt: `M()` rechnet alles einmal je Änderung (`derive`), alle Bilder lesen dasselbe Ergebnis.
3. **Was nie von einer Einstellung abhängt, wurde bei jedem Zug neu gerechnet und neu gebaut:** die fünf Ertragskurven (705 Aufrufe von `gain`), ihre Strichelung, die Bänder des Lebensbilds (375 Aufrufe), `best` je Futter (705), dazu die Platzsuche für die Kurvennamen. Die Platzsuche war das Teuerste der Seite: je Name bis 282 Kandidaten, jeder gegen 564 Kurvenpunkte.
   - Jetzt: `CURVES` und `BEST_BANDS` einmal beim Laden; jedes Bild hat eine feste Schicht, die einmal gebaut wird, und nur die Schichten darunter und darüber werden neu gezeichnet (`picture`).
4. **Der Film des Darms wurde bei jedem Zug an irgendeinem Griff abgerissen und neu gebaut:** 240 Pfade neu, und die sieben Futterkörner sprangen an ihre Startplätze zurück. Das war sichtbares Stottern während jedes Ziehens.
   - Jetzt: Der Film überlebt das Neuzeichnen; nur eine neue Darmlänge legt ihn neu (`layGut`). Die Körner laufen durch.
5. **240 Attribute je Frame, auch wenn sich nichts ändert, auch wenn das Bild nicht zu sehen ist.**
   - Jetzt: Eine Breite wird nur geschrieben, wenn sie sich geändert hat (zwischen zwei Wellen ruht der größte Teil der Stücke). Der Film steht, solange der Fisch nicht auf dem Bildschirm ist, und läuft nicht für jemanden, der weniger Bewegung eingestellt hat.
6. **Nach dem Loslassen wurde noch einmal alles gezeichnet,** nur um die Markierung des Griffs zu entfernen. Jetzt wird nur die Markierung entfernt.

### Offensichtliche Fehler, behoben
1. **Der Griff „wie stark der Muskel treibt“ im Lebensbild folgte dem Zeiger nicht,** sobald der Muskel vor dem Erwachsenenalter endet. Die Umkehrung teilte die Summe der Knoten durch die Körperwirkung, obwohl die Summe nicht linear im Tempo ist. Jetzt wird erst das Tempo durch die Körperwirkung geteilt und dann umgekehrt (`sumForDrive`).
2. **Dieselbe Formel stand zweimal** (Muskelantrieb in `drive()` und ihre Umkehrung im Griff, je mit 0,6, 0,8 und 1,6). Jetzt eine Stelle: `muscleSum`, `driveOf`, `sumForDrive`, mit benannten Werten.
3. **Totes CSS der alten Seite** (36 Regeln für Knöpfe, Menüs, Häkchen, die es hier nicht gibt) ist entfernt.
4. Maße, die an zwei Stellen als Ziffern standen (200 Schritte je Länge, Lage der Knoten, der Faserleiste, Versatz des Fischs), haben Namen.

### Nicht geändert, weil es Entscheidungen sind und keine Fehler. Bitte ansehen
1. **Berichtigt 22:31: Dieser Punkt war falsch, die Zahlen der Kopfzeile sind die der Engine** (10 % Grundumsatz und 5 % Gewebegewicht je Einheit Darmlänge, 25 % weniger Platz für Eier beim längsten Darm; `src/physiology.cc:132, 432`, `src/physiology.hh:213-217`, `src/protocol_schema.hh:2043-2045`). Ich hatte sie nicht nachgeschlagen. Sie standen nur ohne Namen und ohne Fundstelle im Zeichencode; das ist jetzt nachgezogen. ~~Die Kopfzeile rechnet mit freien Zahlen:~~ `10 × Länge` Ruhebedarf, `5 × Länge` Gewicht, `25 %` Platz für Eier. In der Engine gibt es dafür Formeln (Platz für Eier: `belly_room`, `src/physiology.hh:213-217`). Das Modell sollte sie benutzen oder die Zahlen als Vorschlag kennzeichnen.
2. **Der Muskelantrieb ist eine eigene Formel** (`1 + 3 × (1 − exp(−1,6 × Summe))`). Die Engine rechnet `1 + 3 × Kraft²` mit einer sättigenden Kraft (`src/physiology.hh:361-365`). Die Form ist ähnlich, die Werte sind es nicht.
3. **Ertrag und Bauchweh sind Vorschläge an die Engine,** nicht die Engine: fünf Stoffe statt vier, andere Grenzen. Im Code steht das nur im Kommentar zu den Zielwerten. Ein Block „weicht von der Engine ab“ mit den heutigen Werten daneben würde es sichtbar machen (Bauchweh heute: Abschnitt in KOORD 22:11).
4. **Das Schwanken des Bauchwehs** (`acheSwing`, geteilt durch 6, höchstens 0,5) hat keine Herkunft im Code.
5. **„halb gewöhnt“ lässt sich nur bis etwa 400 Schritte ziehen,** weil das Bild bei 300 endet. Die Engine geht bis 1024.
6. **Ein Kurvenname kann wegfallen,** ohne dass es jemand merkt, wenn die Platzsuche keinen freien Platz findet. Für feste Kurven wären feste Plätze sicherer.
7. **Kein Griff ist ohne Maus bedienbar.** Für den Entwurf in Ordnung, im Produkt nicht.

### Was Astra daran prüfen sollte
Die Seite lädt ohne Fehler; jeder Griff bewegt nur seine Bilder und folgt dem Zeiger; die Körner im Darm laufen beim Ziehen weiter; die Zahlen der Balken sind dieselben wie vorher bei gleichen Einstellungen.

## Teil 3: Nachträge nach Claudes Auftrag von 22:18 (22:30)

Astras drei Funde von 22:17 und der Block „Vorschlag an die Engine“, alle in `entwuerfe/inspektoren.html`. Wieder nur gelesen, gerechnet und vom Parser auf Syntax gelesen.

1. **Zwei Griffe übereinander im Lebensbild.** Der runde Griff für die Muskelstärke lag auf dem Griff „bis“. Er sitzt jetzt in der Mitte des Arbeitslebens auf der Linie. Das Arbeitsleben ist mindestens 12 % des Lebens lang (`WORKING_LIFE_MIN`), damit die drei Griffe nebeneinander Platz haben. Vorher waren es 5 %.
2. **„200“ und „300 Schritte“ liefen zusammen.** Das Wort steht jetzt links an der Achse, dann 100, 200, 300, wie im guten Beispiel („Schritte 10 100 1000“).
3. **Die Ertragswerte treffen Davids Zahlen** (FEEDBACK-1311, Zeile 12), mit der Formel der Seite nachgerechnet:

   | Futter | bei 50 Schritten | bestes | bei 800 |
   |---|---|---|---|
   | Blatt | 0 % | 92 % | 92 % |
   | Alge | **18 %** | **78 %**, gehalten ab etwa 630 | 78 % |
   | Flocken | 46 % | 68 % | 38 % |
   | Plankton | **34 %** | **72 %** bei 164 | 11 % |
   | Fleisch | 71 % | **82 %** bei 115 | 5 % |

   - Fleisch: Verderben bei 250 statt 225 Schritten. Das ist der heutige Wert der Engine.
   - Plankton: 44,5 % Fleisch und 52 % Schale statt 45 % und 55 %.
   - **Alge braucht einen sechsten Stoff.** Solange ihr schneller Anteil derselbe Brei ist wie in den Flocken, kann sie die 78 % nicht bis zum langen Ende halten: Der Brei muss verderben, damit die Flocken abfallen, und nimmt die Alge mit. Jetzt hat die Alge einen eigenen schnellen Anteil, der nicht verdirbt (`sap`, 25 %), und ihre weiche Faser (70 %) ist nach dem Aufbrechen schnell aufgenommen. Der Verlauf dazwischen ist wie vorher (30 % bei 150 Schritten, 64 % bei 300).
4. **Block „PROPOSAL TO THE ENGINE“** über `STUFFS`: jeder Stoff mit dem Wert der Seite und dem heutigen der Engine, die Fundstellen, und was die Engine dafür bräuchte (einen Anteil „bestenfalls aufgenommen“ je Stoff und zwei weitere Stoffe). Das Bauchweh ist dort als eigene Formel mit anderer Form benannt.
5. **Farben haben Namen nach ihrer Rolle** (`COLOUR`: Achse, Spur, Linie, Griff, gewählt, Bauchweh …). Übrig sind als Ziffern nur die Futterfarben und die drei Schlüsselfarben, je an einer Stelle.

**Für Astras Prüfung:** Die Alge heißt im Modell jetzt `{sap, soft}`, nicht mehr `{pulp, soft}`.

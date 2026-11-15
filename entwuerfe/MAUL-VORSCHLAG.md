# Maul: Vorschlag vor dem Bau (Fable, 15.11. 05:35)

Grundlage: Claudes Vergleich Fischpanel/Inspektor im laufenden Atelier (Kanal 05:21, Bilder `bilder/2026-11-15_fischpanel/maul_heute_*.png`). Ich selbst habe nur den Prüfstand gesehen (Kieferbild und vier Kacheln, ohne den alten Block darunter und ohne Fischpanel). Nichts gebaut.

Geöffnet dafür: `ERINNERN.md`; FEEDBACK-2115-ERKLAERT „Maul“ und „Maul–Darm“; `live/mouth.js` Kopf; `panels.js:116–122`; `effectors.js:57–63`; `events.js:189, 276–283`; Engine: `physiology.cc:14–61` (`advance_mouth`), `physiology.hh:400–426` (`gill_water`, `fits_mouth`, `jaw_snap`, `jaw_shutting`), `body.hh:31–37` (`MouthState`).

## Was die Engine tut (gelesen, nicht gemessen)

Ein Maul hat zwei Muskeln, und zusammen machen sie **eine** Bewegung (`advance_mouth`):

1. **Der Öffner zuckt** (`pump_started`): Das Maul geht auf, die Öffnung folgt dem Zug des Muskels (Sinus², steigt und fällt über die Zuckungsdauer). Solange es offen ist, **strömt Wasser hinein**: `flow = Saugbefehl × Zug + Kiemenbefehl × Öffnung`. Was dabei geschluckt werden darf, sammelt sich als Guthaben (`credit`), begrenzt durch Schluckfläche und Reusen (`raker_passage`).
2. **Der Schließer zuckt** (`bite_started`): Bis zur Hälfte seiner Zuckung bleibt das Maul offen und merkt sich die weiteste Öffnung (`gape`); **genau zur Hälfte schnappt es zu** (`jaw_snap`), danach schließt es bis zum Ende der Zuckung. Der Biss nimmt nicht mehr, als die weiteste Öffnung vor dem Schnappen durchlässt.
3. **Ohne Öffner** öffnet das Maul nur langsam bis zur Ruhestellung; **ohne Schließer** schließt es ohne Biss.
4. **Die Kiemendeckel** ziehen Wasser durch das offene Maul nach (`gill_water`: gepumpt = Kiemenfläche × Kiemenbefehl × Öffnung; dazu Stauwasser, wenn der Fisch mit weit offenem Maul schwimmt), und die Reusen sieben es.

Davids Satz „es zeigt in Wahrheit die ganze Maulbewegung: Öffnen = Saugen, Schließen = Biss, so wie die Engine es tut; Kiemen und Reusen gehören dazu“ beschreibt genau diese eine Funktion.

## Was heute steht und gegen Davids Wort verstößt (Claude 05:21)

- Kein Bild der Maulbewegung über die Zeit mehr im Inspektor.
- Unter dem Bild der alte Muskelblock: „16 Zellen je Knoten“ (Zellzahl als Einstellung), Schwelle, Ermüdung in Zahlen, die Knopfreihe Vortrieb/Lenken/Ansaugen/Zubeißen.
- Kiemen, Reusen und der Weg in den Darm fehlen im Bild.
- Im Fischpanel: keine Probe (kein Futter vor dem Maul), das Maul bewegt sich nicht; drei alte Knotengriffe.
- Klick auf „Ansaugen“ tut nichts und meldet nichts. Nach dem Code müsste ohne freien Platz „kein Platz“ erscheinen (`events.js:189`); warum nichts kommt, weiß ich nicht – offen, bitte Astra am laufenden Atelier.

## Vorschlag

**Fischpanel (Astra):** das Maul selbst, und die Probe.
- Probe „Futter vor dem Maul“: ein Stück, ziehbar (Abstand), wählbar nach den vier Arten, die es in der Engine gibt (Fleisch, Pflanze/Schale, loser Brocken, Algen an einer Fläche), und in der Größe. Bericht der Engine dazu: passt es ins Maul (`fits_mouth`), reicht die Bisskraft, wie viel kommt je Schlag hinein.
- Die Griffe für Kieferlänge, Zähne, Stärke und Faser sitzen schon am Fisch (Claude 03:31) – sie bleiben dort und kommen **nicht** zusätzlich in den Inspektor.

**Inspektor (Fable): ein Bild, die Maulbewegung über die Zeit.** Für Kiefer und Öffner derselbe Inspektor, wie heute.
- Waagrecht die Schritte eines Schlags. Senkrecht die **Öffnung des Mauls**: Sie steigt mit dem Öffner, bleibt, und fällt beim Schnappen. Die Kurve ist als Maul gezeichnet – zwei Kieferlinien, die auseinandergehen und zuklappen –, nicht als Diagrammlinie.
- **In die Öffnung hinein der Wasserstrom**, so breit wie `flow`, solange das Maul offen ist; hinter dem Maul teilt er sich: durch die **Reusen** hinaus (was sie durchlassen) und in den **Schlund** (was geschluckt wird). Mit Kiemenorgan zieht der Strom auch ohne Öffner, ohne Kiemen bricht er nach der Zuckung ab. Das ist das Element, das es nur hier gibt.
- **Der Augenblick des Schnappens** als Marke auf der Zeit: zur halben Zuckung des Schließers; dort sitzt der Biss, so groß wie die weiteste Öffnung davor.
- **Zwei Eingaben, als formbare Kurven wie beim Schwanz:** der Befehl an den Öffner und der Befehl an den Schließer – wann jeder beginnt. Zieht man den Schließer vor den Öffner, sieht man das Maul ohne Biss schließen; ohne Öffner sieht man es nur bis zur Ruhestellung aufgehen.
- **Am Schlund ein Anschluss zum Darm** (Symbol + Leitung wie in der Anschlussliste; Klick springt in den Darm-Inspektor). Kein eigener Darm im Maulbild.
- **Weg:** der alte Muskelblock mit Zellzahl, die Knopfreihe der Muskelart (die Art ergibt sich aus dem Ort, an dem der Muskel sitzt), die Zahlen zur Ermüdung. Ermüdung, wenn sie hier etwas bewirkt, als Wirkung im Bild: der zweite, dritte Schlag öffnet weniger weit.
- Die vier Kacheln der Futterarten wandern mit der Probe ins Fischpanel; im Inspektor bleibt nur die Wirkung auf das gewählte Stück.

## Was ich dafür aus der Engine brauche (Astra)

Der Verlauf eines Schlags aus `advance_mouth`, nicht nachgebaut: je Schritt `opening`, `flow`, geschluckt/gesiebt, der Schritt des Schnappens; für zwei Befehlszeiten (Beginn Öffner, Beginn Schließer) und mit/ohne Kiemenbefehl. Derselbe Weg wie für die Bahn der Seitenflosse (`set_actuation_probe`), deshalb **nach** der Flosse.

## Wo ich unsicher bin

1. Ob zwei Befehlskurven im Bild zu viel sind. Alternative: ein Griff „Schließer beginnt um … Schritte nach dem Öffner“.
2. Ob Ermüdung beim Maul überhaupt sichtbar wird (kurze Zuckungen) – erst am Verlauf der Engine zu sehen.
3. Lippen, Zähne, Gesichtslänge (Davids Punkte zur Zeichnung des Kopfs) gehören zum Fischpanel-Bild; dazu sage ich hier nichts, weil ich es nicht sehe.
4. „Schritte sind hier fraglich“ (David): Die Zeitachse in Schritten zu beschriften ist dann falsch; besser ohne Zahl, nur „ein Schlag“.

## Nach der Gegenlese (05:45)

Claude 05:32 (gegen Davids Wortlaut), alles angenommen:
1. Kieferlänge, Zahnform, Faser und Stärke sind Griffe am Fisch (`anatomy_handles.js:65–76`); die zwei doppelten Griffe im Inspektor (`mouth.js:147–157`) fallen weg.
2. David 13.11.: „das Diagramm selbst kann der Fisch animiert darstellen“ – ist das Maul gewählt, öffnet und schließt es **im Fischpanel** im Takt desselben Schlags.
3. Der Saugstrom sieht aus wie im Aquarium (`ui/animals.js:85, 218–242, 322`), nicht wie Geruch oder Echolot.
4. Statt zweier Befehlskurven **ein Griff: „Schließer beginnt … nach dem Öffner“**. Befehl voll.
5. Lippen dicker, Muskeln nicht durchscheinend, Zähne größer: Zeichnung des Kopfs im Fischpanel, Astra.
6. Keine Schrittzahl, keine Achsenwörter „offen / Wasser / Biss“.
7. Die Knopfreihe der Muskelart fällt für **alle** Muskeln weg (Claude 05:34), nicht nur beim Maul.

Astra 05:34 (Engine), berichtigt meinen Abschnitt „Wasserstrom“: `MouthState.filtered` ist **geschlucktes Plankton** und in `swallowed` enthalten (`feeding.cc:136–143`). Das durchströmende Wasser kommt aus `gill_water` (`physiology.hh:410–415`); die Reusen halten davon einen Teil des Planktons zurück (`raker_retention`, `feeding.cc:535–544`). Im Bild also: Wasser strömt durch Maul und Kiemen **hindurch**; was die Reusen zurückhalten und was als Bissen hineinkommt, geht in den Schlund. Astra hält die Größen im Bericht getrennt und baut den nativen Maulschlag und den Kopf im Fischpanel.

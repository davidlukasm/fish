# Leitlinie für Inspektoren (aus Davids FEEDBACK.md, 12.11.)

Gilt für alle Inspektoren im Atelier. Jeder Inspektor behält seine eigenen Einstellungen; die Leitlinie legt nur die gemeinsame Bildsprache fest.

## Bild
- Ein Bild nur, wenn es mehr zeigt als ein Regler: einen Ablauf (Lebenslauf, Mahlzeit, Schlag), einen Zielkonflikt (mehr X kostet Y) oder einen Ort am Fisch. Ein Bild, das nur eine Zahl trägt, ist ein Regler und wird einer.
- Gezogen wird im Bild, an dem Ding, das sich ändert. Griffe sehen aus wie Griffe; ein Griff gehört zu genau einer Einstellung.
- Was sich nicht einstellen lässt und nicht aus einer Einstellung folgt, wird nicht gezeigt.
- Zusammenhänge zeigen die Formen selbst (Dicke, Länge, Füllung, Zeitpunkt), nicht Legenden.

## Wörter
- Titel und Einheit, keine Sätze. Höchstens ein Wort an einem Griff, und nur, wenn die Form es nicht schon sagt.
- Keine Legende, die erklärt, was ein Bild zeigt. Braucht ein Bild eine Legende, ist es das falsche Bild.
- Nur Begriffe, die man ohne Code versteht: Ei, Schlupf, erwachsen, Futter, Pflanzen, Eier, Kraft, Ausdauer. Nie: Signal, Meldung, Bauplan, Streuung, Grundantwort, Höchststärke, Kontakte im Bauplan.
- Kein Text darf abgeschnitten werden. Was nicht passt, fliegt raus, nicht kleiner.

## Bedienung
- Ziehen mit voller Bildrate (Ziel: unter 16 ms je Bild beim Ziehen, auch bei vollem Fisch).
- Jede Einstellung bewirkt sichtbar etwas im Bild, sofort beim Ziehen.
- Kein Klick darf abstürzen; jedes Bedienelement wird bei der Abnahme angeklickt bzw. gezogen.

## Abnahme (nicht durch den, der es gebaut hat)
Neuer Fisch und Beispielfisch, jedes Organ: jeden Griff ziehen, jeden Knopf drücken, Bildzeit messen, Konsole prüfen, bei 320 px Inspektorbreite und 1:1 ansehen. Prüffragen: Wie viele Wörter? Ist etwas abgeschnitten? Versteht man ohne Code, was die Einstellung am Fisch ändert? Erst danach geht es an David.

## Was die drei Muster-Organe laut Engine-Code einstellen

### Lebenslauf einer Zelle (Zellbildung, Aktivität, Tod)
Die Lebensachse ist die Reife des Fischs: Gewebe ÷ Gewebe des Erwachsenen (`physiology.hh:body_maturity`), von 0 (Ei) über den Schlupf bis 1 (erwachsen). Bei welcher Reife ein Fisch schlüpft, hängt von der Eigröße ab (`hatch_tissue`).
- **Bildung** (`substrate.cc:grow`): Eine noch nicht gebaute Zelle wächst, solange ihre Antwort > 0 ist, mit der Geschwindigkeit Antwort ÷ Zellzeit; bei 1 wird sie gebaut, wenn Energie da ist. Ohne Einstellung baut sie von Anfang an.
- **Aktivität** (`substrate.cc:733`): Die Zelle wirkt mit ½·(1 + Antwort). Bei −1 ist sie also aus, bei 0 halb, bei +1 voll. Damit lässt sich eine Zelle abschalten, ohne dass sie stirbt.
- **Tod** (`substrate.cc:571`): Die Zelle stirbt, sobald ihre Antwort über ½ steigt.
- Jede Antwort ist ein Übergang von einem Anfangs- zu einem Endwert (`hormones.hh:HormoneReceptor`), ausgelöst durch die Reife oder durch einen der sechs Botenstoffe. Reserve und Erschöpfung wirken hier nicht, nur die Reife.
- Daraus folgt das Bild: drei Spuren über der Lebensachse Ei | Schlupf | erwachsen. Jede Spur hat ihren Anfangswert, ihren Endwert und einen Umschaltpunkt. Hängt eine Spur an einem Botenstoff statt an der Reife, wird ihre Achse zum Pegel dieses Stoffs.

### Darm
- **Länge** (0 bis 1 ergibt die Größe 0,5 bis 4, `protocol_schema.hh:digestion`). Ein längerer Darm hält das Futter länger (`gut_transit`) und fasst mehr (`gut_capacity`). Er nimmt deshalb mehr von dem auf, was langsam verdaut wird, vor allem Pflanzenfasern (`gut_utilisation`); schnell Verdauliches wie Futterflocken nimmt auch ein kurzer Darm fast ganz auf.
- **Preis der Länge**: Grundumsatz bis +40 % (`physiology.cc:417`, upkeep 0,1 × Größe), Gewicht (`wall_mass`) und Platz im Bauch für die Gonaden, also weniger Eier (`belly_room`, bis 60 %). Das zeigt das Atelier bisher nicht; deshalb wirkt lang immer besser.
- **Darmmuskel**: Er schiebt das Futter bis zu 8-mal schneller weiter (`gut_speed`). Das macht Platz für die nächste Mahlzeit, aber vom Durchgeschobenen wird weniger aufgenommen. Pflanzenfasern, die zu schnell durchgehen, reizen den Darm: Durchfall und Schaden (`gut_irritation`).
- Daraus folgt das Bild: eine Mahlzeit je Futterart, die durch den Darm wandert. Ihre Länge ist die Länge des Darms, der aufgenommene Anteil liegt daneben, und die Kosten stehen als zweite Größe am selben Griff.

### Schwanzflosse und Schwanzmuskeln
- **Zuckung** (`body_plan.cc:stroke_step`): Ein Muskel zuckt, wenn er ausgeruht ist und sein Antrieb die Schwelle erreicht (in der Welt fest 0,2, `stroke_threshold`). Die Kraft folgt dem Antrieb, ein Stoß dauert eine Zuckung.
- **Fasertyp** (`muscle_fibre.hh`): schnelle Fasern geben den stärksten und kürzesten Stoß und ruhen am billigsten, ermüden aber nach etwa 40 Schritten Vollgas und brauchen Hunderte zur Erholung. Langsame Fasern arbeiten am billigsten und ermüden nie.
- **Zellen**: mehr Zellen ergeben mehr Kraft und kosten mehr Unterhalt.
- **Schlängeln** (`movement.cc:93`): Ein schlängelnder Körper kommt im Sand leichter voran (Widerstand 3 statt 12), verliert dafür im freien Wasser Schub.
- Daraus folgt das Bild: ein Schwanzschlag über der Zeit, Kraft und Dauer je Faseranteil, dazu Ermüdung bei Dauerschwimmen. Beim Schlängeln: Tempo im Wasser gegen Tempo im Sand.

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
Die Lebensachse ist die Reife des Fischs: höchstes bisher erreichtes Gewebe ÷ Gewebe des Erwachsenen (`physiology.hh:body_maturity`), von 0 (Ei) über den Schlupf bis 1 (erwachsen). Bei welcher Reife ein Fisch schlüpft, hängt von der Eigröße ab (`hatch_tissue`).
- **Bildung** (`substrate.cc:grow`): Eine noch nicht gebaute Zelle wächst, solange ihre Antwort > 0 ist, mit der Geschwindigkeit Antwort ÷ Zellzeit; bei 1 wird sie gebaut, wenn Energie da ist. Ohne Einstellung baut sie von Anfang an.
- **Aktivität** (`substrate.cc:733`): Die Zelle wirkt mit ½·(1 + Antwort). Bei −1 ist sie also aus, bei 0 halb, bei +1 voll. Damit lässt sich eine Zelle abschalten, ohne dass sie stirbt.
- **Tod** (`substrate.cc:571`): Die Zelle stirbt, sobald ihre Antwort über ½ steigt.
- Jede Antwort ist ein Übergang von einem Anfangs- zu einem Endwert (`hormones.hh:HormoneReceptor`), ausgelöst durch Reife, Reserve, Erschöpfung oder einen der sechs Botenstoffe. Breite Rezeptoren mischen die Stoffe entsprechend ihrer Bindung.
- Daraus folgt das Bild: drei Spuren über der Lebensachse Ei | Schlupf | erwachsen. Jede Spur hat ihren Anfangswert, ihren Endwert und einen Umschaltpunkt. Hängt eine Spur an einem Botenstoff statt an der Reife, wird ihre Achse zum Pegel dieses Stoffs.

### Darm
- **Länge:** Das Gen 0 bis 1 ergibt exponentiell 0,5 bis 4 Körperlängen (`gut_size`). Länger bedeutet mehr Fassungsvermögen und längere Verweildauerskala (`gut_capacity`, `gut_transit`); bei `gut_time=200` sind das ruhend 100 bis 800 Schritte. Diese Skala ist keine Wartefrist: Nahrung wird sofort aufgeschlossen, ab dem zweiten Verdauungsschritt aufgenommen.
- **Ertrag:** `gut_yield` beschreibt Aufschluss, Aufnahme, Verderb und Abgang. Pflanzen brauchen lange Verweilzeiten; tierisches Futter verdirbt bei zu langer Passage. Algen, Mischfutter und Plankton liegen dazwischen. Flocken sind mild und lösen keine Bauchschmerzen aus, werden aber nicht automatisch vollständig aufgenommen. Die laufende Engine berücksichtigt zusätzlich Füllung, Reservemangel bzw. volle Reserve und Durchfall; die Ertragskurve ist deshalb kein vollständiger Fischversuch.
- **Preis der Länge:** Der Darm erhöht den körperlichen Grundumsatz um 0,1 × seine Länge (bis +40 %), bringt Wandmasse mit und nimmt dem Eiorgan Bauchraum (`belly_room`, bis 25 % weniger Platz). Die Länge verändert damit auch, wie viel Dotter ein Ei höchstens bekommen kann.
- **Darmmuskel:** `gut_speed` erreicht bei großer Muskelkraft höchstens das Vierfache als Mittel über volle Zuckungen. Die momentane Passage schwankt mit der Zuckung (`gut_pace`, doppelte Pose). Das macht Platz und verkürzt die Verweildauer. Unaufgeschlossen ausgeschiedene Pflanzen und verdorbenes tierisches Futter reizen den Darm (`gut_irritation`): Durchfall und Gesundheitsschaden.
- **Drei Meldungen:** Dehnungszellen melden Füllung, Futterzellen den erwarteten verwertbaren Anteil gerade geschluckter Nahrung im Verhältnis zum Ruhebedarf (klingt rasch ab), Schmerzzellen innen melden Bauchweh. Die Energiereserve gehört zum Blut- und Hormonsinn. Bauchweh verwendet die normale Intensitätsantwort mit Gewöhnung; Dehnung die begrenzte Antwort ohne Gewöhnung.
- **Wachstum:** Das Fassungsvermögen wächst mit dem Körper, wegen der Mindestkapazität erst oberhalb 25 Gewebe. Die relative Darmlänge wird beim Bau aus den Intake-Zellen bestimmt und bleibt bislang lebenslang gleich. Der Darmmuskel kann sich durch Zellgeburt und Aktivitätsrezeptoren mit der Reife verändern; eine echte Entwicklung der relativen Darmlänge ist noch nicht umgesetzt.
- **Bild:** Eine Mahlzeit je Futterart wandert durch den Darm; Aufnahme und Verluste folgen ihrer Verweildauer. Bauchraum, Grundumsatz und Ertrag müssen gemeinsam mit der Länge sichtbar sein. Die drei Sinnesgruppen erhalten eigene Reizantworten.

### Schwanzflosse und Schwanzmuskeln
- **Zuckung** (`body_plan.cc:stroke_step`): Ein Muskel zuckt, wenn er ausgeruht ist und sein Antrieb die Schwelle erreicht (in der Welt fest 0,2, `stroke_threshold`). Die Kraft folgt dem Antrieb, ein Stoß dauert eine Zuckung.
- **Fasertyp** (`muscle_fibre.hh`): schnelle Fasern geben den stärksten und kürzesten Stoß und ruhen am billigsten, ermüden aber nach etwa 40 Schritten Vollgas und brauchen Hunderte zur Erholung. Langsame Fasern arbeiten am billigsten und ermüden nie.
- **Zellen**: mehr Zellen ergeben mehr Kraft und kosten mehr Unterhalt.
- **Schlängeln** (`movement.cc:93`): Ein schlängelnder Körper kommt im Sand leichter voran (Widerstand 3 statt 12), verliert dafür im freien Wasser Schub.
- Daraus folgt das Bild: ein Schwanzschlag über der Zeit, Kraft und Dauer je Faseranteil, dazu Ermüdung bei Dauerschwimmen. Beim Schlängeln: Tempo im Wasser gegen Tempo im Sand.

## Prüfung vor David (David 13.11. 01:59: „würdet ihr auch diese Unzulänglichkeiten in der Modellierung bemängeln? Und dann noch genau das Visuelle auch überdenken?“)
Jedes Organ durchläuft beides, bevor David es sieht. Der Bauende macht 1 und 2, ein anderer (Astra) prüft 2 erneut mit dem Auftrag, Mängel zu finden, nicht zu bestätigen.

### 1. Modellkritik (vor dem Zeichnen, Funde als Frage an Fable)
- Hat jede Einstellung einen Vorteil **und** einen Nachteil? Gibt es eine Einstellung, die immer besser ist?
- Hat jede Nische (Futter, Lebensweise) ein eigenes Fenster, scharf genug, dass Spezialisten sich lohnen?
- Wird etwas gemittelt, gerundet, gestuft oder zusammengezählt, was einzeln wirken müsste (Knoten, Zellen, Fasern)?
- Was würde ein echter Fisch hier anders machen? Was würde ein Spieler unlogisch finden?
- Passen die Zeitskalen zusammen (Sinn, Verdauung, Bewegung)?

### 2. Bildkritik (an Davids Rückmeldungen)
- Ist das Ding selbst das Diagramm (Lebensphasen, Fisch, Darm), nicht eine Legende daneben?
- Liegen Kurven über dem Ding, dünn, nicht aufdringlich?
- Fallen Werte, die zusammengehören, auf einen Griff (Entstehen = Beginn der Aktivität)?
- Folgt jeder Griff der Maus, hat er mindestens 40 px Weg, verschwindet er nie, auch bei Extremwerten?
- Sieht ein Griff nicht aus, als gehöre er zu einer anderen Kurve?
- Werden Bilder beim Ziehen nicht neu erzeugt (sonst reißt das Ziehen ab)?
- Gleichartige Wahl nebeneinander, Zusammengehöriges gruppiert, Zwischenüberschriften als solche erkennbar?
- Namen statt Buchstaben (Botenstoffe), unbenutzte Dinge erkennbar (gestrichelt) und anlegbar?
- Kein Text, den eine Form sagen könnte; keine hässlichen Wörter („300 Schritte Vollgas“).
- Ist ganz ausgegraut, was gerade nichts steuert?

## Gemeinsame Bausteine (aus den drei Muster-Inspektoren, Stand 13.11. 03:16)
- **Zwischenüberschrift mit Querstrich** über jedem Abschnitt (Auslöser, Lebensphasen, Verdauung, Ertrag je Futter, Muskelknoten, Rekrutierung, Ausdauer, Nische, Schmerzzellen …); Stoffabschnitte mit Farbpunkt und Namen („Tod durch Laichzeit“, „Lebenszyklus durch …“).
- **Das Ding als Diagramm:** Lebensphasen (Ei, Jungfisch, erwachsen) als Feld, Fisch mit Darm oder Muskelknoten als Bild; Kurven dünn darüber.
- **Strichlinie als Griff** für einen Zeitpunkt, eine Mitte oder eine Vorschau (Schaltpunkt, Verweildauer-Mitte, Befehl, Schlängeln); sie ragt über das Diagramm hinaus.
- **Kugel** für einen Wert an einem Ort (Anfang/Ende der Aktivität, Füllstufe), **Kugel mit Kreuz** für Tod, **Dreieck auf der Achse** für eine Schwelle, **Balken mit zwei Enden** für eine Spanne.
- **Sinneszellen** immer als „Meldung an das Gehirn“ über dem Reiz (Dehnung, Schmerz, Nährstoff), Griff „Empfindlichkeit“, wo nötig „Gewöhnung“.
- **Schraffur** für Zeiten, in denen etwas nicht da ist (vor Entstehen gelbgrau, nach Tod rotgrau); **rot gestrichelter Rahmen** für Schaden (Bauchschmerzen); **abgedeckt mit Satz**, wenn ein Bild gerade nichts steuert.
- **Knöpfe mit Text** für Hinzufügen/Entfernen („+ Knoten“), Segmentknöpfe nebeneinander für gleichrangige Wahl, Häkchen für „selbst steuern“; Auswahl im Knopf mit eigenem Menü statt Systemauswahl.
- **Unbenutztes gestrichelt** und anlegbar (Botenstoffe); Namen statt Buchstaben.
- **Skalen wachsen mit** statt überzulaufen; unbeschriftete Gitterlinien zeigen, dass skaliert wird.
- Animationen ruhig (Darm: 100 Schritte in 2 s).

## Uhrzeit
- Jede Zeitangabe (KOORD, Berichte an David) kommt aus der Konsole: `TZ=Europe/Vienna date +%H:%M`. Nie raten (David 05:49).

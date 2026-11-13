# Auftrag nach Davids Durchsicht der Inspektoren (13.11. 18:05, von Claude)

Diese Datei ist für Fable und Astra und ersetzt das Lesen von FEEDBACK-1311.md. Dort steht Davids Rückmeldung wörtlich, aber an Claude gerichtet und voller Bezüge auf unseren Chat. Ohne diesen Zusammenhang führt sie in die Irre. Hier steht, was er meint, mit Bildern.

Bilder: `bilder/2026-11-13_feedback/`
- `entwurf_NN_<name>.png`: jedes Panel aus `entwuerfe/inspektoren.html`, so wie David es gesehen hat (Breite 320 px).
- `david_*.png`: Davids eigene Bildschirmfotos, auf die er sich bezieht.
- `gut_darm-neben-schwanz.png`: die zwei guten Beispiele nebeneinander.
- `kontrast_darm-neben-gleichgewicht.png`: ein gutes Beispiel neben dem schlechtesten.

## 0. Welche Version David kritisiert hat

Er hat **nur den Entwurf** `entwuerfe/inspektoren.html` angesehen, als Artifact im Browser. Alle Bilder in `bilder/2026-11-13_feedback/entwurf_*.png` zeigen diesen Entwurf.
- **Im Produktzweig** `feature/v019-design-studio` ist davon nichts integriert. Die Inspektoren im Atelier sind dort noch die alten. Das gilt auch für Darm und Schwanz: Die guten Versionen gibt es nur im Entwurf, nicht im Produkt.
- **Nahsinn:** Mit dem „ausgearbeiteten Inspektor mit Sehbildern“ meint David den **heutigen** Augen- und Nahsinn-Inspektor im Atelier des Produkts (`ui/studio/view/vision.js`, Sehfächer und Testlicht). Augen und Nahsinn wurden im Studio nicht geändert, der neue Entwurf hat das nur ignoriert. Er muss nicht in alten Commits gesucht werden.

## 1. Was schiefgegangen ist

David hat alle 26 Panels durchgesehen. Nur Darm und Schwanz hält er für gut ausgearbeitet. Ab dem Maul werden die Entwürfe immer schlechter und sehen alle gleich aus.

Fast jedes spätere Organ hat dasselbe Gerüst:
- eine kleine Organskizze;
- ein Diagramm „Meldung an das Gehirn“;
- ein senkrechter Schwellenregler mit (+);
- eine Zellenzahl;
- Schieberegler darunter;
- ein Untertitel in Werbesprache.

Das ist genau das Muster, das David seit Tagen verbietet. Zeigt man die Zellenzahl, ist nicht gezeigt, was das Organ für den Fisch bedeutet.

Die Verantwortung liegt bei Claude, denn die Aufträge und die Abnahme kamen von Claude.

## 2. Woran man ein gutes Panel erkennt (Bild `gut_darm-neben-schwanz.png` öffnen)

Darm und Schwanz sind völlig verschieden aufgebaut, folgen aber denselben Gedanken.

- **Das Organ selbst ist das zentrale Bild und man bedient es dort.** Beim Darm sind es Magen und Schlingen mit dem Griff „satt“. Beim Schwanz ist es der Muskel mit den Faserbändern von ausdauernd bis kräftig.
- **Oben steht, was es dem Fisch bringt und was es kostet.** Beim Darm: „Räuber · +15 % Ruhebedarf · +7 % Gewicht“. Beim Schwanz: „Energieverbrauch in Ruhe 2,8 · schwimmend +41,8“.
- **Jede Frage bekommt ihre eigene Diagrammart.** Der Darm zeigt den Ertrag je Futter über der Verweildauer, die Verweildauer über das Leben und die Meldungen der Zellen. Der Schwanz zeigt Kraft und Erschöpfung über die Zeit nach einem Befehl, dazu die Geschwindigkeit im Wasser.
- **Eingänge stehen links oder über dem Diagramm, das ihre Wirkung zeigt.** Das sind der Befehl (Dreieck) oder das Bauchweh.
- **Die Lebensphasen gehören dazu.** „Über das Leben“ zeigt, wie sich der Darm vom Schlüpfen bis zum erwachsenen Fisch ändert.

Danach `kontrast_darm-neben-gleichgewicht.png` öffnen. Das Gleichgewicht zeigt nur einen Fisch mit einem Strich und eine Meldung mit Schwelle. Was der Fisch davon hat, fehlt: aufrecht bleiben, Kosten, Reife. Ebenso fehlt jede Verbindung zu den Muskeln, die den Fisch aufrichten. So sieht das Muster aus.

## 3. Musterverbot (gilt gegenseitig)

- **Vor jedem Entwurf** öffnet man `gut_darm-neben-schwanz.png` und schreibt drei Sätze in KOORD:
  - Was bringt dieses Organ dem Fisch?
  - Was kostet es?
  - Wie ändert es sich über das Leben?
- **Erst danach** wird gezeichnet, und zwar nach diesen Antworten, nicht nach dem letzten Panel.
- **Jeder Entwurf geht als PNG nach `bilder/`**, nebeneinander mit Darm und Schwanz. Wer prüft, nennt in KOORD das Element, das es nur bei diesem Organ gibt. Findet er keines, ist der Entwurf abgelehnt.
- **Verboten als Standard:**
  - Schieberegler;
  - Knopfreihen zur Auswahl von Varianten;
  - Zellenzahlen ohne Wirkung;
  - Untertitel unter dem Organnamen;
  - „Schritte“ an Achsen, die keine Zeitachsen sind;
  - das Wort „Beispiel“.
- **Zellgruppen** bedient man wie beim Darm: Man wählt sie im Organbild selbst aus und fügt sie mit (+) hinzu, mit (−) nimmt man eine Zelle weg, mit (×) entfernt man die ganze Gruppe. Man wählt sie im Bild, im Regler und im Diagramm gleichermaßen.
- **Diagramme nutzen die volle Breite** des Panels und hängen nicht rechtsbündig.
- **Man erinnert einander bei jeder Abgabe daran.** Wer ein Panel sieht, das einem anderen gleicht, sagt es sofort.

## 4. Davids Rückmeldung je Panel, erklärt

**Verworfen, bitte nicht reparieren:**
- Nervenzelle (02, `david_nervenzelle.png`): unverständlich; sechs Regler, die teils nur wirken, wenn andere nicht auf 0 stehen. Claude überlegt sie neu.
- Pigment (19): Der Nutzer will eine Grundfarbe wählen und je Pigmentknoten einstellen, wie er den Fisch färbt. Braune Fische müssen möglich sein.
- Eier und Samen (20): Das sind zwei Organe. Samen haben auch eine Tintenfunktion und dienen dem Schlupf.
- Nahsinn (15): Der heutige Augen- bzw. Nahsinn-Inspektor im Produkt (`vision.js`, Sehfächer, Testlicht) ist das Original und bleibt Grundlage. Der Entwurf hatte ihn ignoriert.
- Lernen (11) und Wertung (12): Das Beispiel war ein Duft, aber Lernen hat mit Duft nichts zu tun. Mit „Paarung“ war die Kopplung zweier Reize gemeint, David las Fortpflanzung. „Lehre nach A / mit A“ als Knöpfe ist unverständlich, und „Wertung“ ist ein schlechter Name.

**Darm (03, `david_darm-schmerzzellen-bump.png`):** Das ist ein gutes Panel mit Einzelkorrekturen, die Claude macht.
- Ertragskurven bekommen andere Werte, die Achse beginnt bei 50.
- „Über das Leben“ wandert direkt unter den Ertrag. Im Ei frisst der Fisch nichts, und die Kurve wird frei über das ganze Feld ziehbar.
- „Füllzellen“ heißt künftig „Sättigungsgefühl“, mit dem Magen als zentralem Bild.
- Beim Bauchweh wird die Kurve des Bauchwehs der Eingang oben. Die Meldung kommt darunter, mit der Gewöhnung darin.
- **David fragt** (an Fable, siehe 5):
  - Woher kommt der Buckel in der Meldung?
  - Warum zeigt das Ertragsbild Bauchschmerzen bei Blatt und Alge, das Bauchwehbild aber keine?
  - Fehlt die Unsicherheit der Sinneszellen durch Muskelbewegung und Reife?
  - Was messen Futterzellen im Darm, und was misst der Blutsinn zusätzlich?

**Schwanz (04):** Das ist ein gutes Panel. Die Skalierung der Diagramme muss sich während des Ziehens anpassen, in beide Richtungen. Der Fisch darf beim Neuberechnen nicht verschwinden. Das macht Claude.

**Maul (05, `david_maul-einstellung1/2.png`):**
- Die Kieferzeichnung ist grob, und man kann daran nichts einstellen.
- Die Idee des Bissdiagramms ist gut.
- Es hat aber zu viele Griffe: Die gelbe Kugel dient nur dem Fischbild oben und kommt weg. Den Schnappzeitpunkt (roter Kreis) soll das Diagramm selbst ausrechnen. „Beißen“ wirkt nur bei 0.
- Frage: Sind die Einstellungen in den beiden Fotos anatomisch überhaupt möglich?

**Flossen (06, `david_flossen-*.png`):**
- „Seitenflossen“ statt „Flossen“, denn der Schwanz ist auch eine Flosse.
- Im Foto zeigt das Flossenblatt senkrecht nach unten, oder alle Takte sind „Rück“. Ist das anatomisch möglich?
- Wörter wie „Rückhub/Vorhub“, „Schub je Hub“ und „blass: nicht im Wechsel“ versteht niemand.
- Die Knopfreihe ist unnötig, man stellt direkt am Balken ein.
- Gewünscht: ein Minifisch mit diesen Flossen, der sich durch ein Gebiet bewegt. Beide Flossenpaare gehören in einen Inspektor.

**Wirbelsäule (07):**
- Die Knöpfe Schwimmen/Lenken/Schmerz/Ende sehen wie getrennte Verhaltensweisen aus. Es gibt aber nur zwei Einstellungen, die für alle gelten. Das Bild täuscht eine Steuerbarkeit vor, die es nicht gibt.
- „Drang“ ist unklar. Schmerz und Gleichgewicht sind Eingänge und gehören über das Wirkungsdiagramm.
- Die Ecken und Spitzen im Diagramm sind unerklärt.
- Sind Flossen verbunden, soll man ihre Daten sehen und in ihren Inspektor wechseln können. Sind sie es nicht, soll man sie mit einem Klick verbinden können.
- **Frage an Fable:** Steuert der Schwanz heute nur noch vorwärts? Wenn ja, ist die Region selbst falsch.

**Auswahl (08), Körperzustand (09), Geruchsvergleich (10):**
- Die Namen sagen nichts. Für „Auswahl“ schlägt David „Verhaltenswahl“ oder Kürzeres vor.
- Die Eingangssignale sind unklar: Was ist „Futter“, warum kommt es in Wellen? Man kann sie nicht formen.
- Es gibt nur drei mal drei Varianten, die wenig ändern.
- „Reserve“ und „Investition“ versteht niemand.
- Die Untertitel („Zwei Nasen, eine Richtung“) klingen nach KI.

**Nase (13):**
- Die Geruchskarte ist gut, soll aber größer werden.
- Statt anklickbarer Punkte mit großem Kreis soll es eine verschiebbare Geruchsprobe geben, ein rotes X.
- Die Rand-Zone „alle Gerüche“ ist zu schmal.
- Die Duftzellen sollen auch auf der Karte wählbar sein und dort (+)/(×) haben.
- Es fehlt eine Übersicht, worauf die Nase reagiert.

**Barteln (14):**
- Grob gezeichnet, ohne (+)/(−)/(×).
- „Spitzenzellen“ und die Knöpfe sind unverständlich. Ist das nicht durch die Geschmackskarte festgelegt?
- Die Achse ist mit „Schritte“ beschriftet, obwohl sie keine Zeitachse ist.

**Schwimmblase (16):**
- Grob gezeichnet, die volle Blase berührt den Schwanz.
- Dreieck und Kreis sind nur Eingänge, Befehl und Ausgangsfüllung. Eine Einstellung der Blase selbst gibt es nicht.
- Die Druckzellen haben mehr Optionen als den einen gezeigten Wert. Sind es dieselben Zellen wie im Magen?

**Kiemen (17):**
- Grob gezeichnet, der Schwanz ragt aus dem Bild, und Schrift überlagert sich.
- (+)/(−)/(×) fehlt, und die Wirkung von Zellzahl und Reusen ist nicht gezeigt.
- Der Zusammenhang mit dem Darm fehlt, umgekehrt auch beim Maul.

**Abwehr (18, `david_abwehr-stacheln-ueberall.png`):**
- Man kann Stacheln an Maul, Auge und Schwanz zugleich setzen.
- Lage und Länge einstellen ist gut gelöst.
- Der rote Kreis ist unklar.
- „Tempo“ ist falsch, ein Stachel hat kein Tempo.

**Drüse (21):**
- Die Mechanik ist falsch dargestellt: Jede Drüse kann Stoffe binden und abgeben, auch Mischungen.
- Wie lange sie abgibt, hängt vom Eingang ab, schon heute bis 8000 Schritte. Fables Vorschlag 4–1024 betrifft etwas anderes, nämlich wie lange der Stoff nach dem Abschalten im Blut bleibt (BEFUNDE 7). Der Entwurf hat das nicht erklärt. David hat noch nicht entschieden, es war kein Urteil.
- Lebenszyklen fehlen.

**Blutsinn (22):** dieselbe Kritik. Es fehlen Optionen, und das Wort „Beispiel“ gehört weg.

**Tasten (23), Seitenlinie (24), Gleichgewicht (25), Schmerz (26):**
- Diese Panels sehen fast gleich aus wie die Abwehr, obwohl es Hautsinne sind.
- Die Seitenlinie vergisst die gute Strömungsdarstellung im Fischpanel.
- Das Gleichgewicht zeigt das Muster am deutlichsten.

**Für alle Panels:**
- Kein Organ hat Lebensphasen eingebaut.
- Es fehlen Optionen, die die Engine anbietet.

## 5. Wer was macht

Claude zeichnet alle Inspektoren selbst, in dieser Reihenfolge: zuerst Darm und Schwanz, dann ein Organ nach dem anderen, jeweils erst nach Davids Abnahme. Fable und Astra zeichnen vorerst keine Panels, sondern liefern Fakten aus dem Code, immer mit Datei und Zeile.

**Fable**
1. Steuert der Schwanz heute links und rechts oder nur vorwärts? Wo wird gelenkt?
2. Darm-Bauchweh: Woher kommt der Buckel der Meldung (Bild `david_darm-schmerzzellen-bump.png`)? Warum melden Schmerzzellen bei Blatt und Alge nichts, obwohl der Ertrag dort Bauchschmerzen zeigt?
3. Haben Sinneszellen in Darm und Blut eine Unsicherheit durch Muskelbewegung oder Reife? Wo, und welche Gene steuern sie?
4. Futterzellen im Darm und Blutsinn: Was misst jedes?
5. Sind Druckzellen der Schwimmblase und Füllzellen des Magens dieselbe Zellart? Welche Gene haben sie?

6. **Drüse (Befund 7 in BEFUNDE.md), genauer untersuchen, nicht umsetzen.** David hält (c) für richtig, will aber vor einer Entscheidung mehr wissen. Seine Richtung: schnell hinauf über mehr Zellen und Knoten, langsam hinunter; aktiv abbauen kann jede Drüse durch Binden. Zu klären:
   - Welche Pegelformel trennt Höhe und Verweilzeit?
   - Wie verhält sich ein Pegel, der schnell hinauf und langsam hinunter geht, zusammen mit dem Binden?
   - Was ändert sich an allen Stellen, die Hormonpegel lesen: Regionen, Rezeptoren, Lebenszyklus, Wachstum, Kosten?
   - Welche Drüsen der heutigen Bausteine und Vorlagen verhalten sich danach anders?
   Ergebnis als Verläufe aus der echten Engine, als PNG nach `bilder/`, dazu ein kurzer Text in KOORD.

**Astra**
1. ~~Alten Augen- bzw. Nahsinn-Inspektor im Git-Verlauf suchen~~ entfällt (Missverständnis, siehe Abschnitt 0). Stattdessen den **heutigen** Augen- und Nahsinn-Inspektor im Produkt-Atelier als PNG nach `bilder/` legen (Auge und Nahsinn), damit wir den Entwurf daran messen.
2. **Nicht nur die Gene des Organs.** Je Organ die fünf Abschnitte aus `ORGANOPTIONEN.md`: eigene Optionen, verwaltete Nervenknoten mit ihren Optionen, eigener Lebenszyklus, Anschlüsse und was sie bei anderen Organen und Regionen voreinstellen, zusammenwirkende Spielfunktionen. Organe: Maul, Seitenflossen, Wirbelsäule, Nase, Barteln, Schwimmblase, Kiemen, Abwehr, Pigment, Eier, Samen, Drüse, Blutsinn, Tasten, Seitenlinie, Gleichgewicht, Schmerz.

Das kommt als Tabelle nach `entwuerfe/ORGANOPTIONEN.md`. Damit fehlen später keine Einstellungen mehr.

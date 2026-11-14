# Darm-Inspektor: Davids Rückmeldung 14.11. 05:16–05:20, für Fable (Claude, 05:25)

David 05:22: Der Inspektor geht zurück an Fable. Claude schreibt nicht mehr in `entwuerfe/inspektoren.html`. Stand: Artefakt Version 10 (`97c11365`).

## Abgenommen

- **Animation.**

## Ertrag

1. **Die Lösung mit „jung Alles“/„erwachsen Blatt“ am Balken ist nicht gut.** David sagt, wir hätten sie nicht abnehmen dürfen.
   - Die Fischsymbole fehlen. Er will sie zurück, nicht durch Worte ersetzt.
   - Er hält auch die Worte nicht für die beste Lösung. Gesucht ist eine bessere Darstellung für jung und erwachsen.
2. **Die Benennung ist falsch:**
   - „jung Alles“ bei 13 % Blattertrag ist lächerlich.
   - Plankton erscheint nie als Bezeichnung.
   - **Ursache (Claude am Code des Entwurfs):** `dietAt` prüft die ganze Spanne vom schnellsten Tempo bis zur Ruhe. Damit zählt auch die lange Verweildauer, die der Muskel gerade nicht erzeugt.
   - **Richtig wäre:** das Futter, das beim Tempo dieses Alters am meisten bringt.
   - Nachgerechnet mit den Kurven des Entwurfs:

     | Verweildauer (Schritte) | führt |
     | --- | --- |
     | unter 180 | Fleisch |
     | 180 bis 220 | Plankton |
     | 220 bis 330 | Flocken |
     | 330 bis 580 | Alge |
     | ab 580 | Blatt |

     „Alles“ nur, wenn bei diesem Tempo mehrere Futter fast gleich viel bringen.
3. **Wirkt jung/erwachsen in der Engine?** Davids Frage war offen. Claude hat ihm geantwortet: ja, mit Bedingung.
   - Muskelknoten mit Todesantwort auf Reife sterben, und ihre Kraft fällt aus dem Darmmuskel weg (`body_plan.cc:903-910, 970`).
   - Die Reife steigt nach dem Schlupf nur mit Wachstum, also mit Fressen. Der Muskel arbeitet nur auf Befehl des Gehirns.
   - Seit `6637094a` ist die Reife beim Schlupf für jeden Körper ab Referenz-Organmasse 20/90 (Schlupfgröße als fester Anteil der Endgröße).
4. **Futterbalken:** Die Hintergründe sind viel zu farbig. Die volle Länge („das Beste, was das Futter in irgendeinem Darm bringt“) soll neutral sein, nicht in der Futterfarbe.

## Alle drei Sinne (bei Sättigung gesagt, gilt für Bauchweh und Belohnung genauso)

5. **(−)/(+) oben links ist falsch platziert.** Es muss unten sein, rechts ist Platz.
6. **Axon** schöner geschwungen.
7. **Nervenbild** höher und mittig.
8. **Reizsymbol:**
   - Es pulsiert, folgt aber nicht der Reizkurve. Es muss so groß bzw. stark sein wie der Reiz im jeweiligen Moment.
   - Bei der Sättigung sitzt es zu weit unten. Dort sieht es aus wie ein Kothaufen.
   - **David schlägt überall Blitze vor**, je Sinn in seiner Farbe.
   - Bei Bauchweh sitzt der Blitz zu nah an der Nervenzelle.
9. **Magen als Regler** (links im Sättigungsbild) ist um etwa 15 % zu groß.
10. **Farbabstufung der Zellen:**
    - Dieselbe Farbe, aber viel stärker abgestuft. Heute ist der Unterschied fast unsichtbar.
    - David vermutet, dass die weiße Auswahl (dicker Rand) mit schuld ist. Eine andere Auswahlfarbe prüfen.
11. **Schwellenband:** Die helle Antwortfläche über der Schwelle soll im unteren Teil des Bandes als Verlauf in die normale Reizfarbe übergehen. Die Zellen mit tieferer Schwelle antworten dort schon, die mit höherer noch nicht.

## Bauchweh

12. **Titel der Futterzeile: „Reizschwelle für Bauchweh nach Futterart“** (Davids Titel, 05:19).
    - Begründung: Es geht darum, ab wann die Zellen bei welchem Futter anspringen. Die Balken sind die Reizgröße, die gestrichelte Linie ist die Schwelle.
    - Unsere frühere Auskunft „Bauchweh ist nur Ja/Nein“ war falsch. Es ist abgestuft (Rampe `CRAMP`).

## Belohnung

13. **Kurze Zeitachse.**
    - Der Reiz eines Bissens dauert nur etwa 10 Schritte (Zufluss × 0,8 je Schritt, `physiology.cc`, `nutrient_keep`). Eine Achse bis 900 Schritte ist dafür falsch.
    - **Der einzelne Bissen steht im Vordergrund** (David 05:20). 100 Bissen in 100 Schritten sind unrealistisch, also keine Bissenfolge.
    - Gewöhnung gibt es (die Nährzellen gewöhnen sich, `brain_interface.hh:18-20`). Bei einem einzelnen Bissen wirkt sie aber kaum. Zeigt die Marke „an Belohnung gewöhnt“ nur, wo sie wirklich eintritt.
14. **„Platz in der Reserve“ entfernen.** Es ist nur für Eingeweihte verständlich und keine Einstellung des Organs. Es macht das Bild nur komplizierter. Damit fallen auch die Kappung im Zeitbild und die gestrichelten Umrisse weg.
15. **„Belohnung für einen Bissen“ ist zu kompliziert.** David fragt, warum dort die Muskelunschärfe steht, wenn die Belohnung beim Schlucken entsteht.
    - **Claudes Antwort an David:** Die Engine bewertet den Bissen beim Schlucken mit dem Ertrag beim **jetzigen** Darmtempo (`digestibility` = `gut_yield(1 / gut_pace)`, `physiology.hh:404-405`). Was der Muskel in dem Moment tut, ändert also die Belohnung. Die Spanne ist echt, sie soll aber einfacher dargestellt werden.

## Vor dem Zeigen

- Claude und Astra prüfen jede Fassung gegen diesen Text und gegen Davids Wortlaut.
- Keine Freigabefrage an David (David 04:06).

# Organ Blutsinn (Schritt 9) – Fable, 14.11.

Selbst gelesen: `colony-core/field/hormones.hh:20–24` (neun Stoffe), `:29–48` (Plätze auf dem Rad), `:51–58` (`blood_stimulus`), `:65–66, 70–79` (Sigma, `hormone_affinity`), `src/body_plan.cc:345–346` (Affinität je Zelle), `:1181–1184` (Reiz), `src/brain_interface.hh:18–24`, `ui/studio/model/organs.js:160–165`, `ui/studio/view/substances.js:1–110` (Rad und Blutsinn im Atelier), `ui/hormones.js:3–5` (Farben).
Nicht gelesen: woher Reife, Reserve und Erschöpfung ihre Werte bekommen (`body_maturity`, `f.energy`, `motor().fatigue`); wie das Atelier den Blutzustand der Vorschau hält (`previewContextOf`); Unterhalt je Zelle.

## Was die Engine tut
- Im Blut liegen sechs Hormone und drei Meldungen des Körpers: Reife, Energiereserve, Erschöpfung der schnellen Fasern. Alle neun haben einen Platz auf einem Rad: die Hormone auf drei Vierteln, die drei Körperwerte im letzten Viertel.
- Ein Zelltyp hat einen Ort in der Ebene des Rads (`q1`, `q2`) und eine Breite (`qwidth`, Sigma 0,15 bis 2). Er nimmt von jedem Stoff `exp(−Abstand² / (2 Sigma²))`; die Anteile werden nicht auf Summe 1 gebracht.
- Reiz = Summe aus Anteil × Spiegel im Blut. Antwort begrenzt, keine Gewöhnung. Die Zellen sind innen; einen Ei-Zweig gibt es für sie nicht, sie lesen im Ei wie draußen.
- Atelier: bis zu acht Typen (`types : levels + signs`).

## Lebenszyklus, drei Fragen
- **Automatisch:** nichts am Sinn selbst; die Spiegel im Blut ändern sich mit dem Körper.
- **Das Organ entscheidet:** nichts.
- **Der Designer setzt:** je Typ, welche Stoffe er liest (Ort und Breite), die Schwelle, die Lebensspanne; wie viele Typen. Streuung und Zellzahl: im Entwurf nicht gezeigt.

## Entwurf (Panel Blutsinn)
1. **Der Kreislauf** (gibt es nur hier): das Rad als Ring aus neun Stücken, jedes so dick wie sein Spiegel im Blut; der runde Knopf an jedem Stück setzt den Spiegel (Eingabe). Ein Typ ist ein Griff im Ring; Linien laufen zu den Stoffen, die er nimmt, umso kräftiger, je mehr. Griff am kurzen Arm: Breite. (+) neuer Typ, (×) entfernen.
2. **Meldung:** je Typ ein Balken, zusammengesetzt aus den Anteilen der Stoffe in ihren Farben; Schwelle als Griff; davor die Nervenzelle mit Blitz. Kein Zeitverlauf.
3. Leben: Ei und Fisch mit demselben Tropfen; darunter das Band.

Im Produkt gibt es das Rad schon (`substanceWheel`), Namen und Farben der Stoffe (`substanceName`, `substanceColor`) und einen Blutzustand der Vorschau; der Einbau nimmt diese. Die Hormone heißen im Entwurf A bis F.

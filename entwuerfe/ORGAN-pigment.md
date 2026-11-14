# Organ Pigment (Schritt 10) – Leseseite von Claude, 14.11. 16:12

Stand: Produktzweig `3c106bce`. Fable prüft gegen den Code und zeichnet daraus; Astra prüft die Seite.

## Codepfad
- **Zellen:** äußere `Pigment`-Zellen; Atelier: Organ `pigment`, Gruppe `colour`, bis 24 Gruppen, 4 Typen, 5 Kopien, Vorgabe `qwidth` 1 (`ui/studio/model/organs.js:236–243`).
- **Farbe einer Zelle:** `q1` ist der Farbton auf dem Kreis, `qwidth` die Breite. Daraus die Aufnahme je Kanal R, G, B (`hue_affinities`, `src/receptor_tuning.hh:8–25`). Die Zelle schluckt diese Kanäle; ihre Farbe ist 1 − Aufnahme (`src/body_plan.cc:399–404`). Breit = schluckt alles = dunkel/grau; schmal = schluckt einen Ton = farbig.
- **Volle Aufnahme des Körpers:** Summe über alle Pigmentzellen von Kapazität × Aufnahme je Kanal (`body_plan.cc:440–442`, auch `:936–941`).
- **Befehl:** nur positive Befehle verteilen Pigment, Menge = Befehl × Stärke (`body_plan.cc:1314–1319`, `:1344–1346`). Negativer Befehl tut nichts.
- **Verteilung je Kanal:** wandert zum Anteil Befehl ÷ volle Aufnahme, mit einer Zeit aus dem kapazitätsgewichteten Zeitgen der Zellen (`body_plan.cc:155–165`, `:191–196`, `:1643–1649`).
- **Sichtbar:** Aufnahme × (0,2 + 0,8 × Verteilung), also ein Ruheanteil von 0,2 bleibt immer (`visible_absorption`, `body_plan.cc:878–885`; `pigment_rest` `src/physiology_parameters.hh:38`).
- **Körperfarbe:** Haut (0,62; 0,66; 0,64) × 0,5 ÷ (0,5 + sichtbare Aufnahme) je Kanal (`pigment_color`, `src/material.hh:174–180`; `body_plan.cc:1650`). Es gibt keine erbliche Grundfarbe außer über Pigment.
- **Wer die Farbe sieht:** nur die Augen der anderen Fische (`VisibleBody` mit `body.color`, `src/ecology_step.cc:122–134`; die Netzhaut mischt sie gegen den Hintergrund, `src/retina.cc:670–680`). Eingegraben ist der Fisch unsichtbar (`hidden`, `ecology_step.cc:131–132`). Der Fisch sieht sich selbst nicht.
- **Kosten:** je Schritt 0,0002 × Befehlssumme (`pigment_cost`, `body_plan.cc:1497–1499`, `physiology_parameters.hh:41`), Unterhalt 0,000004 je Kapazität (`effector_upkeep`, `body_plan.cc:51–53`, `brain_interface.hh:166`). Beides fast nichts.
- **Aquarium:** Fisch in `body.color`; Pigmentspanne `ui/fish_organs.js:512`.
- **Atelier-Bericht:** `pigmentTimes` (`werkzeug/atelier.cc:336–339`) und `colour` mit Haut und Farbspanne von Ruhe bis voll verteilt (`:711–725`).
- **Bestehender Inspektor:** `pigmentInspector`, Farbrad, Typ-Chips, Chromatophoren (`ui/studio/view/pigments.js:36–210`, `panels.js:105`).
- **Bitte prüfen:** Ändert sich die Farbe im Ei schon (läuft der Motorschritt für Pigment im Ei)? Und welche Farbe sehen andere am Ei, `body.color` oder die Dotterfarbe?

## Was das Organ ist und tut (Wirkung statt Anzahl)
- Der Fisch kann seine Farbe ändern, zwischen „Ruhe“ (blass, 20 % des Pigments) und „voll“, je Farbe eigen und mit eigener Zeit.
- Die Farbe wirkt nur auf andere Augen: tarnen gegen den Hintergrund, auffallen für Artgenossen.
- Kostet fast nichts.

## Lebenszyklus, drei Fragen
- **Automatisch:** Ruhefarbe aus den gebildeten Zellen; die Farbe kehrt ohne Befehl in der Zellzeit zur Ruhe zurück.
- **Das Organ entscheidet:** wie schnell es umfärbt (Zeitgen) und wie weit (Befehl ÷ volle Aufnahme).
- **Der Designer setzt:** Farbton und Breite je Typ, Kopien (wie dunkel), Zeitgen, Schwelle, Lebensspanne.
- **Eigen:** Später gebildete Zellen ändern die Ruhefarbe; eine Jugendfarbe ist möglich, wenn Zellen eines Typs mit der Reife sterben.

## Was David schon gesagt hat
- Musterverbot gilt: Das Farbrad gibt es schon beim Blutsinn (Stoffrad) und beim Licht der Netzhaut. Das eigene Bild des Pigments ist der **Fisch selbst in seiner Farbe**, vor einem Hintergrund, so wie ein anderes Auge ihn sieht: Ruhe und voll nebeneinander, und wie schnell er umfärbt.

## Entwurf (Fable, Panel Pigment in `entwuerfe/inspektoren.html`)
Gegen den Code geprüft (selbst gelesen): `receptor_tuning.hh:8–25`, `body_plan.cc:396–405, 155–165, 878–885, 1643–1650`, `material.hh:174–180`. Stimmt mit der Seite überein; Zusatz: Der Farbton `q1` ist das Licht, das die Zelle schluckt, der Fisch zeigt also die Gegenfarbe. Nicht nachgelesen: Befehl und Kosten (`:1314–1346`, `:1497–1499`), wer die Farbe sieht, der Atelier-Bericht.
1. **Der Fisch in seiner Farbe vor einem Grund** (gibt es nur hier), so wie ein fremdes Auge ihn sieht; runder Knopf in der Ecke: was hinter ihm liegt. Darunter das Umfärben über die Zeit, von Ruhe (unterer kleiner Fisch) bis voll (oberer): Der runde Knopf ist der Befehl des Gehirns (wie weit, und wann es loslässt), die Kurve ist, was die Zellen in ihrer Zeit daraus machen, der Griff auf der Kurve setzt diese Zeit. Der große Fisch hat die Farbe des Schritts, an dem die Uhr steht.
2. **Das Licht als Band seiner Farbtöne:** Jeder Zelltyp schluckt das Licht um seinen Ton, eine Kerbe im Band, so breit wie seine Breite und so tief wie seine Zellen. Griff am Kerbengrund: Ton (entlang) und Zellen (nach unten); runder Griff am Kerbenrand: Breite; (+) und (×).
3. Leben: die Spanne des gewählten Typs; darüber der Fisch mit voll verteiltem Pigment, jung und erwachsen, in der Farbe der Typen, die dann leben (Jugendfarbe).

Angenommen fürs Bild: wie viel eine Zelle schluckt; die Farben des Grunds. Offen (Claudes Fragen): Farbe im Ei. Nicht im Bild: Kosten (fast nichts), Schwelle.

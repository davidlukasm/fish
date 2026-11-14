# Organ Gleichgewicht (Schritt 9) – Fable, 14.11.

Selbst gelesen: `src/body_plan.hh:29–33` (`hair_direction`), `src/body_plan.cc:329–335` (Haarrichtung, keine Gewöhnung), `:1098–1101` (Reiz), `:1185–1187` (Ei-Zweig gilt nur für äußere Zellen), `:988–992` (`bounded_response`), `src/brain_interface.hh:18–24, 51–53`, `ui/studio/model/organs.js:138–146`.
Nicht gelesen: ob und wie sich die Lage `b.angle` im Ei ändert; Unterhalt je Zelle; die Atelier-Ansicht `view/balance.js`.

## Was die Engine tut
- Haarzellen im Körperinneren (Kanal `Flow`, `inner`). Die Haarrichtung kommt aus `q1`: −1 zur Schnauze, 0 zur Flanke, +1 zum Schwanz; die andere Seite spiegelt.
- Reiz = wie weit das Haar nach unten zeigt (`max(0, dy)` der Richtung Körperlage + Haarrichtung). Die Feldbreite geht nicht ein.
- Antwort begrenzt (`intensity()` schließt innere Strömungszellen aus), keine Gewöhnung („Gravity does not fade“). Atelier-Vorgabe: kleinste Schwelle.
- Im Ei kein eigener Reiz: der Ei-Zweig (`:1186`) gilt nur für äußere Zellen, innen wirkt derselbe Reiz wie draußen.

## Lebenszyklus, drei Fragen
- **Automatisch:** nichts; der Reiz ist die Lage selbst, im Ei wie draußen.
- **Das Organ entscheidet:** nichts.
- **Der Designer setzt:** wohin das Haar zeigt, die Schwelle (ab welcher Neigung die Zellen melden), von wann bis wann sie arbeiten. Streuung und Zellzahl: im Entwurf nicht gezeigt.

## Entwurf (Panel Gleichgewicht)
1. **Der gedrehte Fisch mit der Rose der Lagen** (gibt es nur hier): Der runde Knopf dreht den Fisch. Um ihn steht für jede Richtung, in die die Schnauze zeigen kann, ein Blatt, so lang wie die Meldung dort. Griff an der Haarspitze: Haarrichtung. Griff am Ende der Rose: Schwelle. Blitz an der Zelle: Meldung in der gezeigten Lage. Kein Zeitverlauf, weil die Meldung hält, solange die Lage hält.
2. Leben: Ei und Fisch mit demselben Pfeil nach unten; darunter das Band.

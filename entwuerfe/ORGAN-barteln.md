# Organ Barteln

Am Produktstand `c468a830` gelesen (Fable, 14.11. 13:35). Selbst gelesen: `body_plan.cc:1003–1010`, `cppn_brain.cc:370–382`, `small_animals.cc:73–101`, `physiology.hh:437–441`, `protocol_schema.hh:2007–2013`, `organs.js:115–123`. Übernommen von Astra 12:26: Stein löst `felt` aus und schmeckt nach nichts; Plankton zählt über die Dichte am Ort (`small_animals.cc:101–111`, nicht selbst gelesen).

## Was das Organ tut

- **Eine Bartel je Seite** am Maul, schräg nach außen (0,45 rad). Ihre Länge wächst mit den Zellen: `Radius × (0,22 + 0,35 × n/(n + 3))` (`body_plan.cc:1003–1010`, `protocol_schema.hh:2007–2013`; ob `n` die Wurzel der Zellen ist, wie der Kommentar in `scents.js:118–119` sagt, habe ich nicht nachgelesen).
- **Sie schmeckt nur, was ihre Spitze berührt** (Reichweite 2): Futterstücke, Körper, Eier, Aas, Pflanzen. Jeder berührte Duft zählt voll (1), nicht nach Menge (`small_animals.cc:73–101`).
- **Schmecken oder Tasten:** Der Reiz einer Zelle ist `(1 − Breite) × min(1, Geschmack) + Breite × berührt` (`cppn_brain.cc:377–382`). Geschmack ist die Summe `berührter Duft × Gewicht` aus der Geschmackskarte, dieselbe Karte wie bei der Nase. Die Breite (`spatial_width`), die eine Geschmackszelle sonst nicht braucht, mischt das Tasten bei.
- **Stein:** wird ertastet, schmeckt nach nichts.

## Lebenszyklus, die drei Fragen

1. **Was geschieht von selbst?** Im Ei meldet die Bartel nichts (Belichtung 0); nach dem Schlupf wächst ihr Reiz über die Zeitkonstante der Zelle auf voll (`physiology.hh:437–441`, `cppn_brain.cc:381`). Die Bartel wird mit dem Körper länger.
2. **Was entscheidet das Organ?** Nichts über die Zeit.
3. **Was setzt der Gestalter?** Zellzahl (Länge), je Typ: Ort auf der Geschmackskarte, wie viel Tasten beigemischt ist, Schwelle; ab/bis.

## Davids Rückmeldung (sinngemäß, `FEEDBACK-1311.md:61–63`)

- Das Bild war hässlich, ohne (+)/(−)/(×).
- Geschmackskarte wie bei der Nase.
- „Spitzenzellen“ und ihre Knöpfe waren unverständlich: Wird das nicht durch die Geschmackskarte bestimmt, und reagiert die Bartel auf Stein nicht immer?
- Die Achse hieß „Schritte“, obwohl sie keine Zeitachse war.

## Antwort auf Davids Frage aus dem Code

Die Karte legt fest, **welcher** Geschmack zählt. Ob die Zelle daneben auch bloße Berührung meldet, ist eine zweite, eigene Einstellung (die Breite). Auf Stein reagiert die Bartel nur so weit, wie Tasten beigemischt ist; eine reine Geschmackszelle bleibt am Stein stumm.

## Für den Entwurf

- **Kopf von oben mit zwei Barteln**, so lang wie ihre Zellen; Griff an der Spitze für die Länge.
- **Was die Spitze berührt, als Eingabe:** ein Gegenstand (Futter, Pflanze, Stein …), den man an die Spitze schiebt. Meldung daneben.
- **Geschmackskarte** wie bei der Nase, mit den Zelltypen, (+)/(×).
- **Schmecken ↔ Tasten** je Typ als ein Griff; am Stein sieht man den Unterschied.
- Keine Zeitachse.

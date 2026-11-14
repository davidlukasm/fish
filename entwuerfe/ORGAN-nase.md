# Organ Nase

Am Produktstand `c468a830` gelesen (Fable, 14.11. 13:35). Grundlage ist Astras Vorarbeit von 12:26. Selbst gelesen: `body_plan.cc:1011–1033`, `cppn_brain.cc:300–368`, `physiology.hh:437–441`, `protocol_schema.hh:1469–1479`, `organs.js:108–114`, `scents.js:22–60`. Nicht selbst gelesen: wie aus `q1`/`q2` einer Zelle ihre acht Gewichte `scents[k]` werden (Compiler), `adapted_response` (Schwelle, Gewöhnung), `odor_field` (wie sich Duft im Wasser verteilt).

## Was das Organ tut

- **Ein Ort, zwei Nasenlöcher.** Der Fisch riecht an einem Punkt 0,8 Körperradien vor der Mitte (`body_plan.cc:16,1011–1014`). Die beiden Nasenlöcher unterscheiden sich nur durch das Wasser, das sie erreicht.
- **Das Wasser an der Nase** ist die Strömung dort minus die eigene Bewegung, samt dem Schwenk beim Drehen (`nose_flow`, `:1017–1020`).
- **Woher jedes Nasenloch riecht** (`nostril_source`, `:1025–1033`): Das angeströmte Nasenloch holt sein Wasser von stromaufwärts, bis zu 8 Schritte Strömungsweg; das im Windschatten riecht am Nasenpunkt selbst; Wasser genau von vorn erreicht beide gleich. In stehendem Wasser riechen beide dasselbe.
- **Acht Düfte:** Futter, Algen, Pflanzen, Würmer/Krabben (benthos), Plankton, Aas, Laich, Muscheln (`protocol_schema.hh:1469–1479`).
- **Eine Duftzelle** riecht durch das Nasenloch ihrer Seite, wo immer sie auf der Haut sitzt. Ihr Reiz ist die Summe `Duft × Gewicht` über die acht Düfte (`cppn_brain.cc:359–368`). Die Gewichte folgen aus ihrem Ort auf der Geruchskarte (`q1`, `q2`).
- **Im Sand** riecht ein eingegrabenes Nasenloch nichts: Reiz × (1 − Eintauchen) (`:313,367`).

## Lebenszyklus, die drei Fragen

1. **Was geschieht von selbst?** Im Ei ist die „Geburtsbelichtung“ 0: Die Zelle bekommt den Mittelwert beider Nasenlöcher, also Duft ohne Seitenunterschied. Nach dem Schlupf wächst der Seitenunterschied über die Zeitkonstante der Zelle von 0 auf voll (`physiology.hh:437–441`, `cppn_brain.cc:356,367`).
2. **Was entscheidet das Organ?** Nichts über die Zeit. Seine Zellen gewöhnen sich an anhaltenden Duft (Astra/Altbild; `adapted_response` nicht gelesen).
3. **Was setzt der Gestalter?** Je Zelltyp: Ort auf der Geruchskarte und Breite, Schwelle, Streuung, Gewöhnung, Zellzahl, dazu „arbeitet ab“ und „stirbt bei“ wie bei jedem Organ.

## Atelier

- `organs.js:108–114`: je Seite ein Organ, bis zu 4 Typen, eine Duftzelle mit 4 Kopien zu Beginn.
- Geruchskarte in `scents.js`: Kugel der Düfte als Scheibe, `scentMapPoint(q1, q2)`; heutiges Bild `scentMap` mit Kennlinie darunter.
- Die Geruchsprobe und die Wasserbahnen gehören ins Fischpanel (`probes.js`), nicht in den Inspektor (David 13.11.).

## Davids Rückmeldung (sinngemäß, `FEEDBACK-1311.md:58–59`, `FEEDBACK-2115-ERKLAERT.md:74–79`)

- Die Geruchskarte ist gut und soll größer sein. Die Düfte als größere Kugeln.
- Statt anklickbarer Punkte mit großem Kreis eine verschiebbare Probe (rotes X). Liegt sie auf einem Duft, ist sie zu 100 % dieser Duft.
- Der Rand „alle Düfte“ kam viel zu schnell.
- Die Duftzellen sollen auf der Karte wählbar sein, dort mit (+) und (×).
- Es fehlt die Übersicht, worauf die Nase reagiert.
- Kein Fischkörper wie ein Stein; keine Fahne „Geruchsbereich“; nie drei Düfte übereinander.
- Die Strömung zeigt das Fischpanel mit seinen Wasserbahnen.

## Für den Entwurf

- **Geruchskarte groß:** die acht Düfte als Kugeln, die Zelltypen als Flecken in ihrer Breite, wählbar, (+)/(×) auf der Karte, die Probe als X.
- **Worauf die Nase reagiert:** acht Balken oder Kugeln, so stark wie die Zellen den Duft melden.
- **Zwei Nasenlöcher:** ein kleines Bild von oben, Strömung als Eingabe (Richtung, Stärke), eine Duftquelle; die Meldung links und rechts nebeneinander. In stehendem Wasser gleich.
- **Lebenszyklus:** im Ei kein Seitenunterschied, nach dem Schlupf wächst er über die Zellzeit; ab/bis-Griffe.

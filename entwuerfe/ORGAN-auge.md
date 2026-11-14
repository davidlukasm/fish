# Organ: Auge (Schritt 12) – Fable

## Weg im Code (selbst gelesen)
- `src/retina.cc:10–33`: Umfeld reicht 3 Feldbreiten nach jeder Seite (`SURROUND_FIELDS`); Kontrastskala; Schwelle = Kontrast für halbe Meldung (`half_contrast`).
- `src/retina.cc:166–180`: `spectral_balance`: Licht zählt in den Farben der Zelle; Gegenfarbe zieht ab (`opponent × opponency`).
- `src/retina.cc:239–247`: Dunkelanteil mischt „heller als Umfeld“ und „dunkler als Umfeld“.
- `src/cppn_brain.cc:404–418`: im Ei kein Kontrast; nach dem Schlupf blendet das Gesehene über die Zellzeit ein (`birth_exposure`, `physiology.hh:437–441`).
- `src/body_plan.cc:318–327`: Gegenfarbe aus Qualität 2, Dunkelanteil aus `identity4`.

## Nicht gelesen
- Netzhautwellen im Ei (nur Astras Angabe 16:26: `retinal_tissue` nimmt Zellen mit Lichtanteil).
- Die Antwortfunktion im Wortlaut (im Entwurf Kontrast / (Kontrast + Schwelle), nach dem Kommentar `retina.cc:20–23`; ein Kommentar ist kein Beleg).
- Wie Strahlen, Verdeckung und Sichtweite das Licht am Auge bilden (`retina.cc:380–700`).

## Drei Fragen
1. Nutzen: meldet, um wie viel das Feld heller (oder dunkler) ist als das Umfeld, in der Farbe der Zelle.
2. Kosten: Zellen und Nerven; sehr empfindlich meldet schon kleine Unterschiede.
3. Leben: im Ei Wellen über die Netzhaut, nach dem Schlupf Einblenden über die Zellzeit, dann Sehen.

## Entwurf
Sehstreifen mit Feld (Rahmen) und Umfeld (gestrichelt); darunter, was die Zelle aus dem Licht macht, mit den zwei Höhen für Feld und Umfeld; der Balken rechts ist ihr Abstand (hell: heller, blau: dunkler), der Blitz die Meldung. Runde Knöpfe: das Objekt (Lage, Helligkeit), seine Farbe, das Licht ringsum; sie stehen für die Sehprobe des Fischpanels. Griffe: halbe Meldung (am Abstand), Dunkelanteil (links), Farbton, Farbbreite, Gegenfarbe, Zellzeit (am Keil im Lebensbild).
Angenommen: Farbgewichte als Glocke um den Farbton; Objekt 4/5 der Feldbreite.

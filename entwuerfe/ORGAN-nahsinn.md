# Organ: Nahsinn (Schritt 12) – Fable

## Weg im Code (selbst gelesen)
- `src/retina.cc:28–33`: Reichweite = 8 × 16^Einstellung (8 bis 128 Einheiten).
- `src/retina.cc:728–735`: Signal = 2^(−Tiefe / Reichweite) × Helligkeit (bis 1).
- `src/cppn_brain.cc:404–418`: begrenzte Antwort; kein Einblenden über die Zellzeit, nur das Tor „geschlüpft“.
- `src/body_plan.cc:318`: Reichweite aus Qualität 2.

## Nicht gelesen
- Der eigene Rhythmus im Ei (Astra 16:26). `bounded_response` im Wortlaut (im Entwurf die begrenzte Antwort der anderen Sinne).

## Drei Fragen
1. Nutzen: meldet, wie nah etwas vor der Zelle ist; je Reichweite halbiert sich das Signal.
2. Kosten: Zellen und Nerven; kurze Reichweite sieht Fernes nicht, lange trennt Nahes schlechter.
3. Leben: im Ei eigener Rhythmus, ab dem Schlupf sofort die Nähe.

## Entwurf
Fisch von oben, Blick nach links; davor Halbierungsringe (je eine Reichweite weiter, halb so hell). Runder Knopf: das Objekt auf seiner Entfernung. Griffe: Reichweite am ersten Ring, Schwelle am gestrichelten Ring der halben Meldung. Darunter die Meldung über die Entfernung.
Angenommen: helles Objekt; 1,25 Pixel je Einheit.

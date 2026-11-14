# Organ Tastsinn (Schritt 8) – Fable, 14.11.

Selbst gelesen: `src/body_plan.cc:315–360`, `:988–1000` (`bounded_response`, `record_touch`), `:1086–1142` (Reiz), `:1185–1205` (Ei), `src/physiology_parameters.hh:9–13, 39`, `src/embryo.cc:1–25`, `src/brain_interface.hh:18–24`.
Nicht gelesen: `prepare_contacts`, woher `sediment_contact` kommt, `movement.cc` (Stoßstärke), `ui/studio/model/organs.js` für Tasten (nur Seitenlinie und Nahsinn gelesen).

## Was die Engine tut
- Dieselben 16 Sektoren und derselbe Keil wie bei der Seitenlinie (Breite 22,5°–180°, Gewichte auf Summe 1).
- Eine Berührung setzt ihren Sektor (`record_touch`) mit der Stoßstärke. Druck = 0,1 + 0,9 × Stoß / (Stoß + 0,05): schon bloßes Anliegen gibt 0,1, der härteste Stoß 1.
- Reiz = Summe aus Gewicht × Berührung × Druck; liegt der Fisch im Sediment, zählt der größere von beiden Werten.
- Antwort begrenzt (`bounded_response`), keine Gewöhnung (`adapting_sense` nennt Tasten nicht).
- Im Ei: Schalendruck (wenn der Embryo die Schale füllt: 0,55 × Körperradius / Schalenradius − 0,65) plus 0,1 × eigenes Zucken; nach dem Schlupf Übergang nach außen über die Zellzeit.

## Lebenszyklus, drei Fragen
- **Automatisch:** im Ei das Spüren der Schale; der Übergang nach dem Schlupf.
- **Das Organ entscheidet:** nichts.
- **Der Designer setzt:** Stelle auf der Haut (am Fisch), Feldbreite, Schwelle und Streuung, Lebensspanne.

## Entwurf (Panel Tastsinn)
1. Fisch von oben mit Feld und Breitengriff wie bei der Seitenlinie; runder Knopf: ein Ding, das am Rand anliegt oder weggezogen nichts berührt.
2. Signalverlauf, begrenzte Skala, ohne Gewöhnung; die Höhe des Reizes ist der Druck. Die Zellen bekommen davon das Gewicht des berührten Sektors: ein breites Feld spürt mehr Rand, aber jede Stelle schwächer.
3. Lebensband: „spürt die Eischale“, dann „spürt Berührung“.

Nicht im Bild: Sediment; mehrere Berührungen zugleich.

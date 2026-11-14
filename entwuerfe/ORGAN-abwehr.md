# Organ Abwehr (Schritt 10) – Leseseite von Claude, 14.11. 16:07

Stand: Produktzweig `bb46eeb8`. Fable prüft gegen den Code und zeichnet daraus; Astra prüft die Seite.

## Codepfad
- **Zellen:** äußere `Defense`-Zellen, nur an der Oberfläche (`colony-core/field/development_sites.hh:77`). Atelier: Organ `defense`, Zellgruppe `armor`, bis 8 Gruppen, 3 Kopien (`ui/studio/model/organs.js:229–235`).
- **Richtung und Breite:** Jede Zelle zielt von der Körpermitte zu ihrer Stelle (`spine_aim`, `src/body_plan.cc:854–857`). Ihre Kraft verteilt sich mit dem Keil der Feldbreite auf die 16 Sektoren (`spread_spines`, `:858–870`; `spine_density`, `:871–877`, gebaut in `:971`).
- **Ruhestacheln:** Höhe = 0,3 × Kapazität ÷ (Kapazität + 5), immer aufgestellt (`resting_spine_height`, `src/material.hh:171–173`; gesetzt `src/physiology.cc:444–447`; Werte `src/physiology_parameters.hh:38`).
- **Aufstellen:** Die Zellen zucken wie Muskeln (`body_plan.cc:27–29`). Je Schritt: Stachel = alter Stachel × Halten + 0,02 × Zuckungskraft, höchstens 0,85 (`body_plan.cc:1640–1642`; `spine_rate`, `spine_max` = `MAX_SPINE_EXTENT`, `physiology_parameters.hh:42`, `simulation_types.hh:41`). Wirksam ist das Höhere von Ruhe und Aufgestellt (`body.hh:113`).
- **Schutz am Ort:** Stachel an einer Stelle = Höhe × 16 × Dichte dort ÷ Gesamtdichte, höchstens 1 (`local_defense`, `body_plan.cc:838–853`; `Body::local_defense`, `:886–890`). Wo keine Stacheln stehen, schützt nichts.
- **Wirkung 1, Biss:** Ein Biss aus Richtung r wird zum Anteil „Schutz bei r“ abgewehrt, wenn der Fisch dafür zahlen kann: Kosten 0,5 × Referenzgewebe × abgewehrter Schaden aus der Reserve (`src/feeding.cc:28–32`, `spine_block_cost` `physiology_parameters.hh:34`). Hungrig wehrt er weniger ab.
- **Wirkung 2, Zusammenstoß:** genauso bei Stößen (`injure`, `src/physiology.cc:359–375`, Aufrufer `collisions.cc:128–131`, `movement.cc:161`).
- **Wirkung 3, nicht zu verschlucken:** Wer einen Fisch ganz schlucken will, rechnet mit Radius × (1 + Stachel) (`feeding.cc:360–364, 388`). Aufgestellte Stacheln machen einen kleinen Fisch zu groß fürs Maul. Ebenso der Abstand, aus dem gebissen wird (`feeding.cc:226`).
- **Kosten:**
  - Unterhalt wie Muskel, nach Fasertyp (`effector_upkeep`, `body_plan.cc:46–56`; Halten aus der Zuckungsdauer `:183`).
  - Aufgestellt bremsen sie im Wasser: Querwiderstand × (1 + 2 × Aufgestellt) (`movement.cc:76, 100, 119`, `SPINE_DRAG`). Nur die aufgestellten, nicht die Ruhestacheln.
  - Im Sand: Widerstand steigt mit Stachel (`environment.hh:36–45`), und jede Bewegung im Sand schadet dem eigenen Körper (0,003 × Stachel × Eingrabtiefe × Weg², ohne Ort, `movement.cc:180–183`).
  - **Im Ei:** Aufstellen gegen die enge Schale schadet dem Fisch selbst (0,002 × Schalendruck × Stachel, ohne Ort, `embryo.cc:33–37`).
- **Aquarium:** Stacheln am Umriss, Zahl und Länge aus der Kapazität, Farbe kräftig ab Aufstellen 0,08 (`ui/fish_organs.js:972–1000`, `ui/fish_painter.js:795–803`).
- **Atelier-Bericht:** `spineAims`, `spinesRest`, `spinesRaised` je Richtung (`werkzeug/atelier.cc:480–512`). **Achtung:** `spinesRaised` nimmt immer die Obergrenze 0,85 (`raised = max(rest, spine_max)`), egal wie stark der Muskel ist. Ob ein schwacher Muskel die 0,85 je erreicht, hängt an Zuckungskraft und Halten: Gleichgewicht ≈ 0,02 × Kraft ÷ (1 − Halten). Bitte am Code prüfen; sonst zeigt der Inspektor Ungültiges.
- **Bestehender Inspektor:** `spineField` (Ring um den Fisch, Ruhe durchgezogen, aufgestellt gestrichelt, Breitengriff) und `defenseGraphic` (Hautschnitt mit Stacheln) samt `musclePicture` (`ui/studio/view/effectors.js:300–400`, `panels.js:115`).

## Was das Organ ist und tut (Wirkung statt Anzahl)
- Schützt die Seite, auf die es zeigt, gegen Bisse und Stöße. Der Schutz kostet bei jedem abgewehrten Biss Reserve.
- Aufgestellt macht es den Fisch zu groß zum Verschlucken.
- Es bremst beim Schwimmen (aufgestellt) und im Sand (immer), und im Sand reibt es den Fisch wund.

## Lebenszyklus, drei Fragen
- **Automatisch:** Ruhestacheln aus der Kapazität (ab Bildung der Zellen). Abwehr kostet nur, wenn Reserve da ist.
- **Das Organ entscheidet:** wann es aufstellt (Befehl des Gehirns → Zuckung), und wie lange sie stehen (Halten aus dem Fasertyp).
- **Der Designer setzt:** Stelle (Richtung), Feldbreite, Kopien (Kapazität → Ruhehöhe), Fasertyp, Schwelle, Lebensspanne.
- **Eigen für dieses Organ:** Im Ei schadet Aufstellen; ein Ei-Programm, das die Abwehr erst nach dem Schlupf zulässt, ist hier echter Inhalt (Zellen erst spät bilden oder Befehl im Ei aus).

## Was David schon gesagt hat
- „Schmerz: Siehe Stacheln, Tastsinn, Seitenlinie“ (FEEDBACK, Musterverbot): Stacheln, Schmerz, Tasten und Seitenlinie teilen den Keil. Abwehr braucht also ein eigenes Bild, nicht wieder Rose oder Ring mit Punkten.
- Vorschlag fürs eigene Bild: ein Räuber (Maul als Knopf, Eingabe) beißt aus einer Richtung; man sieht, wie viel vom Biss die Stacheln dort abhalten und was es an Reserve kostet. Zweiter Zustand: kleiner Fisch vor großem Maul, aufgestellt passt er nicht mehr hinein.

# Organ Muskel (Schritt 10) – Leseseite von Claude, 14.11. 16:13

Stand: Produktzweig `e205068d`. Fable prüft gegen den Code und zeichnet daraus; Astra prüft die Seite.

## Was „Muskel“ im Atelier ist
- Ein Organ `muscle` mit Funktion `'site'`: Was der Muskel tut, entscheidet die Stelle (`ui/studio/model/organs.js:208–216, 385–389`).
- Die Engine vergibt je Zone (`colony-core/field/development_sites.hh:76–78`):
  - Zone 0 (Schnauze): **Kiefer** (`Aggression`, Beißen)
  - Zone 1 (Kopf): **Maulöffner** (`Suction`; auf der Kopfflanke außen sind es Kiemen, die haben ihren Inspektor)
  - Zone 2 (Rumpf): **Seitenflosse** (`Turn`; innen auf der Mittellinie ist es der Darmmuskel, der hat seinen Inspektor)
  - Zone 3 (Schwanz): Schwanz (`Forward`, hat seinen Inspektor); vorn im Schwanzbereich als zweite Spielart die **Bauchflosse** (`Turn`, `PELVIC_REACH` 0,3)
- **Übrig für Schritt 10 sind also drei Bilder: Kiefer, Maulöffner, Seiten-/Bauchflosse.** Jedes braucht sein eigenes Bild (Musterverbot), keine gemeinsame Muskelvorlage.
- Gemeinsam (nicht neu zeichnen, nur übernehmen): Zuckung ab Schwelle 0,2, Fasertyp schnell/langsam, Kopien = Kraft und Unterhalt (`ORGANOPTIONEN.md` Zeile 41–45, 60; `src/muscle_fibre.hh`). Das zeigt heute `musclePicture` (`ui/studio/view/muscle_effect.js:73–150`).
- Heutiger Inspektor: `effectorGraphic` wählt `sideGraphic`, `suctionGraphic`, `jawGraphic` (`ui/studio/view/effectors.js:143–300, 537–560`), Muskelwahl-Chips `panels.js:73–98`.

## 1. Seitenflosse und Bauchflosse
- **Mechanik** (`fin_mechanics`, `src/body_plan.cc:89–128`): Jede Zelle schlägt im Winkel `q1` × 90° (0 = gerade nach hinten, +1 = nach außen, −1 = nach innen; `side_fin::angle`, `src/protocol_schema.hh:2073–2076`). Längs schiebt sie und dreht mit ihrem Hebel wie ein Ruder, quer schiebt sie den Fisch von der Flosse weg und dreht mit ihrem Arm vor oder hinter der Körpermitte. `protraction` teilt die Kraft auf Rück- und Vorschlag.
- **Wirkung im Wasser und am Grund** (`src/movement.cc:78–97`): Flossenschub greift im freien Wasser schlechter als der Schwanz, **am Grund aber voll** (`ground_grip`); Querschub nur durch schräge Flossen.
- **Seite:** Eine Zelle mit Hebel 0 (Mittellinie) wird in der Engine der rechten Seite zugeschlagen (`side = e.lever < 0 ? 0 : 1`, `body_plan.cc:104`). Das erklärt den bekannten Fehler „mittiger Muskel → Lenken“ (`effectors.js:161`): Das Atelier sollte einen mittigen Flossenmuskel gar nicht anbieten, oder es muss sagen, dass er rechts schlägt. @Astra: Ist die Rechts-Zuordnung gewollt?
- **Eigenes Bild (Vorschlag):** Der Fisch von oben, die Flosse mit ihrem Schlagwinkel als Griff; Pfeile für Schub längs, quer und die Drehung, die daraus entsteht. Zweiter Zustand: am Grund (die Flosse „läuft“).
- **Lebenszyklus:** Im Ei zucken Flossen wie alle Muskeln (Schlupfimpuls zählt Flossen mit, `embryo.cc:38–41`). Eigenes: die Flosse ist am Grund stark, im freien Wasser schwach. Für Jungfische, die am Boden bleiben, kann das zählen.

## 2. Kiefer (Beißen)
- **Kraft:** Biss = Kieferkapazität × Befehl × Körpergröße × Hebel × Zahngriff (`bite_force`, `src/physiology.hh:291–296`).
- **Kieferlänge `q2`:** öffnet weiter (Maulanteil = kurz + Spanne × Länge, `:272–274`) und verkürzt den Hebel (`jaw_lever`, `:275–280`). Kleinste und größte Beute hängen daran (`maximum_mouth_aperture`, `:303–305`).
- **Zahnform `q1`:** stumpf mahlt Pflanzen und knackt Schalen, spitz schneidet Fleisch; lose Stücke gehen mit beidem; gemischte Zähne können beides schlecht (Potenz 2, `tooth_grip`, `:282–290`).
- **Werte kommen aus der Summe der Kieferzellen** (`body_plan.cc:551–567`).
- **Bestehend:** `jawGraphic` und `dietCurves('jaw'|'teeth')` (`effectors.js:233–300, 440–530`). Die Futterkurven sind schon Wirkung; zu prüfen ist, ob das Bild davon eigen genug ist.
- **Lebenszyklus:** Kieferlänge und Zähne sind fest; die Beute wächst mit dem Körper (`body_scale`). Ein Jungfisch hat dasselbe Maul im Verhältnis, aber kleiner: andere Beute als der erwachsene.

## 3. Maulöffner (Saugen)
- **Kraft:** Saugkapazität × Körpergröße (`mouth_force`, `physiology.hh:269–271`), Anteil eingesaugt `suction_share` (`:300–302`), Reichweite `suction_range` 2 (`src/physiology_parameters.cc:6`).
- **Schaben:** Algen schaben = Saugkraft × Öffnung × Hebel² (`scrape_force`, `:287–290`). Kurzer Kiefer schabt also besser.
- **Bestehend:** `suctionGraphic` (`effectors.js:193–232`).
- **Eigenes Bild (Vorschlag):** Maul von vorn oder seitlich, Wasser und Futterstücke, die je nach Kraft hineingezogen werden; Reichweite als Bogen vor dem Maul.

## Offene Fragen für Fable
- Gehören Kiefer und Maulöffner in **ein** Bild „Maul“ (zusammen öffnen und schließen, `mouth.opening`, `bite_pose`)? Dafür: Sie arbeiten als Paar. Dagegen: Es sind zwei Organe im Atelier.
- Reihenfolge, wenn die Zeit knapp wird: Seitenflosse zuerst (offener Fehler), dann Maul.

## Entwurf Seitenflosse (Fable, Panel Seitenflosse in `entwuerfe/inspektoren.html`), nach Claudes Prüfung 16:26
Selbst gelesen: `body_plan.cc:86–128`, `protocol_schema.hh:2073–2076`, `movement.cc:9–19, 76–97`. Nicht gelesen: `protraction`, Bauchflosse, `stroke_grip`-Werte (nur die Formel; 0,5 aus Claudes Prüfung).
1. **Die Flosse als Ruder** (gibt es nur hier): der Fisch von der Seite wie im Aquarium, die Flosse als Blatt an ihrem Ansatz, sie zeigt dorthin, wohin sie schlägt; Griff an der Blattspitze: Schlagwinkel. Drei Pfeile: Schub nach vorn, Schub quer von der Flosse weg (nach oben), Drehung vor der Schnauze. Die Uhr lässt die Flosse schlagen; die Pfeile leuchten beim Schlag.
2. Eingaben (rund): das Tempo des Fischs (Wasserstreifen, je länger, desto schneller): Im Stand greift die Flosse voll, schnell nur halb. Die Eingrabtiefe (der kleine Fisch wird in den Sand gezogen): halb eingegraben greift sie voll, aufliegend und ganz eingegraben gibt der Grund nichts dazu.
3. Leben: im Ei zuckt die Flosse, draußen rudert sie; darunter das Band.

Angenommen fürs Bild: Hebel und Arm der Flossenstelle (wird am Fisch gesetzt). Nicht im Bild: der Querwiderstand des Grunds, Vorschlag (`protraction`), Fasertyp, Schwelle, Zellzahl; Bauchflosse.

## Entwurf Maul (Fable, Panel Maul in `entwuerfe/inspektoren.html`): Kiefer und Maulöffner als ein Bild
Selbst gelesen: `physiology.hh:266–305`, `ui/schema.js` (`mouth_share_short` 0,28, `mouth_share_span` 0,44), `ui/studio/view/effectors.js:233–300, 425–532` (heutiges Kieferbild und Futterkurven). Nicht gelesen: `bite_pose`, `mouth.opening`, `maximum_mouth_aperture`, `suction_range`, `body_plan.cc:551–567`.
1. **Der Kopf von der Seite mit Kiefern, Zähnen und zwei Muskeln** (gibt es nur hier): Griff an der Kieferspitze: Länge (länger = weiter auf, kürzerer Hebel); Griff an einem Zahn: Zahnform (spitz bis stumpf); Griffe an den beiden Muskeln: Zellen des Kieferschließers und des Maulöffners. Die Uhr öffnet das Maul, saugt (Wasserfäden, je stärker der Öffner, desto länger) und beißt zu.
2. **Darunter die vier Futterarten**, jede mit dem Biss, den sie bekommt, so tief wie die Kraft darauf: Fleisch (schneiden, (1 − stumpf)²), Pflanze und Schale (mahlen, stumpf²), Brocken (beides), Algen schaben (Saugkraft × Öffnung × Hebel²).
3. Leben: dasselbe Maul im kleinen Körper nimmt kleines Futter, im großen großes; darunter das Band.

Angenommen fürs Bild: der Maßstab der Bisse (Kraft geteilt durch das, was die meisten Zellen einem mittleren Kiefer mit einer reinen Zahnform geben). Beim Einbau kommen die Kurven aus `capabilities.diet` (wie heute `dietCurves`), nicht aus dieser Rechnung. Nicht im Bild: Reichweite des Saugens, größte und kleinste Beute, Fasertyp, Schwelle.

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

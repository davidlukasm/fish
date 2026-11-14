# Organ: Schwanzflosse und Schwanzmuskel (Fable, 14.11. 07:43)

Produktzweig `3a55d01`. **Gelesen** heißt: die genannten Zeilen selbst gelesen. **Nicht gelesen** steht ausdrücklich dabei. Kein Lauf.

## Codepfad

| Station | Stelle | Stand |
|---|---|---|
| Engine, Zuckung | `src/body_plan.cc:1256-1270` (`stroke_step`): ausgeruhter Muskel zuckt, wenn der Antrieb die Schwelle erreicht; Impuls = Antrieb × Dauer. `:1271-1278` (`stroke_shape`): Verlauf einer Zuckung, im Mittel 1 | gelesen |
| Engine, Antrieb je Muskel | `src/body_plan.cc:1425-1445`: jede Muskelzelle zieht mit ihrem Antrieb × verfügbarer Faserkraft (`muscle_demand`), der Muskel zuckt als Ganzes; Schwanz links/rechts `:1449-1453` | gelesen |
| Engine, Fasern | `src/muscle_fibre.hh:20-45`: Kraft, Arbeitspreis, Unterhalt je Faseranteil geometrisch zwischen langsam und schnell; verfügbar = 1 − schnell + schnell × Reserve; Abbau 0,06 × schnell² × Arbeit; Auffüllen in 2…400 Schritten. Werte `src/protocol_schema.hh:2015-2023` (Kraft 0,4/2,5, Preis 0,2/5, Unterhalt 1,2/0,3) | gelesen |
| Engine, Lenken | `FAKTEN-FABLE-1311.md` Abschnitt 1 (`body_plan.cc:1554-1583`, `movement.cc:84-88`): Wechselschlag schiebt nur, einseitiger Schlag dreht | gestern gelesen, heute nicht erneut |
| Engine, Schlängeln | `src/body_plan.cc:562-563`: `undulation` ist ein **Körpermerkmal** (traits[3]), kein Muskelwert. `src/movement.cc:80, 93`: senkt den Widerstand im Sand, kostet im freien Wasser Schub (`undulation_loss`) | Zeilen 80–93 gelesen, `sediment_resistance` selbst nicht |
| Schnittstelle | `StrokeTailLeft/Right` (`motor_state.hh:33`) | gestern gelesen |
| Kosten | Unterhalt je Zelle und Arbeit je Kraft: nur aus dem Kommentar des alten Entwurfs (`inspektoren_alt.html:1163-1175`) | **nicht am Code gelesen** |
| Aquarium-Anzeige | `ui/animals.js:663-668`: Schlängeln und Schlagtakt der Zeichnung; `ui/organ_readout.js:194-204`: Zuckung, Schwelle, Takt im Organfenster | nur diese Zeilen gelesen |
| Atelier-Modell | `ui/studio/model/organs.js:349-352`: Ein Muskel am Schwanzansatz ist Schwanzmuskel (`MOTOR_KIND.forward`). Fasern, Reservegruppen: `document.js` `muscleFibre`, `sprintNodes` | Zeilen 349–352 gelesen, `document.js` **nicht** |
| Bestehender Inspektor | `ui/studio/view/effectors.js:787-810` (`effectorGraphic` → `tailGraphic` + `musclePicture`), `ui/studio/view/muscle_effect.js:1-11`: Kraft je Knoten als Balken, Befehl mit Schwelle, Ausdauer über Schritte, Kosten | Kopf und Verteiler gelesen, `tailGraphic`/`pullPicture` **nicht** |
| Fischpanel | `bilder/atelier_fischpanel_ganz.png`: Fisch von oben, Schwanzmuskeln als rote Spindeln links und rechts am Schwanzstiel. Zeichnung: `ui/studio/view/muscles.js` (`spindle`, `muscleShape`) | Bild angesehen, Code **nicht** |

`bilder/2026-11-14_atelier/Schwanzmuskel_ganz.png` zeigt kein gewähltes Organ (rechts steht „Wähle ein Organ“). **@Claude: bitte neu aufnehmen, mit gewähltem Schwanzmuskel.**

## Was das Organ ist und tut

Der Schwanzmuskel schiebt den Fisch. Er besteht aus Bündeln; jedes hat seine Fasern (ausdauernd bis kräftig), seine Stärke und seine Schwelle: Ein schwacher Befehl bewegt nur die Bündel mit niedriger Schwelle. Kräftige Fasern geben viel Schub und sind nach wenigen Schlägen leer, ausdauernde wenig und für immer. Schlängeln hilft im Sand und kostet im Wasser.

## Lebenszyklus, die drei Fragen

- **Automatisch:** **nicht gelesen.** Vermutung, unbelegt: Muskelzellen entstehen mit dem Bauplan und kosten ab dann Unterhalt.
- **Bestimmt das Organ:** **nicht gelesen** (ob Kraft mit der Körpergröße wächst, ob die Zellreife die Ausgabe gewichtet wie bei Sinneszellen, `substrate.cc:742-744`).
- **Einstellbar im Inspektor:** heute nichts zum Leben.
- **@Astra, @Claude: Wer von euch hat den Pfad „Muskelzelle über das Leben“ schon gelesen? Bitte Stellen nennen.** Ohne das zeichne ich für den Schwanz keinen Lebenszyklus, sondern bringe nur die offenen Punkte unten zu Ende.

## Was David schon gesagt hat

- „Zwei sehr gut ausgearbeitete, verschiedene Konzepte“ (Darm und Schwanzflosse), `FEEDBACK-1311.md:109`. Das Panel bleibt, wie es ist.
- Skalierung beider Diagramme **immer während des Ziehens**, in beide Richtungen; der Fisch darf beim Neuberechnen nicht verschwinden (`FEEDBACK-1311.md:25`).
- Text überdeckt und alles gedrängt: Griff liegt auf „kräftig“, (×) und (+) eng (`feedback2/2_schwanz_griff_ueberdeckt.png`).
- Geschwindigkeit: Skala zittert. **Die Kurve im Wasser immer gleich hoch, nur ihre Form ändert sich; der Regler ändert dann nur die Geschwindigkeit im Sand** (`FEEDBACK-2115-ERKLAERT.md:55-57`, Bilder 3/4).
- Grundsatz 1: Eingabe und Einstellung trennen. „Beim Schwanz ist die Kraft ein Regler außen, ‚Befehl aus‘ ist fest.“ Der Befehl ist eine Eingabe: formbare Kurve mit runden Knöpfen wie in allen Panels.
- Allgemein: keine Schieberegler (07:23 zum Belohnungssignal).

## Was ich deshalb tue (Schritt 2)

Den alten Schwanz-Abschnitt (`inspektoren_alt.html:1163-1340`, Bild `bilder/2026-11-14_schwanz_vorher.png`) in die neue Seite übernehmen, auf deren eines Modell und eine Uhr, und **nur** das ändern:

1. Befehl: kein Schieber links. Der Befehl steht als Eingabe im Kraftdiagramm, mit rundem Knopf für Höhe und Ende; die Schwellen der Bündel bleiben als Griffe an der Befehlsskala.
2. Geschwindigkeit: Wasserkurve füllt immer die Höhe; Sand im Verhältnis dazu. Schlängeln ohne Schieber, als Griff am Fischbild (der Fisch schlängelt dort ohnehin).
3. Kraftskala folgt beim Ziehen sofort in beide Richtungen, ohne Nachgleiten.
4. Fasergriff verdeckt kein Wort; (×) und (+) mit Abstand.
5. Der Fisch bleibt beim Ziehen sichtbar (er wird nicht mehr neu gebaut).

# Lebensphasen-Werkzeug – Leseseite von Claude, 14.11. 17:20

Auftrag (David 07:37, `AUFTRAG-1411.md` Punkt 6): ein Lebensphasen-Werkzeug im Atelier, mit dessen Hilfe Lebenszyklus-Inspektoren für jedes Organ, je eigen. Stand: Produktzweig `b783c8b8`.

## Was die Engine kennt (zwei Uhren)
- **Körperreife** = größtes je erreichtes Gewebe ÷ Gewebekapazität, 0 bis 1 (`body_maturity`, `src/physiology.hh:102–106`; Kapazität `:95–97`). Im Ei steigt sie mit dem Bau, nach dem Schlupf nur mit Wachstum (Fressen). Sie liegt im Blut als dritter Körperwert (`colony-core/field/hormones.hh:20–28`).
- **Zellreife** = Alter der Zelle seit ihrer Bildung ÷ 4096 Schritte (`CELL_MATURITY`, `hormones.hh:25–28`; `substrate.hh:313`). Ein Rezeptor kann sie statt des Bluts lesen. Im Atelier: `young(cell, half)` (`ui/studio/model/organs.js:35`), heute nur für die drei Darmsinne (`GUT_YOUNG_HALF` 0,05 ≈ 200 Schritte).
- **Drei Lebensrezeptoren je Zelle** (`ui/studio/view/life_cycle.js:1–13`): Entstehen (Bildungsrezeptor), Aktivität (Ausgaberezeptor, Zelle arbeitet mit ½·(1 + Antwort)), Tod (Todesrezeptor, stirbt über ½). Nicht angekreuzt: da ab dem Ei, voll aktiv, stirbt mit dem Fisch.
- **Schlupf:** Die Reife beim Schlupf ist nicht fest. Schlupfgewebe = `hatch_tissue(Eienergie)`, mindestens 20 (`physiology.hh:433–436`, `physiology.cc:470–473`), also Reife beim Schlupf ≥ 20 ÷ Kapazität des Plans. Die Eienergie gibt die Mutter. Das Atelier hat keine Mutter (David 08:11): Ein Strich genügt, aber an der **richtigen** Stelle.

## Was das Atelier heute zeigt
- **Reife-Diagramm** „Lebenszyklus der Zelle“ (`life_cycle.js:262–380`, `lifeCycle` `:390–420`): Davids gutes Beispiel. Ei, Jungfisch, Erwachsener, Griffe für Entstehen/Tod und Aktivitätswende.
- **Lebensband** in jedem neuen Inspektor (`lifeBand`, `ui/studio/view/live/skin.js:26ff`): nur Beginn und Ende auf der Reife, schreibt Ausgabe- und Todesrezeptor (`setLifePhase`, `ui/studio/model/document.js:1597ff`).
- **Vorschau-Bedingungen** (`previewControls`, `ui/studio/view/development.js:92–133`): Reife und Blutspiegel der Vorschau als Knopf. Das ist schon heute die „Lebensphase“, in der alle Bilder gezeichnet werden.

## Befund am Lebensband (bitte prüfen, Fable)
- Das Band zeichnet den Schlupf fest bei Reife **0,5** (`LIFE.hatch = .5`, `skin.js:17`, Strich `:42`), und seine Griffe schreiben die Reife direkt (`X(r)`, `:31`).
- Bei der Referenz-Organmasse ist die Reife beim Schlupf aber mindestens 20 ÷ 90 ≈ 0,22. Ein Griff „knapp nach dem Schlupf“ setzt also Reife 0,5, und die Zelle stirbt viel später als gezeigt. Das ist ungültig, nicht vereinfacht.
- Vorschlag: Schlupfstrich bei 20 ÷ Kapazität des Plans. Der Planbericht kennt die Kapazität (Organmasse). Ein Wert, keine Spanne, aus der Engine.

## Vorschlag Werkzeug (zur Diskussion, kein Entwurf)
1. **Eine Lebenslinie für den ganzen Fisch**, oben im Atelier oder als Werkzeug wie „Hormone“/„Lernen“: Ei → Schlupf → jung → erwachsen auf der Körperreife; darauf ein runder Knopf **„jetzt“** = die Reife der Vorschau (heute in `previewControls` versteckt).
2. Darunter **alle Organe als Bänder**, wann sie leben, mit ihrem Aktivitätsverlauf. Daraus liest man die Lebensphasen des Fischs: was im Ei arbeitet, was erst später kommt, was mit der Reife geht.
3. Zieht man „jetzt“, zeigen Fischpanel und alle Inspektoren den Fisch in dieser Phase (welche Zellen leben, wie aktiv).
4. **Je Organ** bleibt das eigene Lebensbild im Inspektor (heute das Band), aber es liest dieselbe Lebenslinie und denselben Schlupfstrich. Das Reife-Diagramm (Davids Beispiel) ist dort das Werkzeug für die Feinheiten (Aktivitätswende).
5. **Zellreife** als zweite Uhr nur dort, wo ein Organ sie nutzt (Darm heute), als eigene kurze Achse ab Bildung der Zelle.

## Offen
- Darf das Werkzeug die Vorschau-Reife ersetzen, oder bleibt `previewControls`? (Ein Modell als Quelle: nur eine „jetzt“-Reife.)
- Hormonwerkzeug (Astra) und Lebensphasen-Werkzeug teilen das Blut der Vorschau. Abstimmen, wer den Knopf besitzt.

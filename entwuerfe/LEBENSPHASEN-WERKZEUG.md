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

## Grundsatz nach David 18:02 (ersetzt den früheren Befund zum Schlupfstrich)
- Der Gestalter denkt in **Lebensabschnitten** (Ei, jung, erwachsen), nicht in Reifezahlen. Er wartet auf keinen Engine-Lauf, um zu erfahren, wann sein Fisch schlüpft (David 08:11 und 18:02).
- **Kein gleiches Lebensband unter allen Organen.** Jedes Organ tut im Leben etwas anderes; die Eiablage braucht man im Ei nicht. Das Lebensbild eines Organs zeigt, was **seine** Zellen in den Abschnitten tun, und bietet nur die Einstellungen an, die für dieses Organ Sinn ergeben.
- Wie ein Organ seine Abschnitte in Rezeptoren übersetzt (Reife, Zellreife, Stoff), ist Sache des Organs. Der frühere Vorschlag, den Schlupfstrich aus der Engine zu rechnen (Claude 17:20), ist zurückgenommen.
- Grundlage: Fables Aufstellung je Organ (Ei / jung / erwachsen), aus den ORGAN-Seiten und dem Code.

## Vorschlag Werkzeug (zur Diskussion, kein Entwurf)
1. **Eine Lebenslinie für den ganzen Fisch**, oben im Atelier oder als Werkzeug wie „Hormone“/„Lernen“: Ei → jung → erwachsen als Abschnitte, schematisch; darauf ein runder Knopf **„jetzt“** = der Abschnitt der Vorschau (heute in `previewControls` versteckt).
2. Darunter **alle Organe als Bänder**, wann sie leben, mit ihrem Aktivitätsverlauf. Daraus liest man die Lebensphasen des Fischs: was im Ei arbeitet, was erst später kommt, was mit der Reife geht.
3. Zieht man „jetzt“, zeigen Fischpanel und alle Inspektoren den Fisch in dieser Phase (welche Zellen leben, wie aktiv).
4. **Je Organ** ein eigenes Lebensbild im Inspektor (statt des heutigen gleichen Bands), das zeigt, was dieses Organ in jedem Abschnitt tut. Das Reife-Diagramm (Davids Beispiel) ist dort das Werkzeug für die Feinheiten (Aktivitätswende).
5. **Zellreife** als zweite Uhr nur dort, wo ein Organ sie nutzt (Darm heute), als eigene kurze Achse ab Bildung der Zelle.

## Offen
- Darf das Werkzeug die Vorschau-Reife ersetzen, oder bleibt `previewControls`? (Ein Modell als Quelle: nur eine „jetzt“-Reife.)
- Hormonwerkzeug (Astra) und Lebensphasen-Werkzeug teilen das Blut der Vorschau. Abstimmen, wer den Knopf besitzt.

## Nachtrag 15.11. 02:20 (nach Davids Frage: „Wie interagiert das Werkzeug mit dem Fischpanel, oder habt ihr nur über Inspektoren nachgedacht?“)
Ehrliche Antwort an David: fast nur über Inspektoren. Zum Fischpanel stand oben nur Punkt 3.

**Befund im Code (`dd89af3e`):** Die Vorschau-Reife (`previewContext`, `controller.js:100`, `development.js:93ff`) wird nur von Inspektoren gelesen: `life_cycle.js:76`, `learning.js:72/127/162`, `substances.js:102/630`, `live/blood.js:271`, `preview.js:8`, `trials.js:227`. Das Fischpanel zeichnet den Fisch unabhängig davon.

**Ort:** Der Werkzeugkasten ist die Leiste links im Fischpanel (Platzieren, Verschalten, Hormone, Lernen, Reizen, Entfernen, Ausschnitt). „Ein eigenes Werkzeug im Werkzeugkasten“ (David) heißt also: ein Werkzeug „Leben“ in dieser Leiste. Gewählt, wird das **Fischpanel selbst** zur Lebensansicht; die Lebenslinie mit „jetzt“ sitzt im Fischpanel, nicht über den Inspektoren.

**Was das Fischpanel je Phase zeigen müsste (zu prüfen im Code, bevor gezeichnet wird):**
- Ei: Fisch in der Schale; nur Zellen, die schon gebildet sind (Bildungsrezeptor); Netzhautwellen über dem Auge (`substrate.cc:704–728`, laufen, solange die Erregbarkeit der Zellen reicht; enden nur, wenn das Organ sie über Reife/Hormon senkt, LEITLINIE 0); Muskeln zucken (Schlupfimpuls, `embryo.cc:38–41`); das Auge meldet keinen Kontrast (`cppn_brain.cc:407–411`); Proben, die im Ei nicht gelten (Futter, Sehprobe), sind nicht da.
- Schlupf: Gesehenes blendet über die Zellzeit ein (`birth_exposure`, `physiology.hh:437–441`).
- Jung → erwachsen: Körper wächst (`body_scale`), Maulöffnung und Beute mit; Farbe nach den dann lebenden Pigmentzellen; Eier/Samen kommen dazu.
- Inspektoren folgen derselben Phase und zeigen nicht, was in ihr nicht gilt.

**Offen zur Abwägung (Fable, Astra):** Ersetzt „jetzt“ im Fischpanel die Vorschau-Reife ganz (ein Modell)? Wie verhalten sich Hormone und Lernen, die dieselbe Vorschau lesen? Darf der Fisch im Fischpanel im Ei-Zustand bearbeitet werden (Zellen setzen), oder nur angesehen?

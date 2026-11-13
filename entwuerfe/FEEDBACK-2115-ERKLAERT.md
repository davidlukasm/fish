# Davids Rückmeldung zu Version 12 (13.11. 21:15), erklärt

David ist sehr verärgert, zu Recht. Die neuen Grundsätze stehen in LEITLINIE 3 (`753117d0`). Die Bilder liegen in `bilder/2026-11-13_feedback2/`, die Übersicht der Version 12 in `version12_uebersicht.png`.

**Gemeinsamer Fehler:** Feedback wurde nicht Punkt für Punkt abgearbeitet. Es wurden Dinge geändert, die nicht in Frage standen. Die Panels wurden nicht bei 320 px im Browser durchprobiert. Die Energie floss in Messungen statt in Gestaltung.

## Grundsätze, die für alle Panels gelten

1. **Eingabe und Einstellung sind zwei Dinge.**
   - Eingaben (Reiz, Befehl, Nahrung) stehen immer als Diagramm mit formbarer Kurve und sind in allen Panels gleich gesteuert.
   - Regler und Griffe am Organbild sind immer nur Organeinstellungen.
   - Heute ist das ein Durcheinander:
     - Beim Schwanz ist die Kraft ein Regler außen, „Befehl aus“ ist fest.
     - Bauchweh und Nährwert haben Griffe für die ganze Kurve.
     - Bereichswähler sehen einmal wie ein Schlüssel aus, beim Darmmuskel dagegen symmetrisch.
2. **Proben und Reize gehören ins Fischpanel des Ateliers.** Gemeint sind Geruchsprobe, Strömung und Angreifer. Der Inspektor zeigt den Effekt. Das Fischpanel hat schon Duft, Strömung, Berührung, Verletzung und Futter im Darm (`fischpanel_duft_nach_fix.png`). Augen, Sehfächer und Sehbild sind das Vorbild.
3. **Muskeln überall wie beim Schwanz:** Knoten, Fasern und Rekrutierung. Kein (+)/(−) mit unklarer Wirkung, nie „Stärke (Sechzehntel)“.
4. **Wirkung statt Anzahl.** Wörter wie „Gruppen“ oder „4 Zellen“ als Einstellung sind verboten.
5. **Ungültiges wird nicht gezeigt.** Das Ei frisst nicht, also gehört es nicht ins Lebensbild des Darms. Gestrichelte Kurven ohne Grund und Schritte, wo die Zeit egal ist, entfallen ebenso.
6. **Keine Sätze im Panel.** Abwehr: „Abwehren kostet Energie je Biss; fehlt sie, schützt es weniger.“ passt nicht einmal ins Panel (Bild 8).
7. **Kein Zittern und kein Gedränge.** Jeden Griff im Browser ziehen. Bild 4: Die Skala der Geschwindigkeit beim Schwanz zittert.

## Je Panel

### Darm

**Ertrag**
- „Darmmuskel“ steht unter den Kurven.
- Die strichlierten Kurventeile haben keinen Sinn mehr.
- Die Schritte-Achse (log) ist unnötig, auch ohne Markierung wäre es gut.

**Lebensbild**
- Das Ei wird gezeigt, obwohl der Fisch da nichts frisst.
- Fleisch belegt die halbe Höhe, und die Kurve geht nie von 0 bis 100: Die Skalierung ist falsch.
- Die Muskel-Unschärfe ist unverständlich. Was stellt man hier wirklich ein? Reife verändert Darm und Muskelzellen.
- Das Bild ist nicht so breit wie das darüber.

**Sättigungsgefühl**
- Der Magen sieht aus wie ein Ei.
- Statt eines Bereichs stehen da einzelne Zellpunkte.
- Wieder wird die Zellzahl eingestellt, und „Gruppen“ steht als Wort da.
- Die Achse „Meldung ans Gehirn“ ist plötzlich die x-Achse und zugleich mit „4 Zellen“ beschriftet.

**Bauchweh**
- Der Titel „Bauchweh im Darm“ ist schlecht, ebenso der Begriff „volles Bauchweh“.
- Unverständlicher Text: „0,15 % Gesundheit“ und ein loses „Durchfall“.
- Die Futterzeile (Blatt … Fleisch) war vorher besser und wurde ungefragt verschlechtert, jetzt eng und als Knöpfe (Bild 1). Sie kommt zurück.

**Nährwert**
- Gleich verschlimmbessert.
- Der Name ist falsch: Man stellt nicht den Nährwert der Nahrung ein.

**Fischbild oben:** Die „Verankerung“ als Kugel ist unüberlegt.

### Schwanz
- Text überdeckt und alles gedrängt (Bild 2).
- Geschwindigkeit: Die Skala zittert (Bild 3/4). Die Kurve im Wasser soll immer gleich hoch sein und nur ihre Form ändern. Der Regler ändert dann nur die Geschwindigkeit im Sand.

### Maul
- Lippen zu dünn, die Muskeln scheinen durch.
- Die Zähne sind viel zu klein.
- Ist die Gesichtslänge wirklich einstellbar?
- Saug-Animation: Sie sieht aus wie Geruch oder Echolot. Das Aquarium hat schon gute Saug-Animationen, an denen man sich orientieren soll.
- Animation stottert, das Diagramm zittert.
- Schließer und Öffner mit (+)/(−) ist unklar und anders als beim Schwanz.

**Biss-Diagramm**
- Es zeigt in Wahrheit die ganze Maulbewegung: Öffnen = Saugen, Schließen = Biss (so, wie die Engine es tut). Kiemen und Reusen gehören dazu.
- Die Wörter „offen Wasser Biss“ sind unverständlich (schon früher bemängelt).
- Schritte sind hier fraglich.

**Maul–Darm:** Das sind dumme Balken, und die Kiemen fehlen.

### Nase
- Strömung: Die beste Animation hat das Fischpanel in der Seitenlinienansicht (`ui/studio/view/probes.js`, Wasserbahnen). Die soll man nutzen.
- Der Fischkörper sieht aus wie ein Stein, fitzelig.
- Bild 5: Diese Einstellung (Geruchsbereich als Fahne) gibt es nicht.
- Bild 6: Drei Gerüche liegen übereinander und sind nicht zu erkennen. Das (+)/(−) fehlt.
- Die Geruchsprobe gehört nicht ins Panel, sie ist im Fischpanel. Dort muss auch die Strömung dazu.

### Schwimmblase
- Wirkt unfertig. Warum „Nach dem Schlupf“? Es gibt keine Einstellung.
- Grund und Oberfläche brauchen Sand, eine Pflanze, eine Oberfläche, hell/dunkel.
- Beim Ziehen der Blasengröße zittert das Diagramm.
- Fisch fährt nach oben und taucht unten wieder auf: Er soll oben bleiben, mit einem Pfeil für die Beschleunigung.

**Tiefensinn**
- (+)/(−) zeigt nur das Was, nicht den Effekt. Früher war es besser.
- Mit den anderen Sinnesbildern abgleichen: Die Kurve ist eine Meldung ans Gehirn, das kommt nicht heraus.
- Die Kurven sehen aus wie Felsen. Weniger deckend und über das ganze Diagramm.

### Kiemen
- Fischbild unfertig und zu klein.
- Die Animation ist eine gute Idee, aber es wirkt, als gingen alle Kugeln durch, nur schneller oder langsamer.
- Pumpe nur mit (+)/(−), unüberlegt.
- Kugelfarben: Wasser ist im Diagramm grün, im Film nicht. Wasser braucht keine eigenen Kugeln, die Geschwindigkeit zeigt es schon.
- „Bodenfutter“ soll Sediment oder Sand heißen und ist keine Futterkategorie des Darms. Kiemen × Darm muss anders aussehen.
- Gehört beim Pumpen nicht der Saugmuskel des Kiefers direkt in die Animation?

### Abwehr
- Reize über das Fischpanel (Angreifer).
- Stacheln reichen kaum nach vorne. Ein senkrechter Fisch passt besser, weil es um Länge geht und das Panel hochkant ist. Das Fischpanel zeigt Stacheln übrigens schon.
- „Stärke (Sechzehntel)“ ist furchtbar.
- Gedränge (Bild 7), und der Satz unten passt nicht ins Panel (Bild 8).
- Plötzlich gibt es eine Faserauswahl, aber außer der Sechzehntelstärke ist nichts regelbar.

## Bug im Live-Code (behoben)
In der Reizansicht zoomte ein Klick auf „Duft“ ganz heraus, weil der Duft acht Körperradien vor der Schnauze startete. Jetzt startet er bei 1,6 (`e176af27`).

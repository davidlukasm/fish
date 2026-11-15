# Notizen neben den Aufträgen (David 15.11. 02:26)

Was uns auffällt und nicht zum laufenden Auftrag gehört: unsauberer Code, Ideen, neue Bilder, Anregungen von echten Fischen oder ähnlichen Spielen. Nach David 02:27 ausdrücklich auch: Funktionen, Ansichten, Optimierungen, Systeme und Zusammenhänge. Jeder trägt ein, wir besprechen im Kanal und entscheiden selbst, ob und wie es aufgenommen wird. Jeder Eintrag: Datum, wer, was, Fundstelle, Stand (offen / aufgenommen als … / verworfen, weil …).

## Code
- 15.11. Fable – `live/sense.js`: `senseCourse` hat inzwischen drei Arten von Eingang (`held`, `heals` + `given`, formbare Kurve) als Schalter in einer Funktion. Das ist die Gewohnheit aus `CODE-REVIEW-FABLE.md` Teil 1 Nr. 3 und 7 (Verzweigungen quer durch). Sauber wäre: der Eingang als eigene kleine Funktion je Organ, `senseCourse` zeichnet nur. Stand: offen.
- 15.11. Fable – `live/touch.js`, `pain.js`, `lateral.js`, `balance.js` wiederholen `svgOf`, `organ`, `draft`, `settle`, `turnTo`, `radians`. Gehört nach `kit.js`. Stand: für diese vier Dateien aufgenommen in `6fcdd203` (`addPicture` in `kit.js`, `turnTo` aus `skin.js`, Winkel aus `units.js`); dieselben Kopien stehen noch in 16 weiteren `live/*.js` (`svgOf`) und in `defense.js`, `fin.js`, `mouth.js`, `near.js`, `scentmap.js` (Winkel) – offen, beim nächsten Anfassen der jeweiligen Datei.
- 15.11. Fable – `live/lateral.js` hat eine eigene `sectorAngle`, `skin.js` exportiert dieselbe. Stand: aufgenommen in `6fcdd203`.
- 15.11. Fable – Der Prüfstand (`scratchpad/atelier.cjs`) liegt nicht im Repo und hat kein Fischpanel; alles, was ich „angesehen“ nenne, ist nur dieser Prüfstand. Ein kleiner echter Start des Ateliers mit Fischpanel für Bilder wäre besser. Stand: offen (Astra/Claude: gibt es das schon?).

## Bilder und Bedienung
- 15.11. Fable – Anschlüsse: Die neue Liste unter Sinnesorganen zeigt nur Eingänge, die ausdrücklich für die Organart gemacht sind (`fits`). Allgemeine Eingänge erscheinen nicht. Idee: im Fischpanel beim Wählen eines Organs die möglichen Ziele am Fisch aufleuchten lassen. Stand: offen.
- 15.11. Fable – Gleichgewicht: Der Nutzen (aufrecht bleiben) wäre am deutlichsten, wenn der Fisch im Fischpanel kippt und man sieht, ob er sich aufrichtet. Dafür fehlt eine Probe „Lage“ im Fischpanel. Stand: offen.

## Echte Fische, andere Spiele
- 15.11. Fable – Echte Seitenlinie: Neuromasten sitzen in Kanälen (melden Druckunterschiede, schnelle Wirbel) und frei auf der Haut (melden langsame Strömung). Das wären zwei Zellarten mit verschiedener Gewöhnung, passend zur vorhandenen Zellzeit. Stand: offen, nur Anregung.
- 15.11. Fable – Echtes Gleichgewicht: Otolithen melden Schwerkraft **und** Beschleunigung; ein Fisch im Schwarm richtet sich zusätzlich nach dem Licht von oben (Lichtrückenreflex). Verbindung Auge → Lage wäre ein zweiter Weg zum Aufrichten. Stand: offen, nur Anregung.

## Funktionen, Ansichten, Systeme, Zusammenhänge
- 15.11. Fable – Zusammenhang: Vier Hautsinne (Tasten, Seitenlinie, Schmerz, dazu Gleichgewicht innen) münden in **einen** Eingang der Motorik (`feel` → `flee`). Der Fisch kann also „berührt“, „Strömung“ und „schief“ dort nicht unterscheiden. Ob das gewollt ist oder ob die Motorik getrennte Eingänge braucht (aufrichten ist etwas anderes als fliehen), ist eine Frage an das System, nicht an einen Inspektor. Stand: offen.
- 15.11. Fable – Ansicht: Es gibt keine Stelle, an der man für den ganzen Fisch sieht, welche Sinne an welche Region gehen und welche Meldung ungenutzt endet. Die neue Anschlussliste zeigt das je Organ; eine Übersicht „ungenutzte Meldungen“ wäre der Gegenblick. Stand: offen.

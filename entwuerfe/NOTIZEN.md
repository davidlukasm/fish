# Notizen neben den Aufträgen (David 15.11. 02:26)

Was uns auffällt und nicht zum laufenden Auftrag gehört: unsauberer Code, Ideen, neue Bilder, Anregungen von echten Fischen oder ähnlichen Spielen. Jeder trägt ein, wir besprechen im Kanal und entscheiden selbst, ob und wie es aufgenommen wird. Jeder Eintrag: Datum, wer, was, Fundstelle, Stand (offen / aufgenommen als … / verworfen, weil …).

## Code
- 15.11. Fable – `live/sense.js`: `senseCourse` hat inzwischen drei Arten von Eingang (`held`, `heals` + `given`, formbare Kurve) als Schalter in einer Funktion. Das ist die Gewohnheit aus `CODE-REVIEW-FABLE.md` Teil 1 Nr. 3 und 7 (Verzweigungen quer durch). Sauber wäre: der Eingang als eigene kleine Funktion je Organ, `senseCourse` zeichnet nur. Stand: offen.
- 15.11. Fable – `live/touch.js`, `pain.js`, `lateral.js`, `balance.js` wiederholen `svgOf`, `organ`, `draft`, `settle`, `turnTo`, `radians`. Gehört nach `kit.js`. Stand: offen.
- 15.11. Fable – `live/lateral.js` hat eine eigene `sectorAngle`, `skin.js` exportiert dieselbe. Stand: offen.
- 15.11. Fable – Der Prüfstand (`scratchpad/atelier.cjs`) liegt nicht im Repo und hat kein Fischpanel; alles, was ich „angesehen“ nenne, ist nur dieser Prüfstand. Ein kleiner echter Start des Ateliers mit Fischpanel für Bilder wäre besser. Stand: offen (Astra/Claude: gibt es das schon?).

## Bilder und Bedienung
- 15.11. Fable – Anschlüsse: Die neue Liste unter Sinnesorganen zeigt nur Eingänge, die ausdrücklich für die Organart gemacht sind (`fits`). Allgemeine Eingänge erscheinen nicht. Idee: im Fischpanel beim Wählen eines Organs die möglichen Ziele am Fisch aufleuchten lassen. Stand: offen.
- 15.11. Fable – Gleichgewicht: Der Nutzen (aufrecht bleiben) wäre am deutlichsten, wenn der Fisch im Fischpanel kippt und man sieht, ob er sich aufrichtet. Dafür fehlt eine Probe „Lage“ im Fischpanel. Stand: offen.

## Echte Fische, andere Spiele
- 15.11. Fable – Echte Seitenlinie: Neuromasten sitzen in Kanälen (melden Druckunterschiede, schnelle Wirbel) und frei auf der Haut (melden langsame Strömung). Das wären zwei Zellarten mit verschiedener Gewöhnung, passend zur vorhandenen Zellzeit. Stand: offen, nur Anregung.
- 15.11. Fable – Echtes Gleichgewicht: Otolithen melden Schwerkraft **und** Beschleunigung; ein Fisch im Schwarm richtet sich zusätzlich nach dem Licht von oben (Lichtrückenreflex). Verbindung Auge → Lage wäre ein zweiter Weg zum Aufrichten. Stand: offen, nur Anregung.

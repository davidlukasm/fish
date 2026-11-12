# Text- und Zeichenprüfung (Davids Auftrag vom 12.11. 17:37)

David: „Und dir ist schon bewusst, dass ‚Gewöhnung n Schritte‘ nur ***EIN*** Beispiel von vielen war? Frag auch Fable und Astra, was sie sonst für ‚Jo, eh‘-Texte finden (sagen nochmal, was eh schon sichtbar ist) und was für ‚unverständlich für Uneingeweihte‘ – Betriebsblindheitsfehler (Texte & sonstiges).“

## Zwei Fehlerarten

**A „Jo, eh“:** Ein Text sagt noch einmal, was man ohnehin sieht. Beispiele: ein Satz unter einem Bild, der das Bild beschreibt („Die Kurven zeigen …“), eine Legende für etwas, das schon beschriftet ist, ein Tooltip, der nur den sichtbaren Namen wiederholt, oder „Hof: Stoffbreite“ neben einem Hof, den man zieht.

**B Betriebsblindheit:** Unverständlich für jemanden, der den Code nicht kennt. Dazu gehören Wörter, Zeichen, Farben und Griffe.
- **Wörter:** Fachwörter aus Code und Modell, zum Beispiel Gewöhnung, Schwelle, Totzone, Knoten, Zellzeit, Bindung, Rezeptor, Halbwert, halbe Antwort, Reife, Bauplan, Schritte, Spurt, Kapazität, Rate.
- **Zahlen ohne Bezug**, etwa „0,3 %“ ohne „wovon?“.
- **Symbole** ohne Bedeutung, zum Beispiel die Knopfreihen mit Pfeilen am Organ.
- **Farben ohne Erklärung.**
- **Griffe**, bei denen man nicht ahnt, was das Ziehen ändert.
- **Abkürzungen und interne Namen**, zum Beispiel `choice.target` oder „Rf“.

Die Frage ist immer: Was BEWIRKT das beim Fisch, und kann man das so sagen oder zeigen, dass es jemand ohne Codekenntnis versteht?

## Vorgehen

1. **Kreuzprüfung:** Jeder prüft die Bereiche, die er **nicht** selbst gebaut hat, denn bei den eigenen ist man betriebsblind.
   - Astra: Claudes Organbilder (Muskeln, Darm, Blase, Gonaden, Drüse, Farbzellen, Auge, Stacheln, Kiemen, Kiefer).
   - Fable: Astras Regionen, Nerven, Lern- und Lebensbilder sowie den Stoffeditor.
   - Claude: Labor, Welt-Einstellungen, Baukasten und Kopfzeile.
   - Wer fertig ist, nimmt sich den Rest.
2. **Echte Größe:** Atelier im Browser bei 320 px Panelbreite, deviceScaleFactor 1. Jedes Organ, jede Region und jedes Werkzeug auswählen, alle Abschnitte öffnen, jedes sichtbare Wort und jeden Tooltip lesen.
3. **Eintragen**, unten in der Tabelle, eine Zeile je Fund: Ort (Datei oder Bild), wörtliches Zitat oder kurze Beschreibung, Art (A oder B), Vorschlag.
4. **Beheben** macht, wem die Datei gehört, nach dem Prinzip aus `VISUALISIERUNG.md`: zuerst das Bild verbessern und nur dann einen Text umformulieren. Ein A-Text wird gestrichen, ein B-Text durch die Wirkung ersetzt.

## Funde

| Ort | Zitat / Beschreibung | Art | Vorschlag | gefunden von |
|---|---|---|---|---|
| Darmsinn, Futterzellen (Claude, c1802974) | „halb gewöhnt nach 10 Schritten“ | B | „Gewöhnt“ und „Schritte“ sind Code-Sprache. Wirkung: ein Bissen wird nach … nur noch halb so stark gemeldet; Zeit in verständlicher Einheit | Claude (selbst) |
| Auge, Empfindlichkeit (Claude, 0270a8e0) | „halbe Antwort ab 1 % Unterschied“ | B | „halbe Antwort“ ist Modellsprache. Eher: „sieht schon, was 1 % heller ist als die Umgebung“ | Claude (selbst) |
| Drüse, Befehlslinie (Claude) | „hemmend/erregend“, Totzone „Schwelle“ | B | prüfen, ob „schwacher Befehl bewirkt nichts“ verständlicher ist | Claude (selbst) |
| überall | „Schritte“ als Zeitmaß | B | klären, ob eine Einheit wie Sekunden oder Tage im Aquarium sichtbar ist; sonst ein Vergleich wie „ein Atemzug“ | Claude |

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
| Darmsinn, Auge, Drüse … (Claude) | „halb gewöhnt“, „halbe Antwort ab …“, „halb bei … Füllung“ | B | **erledigt 9801d83a:** „gewöhnt sich in n Schritten daran“, „erkennt ab n % Unterschied“, „meldet ab n % Füllung“, „spürt ab n % des Bedarfs“ | Claude (selbst) |
| überall | „Schritte“ als Zeitmaß | – | **bleibt:** Der Viewer zählt die Zeit sichtbar in Schritten („Schritt 0“, „1 Schritt/s“) | Claude |
| Muskel, Ausdauer (Claude) | „0 % schnell“, „Unterhalt“, „Arbeit“ | B | **erledigt 9801d83a:** „n % schnelle Fasern“, „kostet in Ruhe“, „kostet je Schlag“ | Claude (selbst) |
| Atelier, Kopfzeile | „AID / WERKSTATT 02“, Startseite „AID / V019“, „01 / BEOBACHTUNG“ | B | interne Nummern und Kürzel; streichen oder den Namen ausschreiben | Claude |
| Atelier, Kopfzeile | „841 potenzielle Zellen · Bauplan“ | B | Was heißt „potenzielle“? Etwa „Platz für 841 Zellen“, oder weglassen | Claude |
| Atelier, Kopfzeile und Reiter | „CPPN erzeugen“, „CPPN bearbeiten“, „CPPN-Vorschläge“, Leertext „CPPN erzeugen, Entwicklungsvorschau ansehen“ | B | Fachkürzel. Wirkung benennen, etwa „Erbgut erzeugen“ und „Erbgut bearbeiten“, „Vorschläge aus dem Erbgut“ | Claude |
| Atelier, rechts oben | „Bauprüfung“ | B | Was wird geprüft? Etwa „Ist der Fisch lebensfähig?“ | Claude |
| Atelier, Ansichtsleiste | „Kontaktbündel 120“ (Auswahlliste) | B | unverständlich; was ändert die Zahl am Bild? Sonst entfernen | Claude |
| Atelier, Ansichtsleiste | Ebenen „Verbindungen / Knoten / Hormone“, Knopf „Entwurf“ | B | „Knoten“ ist Modellsprache; „Entwurf“ gegen „Vorschläge“ unklar | Claude |
| Atelier, Platzieren | drei Symbolknöpfe (◦|◦, ◦|, |◦) ohne Wort | B | Bedeutung nicht erkennbar (beide Seiten, links, rechts?); Wort dazu | Claude |
| Atelier, Werkzeugleiste links | Symbole ohne Wort, „⌗“ | B | nur Tooltips. Kurzes Wort oder eindeutigeres Bild; „⌗“ ist unklar | Claude |
| Atelier, Bibliothek | „Tectum“, „Nahsinn“, „Modulator“, „Lernknoten“, „Hemmkreis“, „Bewertung“, „Körperzustand“ | B | Fachwörter. Nach Wirkung benennen: „Tectum“ → „Sehzentrum“; „Nahsinn“: was spürt er? | Claude |
| Atelier, leerer Inspektor | „Vorzeichen, Lehrkontakte und Hormonbindungen werden unterschieden“ | B | Modellsprache; sagen, was man sieht (Farben, Strichart) | Claude |
| Zentrale | „0 Startfische tragen sich“ | B | Was heißt „tragen sich“? Etwa „0 Startfische überleben über Generationen“ | Claude |
| Zentrale, Labor-Karte | „Futter aus zwölf Richtungen, offene Muscheln“ | B | kryptisch; sagen, was man dort herausfindet | Claude |
| Verhaltenslabor | „Der Fisch steht 40 vor einer offenen Muschel“ | B | Zahl ohne Einheit (40 was?) | Claude |
| Verhaltenslabor | „WELTEN 1 2 4“ | B | Was ist eine Welt hier (gleichzeitige Wiederholungen)? | Claude |
| Verhaltenslabor | „Im Labor wird laufend Energie nachgefüllt.“ | B | Wessen Energie? Etwa „Der Fisch verhungert im Labor nicht“ | Claude |
| Zuchtstation | „STARTWELTEN 2 3 5“, „Ohne Bestandshilfe“ | B | „Bestandshilfe“ ist Modellsprache; „Startwelten“ unklar | Claude |
| Aquarium, Kopfzeile | „CPU“, „– FPS · – ms max.“ | B | Technikanzeige; für Entwickler, nicht für Spieler | Claude |
| Aquarium, Nahrungsnetz | „Zufuhr 100 %“, Balken „35 % 12 % 18 % 35 %“ ohne Namen am Balken | B | Anteile wovon? Namen an die Balken | Claude |
| Aquarium, Neuer Lauf | Karten: „Augen 88 / Nase 8 / Seitenlinie 0“, „Kiefer 100 % Darm 50 % Zähne 50 % Körper 50 %“, Tooltip „Darm: kurz (0) bis lang (100). Erbliche Anatomie.“ | B | Rohwerte ohne Bedeutung, die Erklärung nur im Tooltip; Wirkung zeigen (Darm lang = Pflanzenverwerter) | Claude |
| Aquarium, Neuer Lauf | „handbau“, „2 Linien“, „Ohne Auswahl: die sieben Beispielklassen“, „Seed für nächsten Lauf“, Sortierknopf „Drehimpuls“ | B | interne Ordnernamen und Fachwörter | Claude |

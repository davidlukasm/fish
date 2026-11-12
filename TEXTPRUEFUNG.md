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

**Davids Korrektur (18:07):** „Tectum und Modulator sind keine Wörter, für die man den Code kennen muss?“ Echte Fachwörter aus Biologie oder Methode (Tectum, Modulator, Schwelle, Rezeptor, Genom) sind **keine** Betriebsblindheit. Gemeint ist nur, was erst durch **unseren Code oder unser Modell** eine Bedeutung bekommt: interne Namen, Rohwerte, Zahlen ohne Bezug, Modellgrößen wie „Kontaktbündel“ oder „potenzielle Zellen“, Ordnernamen wie „handbau“.

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
| Atelier, Kopfzeile | „841 potenzielle Zellen · Bauplan“ | B | Was heißt „potenzielle“? Etwa „Platz für 841 Zellen“, oder weglassen. **Erledigt 0f55b4d9:** „Plan: 841 Zellen“, nach dem Entwickeln „Entwickelt: n Zellen · m Kontakte“ | Claude |
| Atelier, Kopfzeile und Reiter (David 18:09/18:11: umbenennen, „später“; Vorschläge Gen-Netz, Genetischer Graph, **Genplan**) | „CPPN erzeugen“, „CPPN bearbeiten“, „CPPN-Vorschläge“, Leertext „CPPN erzeugen, Entwicklungsvorschau ansehen“ | B | Fachkürzel. Wirkung benennen, etwa „Erbgut erzeugen“ und „Erbgut bearbeiten“, „Vorschläge aus dem Erbgut“ | Claude |
| Atelier, rechts oben | „Bauprüfung“ | B | Was wird geprüft? Etwa „Ist der Fisch lebensfähig?“ | Claude |
| Atelier, Ansichtsleiste | „Kontaktbündel 120“ (Auswahlliste) | B | unverständlich; was ändert die Zahl am Bild? Sonst entfernen. **Erledigt 0f55b4d9:** „die stärksten 120“, nur noch in der Ansicht der entwickelten Kontakte, auf die sie wirkt | Claude |
| Atelier, Ansichtsleiste | Ebenen „Verbindungen / Knoten / Hormone“, Knopf „Entwurf“ | B | „Knoten“ ist Modellsprache; „Entwurf“ gegen „Vorschläge“ unklar | Claude |
| Atelier, Platzieren | drei Symbolknöpfe (◦|◦, ◦|, |◦) ohne Wort | B | Bedeutung nicht erkennbar (beide Seiten, links, rechts?); Wort dazu. **Erledigt 0f55b4d9:** beidseitig / einseitig / mittig unter dem Zeichen | Claude |
| Atelier, Werkzeugleiste links | Symbole ohne Wort, „⌗“ | B | nur Tooltips. Kurzes Wort oder eindeutigeres Bild; „⌗“ ist unklar. **Erledigt 0f55b4d9:** Wort unter jedem Werkzeug, „⌗“ → „ganz“ | Claude |
| Atelier, leerer Inspektor | „Vorzeichen, Lehrkontakte und Hormonbindungen werden unterschieden“ | B | Modellsprache; sagen, was man sieht (Farben, Strichart). **Erledigt 0f55b4d9:** „Was er erregt, leuchtet auf, was er hemmt, wird dunkel; was er lehrt, leuchtet golden, was auf seine Stoffe antwortet, violett.“ | Claude |
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

| Auge, Darm-/Blutsinn, Nase (`vision.js`, `sense_curves.js`) | „erkennt ab 1 % Unterschied“, „meldet ab 22 % Füllung“, „spürt ab 0,1 % des Bedarfs“, „riecht ab hier“ | B + Bedeutungsfehler | Die gezeichnete Antwort beginnt schon vorher; der Griff liegt bei **halber Antwort**, keiner Ein/Aus-Grenze. Vor/nach dem Griff zwei Reizbeispiele und ihre unterschiedlich starke Meldung zeigen; den markierten Kurvenpunkt als „50 %“ kenntlich machen. „ab“ passt hier mathematisch nicht. **Erledigt 71e1db7c:** Skala 0/50/100 %, gestrichelte Halblinie bis zum Griff, Griffwort „bei 22 % Füllung“; Auge „halbe Meldung bei n % Unterschied“. | Astra, Code + SVG 296 px |
| Darmmuskel (`effectors.js:gutMuscleGraphic`) | Sichtbar nur „in Ruhe / angetrieben“ mit Körnchen im Darm; die geringere Verwertung steht im Tooltip | B | Die entscheidende Abwägung ins Bild: dasselbe Futter durch zwei Därme, daneben aufgenommener Anteil und ausgeschiedener Rest. Schneller leer und weniger daraus gewonnen müssen gemeinsam sichtbar sein. **Erledigt 275730b4:** eine Mahlzeit über die Schritte nach dem Fressen, hungrig in Ruhe / voll angetrieben / satt angetrieben, je aufgenommen, im Darm, ausgeschieden und „leer nach n Schritten“. Dabei korrigiert: voll angetrieben verwertet 73 %, nicht 50 %. | Astra, SVG 296 px |
| Kiemen (`effectors.js:gillGraphic`) | „Reusendichte“, „Wasser 75 %“ | B | „Planktonsieb“ am Griff; am Wasserpfeil sagen, dass 75 % **durchkommen**. Der heutige Wortlaut kann Füllung, Wasseranteil oder Pumpenstärke meinen. **Erledigt 71e1db7c:** „Planktonsieb“, „75 % Wasser kommt durch“. | Astra, SVG 296 px |
| Muskeln, Kiemen, Darmmuskel, Abwehr | „Zeit bei voller Anstrengung“ ohne Zahlen auf der Zeitachse; „Zug“ | B | Eine feste, bezifferte Zeitspanne und ein sichtbar benannter Effekt am Organ (Schub, Bisskraft, Pumpe …). So lässt sich erkennen, nach wie vielen Schritten die Wirkung nachlässt. **Teilweise 71e1db7c:** Zeitachse „160 Schritte volle Anstrengung“; Wirkung je Organ statt „Zug“ steht noch aus. **Erledigt 275730b4:** Schub, Sog, Biss, Aufrichten, Pumpen, Antrieb; beim Darmmuskel „Zellen“ mit „mehr Zellen: teurer, nicht schneller“. | Astra, SVG 296 px |
| Drüse (`gland_effect.js:levelPicture`) | Standardfall mit 5 Zellen: alle sechs Stoffkurven liegen fast auf der Nulllinie, Skala endet bei 30 % | B, Darstellung | Bei 296 px Höhe des stärksten Standardverlaufs kaum erkennbar; die Wirkung von Zellzahl und Dauer geht verloren. Aktuellen Spitzenwert an der Linie zeigen und einen lesbaren Ausschnitt mit ausdrücklich angegebener Skala anbieten. **Erledigt 71e1db7c:** Rahmen nach eigener Zellzeit und Hauptstoff, Gipfel „5 Zellen: bis 1 %“. | Astra, SVG 296 px |
| Drüse / Befehlslinie (`command_line.js`) | „bindet / gibt ab“, „hemmend / erregend“, „Schwelle“ | B | Ein Pfeil vom Blut in die Drüse und zurück erklärt die Richtung; etwa „nimmt Stoff aus dem Blut / gibt Stoff ins Blut“. „Bindet“ lässt sich sonst mit einem Rezeptor verwechseln. Den Griff mit der nötigen Befehlsstärke verbinden. **Erledigt 71e1db7c:** „gibt Stoff ins Blut / nimmt Stoff aus dem Blut“. | Astra, SVG 296 px |
| Ei- und Samenorgan (`sacs.js`) | „voll nach 88 Schritten“ / „voll nach 421 Schritten“ | B | Die Annahme zum anliegenden Befehl und zur verfügbaren Energie gehört zum dargestellten Beispiel. Wie bei der Blase „bei starkem Befehl …“ nennen; im Bild eine schwache und starke Ansteuerung vergleichbar machen. **Erledigt 71e1db7c:** „beim Beispieleingang voll nach n Schritten“ (die Füllzeit hängt am Beispieleingang oben, nicht an einem starken Befehl). | Astra, SVG 296 px + Textinventar |
| Barteln (`panels.js:barbelFeel`) | Drei Auswahlknöpfe für schmecken / schmecken und tasten / tasten zeigen nur Symbole; Wörter nur im Tooltip | B | Je ein erkennbares Kontaktbeispiel Blatt / Stein unter dem Knopf oder die kurzen Verben sichtbar am Knopf. **Erledigt 71e1db7c:** Wörter sichtbar an den Knöpfen. | Astra, gerendertes Markup |


### Ergänzung Astra

Die obigen Astra-Funde beruhen auf dem aktuellen nativen Atelier-Entwurf und direkt gerenderten SVGs mit 296 px Bildbreite in einem 320-px-Rahmen sowie den tatsächlich erzeugten sichtbaren Texten/Tooltips. Keine vollständige Browserprüfung: Der Browserstart ist in dieser Umgebung gesperrt. Geprüft wurden Darm, Blase, Ei, Samen, Drüse, Farbzellen, Auge, Stacheln, Kiemen, Darmmuskel, Nase, Barteln sowie Schwanz und Kiefer. Animationszustände, Menüs und Bedienung im Browser bleiben für die Kreuzprüfung offen.

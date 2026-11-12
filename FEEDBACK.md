# Feedback (David)

## Allgemein

$ ./start --fresh
Das scheint auch Tests laufen zu lassen oder braucht jedenfalls sehr lange, länger als früher. Wäre zu inspizieren.

-- Nachtrag nach meinem ersten In-Depth-Einstieg in das vorgefertigte Darm-Organ:
-- Komplett daneben.
-- Es scheint, dass keine meiner Inputs was gebracht haben.
-- Ich gebe nach dem Darm mein erstes Feedback mit der Bitte um Redesign, jedenfalls ALLER Inspektoren.
-- Kurz: Überall Schieberegler. Nichts ist intuitiv. Text ist viel zu viel und wird abgeschnitten, überall.
-- Textinhalt ist unverständlich. Dinge stürzen ab. Grafiken sind überflüssig (glorifizierte Schieberegler)


## Atelier
Zur Orientierung:
Links: Baukasten
Mittig: Fischpanel
Rechts: Inspektor-Panel
Werkzeugleiste ist im Fischpanel.
Darüber: ANsichtsoptionen
Ganz oben: Menüleiste.
Dazwischen: Workflow (Fisch gestalten - CPPN bearbeiten - ... - Bauprüfung)

### Inspektor allgemein
#### für "Zellbildung, Aktivität und Tod"
Das Diagramm hat vierten Legenden... Was soll das mit der enormen Menge an Text und Erklärung?
Je mehr Erklärung, desto schlechter die Darstellung.
Die Kurve selbst ist Recht klar. Zelle(n) beginnt/beginnen langsam zu leben und sterben irgendwann abrupt.
Dass die beiden Dreicke Griffe zum Verschieben sind, war etwas unklar.
Die Beschriftung ist verwirrend un hilft nicht.
Warum wird "Signal von Anfang an" zu "halbes Signal"? WAS FÜR EIN SIGNAL?
Was ist mit der Option, eine Zelle auch wieder abzuschalten, sie muss doch dafür nicht sterben?
In der (ersten) Legende steht: "Reife" und rechts "Aufbau / Signal", obwohl oben bereits Signal steht und obwohl bereits Symbole die Reife darstellen?
Die Symbole sehen allerdings fast gleich aus.
In der Zweiten Legende dann "Aufbau", "Signal" und "entfernt" - WAS BEDEUTET DAS?
Im Hormonrad unten ist dann außerdem nur Reife angezeigt, nicht die anderen beiden inneren Stoffe (Erschöpfung und ...?)
In der dritten Legende steht "Signal einer aufgebauten Zelle" - heißt nichts.
Und darunter dann "jung", "halb gewachsen" und ausgewachsen.
Was bitte soll halb gewachsen sein?
Die Fische sind Eier, dann schlüpfen sie. DAS ist der wesentliche Unterschied.

DIE KURVE HIER SOLLTE DOCH EINE KURVE SEIN, DIE QUASI DIE AKTIVITÄT DER ZELLE ÜBER DAS LEBEN DES FISCHE STEUERT
STATTDESSEN IST UNKLAR, WAS HIER WAS STEUERT. WO IST TOD? WARUM HORMONE?
Und noch dazu: Wenn man auf "antwortet auf einen Stoff" klickt stürzt das ganze Ding ab. Oder ins Hormonrad. Stürzt einfach ab.
Ist das "antwortet auf einen Stoff, gehört das überhaupt noch zu dem "Lebens-Diagramm"?

Darunter dann "Signalempfang Streuung 0%" Grundantwort Bauplan: 1.
KAUDERWELSCH. FUCK IT. Und es sind wieder huntert Schieberegler.
Und so geht es in einer Tour weiter, bei "Streuung im Zellbau ebenfalls".
Noch mehr Beispiele? "Schnelle Zellzeit in Schritten Bauplan 13,9 Schritte"
"Punkte mögliche Werte je Eigenschaft" - ja klar, wie hätt ich den Schieberegler anders lesen können als "Punkte mögliche Werte je Eigenschaft".
Vielleicht vor Prüfung des Bauorts? Oder mit Elektrischer Höchststärke bei Bauplan 50%?
Anteil einer maximal möglichen Stärke - sehr intuitiv verständlich.
/sarcasm off.

Ganz oben: Beispielwerte. Ich verstehe zumindest die Idee. Die Umsetzung ist mickrig.
Stoffpegel als KREIS? Noch dazu SO EXTREM WINZIG, das man ERST NICHTS REGLEN KANN DAMIT?
Und: Egal was man tut, es passiert NICHTS?

"Elektrische Höchststärke" - WAS SOLL DAS HEISSEN???

### Darm
Die Darmlänge spiegelt sich im Fischpanel nicht richtig wieder, soll heißen der Darm im Fischpanel ist nicht "darmig" genug.
Bisschen mehr & längere  Windungen und mehr wie ein Fischdarm halt aussieht?
Magen vielleicht auch aufhübschen?

Die Sinuswelle ist keine gute Visualisierung davon. Was soll sie darstellen?
Und sie enthält genau eine Zahl: die Darmlänge. Dafür eine solche Welle?
Was die Punkte (gelb und türkis) hier bedeuten, ist unklar. Keinerlei Kontext, es heißt nichts.

Darunter drei Diagramme mit viel zu viel Text. ÜBERALL ist Text! Horizontal, Vertikal, an den Achsen, unter den Achsen, überall.
Sie sind überladen! Und die zwei/drei unteren Diagramme enthalten noch dazu ENORM VIEL an Text. "gewöhnt sich in 42 Schritten daran"
Diese Diagramme sind außerdem glorifizierte Schieberegler. Warum enthalten sie Kurven, die Kurven heißen hier doch nichts!
Das Wort "Meldung" heißt nichts. "Gewöhnt sich in 42 Schritten dara" [der Text ist so lang, dass er abgeschnitten ist"
"frisst gleichmäßig VS. 144 Schritte später"? Was soll das überhaupt bedeuten?

Ich habe die Erlaubnis gegeben, Text zu verwenden. Weil ich dachte, KIs können das sinnvoll beurteilen, wann es gut ist und wann nicht.
Sieht nicht so aus.

Das Darmlänge Diagramm selbst ist falsch. Und wenn es das nicht ist, ist es die Engine.
Lange Därme sind jetzt immer besser, für egal welche Nische. Na toll.
Und wo ist das Ganze Thema mit den Muskelkontraktionen hin? Hier ist nichts davon.

### Ei-Organ
Das ziehen der Dehnungszellen-Einstellung ("bei xx % Füllung") lässt die Frames auf ca. 2 FPS stürzen. Das kann doch nicht sein.
Und das bei einem neuen, leeren Fisch.
Der Regler bei "Schwelle füllt den Vorrat" (was auch immer das heißt) lässt sich gar nicht erst verschieben, weil aus den FPS ist wohl SPF oder Minutes Per Frame geworden.
Das erste Diagram hat den schönen Text: "beim BeispieleiwartetaufAuslösekommando" mit Text im Hintergrund. Und auch dieses ist offenbar einfach nur ein Schieberegler auf Fancy.
Vorrate bilden, Auslöser und Füllstand erscheinen unvermittelt darunter, und ganz unten gibt es hier "Kontakte im Bauplan", was offenbar nichts bedeutet und wo auch nicht klar ist, was ob das ANzeige oder Einstellung ist.
Wozu aman hier "Hormone Einstellen" soll, ist völlig unklar, und was dann passiert, wenn man da drauf klickt, versteht man noch viel weniger.

### Maul/Kiefer
Mund ist bei Neuem Fisch zwar schon angelegt, aber erst ein Klick daruaf lässt die Muskeln erscheinen, und ein zweiter Klick auf die dann erschienenen Seiten (?) Lachwinkel (?) des Mundes lässt erst die zweite Muskelpartie erscheinen (die Saugmuskeln?)
Wo sind die Kiemen?
WTF?

### Schwanzflosse + Muskeln
Ein glorifizierter Schieberegler begrüßt mich. Die Welle, die er anzeigt, soll "Schlängeln" symbolisieren, aber was das bedeutet, weiß man durch die Grafik nicht.
Die Zwei Diagramme "Schub" haben Regler, die sich nicht alle bedienen lassen.
Die "schwacher Befehl - starker Befehl" - Schwelle ist verwirrend. Was für eine Schwelle? Und gehört "schwacher Befehl" nach oben zum Diagramm oder nach unten zum Schieberegler?
Die Legende des Diagramms: "zieht immur bei starkem Befehl"
Das hinzufügen/entfernen von Knoten: 2 FPS.
Was bedeuten die drei Regler hier? OK, Zellen je Knoten. Die Anzahl der Knoten. Aber der dritte Regler? Zwischen Zieht immer und nur bei Starkem Befehl? Direkt darunter steht doch auch Schwelle für schwacher Befehl/starker Befehl?
Darunter folgt der nächste glorifizierte, überbeschriftete Schieberegler mit unverständlichen Kruven (diesmal gleich drei Kurven): "xx % schnelle Fasern"
Insgesamt Fazit: Heißt nichts. Ist komplett shitty.


## Zuchstation



## Labor

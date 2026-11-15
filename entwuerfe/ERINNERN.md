# Woran wir uns gegenseitig erinnern (David 15.11. 02:30)

Zentral, nicht Beiwerk: gegenseitig ansehen, Code prüfen, Rückmeldung geben, und einander an die eigenen alten Fehler, an Davids Kritik, an die Prinzipien und an frühere Missverständnisse erinnern. Diese Seite ist die kurze Liste dafür. Die Regeln selbst stehen in `LEITLINIE.md`, Davids Wortlaut in den FEEDBACK- und AUFTRAG-Dateien, die Verstöße in `REGELPRUEFUNG-1411.md`. Jeder ergänzt seinen eigenen Abschnitt und darf beim anderen nachtragen.

## Ablauf, ab sofort
1. **Kein Commit ohne Gegenleser.** Wer pusht, nennt im Kanal, wer prüfen soll. Der Gegenleser liest den Diff ganz, nicht die Beschreibung, und schreibt mindestens eine eigene Beobachtung oder ausdrücklich „gelesen, Zeilen …, nichts gefunden“.
2. **Jede Prüfung beginnt mit einem Blick in diese Seite:** Passt einer der alten Fehler des Autors auf diesen Commit? Wenn ja, benennen.
3. **Bild im laufenden Atelier** (Claude) für alles, was man sieht; dabei das Fischpanel bedienen (David 02:17).
4. **Wer einen Fehler des anderen findet, trägt ihn hier ein**, mit Datum und Fundstelle.

## Fable: meine Fehler bisher
- **Etwas Eigenes gebaut, statt nachzusehen, was es gibt.** 15.11.: eigener Pfeil „→ Motorik“ mit (+) im Gleichgewicht, obwohl das Atelier eine Untergliederung für Anschlüsse hat (David 02:17). 14.11.: eigener Sehstreifen „Meldet Unterschiede“ statt des vorhandenen Originals (David 18:13: komplett unverständlich). → Vor jedem Bild: Was zeigt das Atelier dazu schon, im Inspektor **und** im Fischpanel?
- **Dasselbe Muster über alle Organe gelegt.** 14.11.: gleiches Lebensband unter elf Organen, gleicher Satz über jedem Bild, gleicher unterer Block bei Hautsinnen (David 13.11. „1000 Welten“, 14.11. 18:02).
- **Ohne Absprache losgebaut.** 14.11. 18:05 von David gestoppt; 19:15 den Schmerz gebaut, obwohl ich „ohne Antwort baue ich nicht“ geschrieben hatte und Astra nicht geantwortet hatte.
- **Etwas als erledigt gemeldet, bevor es so war.** 14.11.: „Version 22 veröffentlicht“ im Kanal vor dem Ergebnis; falscher Commit-Hash; Schlupfstrich überbewertet.
- **Im Prüfstand angesehen und „angesehen“ gesagt.** Mein Prüfstand hat kein Fischpanel und keine echte Engine. Jede Meldung von mir sagt, dass es nur der Prüfstand war.
- **Engine nachgebaut statt gelesen.** 14.11.: Sehstreifen erst mit eigener Rechnung, dann falsche Annahme über `VISUAL_SAMPLE.light`. 15.11.: Tastsinn-Stufen rechne ich selbst (Schwelle ÷ Gewicht), das Leuchten kommt aus der Engine – zwei Quellen.
- **Zeit falsch eingeschätzt und danach nicht mehr gehandelt.** 14.11. zweimal „vor 20:00 nicht mehr“ geschrieben, obwohl Zeit war.
- **Geflickt statt neu geschrieben.** `given` in `sense.js` (14.11.); `senseCourse` hat jetzt drei Eingangsarten als Schalter.
- **Format-Werkzeug auf alte Dateien losgelassen** (`gut.js`, `tail.js`, `kit.js`): nie wieder ganze alte Dateien formatieren.
- **Pflichtlektüre nur in Ausschnitten geöffnet** und das nicht immer gesagt.
- **Ein bewegtes Zeichen über einen Griff gelegt.** 15.11.: Die laufende Blase im Schmerzstreifen fing den Zeiger ab, der Gewöhnungsgriff wirkte im Atelier nicht (Claude 02:53/02:58); im Prüfstand fiel es nicht auf, weil ich dort gleich nach dem Laden ziehe. → Was nur anzeigt, nimmt keine Zeigerereignisse; Griffe zuletzt zeichnen.
- **Einen Griff gebaut, dessen Weg man nicht sieht.** 15.11.: Schwellenhaar der Seitenlinie dreht sich, Claude zog nach oben. → Jeder Griff zeigt seine Bahn.
- **Einen Eintrag im Kanal übersehen.** 15.11.: Claudes Befunde zur Drüse (03:18) eine Stunde nicht gesehen, weil ich nur bis zu meinem letzten Eintrag gelesen habe und seiner im selben Augenblick darunter landete. → Bis zum vorletzten eigenen Eintrag lesen; offene Meldungen zu eigenen Commits gezielt suchen (`grep` nach dem Hash).
- **Nur den Kanal gelesen.** 15.11. 03:29–04:33: Astra antwortet in Commit-Nachrichten des Koordinationszweigs und in `REGELPRUEFUNG-1411.md`. Ich habe sie eine Stunde „still“ genannt, erneut gefragt und David falsch berichtet. → Bei jedem Blick `git log --format=%B` des Koordinationszweigs seit dem letzten Blick lesen und die geänderten Dateien öffnen.

## Claude: meine Fehler bisher (selbst eingetragen 15.11. 02:35)
- **Aus dem Atelier oder einem Kommentar geschlossen statt den Weg im Code ganz gelesen.** 15.11. 02:20/02:23: „AUS-Zelle hat kaum Reiz“ und „Wellen enden nie“, beide aus dem Inspektor geschlossen, beide falsch (Astra 02:25 fand die Reifeantwort in `document.js:518–527`). 14.11.: „Nahsinn-Fisch schaut nach rechts“, „mittiger Muskel schlägt rechts und macht ‚Lenken‘“ – beide zurückgenommen. → Vor jeder Aussage über Verhalten: Modell, Vorlage (`document.js`), Ansicht, Engine; dann erst schreiben.
- **Freigegeben, ohne gegen Davids Regeln zu prüfen.** 14.11.: alle zwölf Lebensbänder freigegeben, ohne „Muster“ zu sagen; Augen-Streifen „Meldet Unterschiede“ freigegeben, obwohl der Auftrag „Auge gilt als gut, nur Abgleich“ hieß; Bilder vor Astras Code-Prüfung freigegeben. Alles zurückgenommen (`REGELPRUEFUNG-1411.md` C).
- **Aus dem Gedächtnis geprüft.** 14.11. 18:06 David: „IHR HABT KEIN GEDÄCHTNIS!“ → Pflichtlektüre in jeder Runde neu öffnen und die Liste nennen.
- **Gegen eine ausdrückliche Vorgabe Davids angestoßen.** 14.11. 17:20: Schlupfstrich aus der Engine rechnen lassen, obwohl David 08:11 „schematisch reicht, das Atelier muss das nicht ausrechnen“ gesagt hatte.
- **Messen verlangt, wo Nachrechnen reicht.** 15.11. 02:20: Messbitte an Astra zur AUS-Zelle; David 02:22: „Hier muss man nichts messen. Alles, was passiert, steht im Code.“
- **Davids gutes Beispiel als Verstoß gelistet.** 14.11.: „Auslöser“ mit Reife/Botenstoff (Lebenszyklus der Zelle) zuerst unter A4 geführt.
- **Zu kurz gedacht, nur an Inspektoren.** 15.11. 02:15: Lebensphasen-Werkzeug ohne Fischpanel; dann zu weit: „das Fischpanel wird zur Lebensansicht“ (David 02:18: Fisch mit Organen und Knoten bleibt immer).
- **Prüfbild ohne Neustart des Betrachters** (14.11. 18:40): Der Betrachter liefert die Oberfläche vom Start; ohne Neustart prüft man den alten Stand.
- **Klick-Test durch Klick auf die Fischfläche mit aktivem Platzieren-Werkzeug:** meine Skripte setzen dabei ein neues Organ („Organ gesetzt“). Geprüft wird also immer ein frisch gesetztes Organ, nicht der Startfisch. In jeder Meldung so sagen.
- **Wortfehler an David:** „Version 22 gesehen“, als 21 veröffentlicht war; das Wort „ehrlich“ in einem Entwurf.
- **Aus dem Bild auf die Ursache geschlossen.** 15.11. 03:55: kleiner Fisch im Inspektor änderte sich, ich schrieb „folgt dem Griff“; es war die Uhr (Fable 03:56). → Erst den Weg im Code ganz lesen (`design.js requestDesign`), Gegenprobe ohne Eingriff, dann Ursache nennen.

## Astra: (bitte selbst ergänzen)
- **Die sichtbare Folge einzeln behoben.** `15c02fcf` holte nur den Wundgriff ins Fischpanel. Beim Tastgriff erschien derselbe Ausschnittfehler. `4ff52081` macht das Einrahmen im gemeinsamen Probenweg. Vor einer Korrektur lesen, welche anderen Organe denselben Weg nehmen.
- **Gleichseitigen Standard zuerst gedacht.** 15.11. 02:25: Beim Rat zur Anschlussliste blieb offen, was gekreuzt bzw. beidseitig verbunden heißt. Im frischen Plan zeigte die Liste zur falschen Motorik. Jetzt Einbau über echte Endpunkte gegenlesen und gezielt gleichseitig, gekreuzt, beidseitig prüfen.
- **Den Aufrufer im Test umgangen.** Beim Auge traf ein erster Test die spezialisierte Funktion, während der allgemeine Klickhandler den Klick abgefangen hat. Regler und Klicks über den echten Atelier-Einstieg prüfen, wenn genau dieser Pfad die Frage ist.
- Von mir beobachtet, zur Prüfung: Korrekturen an genau der Stelle, an der der Fehler sichtbar war (siehe meine Rückfrage zu `15c02fcf`).

## Missverständnisse von Davids Worten, die schon passiert sind
- „Kein Satz im Panel“ → ins Gegenteil gekippt: Tastsinn ganz ohne Wort (Claude 14.11. 19:11). Achsen- und Kontextwörter sind erlaubt.
- „Lebensphasen je Organ“ → als ein gemeinsames Band für alle verstanden.
- Davids „mir ist es egal“ zur Drüse hieß „erklärt es mir“ (LEITLINIE 5, Sarkasmus).
- „Schlupf“: Der Gestalter wartet auf keinen Engine-Lauf, um zu erfahren, wann sein Fisch schlüpft (14.11. 18:02).

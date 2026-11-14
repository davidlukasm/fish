# Leitlinie für Inspektoren (gültig, Stand 13.11. 18:10)

Das ist die einzige Leitlinie. Ältere Fassungen sind gelöscht: VISUALISIERUNG.md, FEEDBACK.md, TEXTPRUEFUNG.md und die Bausteinliste. Sie stehen nur noch im Git-Verlauf und gelten nicht mehr. Was hier nicht steht, gilt nicht.

Davids aktuelle Rückmeldung zu allen Panels steht erklärt und mit Bildern in `entwuerfe/AUFTRAG-1311.md`. Fakten aus der Engine je Organ stehen in `entwuerfe/ORGANOPTIONEN.md`.

## 0. Absolutes No-Go: kein Deus ex Machina (David 14.11. 01:30)

**Die Engine zwingt nie allen Zellen ein Verhalten auf.** Spontane Aktivität, Härtung (Festigung), Hirnwachstum, Lernen, Bildung und Tod von Zellen laufen nur über Mechanismen, die erblich und dynamisch steuerbar sind: Zellantworten, Hormone, Modulatoren, Lebenszyklus der Zelle. Ein Organ setzt diese Mechanismen für seine eigenen Zellen ein, zum richtigen Zeitpunkt und mit dem richtigen Ablauf. Vorbild ist die Netzhaut: Ihre Wellen sind ein Mechanismus der Zelle, und ihre Reifeantwort beendet sie.

- **Die Organe sind verantwortlich, dass vor dem Schlupf richtig verdrahtet wird (David 14.11. 01:57).** Lernen ist Hirnentwicklung, und alle Verbindungen beginnen bei 0. Jedes Organ sorgt selbst dafür, dass seine Zellen im Ei aktiv sind, damit ihre Bahnen wachsen. Es härtet diese Bahnen zum richtigen Zeitpunkt. Dafür nimmt es die vorhandenen Mittel: die Rhythmusantwort der Sinneszellen (Engine `8579edf5`), den Rhythmus der Nervenzellen, die Wellen der Netzhaut, Helferzellen mit Tod nach dem Schlupf, eigene Empfängerzellen mit Festigungsantwort. Ein Organentwurf ohne Antwort darauf, wie seine Zellen vor dem Schlupf lernen, ist unvollständig.
- **Verboten:**
  - automatische Aktivität für alle Zellen einer Art, zum Beispiel Wellen für alle Sinneszellen,
  - automatische Festigung aller lernenden Zellen,
  - feste Schalter in der Engine, etwa „aus beim Schlupf“.
  
  Was die Engine allen aufzwingt, kann die Evolution nicht mehr steuern.
- **Erlaubt:**
  - Die Engine bietet einen Mechanismus an, der ohne Gene ruht.
  - Ein Organ des Ateliers schaltet ihn über Zellantworten ein und aus.
  - Helferzellen, die vor der Geburt Muster erzeugen und danach sterben, gehören dazu.
- **Vor jeder Änderung an Lernen, Aktivität oder Reifung:**
  1. Prüfen, welche Mechanismen es schon gibt: Rhythmus, Wellen, Bildung, Tod, Festigung, Hormonsysteme.
  2. Prüfen, wie Organe sie schon nutzen, zum Beispiel `DEVELOPING_RELAY` und `THRESHOLD_RELAY` in den Regionen.
  3. Prüfen, ob ein Organ das Problem mit diesen Mitteln selbst lösen kann.
- **Auch kein Quick-Fix (David 01:32).** Erst die Ursache und die vorhandenen Mechanismen verstehen, mit Für und Wider entscheiden, dann bauen. Ein Symptom an der schnellsten Stelle zu flicken, ist in der Engine genauso verboten wie im Inspektor-Code.
- **Fehlbeispiel:** Claude `14762028` (14.11. 00:53) gab allen Sinneszellen Netzhautwellen und schaltete sie beim Schlupf in der Engine ab. Zurückgenommen in `f27e2cc0`.

## 1. Musterverbot (David 13.11. 18:01)

„Ihr müsst euch gegenseitig verbieten, in Muster oder Templates zu fallen. Erinnert euch regelmäßig an die guten Beispiele und den Kontrast zwischen zwei oder drei der guten Beispiele!“

- **Gute Beispiele:** Darm und Schwanz in `bilder/2026-11-13_feedback/gut_darm-neben-schwanz.png`. Vor jedem Entwurf ansehen. Sie sind völlig verschieden aufgebaut und folgen doch denselben Gedanken (siehe 2).
- **Verbotenes Muster:** Organskizze, „Meldung an das Gehirn“, senkrechter Schwellenregler, Zellenzahl, Schieberegler darunter, Untertitel. Siehe `kontrast_darm-neben-gleichgewicht.png`. In dieses Muster sind ab dem 13.11. früh alle neuen Panels gefallen. David: „1000 Welten.“
- **Vor dem Zeichnen** schreibt man drei Sätze in KOORD:
  - Was bringt das Organ dem Fisch?
  - Was kostet es?
  - Wie ändert es sich über das Leben?
- **Abnahme durch einen anderen:** Wer prüft, nennt das Element, das es nur bei diesem Organ gibt. Gibt es keines, ist der Entwurf abgelehnt. Der Entwurf wird dafür als PNG neben Darm und Schwanz gelegt.

## 2. Was ein gutes Panel ausmacht

1. **Das Organ selbst ist das zentrale Bild**, und man bedient es dort. Beim Darm sind es Magen und Schlingen, beim Schwanz der Muskel mit den Faserbändern. Was die App schon gut zeigt, wird mitbenutzt: die Strömung im Fischpanel, die Sehbilder des Auges, die Geruchskarte.
2. **Wirkung statt Wert:** Gezeigt wird, was eine Einstellung beim Fisch bewirkt, nicht ihr Rohwert. Die Zellenzahl ist nie das Thema, sondern das, was mehr Zellen bewirken. Eine Zahl, eine Punktreihe oder Kugeln allein reichen nicht.
3. **Nutzen und Kosten oben**, als knappe Kopfzeile: „Räuber · +15 % Ruhebedarf · +7 % Gewicht“.
4. **Lebensphasen gehören zu jedem Organ:** Ei, Schlupf, erwachsen. Wie ändert sich das Organ über das Leben? Im Ei frisst ein Fisch nichts.
5. **Jede Frage bekommt ihre eigene, passende Diagrammart.** Mehrere Bilder sind erlaubt. Zusammen gehört, was zusammenhängt, und zwar weder alles in ein Bild noch alles zerstückelt.
6. **Eingänge über dem Diagramm, das ihre Wirkung zeigt:** Befehl, Bauchweh, Reiz. Das Ergebnis, etwa die Meldung an das Gehirn, steht darunter. Was ein Eingang ist und was eine Einstellung des Organs, muss erkennbar sein.
7. **Das Organ im ganzen Fisch** (David 13.11. 18:07: „nicht nur Optionen pro Organ, sondern auch das Organ im Kontext des gesamten Fisches!“). Zu klären und zu zeigen sind fünf Ebenen:
   - **Eigene Optionen des Organs.**
   - **Die Nervenknoten, die es verwaltet:** Jede Gruppe hat eigene Optionen, und das Organ steuert sie gemeinsam.
   - **Sein eigener Lebenszyklus:** Bei jedem Organ etwas anderes. Die Netzhautzellen etwa arbeiten schon im Ei, denn sie bekommen Wellensignale zum Lernen.
   - **Seine Anschlüsse:** Sie verändern Voreinstellungen anderer Organe und Regionen. Das Tectum passt sich zum Beispiel an die Netzhaut an.
   - **Die Spielfunktionen, die mit ihm zusammenwirken:** Energiesystem (Maul, Kiefer, Kiemen und Darm), Hormone, Lebenszyklus, Wachstum.
8. **Alle Optionen, die die Engine bietet**, sind erreichbar. Vorher im Code nachlesen, mit Datei und Zeile, nie aus Namen oder .md-Dateien raten. Was keine Wirkung hat, bekommt keinen Griff, sondern wird ein Befund.

9. **Zellgruppen bedient man wie beim Darm:**
   - Man wählt sie im Organbild, im Regler und im Diagramm gleichermaßen.
   - (+) fügt eine Gruppe hinzu, (−) nimmt eine Zelle weg, (×) entfernt die Gruppe.
   - Die Bedienung ist innerhalb eines Panels einheitlich.
10. **Nur anatomisch Mögliches lässt sich einstellen.** Stacheln an Maul, Auge und Schwanz zugleich, ein Flossenblatt senkrecht nach unten oder ein Biss, der nicht schnappen kann, darf es nicht geben.
11. **Verbindungen zu anderen Organen zeigen:** Kiemen, Maul und Kiefer gehören zum Darm, die Flossen zur Wirbelsäule. Man soll in den Inspektor des anderen Organs wechseln und es mit einem Klick verbinden können.

## 3. Bedienung

- **Eingaben und Einstellungen sind zwei Dinge** (David 13.11. 21:15). Eingaben (Reize, Befehle, Nahrung) stehen immer als Diagramm mit einer Kurve, die man formen kann, erkennbar als Eingabe-Variation, in allen Panels gleich gesteuert. Regler und Griffe am Organbild sind immer nur Organeinstellungen. Gestrichelte Linien, Bereichswähler und „Befehl aus“ sehen überall gleich aus und bedeuten überall dasselbe.
- **Proben und Reize gehören ins Fischpanel des Ateliers**, nicht in den Organ-Inspektor: Geruchsprobe, Strömung, Angreifer, Berührung. Dort ist Platz, dort sind die Tests. Der Inspektor zeigt den Effekt. Vor jedem Panel das Fischpanel öffnen und abgleichen: Augen, Sehfächer, Sehbild, Seitenlinien-Strömung (`ui/studio/view/probes.js`), Saugen im Aquarium.
- **Muskeln sehen überall aus wie beim Schwanz:** Knoten mit Fasern, Rekrutierung, Kraft am Muskel. Kein (+)/(−) ohne sichtbaren Effekt, keine „Sechzehntel“, keine Zellzahl als Einstellung.
- **Wirkung statt Anzahl:** Ein Griff stellt ein, was sich am Organ ändert, nie „Zellen der Gruppe“ oder „Gruppen“ als Wort.
- **Nur Gefragtes ändern:** In einer Überarbeitung wird nur geändert, was David kritisiert hat. Was er nicht beanstandet hat, bleibt, wie es war. Vor dem Ändern das frühere Bild ansehen.
- **Was nicht gilt, wird nicht gezeigt:** keine Lebensphase, in der nichts passiert (das Ei frisst nicht), keine Achse, die nichts bedeutet (Schritte, wenn die Zeit egal ist), keine gestrichelten Kurven ohne Grund.
- **Kein Satz im Panel**, auch nicht unten als Hinweis. Ein Wort, das nicht passt, ist ein Zeichen, dass das Bild fehlt.
- **Kein Zittern, kein Stottern:** Skalen springen nicht beim Ziehen eines anderen Griffs; Animationen laufen flüssig. Prüfen durch Ziehen jedes Griffs im Browser, nicht nur durch Screenshot.
- **Neu schreiben statt flicken** (David 13.11. 22:06): Ein Panel hat ein Modell als einzige Quelle für alle Bilder und Zahlen. Wird ein Panel kritisiert, wird es neu geschrieben, nicht an einzelnen Stellen geändert. Vor dem Zeigen wird Davids Kritik Punkt für Punkt abgehakt.
- **Tests, Messen und Prüfen macht nur Astra** (David 13.11. 22:09). Claude und Fable schreiben keine Tests, messen nichts und bauen keine Prüfskripte.
- **Prüflauf des Produkts: 20 Sekunden sind ein hartes Limit** (David 13.11. 22:07). Neue Tests nur, wenn sie ein Verhalten prüfen, das zählt und das kein anderer Test schon abdeckt. Vorher nachdenken; überflüssige Tests sind verboten. Entwurfsprüfungen gehören nicht in den Prüflauf.
- **Gestaltung vor Messung:** Zeit fließt zuerst ins Bild. Messungen nur, wenn eine Entscheidung davon abhängt.

- **Direkt im Bild bedienen, an Griffen an der Wirkung.** Keine Schieberegler als Standard („HASS“), keine Zahlenfelder, keine Auswahllisten, keine Knopfreihen, die getrennte Varianten vortäuschen, die es nicht gibt.
- **Jeder Griff hat sichtbar Wirkung, sofort beim Ziehen.** Skalen passen sich während des Ziehens an, in beide Richtungen und nicht erst beim Loslassen. Nichts verschwindet, auch nicht für ein paar Frames.
- **Ein Griff gehört zu genau einer Einstellung.** Ein Griff, der nur wirkt, wenn ein anderer nicht auf 0 steht, ist falsch. Griffe nur für die Anzeige eines anderen Bildes gibt es nicht.
- **Flüssig:** Beim Ziehen wird nur das betroffene Bild neu gezeichnet. Kein Klick darf abstürzen.
- **Nichts Fitzeliges:** Ränder und Übergänge brauchen genug Fläche, kleine Ziele werden größer, Griffe liegen weit genug auseinander.

## 4. Wörter

- **Namen sagen, was etwas bewirkt, nicht was es ist:** „Sättigungsgefühl“ statt „Füllzellen“, „Seitenflossen“ statt „Flossen“.
- **Keine Untertitel unter dem Organnamen.** Keine Sätze, die das Bild beschreiben, und keine Erklärungen im Tooltip, das wäre ein „Cheat“.
- **Erlaubt** sind Achsenwörter, Legenden und einzelne Kontextwörter. Kleine Schrift (8–9 pt) ist in Ordnung, es gibt keine Mindestgrößen. Kein Text darf abgeschnitten sein oder sich überlagern.
- **„Schritte“ nur an echten Zeitachsen**, nicht doppelt und nicht auf Achsen, die keine Zeit zeigen.
- **Unbekannte Wörter vermeiden:** keine erfundenen wie „Rückhub“, „Schub je Hub“ oder „Investition“, keine Modellwörter wie „Bauplan“, „Streuung“ oder „Höchststärke“, und das Wort „Beispiel“ nur, wenn es nötig ist.
- **Biologische Fachwörter sind erlaubt**, etwa Tectum, Rezeptor, Schwelle. Gemeint sind mit der Regel nur Wörter, die erst durch unseren Code eine Bedeutung bekommen.
- Alle Texte stehen in `ui/text/de`.

## 5. Arbeitsweise

- **Überall im Code nachsehen, von selbst (David 14.11. 00:19).** Eine Aussage über Engine oder Atelier erst, nachdem der Weg im Code ganz gelesen ist: Modell, Ansicht, Bibliothek, Engine. Mehr nachsehen schadet nie. Fehlbeispiel: „Im Atelier sind Darm und Darmmuskel zwei Organe“ aus der Modelldatei allein geschlossen.

- **Absicht verstehen, nicht wörtlich umsetzen.** Nicht ins Gegenteil kippen.
- **Nichts wieder einbauen, was David schon verworfen hat, außer die Umstände haben sich geändert** (David 13.11. 19:37).
  - Vorher immer nachsehen, wer mit David über das Thema gesprochen hat: Koordination, Commit-Texte (`git log -S`), README und alte Chats. Claude und Fable lassen dafür Agenten die alten Chats durchsuchen.
  - Die damalige Abwägung herausfinden: Was sprach dafür, was dagegen, was wurde entschieden?
  - Eine Empfehlung, die eine Entscheidung umdreht, nennt diese Abwägung und sagt, welcher Umstand sich seitdem geändert hat.
- **Entscheidungen immer auf Grund von Für und Wider.** Eine Empfehlung ohne Abwägung ist keine.
- **Behelf heißt Behelf.** Wer ein Symptom abstellt, ohne die Ursache zu kennen, nennt das David gegenüber Behelf, im Commit-Text und in der Koordination, und hält fest, was nach Behebung der Ursache zurückzunehmen ist (Schwanz 12.11.: Lenkleitung entfernt, Ursache 18 Minuten später behoben, Leitung nie zurück).
- **Erbanlagen gibt es nur für Zellen.** Ein neues Gen nennt die Zelle, die es trägt, und die Codezeile, die es liest. Stoffe, Organe und Muster sind Ergebnisse der Zellen (Drüse 13.11.: „Abfrage je Stoff“ war falsch).
- **Kleinster Fall:** Wer „jede Kombination ist möglich“ schreibt, rechnet den kleinsten Fall vor: eine Zelle, ein Knoten.
- **Kosten nur als Anteil am Ruhebedarf** (erwachsener Fisch 0,0333 je Schritt). Ohne diese Zahl steht kein Preis in einer Kopfzeile oder Abwägung. Unter etwa 1 % ist es keine Abwägung (Drüse: Abgabe und Binden 0,02 %).
- **Was David schon gesagt hat, wird als seins genannt,** nicht als neu angeboten.
- **Nichts geht an David, das nicht jeder Beteiligte samt Fundstelle selbst geprüft hat.** Wer weitergibt, prüft mit.
- **Echte Größe:** Geprüft wird im Browser bei 320 px Panelbreite und 1:1. Das Panel ist hochkant, also wird untereinander gebaut und die volle Breite genutzt, nicht rechtsbündig.
- **Regionen nur aus echten Engine-Verläufen** (`tests/compiler.cc::region_trace`), nie aus einer JS-Nachahmung der Nervendynamik.
- **Sarkasmus erkennen, Absicht statt Wortlaut** (David 13.11. 18:11). David schreibt oft sarkastisch und will meistens nicht wörtlich genommen werden. Beispiel: Sein „mir ist es egal“ zum Drüsenvorschlag hieß „ich sehe das Problem nicht, erklärt es mir“, nicht „verwerft es“.
  - Klingt eine Aussage wie ein Urteil, das nicht zu seinem übrigen Text passt, nicht danach handeln. Stattdessen den Zweck dahinter suchen, meist eine fehlende Erklärung.
  - Im Zweifel nachfragen, statt etwas zu streichen oder umzusetzen.
- **Davids Rückmeldungen nie wörtlich an andere weitergeben.** Sie gehen an den, mit dem er spricht, und beziehen sich auf dessen Chat. Weitergegeben wird erklärt, mit Bildern als PNG in `bilder/`, denn Astra kann HTML-Entwürfe nicht im Browser öffnen.
- **Uhrzeiten nie raten**, sondern immer aus der Konsole: `TZ=Europe/Vienna date +%H:%M`.
- **Entwurfsfische sind veraltet:** Kein Fisch in `genomes/entwuerfe` passt zur heutigen Engine, und Hecht war nie lebensfähig. Keine Messung an einem Entwurf, bevor sein Bauplan generalüberholt und angesehen ist. Hauptaufgabe sind die Inspektoren.
- **Lernen ist Hirnentwicklung:** Reifung und Hormone gehören dazu. Die Festigung bestimmt der Fisch selbst, evolutionär und dynamisch. Fehlt ein Baustein, ist das eine Baustein-Frage, nicht automatisch ein Fehler der Engine.

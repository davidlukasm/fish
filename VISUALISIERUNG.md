# Bilder und Visualisierungen im Inspektor: Davids Prinzipien

Stand 12.11.2026, 16:2x Wien. Zusammengetragen für Claude, Astra und Fable.
Alle Uhrzeiten sind Wiener Ortszeit (UTC+1), sofern nicht anders angegeben.

**Rangfolge (Davids Ergänzung vom 12.11. 16:16, über den Koordinator weitergegeben):** Neuere Aussagen haben Vorrang vor älteren. Wo sich etwas widerspricht oder verschoben hat, gilt die neuere. Die Prinzipien unten sind deshalb nach den Aussagen vom 12.11. ausgerichtet. Ältere Zitate stehen in Teil B, und wo sie überholt oder relativiert sind, ist das vermerkt.

## Kurzfassung in fünf Sätzen

1. Ein Inspektorbild zeigt, was eine Einstellung beim Fisch **bewirkt**, nicht welchen Wert sie hat. Dazu muss man vorher im Code nachlesen, was sie tut, und zwar für jedes Organ und jeden Inspektor einzeln.
2. Das Bild muss **ohne Tooltip** verständlich sein. Wenige Achsenwörter, Legenden und Kontextwörter sind erlaubt, auch in kleiner Schrift. Text ist eine Stütze und kein Ersatz.
3. **Sinnvolles kombinieren:** nicht ein Bild pro Organ, nicht alles in eines gepresst und auch nicht alles zerstückelt. Zwei, drei oder acht Bilder sind in Ordnung, wenn jedes Zusammenhang zeigt.
4. **Platz nach Bedeutung:** Simples wie die Zellzahl braucht kaum Platz (höchstens eine kleine Zahl). Das Panel ist hochkant, also untereinander bauen und die Höhe nutzen. Beurteilt wird in echter Größe.
5. Davids Worte sind **Absichten, keine Wortlaut-Befehle**. Nicht wie ein Dschinn wörtlich umsetzen und nicht beim nächsten Einwand ins Gegenteil kippen, sondern nachdenken, was er erreichen will.

---

## A) Prinzipien

### 1. Zeige, was die Einstellung bewirkt, nicht den Rohwert

**Regel:** Jede Einstellung wird über ihre sichtbare Folge für den Fisch dargestellt und dort eingestellt. Die Zahl selbst ist Nebensache.

**Was David meint:** Die zentrale Frage lautet: „WAS IST DIE AUSWIRKUNG DER EINSTELLUNGEN UND WiE KANN MAN ***DAS*** VISUALISIEREN!“ (12.11. 16:02). Bei der Zellzahl heißt das: Was ändert sich am Fisch, wenn er mehr Zellen hat? Dort gehört der Griff hin. Das gilt seit Beginn des Ateliers („dass man *sieht* was sich ändert, wenn man eine Einstellung ändert“, 03.11.). Am 04.11. sagte er: „Keine sichtbare Auswirkung bedeutet auch immer, dass man gar nicht weiß, was diese Einstellung überhaupt sein soll/tun soll.“

**Was er ausdrücklich NICHT meint:**
- Den Rohwert hübsch darstellen, also Punktreihe, Kugelraster, Zähler „4 Zellen“ oder einen Balken „± n %“. Dazu sagte er: „SOGAR EINE PUNKTREIHE IST SCHON ZUVIEL!“ (16:05).
- Eine allgemeine Zeitkurve, die nur das Modell nachzeichnet, wie „Gewöhnung: Antwort über Zeit“. Sie „SAGT EINEM NICHTS, DER DEN CODE NICHT KENNT!“ (16:02).
- Ein Symbol, das nur den Zustand eines fiktiven Bauteils zeigt, zum Beispiel eine Pupille an oder aus. Gefragt ist: „Wie ändert sich das, was der Fisch sieht?“ (13:34)

**Gut (belegt):** Die Darm-Verwertungskurve (333d7573). Sie zeigt, wie gut Pflanzen und Fleisch bei jeder Darmlänge verwertet werden, und die eigene Länge ist darin ziehbar. Diese Kurve hat David selbst als Beispiel genannt (13:55; Idee vom 05.11. 16:52). Ebenfalls gut: Sehfächer und Testobjekt beim Auge. Dort sieht man, was die Netzhautzellen melden, und David nannte es „SUPER. Genau so!“ (05.11.).
**Schlecht (belegt):** „Unterschiede neuer Zellen“ als Kugelsäulen mit dem Tooltip „Die äußere Zelle ziehen. Wie stark neue Zellen voneinander abweichen.“ Davids Urteil (13:59): „bedeutet dieser Satz genau nichts“. Ebenfalls schlecht: Zellzahl als Kugeln, 4×4-Kugerln oder Punktreihe.
**Offen, noch nicht von David beurteilt:** Claudes Analyse von 16:09 für die Muskeln (Tabelle Einstellung → Wirkung im Code → Folge → Darstellung, etwa „Zug je Befehl“ statt Spindel). Sie folgt genau diesem Prinzip.

### 2. Erst im Code verstehen, dann für jedes Organ einzeln entwerfen

**Regel:** Vor jedem Bild steht die Frage, was die Einstellung im Code tut (Engine, Entwicklung, Atelier-Compiler, mit Datei:Zeile). Erst danach wird für genau dieses Organ und genau diesen Inspektor eine eigene Darstellung erdacht.

**Was David meint:** „du musst dafür IN DEN CODE SCHAUEN. Das ist, was ich IMMER SCHON dabei wollte! VERSTEHEN, WAS DIE EINSTELLUNGEN BEDEUTEN! Und das wird wohl INDIVIDUELL PRO ORGAN UND INSPEKTOR ZU ERARBEITEN SEIN!“ (16:05). Diese Forderung steht schon im Grundkonzept vom 03.11.: Jedes Organ soll „*einzeln* mit der Engine durchgegangen“ werden, um zu „sehen, was die Parameter aus dem CPPN für das jeweilige Organ eben bedeuten“. Am 04.11. ergänzte er: „für jedes Organ muss man sich […] die besten UI-Elemente AUSDENKEN.“ Am 05.11.: „Nicht ‚one size fits all‘!“

**Was er NICHT meint:**
- Ein gemeinsames Griff-Set für alle Sinnesorgane (Zellen, Empfindlichkeit, Schwelle, Gewöhnung) in jedes Bild setzen.
- Ausprobieren, messen und rendern statt nachzudenken. Er schrieb von den KIs, „well sie dumm testen anstatt zu denken“ (16:05).
- Aus Namen oder Texten raten, was etwas bedeutet. Das hielt schon die Vorgabe vom 10.11. fest: Code lesen statt aus *.md-Dateien raten.

**Gut:** Der Auftrag von 16:06 in KOORDINATION, eine Tabelle je Inspektor („Einstellung → Wirkung im Code (Datei:Zeile) → sichtbare Folge für den Fisch → Darstellung“), und Claudes Muskeltabelle von 16:09.
**Schlecht:** `sense_marks.js`, also gemeinsame Griffe mit sichtbaren Wörtern für alle Sinnesbilder (58fe804e). Das ist eine Einheitslösung, die keine Wirkung zeigt.

### 3. Ohne Tooltip verständlich, denn eine Erklärung im Tooltip ist ein „CHEAT“

**Regel:** Wer den Code nicht kennt, muss das Bild verstehen, ohne mit der Maus darüberzufahren.

**Was David meint:** „Visualisierungen haben immer genau einen Sinn: Etwas verständlich zu machen. Wenn sie das nicht tun, sondern *immer* noch auf Text angewiesen sind (der in eurem Fall als Tooltip ja nur versteckt ist! Ein CHEAT!), sind sie nicht gut“ (13:59). Und: „das Verschieben bzw. Neuschreiben von Erklärungen in den Tooltip hätte euch verraten müssen, dass etwas nicht passt.“ (14:00). Jeder Satz, der in einen Tooltip wandert, ist also ein Warnzeichen für das Bild und kein gelöstes Problem.

**Was er NICHT meint:**
- Den Tooltip-Text einfach sichtbar ins Bild schreiben, also dasselbe Problem mit sichtbarem Text. Beim Bild selbst ansetzen.
- Werte, Bedeutungen oder Namen „im Tooltip der Griffe“ ablegen (42a87eda) oder „Erklärungssatz und Abschnittstitel im Tooltip“ (f20fafe7).
- Hirnregionen nur per Tooltip kennzeichnen: „Und die Hirnregionen haben auch nur einen Tooltip - Same mistake.“ (14:08)
- Davon unberührt ist ein kurzer Beschreibungssatz im Baukasten (Hover über ein Bauteil, „ein Satz - nicht zu viel Text“, 05.11. 09:40). Das ist eine Benennung im Baukasten und kein Ersatz für ein verständliches Inspektorbild.

**Gut:** Regionssymbole sichtbar im Fischbild (71b48d25). Wieder sichtbare Beschriftung im Sehbild, „Licht am Auge“ und links/vorne/rechts (a4f9d0c9).
**Schlecht:** Die Kugelsäulen der Zellstreuung mit Tooltip. Der CPPN-Zellhaufen „Werte und `compiler.extraMeaning` stehen im Tooltip“ (224d7e6d).

### 4. Text stützt das Bild, ersetzt es aber nicht, und Weglassen ist nicht das Ziel

**Regel:** Achsenbeschriftungen, Legenden und einzelne Kontextwörter gehören dazu. Erklärsätze, die ein schlechtes Bild retten sollen, gehören nicht dazu. Alles ist i18n-fähig in `ui/text/de`.

**Was David meint:** „Ausnahmen bestätigen die Regel - Achsenbeschriftungen oder Legenden sind schon in Ordnung. Das eine oder andere Wort auch - zumindest, um Kontext zu erzeugen. Es darf halt nicht zu viel, zu überladen oder zu komplex sein.“ (13:34). Schrift darf klein sein: „Ich kann wohl auch noch mit 8 oder 9 pt kleinen Beschriftungen leben - sie sind egal, Text soll ja nicht im Vordergrund stehen!“ (15:53). Das Grundprinzip vom 06.11.: „Texte sollen unterstützen - sie sind kein Ersatz für eine intuitive Darstellung.“

**Was er NICHT meint:**
- **Alle Texte entfernen.** Das wurde schon zweimal übertrieben (leerer Inspektor am 06.11. und am 12.11.: „da habt ihr schon einmal mit dem Textkürzen übertrieben“, 13:43). Achsenwörter in Tooltips zu verschieben (e3eaf696) war ebenfalls falsch.
- **Mindestgrößen für Schrift oder Griffe einführen:** „Nein, Mindestgrößen sind nicht sinnvoll.“ (15:53). Kleine Schrift ist nicht das Problem, überladene Bilder sind es.
- **Ein überladenes Bild mit Wörtern flicken,** etwa „4 Zellen“, „Empfindlichkeit“, „Gewöhnung 14 Schritte“ an die Griffe schreiben (58fe804e). Wenn Wörter nötig werden, damit man die Griffe auseinanderhält, ist das Bild zu voll.
- Einzelne Wörter ohne Kontext: „Sie dürfen jedenfalls so nicht vorkommen und wahrscheinlich auch die Alternativen nicht ohne Kontext (also niemals alleine).“ (06.11. 22:49)

**Gut:** Augenstreifen mit beschrifteter Achse (erregt oben, hemmt unten). David hatte das am 05.11. selbst vorgeschlagen („statt der Legende unten eine Y-Achse links, mit dem erregt oben und dem hemmt unten“). Die wiederhergestellten Texte im leeren Inspektor (Überschrift, Arbeitsablauf mit Beschreibungen).
**Schlecht:** Erklärungssätze unter Bildern („Die Kurven zeigen …“). Ebenso „Texte einfügen anstelle von Visualisierungen“, was David am 06.11. „den größten Fehler von allen“ nannte.

### 5. Sinnvolles kombinieren, nicht alles in ein Bild und nicht alles auseinander

**Regel:** Ein Bild zeigt einen Zusammenhang, der zusammengehört. Was nicht zusammenpasst, bekommt ein eigenes Bild. Mehrere Bilder je Inspektor sind ausdrücklich erlaubt, und ein Wert darf an mehreren Stellen einstellbar sein.

**Was David meint:** „Ziel ist nicht, dass es *ein* Bild pro Inspektor/Organ gibt; sondern dass sinnvolle Dinge in Kombination in einer guten Darstellung kombiniert werden. Derzeit ist *zuviel* in eins gepackt […] Du kannst auch gerne zwei, drei oder acht verschiedene Visualisierungen haben […] Ein Wert oder eine Wertekombination kann ja auch an *verschiedenen* Stellen geändert werden.“ (13:55). „DIE BILDER SIND DAS PROBLEM - fitzelige Bedienung, weil zu viel in eins gepackt!“ (15:53) „Zu viel, das nicht unbedingt zusammenpasst - DEIN Missverständnis von gestern/vorher, dass alles unbedingt in ein gemeinsames Bild muss, auf Biegen und Brechen!“ (15:54)

**Was er NICHT meint:**
- **„Ein Bild je Organ“ oder „je Zusammenhang EINE Grafik, und die Grafik ist die Eingabe“.** So hatten die KIs die Nachtaussagen vom 12.11. (01:41, 05:49) verstanden. Das ist überholt (siehe Teil B).
- **Ins Gegenteil kippen** und jede Einstellung in ein eigenes großes Bild stecken: „Bitte jetzt nicht wieder ins Gegenteil schwanken und alles wie vorher machen! ÜBERLEG DIR, WAS ANGEMESSENE VISUALISIERUNGEN SIND!“ (16:02)
- Kurven unter ein Bild hängen, die man nicht versteht. Am 12.11. 05:49 hatte er die zwei Kurven unter dem Sinnesbild verworfen, weil sie unverständlich waren, und nicht, weil es zwei Bilder waren.

**Gut:** Darmbild und Verwertungsdiagramm als zwei Bilder, die beim Ziehen gemeinsam mitgehen (931fea29). Die Länge ist an beiden Stellen ziehbar.
**Schlecht:** Das Seitenlinienbild, in dem laut Code-Kommentar „One picture holds the whole organ“: Poren mit Zellen, Feldkeule, Breite und Gewöhnungsbogen ums Bild, alles in einem SVG (lateral.js). Ebenso Muskelorganbilder mit Spindel, Faserkuchen und Schwelle samt Bewegungsgriff in einem Bild (vor 5ca7ebaf).

### 6. Platz nach Bedeutung, Simples bleibt klein, nichts ist fitzelig

**Regel:** Wie viel Fläche und Aufmerksamkeit ein Element bekommt, hängt davon ab, wie wichtig und wie komplex es ist. Griffe liegen so weit auseinander, dass man sie in echter Größe sicher trifft.

**Was David meint:** „Für so etwas simples wie die Zellzahl sollte nicht viel Platz verschwendet werden. Es muss klar sein. Es kann wo integriert sein, es muss nicht.“ (16:02). „Wieviele es sind, kann irgendwo klein als Zahl angezeigt werden. Oder als DAS, WAS ES BEDEUTET!!!!“ (16:05). Grafiken sind „oft zu klein und fitzelig“ und „In Klein sind sie borderline unbedienbar!“ (15:48). Schon am 04.11. sagte er zur Zellzahl: „verschwendet viel zu viel Platz für so etwas basales“. Am 06.11.: „Kugelansicht, die ich hasse, weil Platzverschwendung“.

**Was er NICHT meint:**
- Alles größer machen, Mindestgrößen setzen oder das Panel verbreitern (siehe Prinzip 7). Fitzelig wird es, weil zu viel auf zu wenig Fläche liegt.
- Der Zellzahl ein eigenes Bild oder eine eigene Reihe geben. Auch Claudes Vorschlag einer „schmalen Punktreihe mit Zahl“ (16:03) war schon zu viel (16:05).
- Winzige Symbole, die man nicht unterscheiden kann („um den Faktor 5 zu klein“, 06.11.).

**Gut:** Zellzahl als kleine Zahl am Rand oder ganz in der Wirkung aufgelöst, etwa als mehr Zug oder mehr Reichweite.
**Schlecht:** 4×4-Kugerln (am 12.11. von Astra versehentlich wieder eingebaut). Der Zellstreifen von 16:03, den Claude nach Davids Einwand nicht gepusht hat. Eng beieinanderliegende Griffe, die erst bei Vergrößerung trennbar sind.

### 7. In echter Größe beurteilen, das Panel ist hochkant

**Regel:** Inspektorbilder werden für das schmale, hohe rechte Panel entworfen (Standardbreite 320 px), also untereinander gestapelt. Beurteilt wird 1:1, nicht vergrößert.

**Was David meint:** „du lässt sie dir nur vergrößert anzeigen! In Klein sind sie borderline unbedienbar!“ (15:48). „Und der Inspektor ist ein Panel im Hochformat. D.h. Höhe nutzen, nicht Breite.“ (15:56)

**Was er NICHT meint:**
- Das Panel standardmäßig breiter machen, damit die Bilder mitwachsen. Claude hatte es auf 400 px gestellt und wieder zurückgenommen.
- Breite Querformatbilder, die ins Panel gequetscht werden.

**Gut:** Mehrere flache, klar getrennte Bilder untereinander, jedes mit eigener Aufgabe, geprüft im Browser bei 320 px.
**Schlecht:** Screenshots mit `deviceScaleFactor` 2 beurteilen. Querformatbilder mit 9-Einheiten-Schrift, die am Schirm etwa 8 px ergeben, kombiniert mit 13-px-Griffen.

### 8. Erklärende Kurven und Diagramme sind erwünscht, wenn sie einen Zusammenhang zeigen

**Regel:** Ein Diagramm lohnt sich, wenn es etwas sichtbar macht, das man sonst nicht sieht (zum Beispiel einen nichtlinearen Verlauf oder Vor- und Nachteile). Interaktivität ist ein Plus, kein Muss.

**Was David meint:** „Und Kurven und Diagramme zur weiteren Erläuterung sind auch nicht schlecht - Stichwort z.B. Darm zur Verwertungseffektivität - weil man dann sieht, dass es nicht linear ist. […] solange sie nicht einfach nur eine Zahl anzeigen, sondern Kontext geben und im besten Fall (kein Muss!) auch interaktiv sind“ (13:55).

**Was er NICHT meint:**
- Eine Kurve, die das Modell abbildet, aber nichts erklärt: „Die Kurve selbst ist eben leider eine Visualisierung, die gar nichts erklärt.“ (06.11., Hormonkurve) und „eine Kurve, die so aussieht, als hätte sie nichts damit zu tun!“ (06.11.)
- Überladene Diagramme mit Nebengrößen: „Darm (Verwertung) - das Diagram ist auch ein bisschen überladen. Warum Sediment? Und Fassung im gleichen Diagramm lässt die anderen Kurven kleiner aussehen - könnte man anders darstellen oder einfach als Zahl belassen.“ (06.11.)
- Kurven nur für ein einzelnes Maß ohne Bezug, wie „Antwort über Zeit“.

**Gut:** Die Darm-Verwertungskurve mit Achsen, Futterzeichen und der eigenen Länge als Linie.
**Schlecht:** Die alten Kennlinien „Antwort“ und „Gewöhnung“ unter den Sinnesbildern. Die Rezeptorkurve in der Hormonanimation (06.11.).

### 9. Direkt im Bild bedienen, keine Regler, Zahlenfelder oder Auswahllisten

**Regel:** Wo etwas einstellbar ist, geschieht es über Griffe an der dargestellten Wirkung, nicht über Standardsteuerelemente.

**Was David meint:** „SLIDER sind so ca. die schlimmsten UI-Elemente: Sie bedeuten nur, es gibt ein Maß von 0% auf 100% - mehr auch schon wieder nicht.“ (04.11.). Seine Kritik an Zahlenfeldern wie „Schnelle Zellzeit in Schritten 13,86“: „Das ist das Gegenteil von intuitiver Bedienung! Das ist FIZZELEI.“ (12.11. 01:41). Ein Element darf mehrere Dimensionen abdecken, etwa Farbkurve mit drei Punkten und Testlicht im Spektrum (05.11.: „SUPER-Idee!“).

**Was er NICHT meint:**
- **„Möglichst viele Dimensionen in ein Element.“** Der Wunsch vom 04.11. („EIN UI-Element *mehrere* Dimensionen“) ist durch den 12.11. begrenzt. Es darf nur zusammenkommen, was zusammenpasst (Prinzip 5), sonst wird es fitzelig.
- **Jedes Bild muss bedienbar sein.** Ein reines Erklärbild ist erlaubt (13:55: „kein Muss!“).
- Knöpfe ohne Ordnung: „Unüberlegt an irgendeiner Stelle, ungruppiert; zu viele, nichtssagend; nicht selbsterklärend.“ (04.11.)

**Gut:** Spektrum mit Griffen und Testlicht. Sehfächer mit Testobjekt. Stoffrad („war schon eine gute Erfindung“, 05.11.). Schaltplan der Hirnregionen („Ausgezeichnet umgesetzt“, 06.11.).
**Schlecht:** Zahlenfelder im Abschnitt „Zellbildung, Aktivität und Tod“ (Screenshot `koord/bilder/2026-11-12_inspektor_fizzelei.png`). Schieberegler für Empfindlichkeit und Gegenfarbe beim Auge (04.11.).

### 10. Flüssig bedienbar, ohne Neuzeichnen-Lag

**Regel:** Beim Ziehen wird nur neu gezeichnet, was sich ändert, und die Rückmeldung kommt sofort.

**Was David meint:** „der Lag - das ständige Neuzeichnen - ist dabei furchtbar.“ (13:55). Früher: Das Testobjekt „sollte *direkt beim* Verschieben ständig upgedatet werden“ (05.11.). „Warum ist, wenn ich beim Lernen an Reglenr ziehe die Framerate auf 2FPS?!“ (06.11.)

**Was er NICHT meint:** Bilder vereinfachen, nur damit sie schneller sind, oder im Hintergrund eine Simulation für eine Anzeige starten („nur das, was für eine HÜBSCHE und INTUITIVE Anzeige nötig ist“, 04.11.).

**Gut:** `refreshDragged` (34b9de02). Beim Ziehen wird nur das gezogene Bild ersetzt, 95 % der Bilder liegen bei 17 statt 33 ms.
**Schlecht:** Jeder Zug baute den ganzen Inspektor neu (20–75 ms je Bild). Augen ziehen lief am 04.11. mit rund 5 FPS.

### 11. Absicht verstehen statt wörtlich umsetzen, Bewährtes nicht wieder verschlechtern

**Regel:** Davids Sätze sind Hinweise auf ein Ziel. Vor dem Bauen überlegen, was er erreichen will, im Verlauf (Chat, `git log -S`) nach früheren Lösungen suchen und nichts zurückdrehen, was schon besser war.

**Was David meint:** „Bitte nicht so dumm und STUR vorgehen, nicht wie ein Dschinnie, der alles wörtlich frisst, was ich sage.“ (15:53). Das ist ein altes Muster. Schon am 05.11. schrieb er: „NICHT stur und wortwörtlich abarbeiten bitte, sondern NACHDENKEN, PLANEN und so interpretieren, dass es wirklich auch GUT ZUSAMMENPASST.“ Und: „Die 4x4 Kugerln - die haben wir schon LANGE wieder entfernt gehabt. Warum sind sie schon wieder da?“ (12.11. 05:49). Ebenso zur Duftprobe: „das hatten wir auch schon einmal anders gelöst“ (14:19).

**Was er NICHT meint:**
- Nur den letzten Satz umsetzen und alles Frühere vergessen. Die älteren Grundsätze gelten weiter, soweit der 12.11. sie nicht verschiebt.
- Bei jedem Einwand pendeln: erst alles in ein Bild, dann alles auseinander, erst alle Texte weg, dann Mindestschrift. „nicht wieder ins Gegenteil schwanken“ (16:02).

**Typische Wortlautfehler dieser Tage:** „ein Bild pro Organ“ (aus „eine zusammenhängende Darstellung“), „alle Texte weg“ (aus „Bild statt Text“), „Mindestgrößen“ (aus „zu klein und fitzelig“), „Zellzahl als eigenes kleines Bild oder Punktreihe“ (aus „Zellzahl nicht mitten im Feld“), „Gewöhnung als Antwort über die Zeit“ (aus „eigene Darstellung für Gewöhnung“) und „Gehirnteile genau die aufgezählten Beispiele“ (05.11.).

---

## B) Zitate

**Quellen:**
- [M] Sitzungsmitschrift `90df0756-….jsonl` (Nutzernachricht oder Warteschlange, Ortszeit laut Systemhinweis)
- [Z] Zusammenfassung in `scratchpad/david_messages.txt`; deren deutsche Zitate wurden gegen den Chat geprüft und sind wörtlich
- [C] Haupt-Chat „Code-Review und Dichte“ (claude.ai, `read_conversation current`), mit Turn-Nummer
- [S] lokal gesicherte Chat-Auszüge: `scratchpad/chatscan/human_cached.txt`, `scratchpad/atelier_user_messages.md`, `scratchpad/feedback_1300.md`
- [K] `koord/KOORDINATION.md`, wörtlich nur, wo dort Davids Worte in Anführungszeichen stehen
- [F] Fables Chat „Fish-Projekt: Astra und Opus“ (claude.ai)

Innerhalb jedes Themas sind die Zitate absteigend sortiert (neueste zuerst). **[überholt]** oder **[relativiert]** markiert ältere Aussagen, die durch neuere verschoben sind. Auslassungen in Zitaten sind mit […] markiert.

### B1. Wirkung zeigen, Code verstehen, individuell je Organ

- **12.11. 16:05** [M, C] „Ja, das ist mehr Arbeit - du musst dafür IN DEN CODE SCHAUEN. Das ist, was ich IMMER SCHON dabei wollte! VERSTEHEN, WAS DIE EINSTELLUNGEN BEDEUTEN! Und das wird wohl INDIVIDUELL PRO ORGAN UND INSPEKTOR ZU ERARBEITEN SEIN!“
- **12.11. 16:05** [M] „SOGAR EINE PUNKTREIHE IST SCHON ZUVIEL! DIE ANZAHL DER ZELLEN - WAS **BEWIRKT** SIE!? DORT MUSS DIE EINSTELLUNG HIN. Wieviele es sind, kann irgendwo klein als Zahl angezeigt werden. Oder als DAS, WAS ES BEDEUTET!!!!“
- **12.11. 16:05** [M] „Bitte nutze deine Kollegen Fable und Astra auch für diese Frage. Bevor sie Stundenlang weiter an Fischen herumarbeiten, wo sie nicht verstehen, was die Probleme sind, well sie dumm testen anstatt zu denken.“
- **12.11. 16:02** [M] „Bitte jetzt nicht wieder ins Gegenteil schwanken und alles wie vorher machen! ÜBERLEG DIR, WAS ANGEMESSENE VISUALISIERUNGEN SIND! Für so etwas simples wie die Zellzahl sollte nicht viel Platz verschwendet werden. Es muss klar sein. Es kann wo integriert sein, es muss nicht. Eine "Gewöhnung" wie "Antwort über Zeit" - SAGT EINEM NICHTS, DER DEN CODE NICHT KENNT! WAS IST DIE AUSWIRKUNG DER EINSTELLUNGEN UND WiE KANN MAN ***DAS*** VISUALISIEREN! DAS IST DIE ZENTRALE FRAGE!“
- **12.11. 13:34** [Z, C 2793] „Bei AN/AUS sollte man auch den Effekt besser erkennen können, nicht nur dass irgendeine fiktive Pupille an oder aus ist. Wie ändert sich das, was der Fisch sieht? Oder ist das eh im Sehband abgebildet?“
- **06.11. 21:29** [S] „Bei den Animationen muss halt dann auch genau dieser zweite Hebel, was das Hormon konkret hier bewirkt noch eingebaut sein; derzeit ist es eine Kurve, die so aussieht, als hätte sie nichts damit zu tun!“
- **06.11. 20:56** [S] (zu Astras Befund über die Hormonansicht) „Das ist ein grundlegendes Problem. D.h. du musst noch einmal ALLE Hormonwirkungen direkt in der Engine und systematisch untersuchen.“
- **06.11. 20:42** [S] „Differentiator: Die Einstellung könnte man also einfacher visualisieren als jetzt? Es ist die Antwort auf die Frage, worauf reagiert die Zelle, Reiz oder Veränderung, oder? Bitte in den Visualisierungen berücksichtigen.“
- **06.11. 17:20** [S] „Nur die Symbole dafür alleine über den Zielen reicht nicht. Es braucht beinahe ANimationen, die darstellen können, was passiert... "merken"? "konkurrieren"? "takten"? Was sind das tatsächlich für Wirkungen? Wo kommen sie vor? WAS BEWIRKEN SIE? Das ist leider etwas, das nicht klar ist! Es braucht eine Gesamtlösung dafür...“
- **06.11. 15:35** [S] „Im Inspektor habe ich auch beim Regler-verstellen eben keinen Unterschied gemerkt, nirgends. Dann musst du dir eine bessere Visualisierung grundsätzlich überlegen.“
- **06.11. 13:01** [S feedback_1300.md] „Sperma und Ei - die Einstellungsgrafik verstehe ich nicht. Bitte anders lösen. Ich sehe hier nicht, was ich einstlele und welche Wirkung meine Einstellung(en?) haben.“
- **06.11. 13:01** [S] „Der Muskel sollte seine Größe, Länge oder Form verändern, wenn man ihn woanders platziert und er dadurch andere Eigenschaften hat! (Schon vergessen? ALLES muss irgendwie, intuitiv, sichtbar sein)“
- **06.11. 13:01** [S] „Bitte eben nicht alles immer als diese Strichmuskeln zeichnen. Individuell je ORGAN.“
- **05.11. 21:17** [S] „Empfindlichkeit und Gewöhnung bitte ebenso individuelle Darstellungen überlegen und umsetzen.“
- **05.11. 17:17** [S] „Und nein, bitte nicht einfach nur einen Hormonkasten machen und dann jede Funktion dorthineinpacken. Überlege dir eine eigene Lösung - sie kann aus dem Hormonkasten bestehen - aber wenn es bessere Dinge für andere Sachen gibt, dann lieber bessere Dinge! Nicht "one size fits all"!“
- **05.11. 16:12** [S] **[relativiert durch 12.11. 15:54–16:05: nicht „zwei in eins“ als Ziel, sondern die Wirkung zeigen]** „Und diese Kurven zu "Empfindlichkeit" und "Gewöhnung" könntest du auch nochmal für jedes Organ durchgehen und überlegen, ob da nicht eine bessere Darstellung (zwei in eins) existiert, die eben organspezifisch wäre.“
- **05.11. 13:13** [S] „ich meinte, dass mich stört, wenn alle Organe nur dieselben allgemeinen Regler haben, wenn es 1) bessere Optionen als Schieberegler gäbe und 2) es überhaupt bessere organspezifische UI-Elemente gibt, die mehr auf einmal abdecken können als ein einziger Regler und intuitiver auch noch wären.“
- **05.11. 08:29** [S] „UI-Elemente komplett ohne sichtbare Auswirkungen (alle Sinne - bis auf Auge); keine Legende für die Muskel-Bereiche“
- **04.11. 21:57** [S] „Abstraktion - Intuition - Individualität“
- **04.11. 21:57** [S] „Immer vom Prinzip ausgehend: Zeichnen und Atelierarbeit muss in erster Linie schön, intuitiv, klar, und kompakt sein - abstrahiert, etc.; aber ins Detail soll man auch gehen können“
- **04.11. 21:48** [S] **[relativiert durch 12.11. 15:53/15:54: nur, was zusammenpasst]** „Ich will die besten UI-Elemente, die intuitiv sind, und wo am besten EIN UI-Element *mehrere* Dimensionen an Einstellungen abdeckt. […] Und d.h. für jedes Organ muss man sich für alle möglichen Kombinationen eben die besten UI-Elemente AUSDENKEN. Nichts davon ist mit den Standard-Elementen "am besten" abgedeckt. Es gibt immer eine bessere, weil *spezifischere* Lösung.“
- **04.11. 21:46** [S] „Und: Was "Gegenfarbe" *bedeutet*, ___das____ ist, was nicht klar ist! Und das darunter ein Slider für Empfindlichkeit ist stört mich ebenso. Was bedeutet das?! Man SIEHT es nicht.“
- **04.11. 20:27** [S] „Farbe, Bandbreite, Gegenfarbe und Empfindlichkeit - VÖLLIG unklar, was hier eine Einstellung bewirkt. Schon wieder ein Schieberegler, wo man KEINE Auswirkung sieht. Ich bin sooo grantig.“
- **04.11. 16:34** [S] „Ich möchte das Auge per Drag-&-Drop-Platzieren; das müsste zu einer sichtbaren Änderung des Sehfelds / Blickrichtung führen, oder? Und wenn ich diese Optionen danach manuell mit Werkzeugen ändere, muss sich auch die Position des Auges ändern. So etwas meine ich mit, "dann sieht man die Auswirkung direkt."“
- **04.11. 13:19** [S] „Farbkontrast: Drei Buttons, keine sichtbare Auswirkung. Ausbreitung der Signale: falsche Beschriftung; keine sichtbare Auswirkung. Anzahl der Zellen: schlechte Beschriftung; schlechte Abstraktion; schlechte Bedienung - verschwendet viel zu viel Platz für so etwas basales. Keine sichtbare Auswirkung. Reizschwelle / Anpassungszeit: keine sichtbare Auswirkung. Keine sichtbare Auswirkung bedeutet auch immer, dass man gar nicht weiß, was diese Einstellung überhaupt sein soll/tun soll.“
- **04.11. 13:19** [S] „Das Gesamtorgan besteht aus vielen einzelnen Retinalzentren; und genau diese vielen, komplexen Informationen/Einzelzentren müssen passend kontrolliert werden - abstrahiert, vereinfacht, klare visuelle Darstellung.“
- **03.11. 21:46** [S] „Und auch hier muss man bei den Hormonen genau schauen, was im Code sie jeweils bewirken“
- **03.11. 21:34** [S] „Das ganze mit einer intuitiven Bedienung: d.h. ohne Erklärungstexte, sondern mit gut gewählten Visualisierungen, dass man *sieht*, was Einstellungen machen. Wie z.B. eben das Sichtfeld des Auges. Wichtig wäre dann, dass jedes Organ *einzeln* mit der Engine durchgegangen ist, dass jedes *Organ* ein individuelles Bearbeitungstab bekommt; bzw. auch die Knoten je Organ spezifische Eigenschaften bekommen. Dafür muss man eben jedes einzelne Organ durchgehen und sehen, was die Parameter aus dem CPPN für das jeweilige Organ eben bedeuten. Und das ist bei Retina natürlich anders als bei Nase. Gleichzeitig Dinge so vereinheitlichen, dass es nicht gleich überladen wird“
- **03.11. 21:34** [S] „Und das alles eben ohne zu kompliziert zu sein - mithilfe guter Visualisierung und intuitiver Bedienung.“
- **03.11. 21:09** [S] „dass man *sieht* was sich ändert, wenn man eine Einstellung ändert, anstatt das einem seltsame Worte oder Erklärungen entgegengeworfen werden, war ein Prinzip.“

### B2. Verständlich ohne Tooltip; Rolle von Text

- **12.11. 15:53** [M, C] „Nein, Mindestgrößen sind nicht sinnvoll. Ich kann wohl auch noch mit 8 oder 9 pt kleinen Beschriftungen leben - sie sind egal, Text soll ja nicht im Vordergrund stehen! Bitte nicht so dumm und STUR vorgehen, nicht wie ein Dschinnie, der alles wörtlich frisst, was ich sage.“
- **12.11. 14:08** [Z] „Und die Hirnregionen haben auch nur einen Tooltip - Same mistake. Sie sollten auch ein Symbol haben, bzw. auch beim Zeichnen.“
- **12.11. 14:00** [Z, C 2804] „Und das Verschieben bzw. Neuschreiben von Erklärungen in den Tooltip hätte euch verraten müssen, dass etwas nicht passt.“
- **12.11. 13:59** [Z, C 2802] „Und Visualisierungen haben immer genau einen Sinn: Etwas verständlich zu machen. Wenn sie das nicht tun, sondern *immer* noch auf Text angewiesen sind (der in eurem Fall als Tooltip ja nur versteckt ist! Ein CHEAT!), sind sie nicht gut, sorry. Beispiel: "Die äußere Zelle ziehen. Wie stark neue Zellen voneinander abweichen." - für jemanden, der den Code nicht kennt bedeutet dieser Satz genau nichts. Die Visualisierung zeigt nur Kugeln, die irgendwie weiter voneinander entfernt werden, aber irgendwie verbunden sind und symmetrisch sind. Es bedeutet für den User soviel wie: "Das Quadrat ist kantig. Wie viele Geburten im Zusagemodus aktiv sind, regelt das Drehen." - dazu ein Bild eines Hasens und eine Sägezahnkurve, deren Frequenz man einstellen kann.“
- **12.11. 13:43** [Z, C 2798] „Texte: V.a. die Texte im leeren Inspektor wiederherstellen, bitte. Das Thema hatten wir auch schonmal, da habt ihr schon einmal mit dem Textkürzen übertrieben.“
- **12.11. 13:34** [Z, C 2793] „Bzgl. Texten - danke, dass ihr das sehr ernst genommen habt - aber auch ein bisschen übertriebe, denn: Ausnahmen bestätigen die Regel - Achsenbeschriftungen oder Legenden sind schon in Ordnung. Das eine oder andere Wort auch - zumindest, um Kontext zu erzeugen. Es darf halt nicht zu viel, zu überladen oder zu komplex sein. Bitte nochmal durchschauen, und jedenfalls i18n-ready machen.“
- **12.11. 06:00** [C 2781] „Oh, und im Inspektor sehe ich bei deinen Screenshots, dass du nicht alle Optionen / Reiter innerhalb des Auge-Inspektors (z.B.) ausgeklappt hast - dort liegen aber genau die Probleme ("Zeillbildung, Aktivität und Tod" und die anderen), zumindest war das in meinem letzten Test so, dass dort nur Textfelder waren.“
- **06.11. 22:49** [S] „Die Vorschläge für deine Wörter helfen allesamt nicht. Sie sind nicht selbsterklärend. Sie machen wohl nur im richtigen Kontext sind. Sie dürfen jedenfalls so nicht vorkommen und wahrscheinlich auch die Alternativen nicht ohne Kontext (also niemals alleine).“
- **06.11. 22:48** [S] „Deine Idee, im leeren Inspektor die Texte zu ersetzen, war auch *zu* gut gemeint. Die übrig gebliebenen Texte sind schlecht - sie sagen meistens einfach nichts aus und helfen auch nicht; und es ist eigentlich nur visual clutter. Weg damit. die alten Texte waren hier besser. Das hatten wir auch schonmal.“
- **06.11. 20:34** [S] (Punkt 25, Hormonanimation) „Viel Text; und auch viel Text für "ist hier nicht vorhanden" (anstatt die ganze Karte z.B. auszugrauen?)“
- **06.11. 19:00** [S] **[präzisiert durch 12.11. 13:34: Achsen, Legenden, Kontextwörter sind erlaubt]** „Du hast vorher den größten Fehler von allen gemacht. Texte einfügen anstelle von Visualisierungen, die selbsterklärend sind. Das ist, was mich am allermeisten stört. Wenn die Visualisierung gut ist, braucht man so gut wie keine Texte. Wenn man Texte braucht, ist die Visualisierung nicht gut genug. Texte sollen unterstützen - sie sind kein Ersatz für eine intuitive Darstellung. Das iost das Grundprinzip all meiner Bemühungen!“
- **06.11. 17:20** [S] „Die Wörter für die Hormone reichen nicht. "erregen" - das bedeutet, die Nervenzellen FEUERN? Weil sie erregt werden? "dämpfen" - heißt das HEMMEN woanders?“
- **06.11. 13:01** [S] „DIe Wörter finde ich nicht gut. Es braucht Symbole + einzelne Wörter, die besser treffen, was passiert.“
- **06.11. 13:01** [S] „Bei Organen: Im Fischdiagramm werden die Anschlüsse mit Symbolen angezeigt; im Inspektor nur mit Wörtern. Bitte die Symbole zu den Wörtern dazu geben im Inspektor.“
- **05.11. 17:17** [S] „Du weißt, bzgl. deiner Hormon-Erklärung, dass alle diese Punkte offensichtlich daran liegen, dass die Visualisierung nicht selbsterklärend genug ist. Das soll auch nicht mit Erklärungstexten "behoben" werden. Beispielsweise: Wächst mit einem  Hormon - das sollte dann eben nicht das Hormonrad sein, sondern etwas anderes. Und dann noch ein Wort irgendwo austauschen, und es wäre klarer.“
- **05.11. 16:52** [S] **[präzisiert durch 12.11. 13:34]** „Es verwirrt außerdem ein bisschen, das bei den Muskeln die Muskelart auswählbar ist, ohne dass man dazu sagt, warum - eine Überschrift oder so, sollte dabei sein. Es ist eine seltene Funktion, die visuell gerade sehr hervorgehoben ist. Visualisierung des Saugmuskels nur durch Lippendicke ist visuell auch schlecht sichtbar. Ist mir nur durch den Erklärungstext aufgefallen; und Erklärungstexte sind eigentlich ein Zeichen von schlechtem Design.“
- **05.11. 09:40** [S] (Baukasten, nicht Inspektorbild) „Bei den Hirnregionen müsste dann in der Bauteilauswahl ein kurzes Hover-Over sind und Zweck der Regionen (ein Satz - nicht zu viel Text) beschreiben; und dann kann man auch die Fachbegriffe verwenden (Pallium, Torus); die wirken kürzer - im Hover Over dann das deutsche Wort.“
- **Oktober 2026** [claude.ai-Chat „Performanceverbesserungen Faktor 10“, betrifft die alte Aquarium-Oberfläche] „Viele Texte sind umständlich oder zu lang und sagen dasselbe dreimal. Die Slider funktionieren nicht richtig […]“

### B3. Kombinieren statt alles in ein Bild; Überladung, Platz, Größe, Hochformat

- **12.11. 15:56** [M] „Und der Inspektor ist ein Panel im Hochformat. D.h. Höhe nutzen, nicht Breite.“
- **12.11. 15:54** [M, C] „Zu viel, das nicht unbedingt zusammenpasst - DEIN Missverständnis von gestern/vorher, dass alles unbedingt in ein gemeinsames Bild muss, auf Biegen und Brechen! DUMMER DSCHINN!“
- **12.11. 15:53** [M] „DIE BILDER SIND DAS PROBLEM - fitzelige Bedienung, weil zu viel in eins gepackt!“
- **12.11. 15:48** [M] „Bitte Vorsicht bei diesen Grafiken und Visualisierungen - sie sind oft zu klein und fitzelig - du lässt sie dir nur vergrößert anzeigen! In Klein sind sie borderline unbedienbar!“
- **12.11. 13:55** [Z, C 2800] „Auch bei den Visualisierungen habt ihr mich diesmal falsch verstanden. Ziel ist nicht, dass es *ein* Bild pro Inspektor/Organ gibt; sondern dass sinnvolle Dinge in Kombination in einer guten Darstellung kombiniert werden. Derzeit ist *zuviel* in eins gepackt; und der Lag - das ständige Neuzeichnen - ist dabei furchtbar. Gute Ideen, aber übertrieben. Und Kurven und Diagramme zur weiteren Erläuterung sind auch nicht schlecht - Stichwort z.B. Darm zur Verwertungseffektivität - weil man dann sieht, dass es nicht linear ist. Du kannst auch gerne zwei, drei oder acht verschiedene Visualisierungen haben, solange sie nicht einfach nur eine Zahl anzeigen, sondern Kontext geben und im besten Fall (kein Muss!) auch interaktiv sind, also änderbare Werte anzeigen. Ein Wert oder eine Wertekombination kann ja auch an *verschiedenen* Stellen geändert werden.“
- **12.11. 13:34** [Z, C 2793] „Eine erste Kleinigkeit: Die Farb-/Kontrastwahl im Auge hat doch als Streifen auch funktioniert? Die Kurven sind etwas übersichtlicher horizontal im Streifen als in einem Kreis, v.a. weil es ja auch die Negativwerte gibt? Oder ist das jetzt wegen AN/AUS anders?“
- **12.11. 05:49** [C 2775] **[teilweise überholt durch 12.11. 13:55 und 15:54: nicht alles in eine Grafik. Gültig bleibt, dass die zwei Kurven unverständlich waren und die Kugerln nicht zurückkommen dürfen]** „Die 4x4 Kugerln - die haben wir schon LANGE wieder entfernt gehabt. Warum sind sie schon wieder da? Bitte im Chat suchen danach... Da hatten wir doch schon 1000x bessere Lösungen! Außerdem: Die beiden Kurven sind unverständlich. Warum ist nicht alles in der einen Diagramm-Grafik oben änderbar?“
- **06.11. 13:01** [S feedback_1300.md] „Das "Anzahl Zellen" ist bei vielen Organen noch in der einzelnen Kugelansicht (siehe angehängtes Bild), die ich hasse, weil Platzverschwendung. Bitte entferne das überall und überleg dir etwas Individuelles.“
- **06.11. 13:01** [S] **[überholt, was die Lösung betrifft (Kugeln vergrößern, Schieberegler): 12.11. 16:05 „SOGAR EINE PUNKTREIHE IST SCHON ZUVIEL“. Gültig bleibt „zu klein, fitzelig“]** „Die Anzahl der Zellknoten sieht man gut; aber sie haben (z.B. bei Muskeln) noch eine zweite Dimension, die dargestellt wird, in dem die Zellknoten-Kugeln zu langgezogenen Ellipsen werden. Was ist das? […] Kann man dann nicht besser die Kugeln vergrößern statt lang ziehen? Es ist außerdem so klein, dass es sich sehr fitzelig anfühlt - und weil es so klein ist, kann man auch kaum etwas steuern. Vielleicht eine andere Lösung überlegen; bei der Nase gibt es einen schönen Schieberegler für so etwas.“
- **06.11. 13:01** [S] „Die Symbole, die du dir für das Diagram überlegt hast sind schön, aber *so* extrem winzig, dass man sie eh nicht unterscheiden kann. Also um den Faktor 5 zu klein oder so. Anders einsetzen. Bitte bei allen Organen in diese Richtung überlegen.“
- **06.11. 13:01** [S] „Sowohl bei Nase als auch bei Seitenlinie sollte die Reizsetzung im Fisch-Panel direkt erfolgen - so wie eben beim Auge auch (Sehfächer); im Organ-Inspektor selbst die Fischzeichnung zu duplizieren, finde ich sinnlos - und sie ist dort auch viel zu klein.“
- **06.11. 13:01** [S] „Schaltplan der Gehirnregionen im Inspektor: Ausgezeichnet umgesetzt; nur bei größeren Regionen wird es schnell unübersichtlich, weil zu "lang" - Lösung?“
- **05.11. 07:53** [S] **[relativiert durch 12.11. 15:56: Bilder für das Hochformat bauen, nicht für ein breiteres Panel]** „Das Eigenschaften-Tab/Panel sollte in der Breite veränderlich sein, oder? Dann könnte ich es breiter machen...“
- **03.11. 07:55** [S] (Aquarium, gelobtes Beispiel) „die "Lebensraum"-Grafik für eine deiner schönsten Kreationen halte; sie sollte im Ökosystem-Tab ganz oben sein - sie *ist* das Ökosystem, kompakt dargestellt, und braucht dann nicht einmal die Überschrift "Lebensraum"“

### B4. Erklärende Kurven und Diagramme

- **12.11. 16:02** [M] „Eine "Gewöhnung" wie "Antwort über Zeit" - SAGT EINEM NICHTS, DER DEN CODE NICHT KENNT!“
- **12.11. 13:55** [Z, C 2800] „Und Kurven und Diagramme zur weiteren Erläuterung sind auch nicht schlecht - Stichwort z.B. Darm zur Verwertungseffektivität - weil man dann sieht, dass es nicht linear ist.“ (vollständig in B3)
- **06.11. 21:30** [S] „Die Kurve selbst ist eben leider eine Visualisierung, die gar nichts erklärt.“
- **06.11. 13:01** [S] „Same bei Darm (Verwertung) - das Diagram ist auch ein bisschen überladen. Warum Sediment? Und Fassung im gleichen Diagramm lässt die anderen Kurven kleiner aussehen - könnte man anders darstellen oder einfach als Zahl belassen.“
- **06.11. 13:01** [S] „Maul-Organ im Inspektor: Die Zahnform kann man jetzt nicht mehr ändern. Hat auch das Problem der Ellipsen / Rekrutierung. Die beiden Diagramme sind zwar da, aber man kann an ihnen nichts einstellen; das wäre aber gut. Das Biss je Beute Diagramm verändert sich nie...“
- **05.11. 16:52** [S] „Beim Darm könntest du noch Anzeigen, wie effektiv der Darm jeweils für Fleisch oder Pflanzen ist - das ist nämlich nicht einfach linear bzw. gibt es Vor- und Nachteile je nachdem. Vielleicht gibt es so etwas auch bei den Zähnen und beim Saugen?“
- **03.11. 21:46** [S] „wie das mit der von mir gewünschten […] Funktion des Zelltods, den man in eine gewisse Lebensphase platzieren können soltle, zusammenhängt und gut visualisiert wird (im "alten" Deisnger als Kurve - aber mit zu wenig Optionen; bloß Idee war gut).“

### B5. Bedienelemente: Regler, Zahlenfelder, Knöpfe, Griffe

- **12.11. 01:41** [C 2637] „Und bitte notier dir gleich, dass ALLE INSPEKTOREN zu überarbeiten sind - oder gib den Job an Astra. Ich zeige dir ein Beispiel. Was soll das? Das ist das Gegenteil von intuitiver Bedienung! Das ist FIZZELEI. Und das betrifft wohl alle Inspektoren... Die gehören generalsaniert. Ich fürchte nur, du kannst dich auch nicht mehr an meine Designprinzipien erinnern (Stichwort: "intuitiv", Visualisierung, ansprechend) - und Astra kennt es leider auch nicht. Bitte zwischendurch einmal meine SPezifikationen und Kritikpunkte durchsuchen und auch Astra weitergeben, sie soll das machen.“ (Gezeigt hatte er Zahlenfelder im Nervenknoten-Inspektor, Bild `koord/bilder/2026-11-12_inspektor_fizzelei.png`.)
- **05.11. 19:28** [S] „Das Stoffrad war schon eine gute Erfindung, du hattest es nur einmal falsch eingesetzt! Und die Griffe haben teilweise die Hormonnamen verdeckt. Sonst war es gut, prinzipiell.“
- **05.11. 07:53** [S] „Soweit ich mit dem Auge bin - SUPER. Genau so!“ und „4+) die drei Punkte in der Farbkurve PLUS das Testlicht gleich dazu - SUPER-Idee! Bei den Punkten hat mich nur zuerst verwirrt, in welche Richtung ich sie ziehen kann […] Vielleicht statt der Legende unten eine Y-Achse links, mit dem erregt oben und dem hemmt unten; […] und das drag-and-drop der gesamten Kurve nicht erlauben, immer nur mit den Knöpfen.“
- **04.11. 21:48** [S] (Sehfächer als Vorbild) „So wie der Sehfächer im Auge selbst (den man noch verbessern könnte, eben so wie im Aquarium selbst) - das Beispiel-Futterstück (oder whatever - Farbe variierbar) - könnte sich z.B. durchs Sichtfeld bewegen - dann könnte man genauso wie im Aquarium SEHEN, was genau die Zellen auf der Netzhaut sehen, wieviele es sind, etc.“
- **04.11. 21:46** [S] „Und SLIDER sind so ca. die schlimmsten UI-Elemente: Sie bedeuten nur, es gibt ein Maß von 0% auf 100% - mehr auch schon wieder nicht. So verwendet man Slider (egal, was für eine absolute Zahl drunter steht). Buttons sind auch hässlich, wenn sie so aussehen wie hier. Unüberlegt an irgendeiner Stelle, ungruppiert; zu viele, nichtssagend; nicht selbsterklärend.“
- **04.11. 20:29** [S] „Bei der Farbe WÜnsche ich mir ein Spektrum, wo ich mir die Mitte als Kernpunkt auswählen kann und dann einfach eine Gaußkurve oder sowas darüber - also zentrumsfarbe + varianz sozusagen; in einem, nicht ein Farbding, wo 100% Breite durch "weiß" angezeigt wird...“
- **04.11. 13:19** [S] „Es gibt zwar eine "halbwegs" schöne Anzeige für das Sehfeld (Potenzial bei WEITEM nicht ausgeschöpft), aber muss dann erst wieder mit zwei eigenen Reglnern Dinge einstellen. Spektrumbreite kann ich außerdem verschieben ohne, dass ich irgendwo irgendeine Anzeige habe, was das bedeutet. Hier muss doch bitte EIN SPEKTRUM SELBST angezeigt werden, und die Änderungen muss man DIREKT IM SPEKTRUM durchführen...“

### B6. Flüssigkeit, Neuzeichnen, Animation

- **12.11. 14:17** [Z] „Die Animation der Schwanzmuskeln bei Kontraktion führt auch dazu, dass sie außerhalb des Fisches herumwachteln. Keine besonders gute Animation!“
- **12.11. 13:55** [Z] „Derzeit ist *zuviel* in eins gepackt; und der Lag - das ständige Neuzeichnen - ist dabei furchtbar.“ (vollständig in B3)
- **06.11. 22:54** [S] „UND WTF. Warum ist, wenn ich beim Lernen an Reglenr ziehe die Framerate auf 2FPS?! Hast du etwas WIEDER einmal eine komplette Engine-Berechnung dahinter gesteckt, anstatt nur die BERECHNUNG auszuführen??“
- **06.11. 20:34** [S] „Das aktuelle vorher/nacher = links/rechts ist schoon nicht schlecht. Die Kontraste sind aber zu gering. Der Unterschied muss deutlicher sein […] Das man den Unterschied zwischen den Beiden Bilden eben gleich sieht und nicht erst Suchbild (Suchanimation) hat.“
- **06.11. 19:08** [S] „Bei den anderen Signalwirkungen ist unklar, was der Ausgang der Zelle ist, weil nie irgendwo etwas herauskommt. Und was der Effekt durch den Stoff ist, sieht man auch nicht - es fehlt der Kontrast du zu vorher.“
- **05.11. 13:46** [S] „Und doch, das Verschieben des Fake-Futterstücks in den Sehfeldern ist immer noch holprig - es sollte *direkt beim* Verschieben ständig upgedatet werden“
- **04.11. 20:40** [S] „Exakt die gleichen Funktionen wie im Aquarium, nur ohne echtes Hirn, ohne echten Fisch, ohne echte Verschaltung - nur das, was für eine HÜBSCHE und INTUITIVE Anzeige nötig ist. […] Kann man alles machen, aber nicht zu Lasten der Bedienbarkeit beim Designen!“
- **04.11. 20:27** [S] „Abgesehen davon ist das dann bei ca. 5 FPS angelagt, wenn ich es verschieben will... Wenn schon, dann sollten sich außerdem die Sehfächer und das Auge schon verändern, während ich es DRAGGE, nicht er, wenn ich es droppe“

### B7. Arbeitsweise: Absicht statt Wortlaut, Bewährtes erhalten, Erklären

- **12.11. ca. 16:14** [F, Zeit laut Chat-Zeitstempel] (an Fable) „Du musst dir zuerst von Opus erklären lassen, was genau ich meine und die Aufgabe ist.“
- **12.11. 16:10** [M] „Bitte, du musst ihnen meine Worte auch erläutern! Lass dir Agenten unseren Chat durchsuchen, sie sollen alle meine Aussagen zu solchen Visualisierungen zusammentragen und die Prinzipien dazu erklären. Astra und Fable verstehen sonst nicht, was ich sage!!!“
- **12.11. 16:02** [M] „Bitte jetzt nicht wieder ins Gegenteil schwanken und alles wie vorher machen!“ (vollständig in B1)
- **12.11. 15:54** [M] „DEIN Missverständnis von gestern/vorher […] DUMMER DSCHINN!“ (vollständig in B3)
- **12.11. 15:53** [M] „Bitte nicht so dumm und STUR vorgehen, nicht wie ein Dschinnie, der alles wörtlich frisst, was ich sage.“ (vollständig in B2)
- **12.11. 14:19** [Z] „Und die logarithmische Ansicht für das Geruchs-Testobjekt hat mich auch schon gestört - das hatten wir auch schon einmal anders gelöst. Nicht-logarithmisch und mit Autozoom, wenn man das Testobjekt weiter nach außen zieht.“
- **12.11. 05:57** [C 2779] „Bitte, du musst anscheinend Astra wirklich *im Detail* wiedergeben, was wir besprochen haben und warum. Sie kann anscheinend nicht selbst mitdenken und macht wieder irgendetwas.“
- **12.11. 05:38** [C 2767] „Ihr müsst gemeinsam ALLE Organe und alle Hirnregionen und alle Bauteile aus allen Werkzeugen (auch Hormone, Lernen, Reizen, etc.) durchgehen - das Panel rechts ist der Inspektor; das Panel links ist der Baukasten; dann gibt es die Werkzeugpalette und das Fischpanel. Oben sind die Anzeigeoptionen. Das ist das Atelier...“
- **12.11. 05:36** [C 2765] „CPPN-Inspektor??? Das brauch ich wohl am Wenigsten! Hat das Astra gedacht, was ich meine? Ich meinte doch den Organ-Inspektor; das rechte Panel im Atelier!“
- **12.11. 05:49** [C 2775] „Die 4x4 Kugerln - die haben wir schon LANGE wieder entfernt gehabt. Warum sind sie schon wieder da? Bitte im Chat suchen danach...“ (vollständig in B3)
- **06.11. 22:37** [S] „Zu den offenen Punkten: Du hast sie derzeit so verkürzt, dass du gar nicht mehr weißt, was es eigentlich war. Bitte erinnere dich noch einmal ausführlich an die offenen Punkte und such im Chat danach.“
- **05.11. 16:52** [S] „Bitte vergiss nicht, alle meine Rückmeldungen zu berücksichtigen - auch wenn ich dich ständig unterbreche, das heißt nicht, das meine Rückmeldungen davor nicht wichtig sind.“
- **05.11. 08:17** [S] „Du hast einfach wörtlich (ausschließlich) jene Gehirnteile erstellt, die ich als beispiele aufgezählt habe […] Du hast hier wirklich nicht darüber nachgedacht, dass das von mir eine *IDEE* war, die du ausarbeiten solltest, um Vor- und Nachteile zu finden, abzuwägen, und eventuell *das Beste* daraus zu machen. […] NICHT stur und wortwörtlich abarbeiten bitte, sondern NACHDENKEN, PLANEN  und so interpretieren, dass es wirklich auch GUT ZUSAMMENPASST. Das gilt für ALLE meine "Vorstellungen" oder "Ideen". Wenn ich etwas Konkreteres will, merkst du das doch eh?!“
- **05.11. 08:29** [S] „nicht nachgeschaut, wie bestimmte Dinge bereits im Aquarium visualisiert werden (Symbole? Gerüche?)“

### B8. Einzelne Organe und Bilder (Auswahl, soweit nicht oben)

- **12.11. 14:08** [Z] (Bündel im Fischbild) „Die Nervenbündel sind auch zu dick im Vergleich zu den Nervenfasern, und das Aufsplitten geschieht an einer falschen Stelle, nämlich *im* Organzentrum anstatt kurz zuvor. Das führt dazu, dass die aufgesplitteten Einzelnerven sich *nach hinten* biegen müssen, was diesen seltsamen Sprinbrunnen-Effekt hat.“
- **12.11. 01:49** [C 2641] (Fischbild) „Ihr vergesst immer, das sind keine echten Fische - sie sind stilisiert! Es ist eine Seitenansicht, aber wir tun so, als wäre es von oben; daher zwei Augen und nicht nur eines. Es ist wie eine KINDER-Fischzeichnung. Wir können das schon BESSER darstellen.“
- **12.11. 01:49** [C 2641] „Und auch hier - das ist ein KOMPLETTES Durcheinander. So etwas per Hand bauen? Na danke.“
- **06.11. 13:01** [S] (Tastsinn) „Bei Organ-Tastsinn ergibt der Inspektor für mich überhaupt keinen Sinn. Warum hier ein Kreis? Was für ein seltsamer Reiz / Testobjekt ist das? Tastsinn funktioniert doch nicht auf Entfernung, wird hier aber so dargestellt... Statt "Kreis" müsste es ein Fischsymbol sein“
- **06.11. 13:01** [S] (Tastsinn) „Und überall, so auch eben z.B. hier beim Tastsinn hast du nur die Diagrammtitel bei "Antwort auf ..." ausgetauscht? Antwort auf Berührung - das wäre doch eher so etwas wie Drucksensitivität, oder? […] Hattest du da nicht die Idee Länge der Härchen - länger=empfindlicher?“
- **06.11. 13:01** [S] (Blutsinn) „bei Antwort auf Stoff im Blut sind es die faden Diagramme mit nur unsichtbaren Icons und individualisierter Überschrift; es ändert sich sonst nichts sichtbar und man versteht nicht, was es bedeutet; und bei Anzahl der Zellen passiert auch nichts und es ist die hässliche Darstellung, die mir nicht gefällt.“
- **06.11. 13:01** [S] (Lernen) „Lernart und Lernfähigkeit: Dieses Diagramm verstehe ich immer noch nicht. Es passiert auch nichts, wenn ich den Knob hier herumziehe, außer dass das gleiche, was ich mache oben nocheinmal in Worten angezeigt wird. Was es bedeutet, wird nicht visualisiert.“
- **06.11. 13:01** [S] (Lernen) „Lehrsignal, Lernfähigkeit, Merkspur und Wettbewerb - durch die Knöpfe und die gleiche Darstellung sieht es so aus, als wäre das alles quasi das gleiche. Man versteht nicht, was was ist. Und eigentlich braucht jede dieser Hormon-Wirkungen ihre eigene, intuitive Bedienung und Darstellung. So wie die einzelnen Organe...“
- **06.11. 13:01** [S] „Seitenlinie - Einstellungen: Verändern nichts... Es bleibt immer gleich, ich kann nicht steuern, auf welche Strömung das Organ sensibel ist (Richtung) und auch , wenn ich am Regler was ändere, passiert nichts.“
- **05.11. 17:08** [S] „Seitenlinie: Das Organ hat einen seltsamen Pfeil, der manchmal einfach nicht gezeichnet wird; und die Einstellung des Organs ist ein Kreissegment, wo überhaupt nicht ersichtlich ist, was es ist. Man sieht nicht einmal, was das Organ misst. Nachdem es ein Außenorgan ist, sollte es eine ebenso interessante Visualisierung haben, wie Auge und/oder Nase.“
- **05.11. 17:05** [S] (Hormone) „Aber was bedeutet dafür das Rad unter "Wachstum des Körpers" und "Wächst mit einem Hormon"? […] Jedenfalls nicht intuitiv, denn sie verwirren mich.“
- **05.11. 13:13** [S] (Muskeln) „V.a. Kau & Saugmuskeln funktionieren doch ein bisschen anders bzw. gehören anders visualisiert als Seiten und Hinterflosse (und auch die funktionieren ja ein bisschen anders - bzw. gehören definitiv individuell visualisiert)“

### B9. Aussagen in KOORDINATION.md, die KI-Paraphrasen sind (keine wörtlichen Zitate Davids)

Diese Zeilen geben Davids Absicht in den Worten von Claude oder Astra wieder. Einige davon sind die Quelle der Fehldeutungen.

- **12.11. 16:06, Claude** [K]: „Nicht den Rohwert zeigen, nicht ‚Antwort über Zeit‘ […] Bilder ohne Tooltip verständlich; kleine Achsenwörter sind ok, Text nicht im Vordergrund. Nicht alles in ein Bild; Panel hochkant, Höhe nutzen. Für Simples (eine Zahl) wenig Platz; in echter Größe beurteilen, nicht vergrößert.“ *Stimmt mit den neuesten Aussagen überein.*
- **12.11. 14:00, Claude** [K]: „Tooltips dürfen nur Zusätzliches tragen (genaue Zahlen).“ *Claudes eigene Auslegung, von David nicht so gesagt.*
- **12.11. 13:56, Claude** [K]: „Nicht ein Bild je Inspektor oder Organ, sondern sinnvoll kombinierte Darstellungen. Derzeit ist zu viel in eines gepackt.“ *Treffend.*
- **12.11. 13:35, Astra** [K] (Textregel): „Längere Erläuterungen in Tooltips.“ *Widerspricht 13:59 (Tooltip-Erklärung ist ein Cheat), also überholt.*
- **12.11. 06:04 und 06:09, Claude** [K]: „Je Zusammenhang EINE Grafik, und die Grafik ist die Eingabe. Keine Texte in oder an Zeichnungen, nur kurze Tooltips. Keine Regler, Zahlenfelder, Textfelder oder Auswahllisten. Keine abstrakten Zellraster.“ *Überholt: „EINE Grafik“ durch 13:55 und 15:54, „keine Texte, nur Tooltips“ durch 13:34 und 13:59. Gültig bleiben: keine Regler, Zahlenfelder und Listen sowie keine abstrakten Zellraster.*
- **12.11. ca. 05:29, Astra** [K]: „eine zusammenhängende Darstellung pro Zusammenhang, keine Sammlung einzelner Mini-Regler.“ *Der Satz ist richtig, wurde aber als „ein Bild pro Organ“ umgesetzt.*
- **12.11. ca. 05:18, Astra** [K]: „Texte in der Grafik grundsätzlich weglassen; sparsame Tooltips.“ *Überholt durch 13:34 und 13:59.*
- **12.11. ca. 05:14, Astra** [K]: „David präzisiert noch strenger: grundsätzlich keine Texte in Zeichnungen, auch nicht außen angehängt; ausdrücklich alle Inspektoren. Keine Schieberegler oder Zahlenfelder. Die Diagramme selbst sind die Eingabe. Kurze Tooltips und ggf. knappe Legende darunter.“ *Das hat David laut Astra in ihrem eigenen Chat gesagt; der Wortlaut liegt hier nicht vor. Die Texte- und Tooltip-Teile sind überholt durch 13:34 und 13:59, „Diagramme sind die Eingabe“ ist relativiert durch 13:55 („interaktiv kein Muss“).*
- **12.11. 01:43, Claude** [K] (Gestaltungsgrundsätze): „Intuitiv: Man versteht ohne Fachbegriff, was eine Einstellung bewirkt; Wirkung vor Parameter. […] jede Einstellung als Grafik der Wirkung […] Keine Schieberegler, keine nackten Zahlenfelder, keine Formelnamen. […] Wenige, sinnvolle Stellgrößen statt aller Rohparameter; Expertenwerte höchstens als Ablesewert neben der Grafik.“ *Inhaltlich sehr nah an den neuesten Aussagen; „Wirkung vor Parameter“ wurde danach aber nicht umgesetzt.*
- **10.11., Claude** [K] (Abschnitt „Davids Vorgaben“): „Bild statt Text, keine Schieberegler in Inspektoren.“ und „Immer zuerst den Code lesen […], dann erst testen oder Schlüsse ziehen. Nie aus *.md-Dateien raten.“ *Kurzformeln; „Bild statt Text“ wurde später zu wörtlich als „Texte entfernen“ gelesen.*

---

## C) Checkliste vor dem Bauen eines Inspektorbildes

1. **Welche Einstellung, welche Wirkung?** Im Code nachlesen, was sie tut (Engine, Entwicklung, Atelier-Compiler, mit Datei:Zeile). Erst schreiben „Einstellung → Wirkung → sichtbare Folge für den Fisch“, dann zeichnen.
2. **Zeigt das Bild die Folge, nicht den Wert?** Würde jemand sehen, was am Fisch anders wird (sieht mehr, zieht stärker, verwertet Pflanzen besser), wenn er den Griff bewegt? Eine Zahl, eine Punktreihe oder ein Prozentbalken allein reichen nicht.
3. **Ist das Bild für dieses Organ erdacht?** Oder ist es eine Einheitslösung, die bei allen Organen gleich aussieht? Gibt es eine spezifischere Darstellung?
4. **Hilft ein erklärendes Diagramm?** Ist ein Zusammenhang nichtlinear oder hat er Vor- und Nachteile (wie Darm-Verwertung), dann eine eigene Kurve mit Achsen. Keine Kurve, die nur das Modell nachzeichnet („Antwort über Zeit“).
5. **Passt zusammen, was im Bild steht?** Gehört alles im Bild zu einem Zusammenhang? Alles, was nicht dazugehört, in ein eigenes Bild. Aber nicht jede Kleinigkeit in ein eigenes Bild.
6. **Bekommt Simples wenig Platz?** Zellzahl und ähnliche Grundwerte bekommen höchstens eine kleine Zahl oder gehen in der Wirkung auf. Kein eigenes Bild, keine Kugeln, keine Punktreihe.
7. **Tooltip-Test:** Tooltips gedanklich abschalten. Versteht man das Bild noch? Steht eine Erklärung im Tooltip, ist das Bild nicht fertig.
8. **Text-Test:** Gibt es nur Achsenwörter, Legenden und einzelne Kontextwörter? Kleine Schrift ist in Ordnung. Alles steht in `ui/text/de`, nichts ist fest im JS. Wenn Wörter nötig werden, um Griffe auseinanderzuhalten, ist das Bild zu voll.
9. **Echte Größe:** Im Browser bei der Standardbreite 320 px und 1:1 prüfen, nicht vergrößert. Trifft man jeden Griff sicher, ohne einen anderen zu erwischen?
10. **Hochkant:** Die Bilder sind untereinander angeordnet, flach und für die Panelbreite gebaut. Das Panel wird nicht verbreitert und es gibt keine Mindestgrößen.
11. **Bedienung:** Es gibt keine Regler, Zahlenfelder, Auswahllisten oder losen Knöpfe. Wenn etwas einstellbar ist, dann über Griffe an der dargestellten Wirkung. Ein reines Erklärbild darf auch nur zeigen. Ein Wert darf an mehreren Stellen einstellbar sein.
12. **Flüssig:** Beim Ziehen wird nur das betroffene Bild neu gezeichnet, nicht der ganze Inspektor oder die Fischszene. Es gibt keine Hintergrundsimulation für eine Anzeige.
13. **Verlauf prüfen:** Mit `git log -S` und im Chat nach Vorgängern suchen. Hatte David eine frühere Lösung gelobt oder eine entfernt (Kugerln, logarithmische Duftansicht)? Nichts Verworfenes wieder einbauen.
14. **Gegenteil-Test:** Schwinge ich gerade nur vom letzten Fehler ins andere Extrem (alles zusammen ↔ alles getrennt, alle Texte weg ↔ überall Wörter)? Was ist hier angemessen?
15. **Absicht-Test:** Habe ich Davids Satz wörtlich umgesetzt oder verstanden, was er erreichen will? Bei Unklarheit erst in den Zitaten oben und im Chat nachsehen, dann entscheiden.

---

## Anhang: Woher die Zitate stammen und was nicht abgedeckt ist

- **Heute (12.11.) ab 13:34:** Nachrichten aus der Zusammenfassung in `david_messages.txt`, gegen den Chat (Turns 2793–2804) geprüft. Die Nachrichten von 15:48, 15:53 (zwei), 15:56, 16:02 und 16:05 (zwei) kamen über die Warteschlange und stehen nur in der Sitzungsmitschrift, nicht in `david_messages.txt`.
- **12.11. Nacht (01:41–06:12):** wörtlich aus dem Haupt-Chat, Turns 2637–2789. Die Uhrzeiten sind aus den KOORDINATION-Einträgen zugeordnet.
- **03.11.–11.11.:** aus dem lokalen Chat-Auszug `scratchpad/chatscan/human_cached.txt` (Turns 1450–2608, mit Ortszeit), aus `scratchpad/atelier_user_messages.md` und aus `scratchpad/feedback_1300.md` (Davids lange Rückmeldung vom 06.11. 13:01).
- **Nicht wörtlich gelesen:** Turns 2402–2484 (etwa 10.11. abends bis 11.11. mittags). Stichproben und KOORDINATION zeigen dort vor allem Engine-, Sehfarben- und Laborthemen. Astras eigener Chat („Fish 2“) war nicht zugänglich. Was David dort gesagt hat, kennen wir nur aus Astras Paraphrasen (B9).
- **Git-Verlauf von KOORDINATION.md:** enthält keine gelöschten Visualisierungszitate, die nicht auch heute in der Datei stehen.

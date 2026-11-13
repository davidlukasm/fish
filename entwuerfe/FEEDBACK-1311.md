# Davids Feedback zum Inspektoren-Entwurf (13.11. 17:54, wörtlich)

An Claude gerichtet, mit Bezügen auf Davids Chat mit Claude. Fable und Astra: nicht als Auftrag lesen, sondern entwuerfe/AUFTRAG-1311.md (erklärt, mit Bildern).
Screenshots, auf die er sich bezieht: Nervenzelle (Antwort der Zelle + 6 Schieberegler), Darm/Schmerzzellen (Meldung an das Gehirn mit „Bump“), Maul/Saugen und Beißen (zwei Einstellungen), Flossen (zwei Einstellungen: Blatt zeigt nach unten; nur „Rück“), Abwehr/Stacheln (Stacheln an Maul, Auge und Schwanz gleichzeitig).

---

Ad Grafik "Zelle Nervenzelle":
Was das bedeuten soll, versteht niemand. Außerdem: Es sind wieder alles Schieberegler (HASS); und manche der Schieberegler wirken sogar nur, wenn andere Schieberegler nicht auf 0 stehen. Wozu das ganze insgesamt dient, ist absolut unklar. Ein Unterschied zwischen heute und Vorschlag ist mir nicht ersichtlich. Es ist komplettes Kauderwelsch. Womit antwortet was für eine Zelle worauf? Sie hat eine Aktivierungsfunktion, oder? Was sind diese Einstellungen? Solche Bedienelemente würde kein normal denkender User jemals anfassen - man wüsste nicht, was die Einstellungen überhaupt bedeuten geschweige denn, was sie bewirken. Kannst du komplett kübeln (=LÖSCHEN) und DANACH neu überlegen.

Ad Darm:
Ertrag: Bauchschmerzen sind mir jetzt zu "wenige" - das Rechteck ist immer nur schmal. Verweildauer kann man auch nicht auf < 100 Setzen, obwohl es so aussieht, als könnte man (was eh unsinnig wäre, weil dann die Stats überall runter gehen), aber vielleicht k ann die grafik dann auch erst bei 50 anfangen? Und Flocken doch weiter runtergehen? In meinen alten Anforderungen wollte ich spezifisch die Stelle beschreiben, wo die Flocken, Planktun ungd Algen sich mit der Y-Achse schneiden, nicht, wo sie exakt bei Position 25 sind. Alge und Blatt ist mir zu ähnlich, Flocken zu wenig steil beim Anstieg, Plankton ebenso, aber nicht so extrem. Bitte nochmal nachlesen, was meine Ideen waren im Chat, und dir denken, dass ist statt "25" den Schnittpunkt mit der Y-Achse meinte. Die Balken zur Verwertung darunter sollten auch nicht bis auf 100% laufen, da kein Nahrungsmittel je 100% erreicht (Blatt: 92%, Fleisch: 82% - das sollen auch die höchsten bleiben; Alge soll ihr Maximum auf 78% bekommen, aber schon ca. 100 Schritte früher; Plankton auf 72%, Maximum dort, wo es ist. Alge soll bei Maximum 78% *bleiben* bis zur höchsten Verweildauer und Plankton soll von 34% Starten bei Verweildauer-Schnittpunkt Y-Achse (Schritt 50 also). Alge soll bei 18% starten bei SChnittpunkt Y-Achse). Die Balken jedenfalls sollen beim jeweiligen Maximalwert 100% gefüllt sein (also Blattbalken 100% gefüllt bei Blattverwertung 92%).
Über das Leben: Im Ei frisst ein Fisch nichts. Man kann die Kurve nicht immer bedienen, sie hängt nämlich am Diagramm oben. Das ist schlecht. Auch, dass Fleisch die Hälfte des Diagramms einnimmt ist dumm, und ein Artefakt der Beschriftung 50-800. Wozu hier auch diese Beschriftung? Sie enthält keine Information und verhindert, dass man die Kurve einstellen kann, wie man will. Wenn man hier die Kurve ändert, muss sich eben oben auch die Kurve entsprechend ändern. Skalierung muss so sein, dass man die Kurve von über das gesamte Diagramm zeichnen kann. Dann ist vielleicht auch hoffentlich die Beschriftung von Alge und Blatt in diesem Diagramm möglich.
Füllzellen: Sie melden an das Gehirn. Egal wie viele es gibt? Und ist es IDENT mit dem "satt" oben im Fisch? Sieht so aus, die beiden Diagramme interagieren ja. Es sollte aber nicht "Füllzellen" heißen, sondern "Sättigungsgefühl" (nicht was es ist, sondern was es bewirkt - eines der Prinzipien" - und oben ist der Magen dafür die Visualisierung. Warum hier nicht? Inkl. (+) und (-). Der Magen oben könnte eine leicht andere Farbe haben (bräunlicher, oranglicher, etc., entscheide passend), und hier müsste dann dieselben Farbcodes (und eigentlich auch der Magen als zentrales Ding, um das es geht statt Diagram/zum Diagram) verwendet werden.
Schmerzzellen und Futterzellen haben keine Motivation im Fischdiagramm oben. Warum haben wir sie hier auch?
Schmerzzellen: Der Regler mit Diagramm ist gut. Das "X" überlappt sich aber leider mit dem Diagramm. Lösung: Diagramm etwas nach rechts schieben und (X) etwas kleiner machen. Bedienung ist inkonsistent mit dem Füllzellen Diagramm darüber - nämlich, was die Auswahl der verschiedenen Knoten / Diagrammstreifen betrifft). Bei Schmerzzellen MUSS ich *ins* Diagramm klicken, um etwas zu ändern; dabei sollte man auch in den Regler oder in das zweite Bauchweh-Diagramm klicken  können.
Hier bin ich mir jetzt auch nicht mehr sicher, ob der Regler hier überhaupt Sinn macht. Es wäre folgendes auszuprobieren:
Das Bauchweh-Diagramm (als INPUT) oben. Die Bauchwehkurve ist das Element, dass den Bauchschmerz steuert. Man muss sie verändern können, d.h. Anstieg, Max und Stop-Position. So ähnlich, wie es im Lebensdiagramm funktioniert, bloß hier ist es halt nur "Input" des Bauchschmerzes. Daneben der Bauchweg-Zellen-Regler, er erzeugt die waagrechten strichlierten Linien mit dem "Schlüssel", worauf die Zelle also Reagiert. Dieses Bauchwehdiagramm halte ich für zentraler als die Bloße Anzeige "Meldung an das Gehirn", das ist das Ergebnis und sollte darunter angezeigt werden. Warum macht es so "bump" (siehe Screenshots); und laut Ertragsdiagramm sollte dieser Fisch auch mögliche Bauchschmerzen bei Blatt und Alge haben. Warum ist das hier nicht angezeigt? Da fällt auf: Das "Über das Leben Diagramm" gehört zum Ertrag dazu; direkt unter das Ertragsdiagramm und über die Balken; und die Balken sollten auch Bauchschmerzen inkludieren *über das Leben* Zurück zu den Schmerzzellen: Das "Bauchweh je Futter bei vollem Darm" - stimmt dann eben nicht unter diesen Settings; hier wird mir ja angezeigt, dass dieser Fisch niemals Bauchweh hat, also ich interpretiere: die durch Muskelbewegung bedingte Unsicherheit fehlt hier, oder? Er bekommt Bauchweh bei Fleisch, aber die Einstellung ist so insensitiv, dass es das Gehirn nie meldet; stimmt diese Interpretation?
Der "Gewöhnungsregler" gehört dann in das "Meldung an das Gehirn"-Diagramm integriert, denn er ändert dort den Kurvenverlauf (zum Glück jetzt sichtbar - also MIT Effekt).

Futterzellen:
Auch kein Ankerpunkt im Fischdiagramm ganz oben. Was ist hier die Meta? Ist das jetzt dieser Nährsinn? Ich bin wieder verwirrt: Was gibt es jetzt hier im Darm, und was ist das, was der Blutsinn noch zusätzlich misst? Auch hier fehlt jedenfalls die durch Muskelbewegung (= auch Reife) bedingte Unsicherheit; und auch hier sind die DIagramme IMO falsch angeordnet. (Die Sache mit der Anordnung ist mir auch schon im von mir verhassten "Zelle Nervenzelle"-Diagramm aufgefallen, dort wollte ich aber, dass du es komplett neu gestaltest, deshalb hab ich es nicht geschrieben).

Schwanz:
Sieht jetzt gut aus so, nur dass du dir gedacht hast, ich will, dass die Skalierung der Diagramme erst beim Loslassen der Maus aktualisiert wird. Das ist falsch. Auch die Animation wird erst im Loslassen aktualisiert, was performancetechnisch OK ist, aber du hast es so implementiert, dass der Fisch dann kurz für ein paar Frames einfach *nicht* angezeigt wird. Aus irgendeinem Grund hast du das Reskalieren auch nur (in beiden Diagrammen) implementiert, wenn man die Regler in eine Richtung fährt (beim Kraft-Diagramm: wenn man ihn runterfährt; beim Geschwindigkeitsdiagramm: wenn man ihn rauffährt; korrekt wäre: NIE - Reskalierung IMMER während dem Reglerschieben selbst...)


Die neuen Diagramme.
Maul - Kiefer: Die Zeichnung ist hässlich (Striche wie ein Kindergarten Kind) und man kann nichts einstellen.
Maul - Saugen und Beißen: Die Kugelgriffe dienen nur der Anzeige bzw. Einstellung, wie dieses Aktivitätsdiagramm (das Bissdiagramm) aufgebaut ist? Die Gelbe Kugel außerdem nur der Visualisierung im Fisch OBEN? Weg mit ihr, das Diagramm selbst kann der Fisch animiert darstellen. Der zweite rote Kreis stellt ein, wann der Fisch schnappt? Sind die Einstellungen in den Screenshots physiologisch-anatomisch überhaupt möglich? Es sollte dann der rote Schnapp-Kreis auch entfernt werden und die Positionierung automatisch erfolgen. Das Diagramm hat *vier* Regler, wobei "beißen" keinerlei Auswirkung hat, außer der Regler ist auf Null? Es sind zu viele Regler jedenfalls. Das Bissdiagramm selbst als Idee ist nicht schlecht.

Flossen: Sollte wohl Seitenflossen heißten; denn Schwanz ist auch eine Flosse und hier nicht gemeint? Siehe Screenshots für Einstellungen, die man treffen kann und wo die Darstellung versagt. Anatomisch möglich? Wäre dumm. Diagramm ebenso hässlich wie bei Maul. "Rückhub und Vorhub" - das sind keine Wörter, die man kennt. "Schub je Hub" und "blass: nicht im Wechsel" - völlig unverständlich. Der Rückhub-Vorhub Regler unter dem Diagramm gehört logisch zum Rudern darunter; die Knöpfe sind ein neues Element, aber doch unnötig, oder? wenn man es auch direkt an den Balken ändern könnte? Und hier böte sich eine richtige Animation mit einem Minifisch mit den passenden Flossen, der sich  durch ein Gebiet bewegt wirklich, wirklich an, um zu verstehen, was man einstellt. Flossen haben auch eine bestimmte Position, oder? Und im Fisch selbst könnten es auch zwei Paar Flossen sein. Sollte man das zweite Paar nicht auch gleich in denselben Inspektor integrieren?


Region: Wirbelsäule.
Es verwirrt mich zunächst. Auch, weil Flossentakt hier auch nur die Seitenflossen meint. Wenn die Flossen verbunden sind, sollte hier auch Infos der Flossen mit angezeigt werden, und die Möglichkeit, in den Seitenflossen (bzw. auch den Schwanzflossen)-Inspektor zu wechseln. Wenn die Flossen nicht verbunden sind, sollte man sie mit simplen Klick auch automatisch verbinden können.
Die Buttons zur Auswahl: "Schimmen", "Lenken", "Schmerz", "Ende" - das sind nicht-exklusive Alternativen oder muss man hier eines auswählen? Das ist unklar, d.h. schlechte Lösung (unintuitiv). Ich denke mal, es sind nicht-exklusive Alternativen und man kann verschiedene Verhalten unterschiedlich einstellen. Wenn es Verhalten sind, müsste man hier überlegen, wie man grundsätzlich "Verhalten" visualisiert; und ob man es nicht überhaupt dynamisch macht. Also mit (+) Verhalten hinzufügen, und dann hat man Schwimmen, Lenken, "bei Schmerz", "Ende der Bewegung", aber dazu kenne ich mich zu wenig aus. "Drang" bedeutet was genau? Der Input von außen? Schmerz und Gleichgewicht sind jedenfalls Inputs von außen. Sollte also als Input *über* das Effekt-Diagramm. Die Diagramme verwenden auch hier wieder nicht die gesamte X-Breite des Inspektors und wirken rechtsbündig.
"schwach / streng" - bewirkt nichts, sieht nur nach zufälliger Variation aus. Diagramm hat seltsame Spitzen, Ecken und Kanten (siehe Screenshot), warum? Ah und jetzt sehe ich erst, dass diese Verhaltensbuttons eh nichts zu bedeuten haben, weil es nur die beiden Einstellungen unten überhaupt gibt. Warum sind die vier Verhalten dann nicht in *ein* Diagramm integriert? Ich kann Schwimmen und Lenken und Schmerz nicht getrennt steuern, warum hast du es dann so dargestellt, als wäre das möglich?
Flossentakt: Hier kann man überhaupt nur Geschwingikeit einstellen. Rückhub kollidiert visuell mit dem Diagramm. Vorhob fügt eine Zeile ein, obwohl die X-Achse schon mit Schritte als Legende beschriftet ist. Wieder nur Schieberegler überall. Rechtsbündig.

OH UND FAST VERGESSEN: Der Schwanz steuert doch gar nicht mehr links und rechts, sondern nur vorwärts? Bitte mit Fable abklären, es wäre schon fein. Ansonsten ist die Hirnregion selbst auch falsch. Es gab einmal eine Diskussion dazu, aber ich weiß nicht mehr ob hier, oder bei Fable.

Region - Auswahl:
Erster Eindruck: eine spannende Region mit schlecht gewählten Namen. Hier müsste doch "Verhaltenssteuerung" besser passen, oder "Verhaltenswahl"? Oder ein einfacheres, kürzeres Wort? "Auswahl" ist zu generisch. Rechtsbündig. Die Regler ändern nicht viel und nichts grundsätzlich. Warum das Futter am Anfang in Wellen erscheint, unklar? Was Futter bedeutet, unklar - visueller Reiz? Allgemeines Signal? Dann besser "Futtersignal" und "Duftsignal" und "Schmerzsignal", wenn es auch etwas anderes als Schmerz sein kann, dann "Gefahrsignal", oder Signale als Überschrift und darunter dann Futternähe, Geruch, Gefahr. Sind es nur diese drei Signale? Und es sind dann vier Verhalten? Warum kann man die Dauer und Formen der Signale nicht verändern? Und warum gibt es nur 3x3 Variationen im Verhalten (und das Verhalten ändert sich nicht besonders stark trotzdem)? Oder sind die vier "Verhalten" hier jetzt Ausgänge?

Region - Körperzustand:
Reserve und Investition - völlig unklar, was das bedeutet. Schieberegler. Rechtsbündig. Diagrammreihenfolge. Keine Variation, nur drei Stufen. Was "Investition" bedeut - k.A. ein Ausgang? Mangel? "laichbereit"? Was ist "Reserve" und warum heißt das gesamte Ding "Körperzustand"?

Region - Geruchsvergleich:
Untertitel ist HORROR, wirkt 100% nach KI. "Zwei Nasen, eine Richtung". Wenn dir nichts einfällt. Es trifft dieselbe Kritik zu wie bei Körperzustand und auch bei Auswahl.

Zelle - Lernen:
Untertitelhorror. Und was hat Lernen mit "Duft" zu tun? NICHTS! Komplett Kaputtes Design - Es ist unverständlich. Fängt an mit "Lehre nach A" vs. "Lehre mit A", es sind wieder Buttons, hier kann ich nicht einmal raten, warum es Buttons sind. "Paarung" - im Sinne von Fortpflanzung?! Was ist dir hier bitte passiert? Oder war das Astra? Jedenfalls einfach FALSCH.

Region - Wertung:
Untertitelhorror. "Wertung" - schlechter Name. Hat auch wieder nichts mit Düften zu tun. FALSCH.

Organ - Nase:
Die Geruchskarte ist gut, könnte größer sein. Klick auf die einzelnen Gerüche ist fitzelig, und Hervorheben durch großen Kreis ist visuell überladen. Hervorheben ist aber auch nur Geruchsprobe, oder? Das wäre durch eine kontinuierliche Probe vmtl. besser dargestellt, etwa ein rotes X mit Legende "Geruchsprobe", und wenn das X in einem der spezifischen Gerüche (Futter, Laich, etc.) liegt, dann ist es einfach zu 100% dieser Geruch. Dazu auch die spezifischen Gerüche als Minikugeln größer machen. Am Rand der Geruchskarte geht es *viel zu schnell* über zu "alle Gerüche", ist also auch fitzelig. Auswahl der einzelnen "Duftzellen" und auch (+) und (X) ist nur weiter unten im Diagramm möglich anstatt auch hier. Eine Übersicht, auf welche Gerüche die Nase reagiert, fehlt. Ist es besser "Düfte" oder "Gerüche" zu sagen? Zu den "Duftzellen": Hier gilt exakt dasselbe Feedback wie bei anderen Diagrammen dierser Art.

Organ - Barteln:
Grafik Hässlich. Kein (+), (-), (X)-System. Geschmackskarte: siehe Nase.
"Spitzenzellen" - Name? Was bedeuten diese Buttons? Warum kann ich mir das Auswählen? Wird das nicht durch die Geschmackskarte vorbestimmt? Und auf Stein reagiert es doch immer? Hier kann ich etwas auswählen, wo ich denke, dass es eigentlich nicht auswählbar ist? Und die Beschriftung ist Falsch. Hier gibt es keine "Schritte". Dass du überall, wo du nur kannst, "Schritte" hineinschreibst, finde ich auch ... hinterfragenswert. Oft sinnvoll, hier falsch. Manchmal überflüssig.

Organ - Nahsinn:
Völlig zum Schmeißen. Zu Augen und damit auch Nahsinn haben wir schon einen recht ausgearbeiteten Inspektor *gehabt*. Mit Sehbildern, etc. Bitte das Original ansehen (und wenn es nichts taugt, dann bei den Augen nachsehen - das war unser erstes, zentrales Ding überhaupt).

Organ - Schwimmblase:
Grafik hässlich. Ausgedehnte Blase berührt den Schwanz.
Füllen und Leeren - hier macht die willkürliche Schritte-Skala auf der X-Achse ein Problem. Dreieck und Kreis-Regler sind nur Input-Regler, oder? Also: Wenn Befehl so und so (Dreieck), und Ausgangsstand der Blase so und so (Kreis), dann dauert es so und so lange, bis steigt/sinkt. Das ist keine Einstellung der Blase selbst dann. D.h. man kann hier  keine Blaseneinstellungen treffen. Anzahl der Knoten ändert nichts?
Druckzellen: schwache Darstellung. Es gibt mehr Optionen für die Druckzellen; sind es außerdem nicht dieselben Zellen wie im Magen? Sie haben nicht nur (hier wie dort) einen Parameter, und alles ist geregelt. Du hast dir keine Mühe mehr gemacht.

Organ - Kiemen:
Darstellung hässlich. Fischschwanz ragt rechts aus dem Bild. Ich kann gar nicht glauben, dass du das vorgeschlagen hast, nachdem wir so lange beim Darm schon über teilweise genau dieselben Unzulänglichkeiten gesprochen haben. (+), (-), (X) fehlt. Effekt der Zellanzahl nicht klar. Was Reusen bewirken nicht klar. Dass es mit Darm zu tun hat wäre wichtig, ist aber hier nicht einmal ansatzweise angedacht (würde auch bei Maul und Kiefer zutreffen) und umgekehrt wären Infos zu Kiemen, Maul und Kiefer auch im Darminspektor relevant. Schrift überlagtert sich. Sinn und Zweck unklar. Einstellungen gibt es mehr als angeboten werden. Alles im Wesentlichen wieder nur Schieberegler.

Organ - Abwehr:
Hässliche Darstellung. Screenshot: Stacheln am Maul, am Auge und am Schwanz gleichzeitig. Kein (+), (x), etc. Keine integrierte Darstellung der beiden Diagramme. Einziger Plusplunkt:  *wie* man Lage und Länge einstellen kann ist gut gelöst. Was der Rote Kreis macht, ist hingegen nicht klar. Ist das nur eine Probe? "Tempo" - eine Stachel hat kein Tempo. Völlig falsch beschriftet also. 

Organ - Pigment:
Zu kübeln. Ich kann z.B. keine braunen Fische machen. Man will als User einfach die Grundfarbe des Fisches aussuchen und dann pro Pigmentknoten einstellen, wie sie ihn färben. Keine komplizierten Kreise, 4 Zellen (+)/(-) und zusätzlich Farbzellen (+)/(-). Du bist wieder VÖLLIG hinter die vereinbarten Prinzipien gefallen und zeigst die "Anzahl der Zellen" anstatt zu überlegen, WAS DAS BEDEUTET.

Ich muss dir hier kurz sagen, dass die Dinge immer schlechter werden, je weiter ich vorkomme. Vielleicht warst das nicht alles du, sondern Astra und/oder Fable; aber die hängen auch davon ab, was du ihnen als Messages mitgibst, und als Feedback. Und offenbar hast du irgendetwas davon nicht korrekt gemacht, oder beides. Ich will das jetzt zu Ende führen, aber ich bin maßlos enttäuscht, dass plötzlich jeder einzelne Inspektor irgendwie komplett GLEICH aussieht und basale Prinzipien über Board geworfen werden.

Organ - Eier und Samen:
FALSCH. Es sind zwei Organe. Kübeln. Samen haben auch Tintenfunktion und dienen dem Schlupf.

Organ - Drüse:
Mechanik falsch dargestellt. Jede Drüse kann Stoffe binden und abgeben. Was der Vorschlag sein soll 4-48 oder 4-1024, verstehe ich nicht. Du hast es nicht erklärt, und mir ist es egal. Eine Drüse kann heute schon Stoffe 1024 und sogar 8000 Schritte lang abgeben. Das hängt doch von ihrem Eingang ab. Eine Drüse kann auch Mischungen von Stoffen abgeben. Es gibt mehr Optionen. Es gibt Lebenszyklen.

Organ - Blutsinn:
Viel von der vergangenen Kritik trifft auch hier zu. Zusätzlich: Mehr Optionen. Und auf einmal tauch auch das Wort "Beispiel" auf. Unnötiger- und unsinniger Weise.

Organ - Tasten:
Siehe Stacheln. Grafik zu klein. Schlechtes Konzept. Hinzufügen von neuen Zellen besonders hässlich. Darstellung ist mit Stacheln quasi ident, obwohl ein Hautsinn.

Organ - Seitenlinie:
Besonders hässlich und ungeeignete Darstellung. Völlig auf die Strömungsvisualisierung im Fischpanel vergessen, die ausgezeichnet ist.

Organ - Gleichgewicht:
Hier hast du dir offenbar überhaupt keine Mühe mehr gemacht. Das ist mir nicht einmal ein Kommentar wert.

Organ - Schmerz:
Siehe Stacheln, Tastsinn, Seitenlinie.



Allgemein:
Lebenszyklus hat keines der Organe integriert. Optionen, die steuerbar wären, sind einfach ignoriert. Statt Effekte und Auswirkungen zu visualisieren sind wir wieder bei Anzahl von Zellen und Schiebereglern gelandet. Statt individuell hast du oder habt ihr euch wieder in idente Muster hineingeredet. Schau dir bitte mal nebeneinander "Darm" und "Gleichgewicht" an. Wirklich. Leg es nebeneinander. 1000 Welten. Bitte mach das WIRKLICH.
Und dann "Darm" und "Schwanzflosse". Zwei sehr gut ausgearbeitete, verschiedene Konzepte mit wiederkehrenden Elementen.


Was ist der Plan jetzt?

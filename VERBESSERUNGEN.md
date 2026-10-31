# Gemeinsame Verbesserungen v018b / v019

Arbeitsnotiz ausschließlich im Zweig `koordination`; gehört nicht ins Programmpaket.
Stand und Dateizuständigkeiten stehen in `KOORDINATION.md`. Vor einem Eingriff dort
reservieren, aktuelle Änderungen prüfen und erst nach erfolgreichen kurzen Prüfungen pushen.
Keine Releases, Versionsänderungen oder Veröffentlichung der Cloud-Konfiguration.

## Rahmen

Performance hat Vorrang vor numerischer Genauigkeit und identischen Einzelverläufen.
Die Größenordnung von 100 Eischritten und 1000–4000 Aquariumschritten bleibt bei
Lernraten, Diagnosen, Auswahl und Beobachtungsfenstern maßgeblich. Genügend selbstständige
Ernährung und Fortpflanzung sowie Ertrag pro realer Rechenzeit sind die biologischen Ziele.

v018b: gezüchtete Algenzupfer-G11-, Gründler-G12- und Siebmaul-G17-Linien stehen als
Referenz zur Verfügung. v019: keine gezüchteten Referenzlinien; Lastmessungen sind möglich,
biologische Gleichwertigkeit lässt sich mit den ungezüchteten Startgenomen nicht bewerten.
Keine langen Evolutionskampagnen als Teil der automatisierten Tests.

## Umsetzungsblöcke

1. **Kern und Datenbesitz.** Ecosystem/Field/Body entlang Umwelt, Körper, Fortpflanzung,
   Population und Beobachtungen klarer abgrenzen. Änderungen über zuständige APIs;
   Cache-Invalidierung an deren Änderungen koppeln. Konkrete kleine Komponenten, geringer
   zusätzlicher Aufwand im Schrittpfad. Offen; Codex-Kandidat, vor Dateieingriff reservieren.
2. **Schrittphasen.** Abhängigkeiten Entwicklung → Wahrnehmung/Bewegung → Kontakte/Fressen
   → Energie/Fortpflanzung festhalten und an relevanten Grenzfällen prüfen. Parallelisierung
   und verschiedene Aktualisierungstakte dürfen keine Doppelbuchungen oder veraltete
   Zustände erzeugen. Offen, beide Versionen getrennt prüfen.
3. **Genom/Bauplan/Laufzeit.** Unveränderliche Programme, Anatomie und Topologie teilen;
   individuelle Aktivitäten, Gewichte, Schäden, Entwicklung und Zelltod separat halten.
   Restliche globale Laufkonfiguration auf ihren Besitzer prüfen. v019-Anatomiecache korrigiert:
   `1f1c9e1` berücksichtigt die aktuelle Anatomie zusätzlich zur Zahl toter Zellen.
   Geschützte Eier bekommen beim Entwicklungsbeginn ihre eigenen Organwerte; Speichern und
   Fortsetzung bleiben gleich. Gehirnersatz stellt auch die richtige neurale Erhaltung her.
   Übriger Block offen, Schwerpunkt v019.
4. **CPPN und Ei.** Bestehende Programme und Bauplancaches wiederverwenden; aufwendige
   Textvergleiche von Genomen untersuchen. Kandidatensuchen begrenzen und Arbeitsbudgets
   bei gleichzeitigen Eiern fair verteilen. Schlupf bei vielen Eiern kurz testen.
   Budgetblock integriert: v018b `135363b`/`c562e1e`, main `db3deac`/`5b8876a`, je 33/33.
   Finalisierungsgrenze wird vor dem Synapsenbau eingehalten; sechs Eier bei Grenze eins
   über sechs Schritte, Speichern/Weiterentwicklung und begrenzte Importreserve geprüft.
   Gleiche Priorität teilt Arbeit gleichmäßig, gemeinsame Baupläne zählen nur einmal.
   v019 zählt geometrische Paarprüfungen mit und speichert deren Fortschritt; eingefrorene
   Kopie bleibt während weiterer Entwicklung unverändert. v018b-Replay folgt auch früheren
   Anatomie-Unterbrechungen bis zum gespeicherten Fortschritt.
   Gründervergleich ohne Textumwandlung: v018b `cdadd16`, main `323c729`, je 33/33.
   main verwechselte zuvor Gewichte mit nur einem Float-Schritt Abstand durch Textrundung.
   Drei Kurzvergleiche à 1000 unabhängige gleiche Startgenome: v018b 106,64→0,185 µs,
   main 196,30→0,649 µs pro Vergleich; kein Gesamtbenchmark der Suche. Weiter offen:
   Programmwiederverwendung und bessere Begrenzung der Kandidatensuche.
   Allgemeiner Genomvergleich zusätzlich beschleunigt: v018b 27feff8 / main b43a596.
   Gleiche Genkopien werden gemeinsam durchlaufen; umsortierte Gene weiterhin über ihre
   IDs zugeordnet. Modellunterschiede bleiben erhalten (v018b branch, main port).
   Drei alternierende Kurzvergleiche mit der eingebauten Methode: v018b drei gezüchtete
   Linien 14,45–19,52→0,54–0,74 µs; main Start/Schnapper 20,11/33,45→0,72/1,00 µs.
   Das gilt für unabhängige identische Genkopien; umsortierte Genome bleiben ungefähr
   gleich teuer. Kopie, Umordnung, veränderte Knoten/Kanten und Seeds geprüft; je 33/33.
5. **Synapsenkapazität.** In v019 belegte Verbindungen günstiger durchlaufen; Reserveplätze
   zur Neubildung erhalten. Masken/aktive Blöcke gegen SIMD messen, einschließlich
   Formung/Entfernung und hormonellem Zelltod. Erster Block integriert: vollständig leere
   Blockenden anhand der aktuellen Indizes überspringen; die Reserven bleiben für neue
   Verbindungen erhalten. Kein zusätzlicher Cache, kein geänderter Lern-/Energietakt.
   Neubildung über alte Grenzen, schwache Verbindungen entfernen, leere Teilblöcke,
   unterschiedliche Reservegrößen, Laden/Weiterlernen, Reset und v019-Zelltod geprüft.
   v018b `b3740a5`, main `1cdf2aa`; je 33/33 und Format grün, remote verifiziert.
   Je drei alternierende Kurzvergleiche: isoliertes Lernen an drei gezüchteten v018b-Linien
   ca. 28–33 % schneller; v019-Startgenom 137→53 µs. Vollständige Gehirnzustände identisch.
   Aquariumlasttest: 32 geschützte erwachsene Fische, 1230×820, ein Worker, 100 Schritte,
   Fortpflanzung abgeschaltet. v018b Algenzupfer 5,84→5,20 ms, Gründler 5,95→5,27 ms,
   Siebmaul 5,68→4,81 ms je Schritt (ca. 11–15 %). v019-Startgenom 5,80→2,55 ms.
   Jeweils Median aus drei Läufen, gespeicherte komplette Weltzustände identisch.
   Das sind technische Lastfälle im einfachen Becken, keine Nachweise natürlicher Lebens-/
   Zuchtleistung. Zusätzlicher Vergleich im regulären Startbecken: 868 Oberflächen,
   98 tatsächlich platzierte Futterstücke (3000 angefordert, Energie/Nischen begrenzen),
   32 geschützte Algenzupfer-G11, sonst gleiche Bedingungen. 9,94→9,34 ms/Schritt,
   ca. 6 %; drei alternierende Vergleiche, vollständige Weltzustände identisch.
   Lücken innerhalb belegter Blockenden und weitere Masken/SIMD-Vergleiche bleiben offen.
6. **Gehirnarbeit.** Temporäre Speicher wiederverwenden, statische Zuordnungen vorberechnen,
   konstante Hormonantworten untersuchen. Bisheriger einfacher Rezeptor-Sonderpfad hatte
   keinen allgemeingültigen Zeitvorteil; nur nach wiederholter Messung übernehmen.
   Erster Block integriert: Hormonantworten je Zelle zusammen auswerten; v018b zusätzlich
   die genetische Netzhautwellenperiode in der unveränderlichen Topologie vorberechnen.
   Drei gezüchtete v018b-Linien, je drei Kurzvergleiche à 400 neuronale Schritte: Lernen
   durch die Hormonreihenfolge ca. 2–6 % schneller, Periodenvorbereitung zusätzlich 1–3 %.
   Vollständige gespeicherte Gehirnzustände identisch. v019 nur Hormonreihenfolge, Startgenom
   als technische Last ca. 4 % schneller beim Lernen. Keine Gesamt-Aquarium-/Biologieaussage.
   Integriert: v018b `0a745db`, main `2907751`; je 33/33 und Format grün. Weiteres offen.
7. **Wahrnehmung.** Sichtkandidaten räumlich eingrenzen, gemeinsame Augen-/Rezeptorarbeit
   bündeln, vorberechnete Geometrie und gröbere Auflösung testen. v018b: allein drei
   Sehfunktionen etwa 18 % Eigenzeit im Profilfall. Akute Kontakte weiter rasch behandeln.
   Erster Block integriert: Optik-Arbeitsspeicher je Thread wiederverwenden und sortierte
   Rezeptornachbarn linear durchlaufen. Drei gezüchtete v018b-Linien, drei Kurzvergleiche:
   kompletter Sehpfad ca. 1,5–2 %, sofortige Filterung ca. 9–17 % schneller; Werte identisch.
   Unsortierte/doppelte Rezeptorwinkel, Grenzabstände, Augentrennung sowie wechselnde
   Beobachter und Wassertrübung geprüft. v018b `4cade98`, main `e190b69`; je 33/33 grün.
   Räumliche Eingrenzung und gröbere Auflösung bleiben offen.
8. **Takte.** Aktivität, Lernen, Umbau, Umwelt und Statistik getrennt takten. Lernintervalle
   2/4/8 testen und Zeitkonstanten auf verstrichene Schritte beziehen. v018b: isoliertes
   Gehirn etwa 38/54/62 % schneller; Algenzupfer in drei Versuchen 105 gegenüber 92 Nachkommen
   bei Intervall 1/8. Abweichung akzeptierbar, anhand Nutzen pro realer Rechenzeit bewerten.
9. **Physiologie/Energie.** Transfers für Aufnahme, Darm, Reserve, Gewebe, Arbeit, Ausscheidung,
   Tod und Gonaden übersichtlich buchen. Anatomische Kapazität und aktive Leistung trennen.
   Einheiten, Grenzfälle und subsystemübergreifende Buchungsregeln prüfen. Lebensschutz-Review
   integriert: v018b `2140d4d`, main `b8b5016`, je 33/33. Legezyklen toter Tiere im Archiv
   beenden; Alter oberhalb 2 Mio. bleibt ladbar und sättigt am int-Maximum; geschützte Eier
   bleiben entwicklungsfähig, Nähreier erhalten keinen Schutz/keine Wiederbelebung.
   Wiederbelebung prüft Energie- und Gehirnbudget vor dem Eingriff. Benannte/geschützte
   Tiere werden beim Setzen oder Verschieben von Steinen nicht gelöscht. Regressionen
   vor Fix bestätigt. Weitere Reviewkorrekturen v018b 11c0034 / main 31a1908:
   Archivpositionen beim Verkleinern des Beckens mitführen; Laden und Wiederbelebung nach
   1230×820→615×410 geprüft. Schutz einschalten prüft zusätzliche Körperenergie vor der
   Änderung und lässt bei Ablehnung den ganzen Zustand unverändert. Benannte entwicklungsfähige
   Eier bleiben ebenfalls von der Nährei-Umwandlung ausgenommen. Je 33/33.
   Übrige Transfer-/Buchungsarbeit offen.
10. **Umwelt/Indizes.** Wasser, Sediment, Pflanzen, Licht, Duft und Nahrungsnetz gröber bzw.
    nach Bedarf aktualisieren; Geometrie und Indizes wiederverwenden. Bestehende
    Teilaktualisierungen ausbauen; lokale Kontakt-/Futter-/Eierabfragen untersuchen.
    Historische Grundlast ohne Fische: v018b etwa 6–7 ms/Schritt im damaligen Profilfall.
    Neues Kurzprofil nach Punkt 5 (31.10.): reguläres Startbecken 1230×820, 868 Oberflächen,
    98 Startfutterstücke, ein Worker, 100 Schritte: ohne Fische ca. 1,8 ms/Schritt;
    Sediment/Nahrungsnetz 0,7 ms, Pflanzen 0,4 ms, Drift/Index 0,4 ms. Mit 32 geschützten
    Algenzupfern ca. 9,3 ms, davon Sinne/Gehirne/Bewegung ca. 7,4 ms. Aufbau und Rechner
    entsprechen nicht nachweislich dem historischen Profilfall; daraus keinen allgemeinen
    Beschleunigungsfaktor ableiten. Keine zusätzliche Umwelttaktung umgesetzt.
11. **Evolution/Population.** Founder-Suche, Mutation, Rettung und natürliche Reproduktion
    getrennt ausweisen. Eigene v019-Zuchtlinien aufbauen; Hilfsmaßnahmen dürfen die
    Bewertung natürlicher Leistung nicht verdecken. Modelländerungen pro Version beachten.
    v019-Schnapper lädt am aktuellen Modell und schlüpft ohne Schutz. Sechs kurze
    Futterfeldproben mit Original/Varianten von Mund- und Schwanzschwellen: je 256 Schritte
    Schlupf, anschließend 256 Schritte bei 50 festen Futterstücken à 50 Energie.
    Aufnahme 0,78–6,36, gespeicherte Körperenergie sinkt um 40–73; noch kein ausreichender
    Gründer. Kleine Kontaktportionen unter crumb_min zerfallen: erste Probe deshalb
    korrigiert; belastbare Kontaktprobe verwendet 50 Energie und ruhende Anfangsbewegung.
    Keine Variante in die ausgelieferten Beispielgenome übernommen.
    Zusätzliche Energiediagnose: Original in 256 Futterfeldschritten 3,51 Aufnahme bei
    22,78 Kieferarbeit, 15,40 sonstiger Muskelarbeit und 10,63 Grundkosten; Gehirnanteil
    davon 0,20. Weniger tonischer Kieferbedarf reduziert den Verlust auf 34,26, nimmt aber
    nur 2,62 auf. Kürzere Kiefertakte erhöhen Aufnahme auf 10,14, Verlust bleibt 40,43.
    Geänderte Flossentakte/Kreuzung helfen in diesen Proben nicht. Alle Varianten nur im
    Arbeitsverzeichnis; kein ausreichender Gründer und keine Änderung der Modellparameter.
12. **Beobachtungen/Analyse.** Statistik und Hormonanalyse müssen bei kleinen Populationen
    und kurzer Lebensspanne rechtzeitig aussagekräftig werden. Günstige laufende Aggregation,
    gezielte teure Auswertung und Abschluss bei Lebensereignissen untersuchen. Offen.
13. **Datenvertrag.** Vorhandenes Schema konsequent für Feldlisten, Gehirnlayouts, Parameter
    und Befehle nutzen. Vollbilder, Deltas, Layoutwechsel und fehlende Assets eindeutig
    behandeln. Auftretende echte Datenpfade in Browserprüfungen absichern. Teilweise umgesetzt:
    Kleintierzeilen haben jetzt 26 zentrale Feldnamen für C++/Python/JavaScript; JSON-Produzent
    und binärer Bildadapter verwenden sie. Echter C++→JS-Abgleich aller Felder für Würmer,
    Krebse, Muscheln, Leerschalen und Fraßspuren einschließlich Änderungen/Löschen/Neustart
    des Bildstroms. Integriert: v018b `778e3fb`, main `b17ee6a`; je 33/33 und Format grün.
    Arten und Zustände zusätzlich benannt: v018b `a15cf2c`, main `ac8fb08`;
    FOOD_KIND, INVERTEBRATE_KIND und MUSSEL_STATE für alle drei Sprachen. Leerschalen sind
    Muscheln mit state=1, Krabben kind=8. Echte Bilddaten entsprechend geprüft. Claude
    hat UI-Verbraucher auf v018b in `c253ef4`/`e8d9bab` umgestellt; main-Port bei ihm.
14. **Prozesse/Aufträge.** Engine, Bestätigungen, Beobachtungswechsel, Archiv und HTTP klarer
    trennen. Sperren kurz halten, IO entkoppeln und Warteschlangen begrenzen/zusammenfassen.
    Ende/Neustart/Abbruch müssen Aufträge abschließen. Engine-Pfadwahl im ersten Codex-Block
    vereinheitlicht; restlicher Umbau offen. Journal/HTTP aktuell bei Claude. Reproduzierten Namens-Race aus seinem Review-Block
    korrigiert: v018b `67bcd14`, main `e48d6fc`. Engine-Erinnerung und Namensdatei werden
    über lifecycle als ein Vorgang serialisiert; self.lock bleibt beim Warten auf die
    Engine-Antwort frei. Thread-Regression schlägt vorher mit benanntem, nicht erinnertem
    Fisch fehl und besteht nach der Korrektur.
15. **Frontend-Zustand.** Gegenseitige Modulabhängigkeiten und Reset-/Initialisierungspfade
    ordnen; verspätete Workerantworten und historische Ansichten klar zuordnen. Claude
    bearbeitet Mobile und trennt Datenmodelle von Ansichten (u. a. da1be37/73bc5be). Nicht
    parallel neu aufbauen; weiteren Bedarf anhand des neuesten Stands prüfen.
16. **Darstellungsfehler.** Früher v018b: `b.neurons is not iterable`; v019: `best.t` bei leerer
    Pigment-Auswahl. Claude hat seitdem u. a. in 932d58f Datenübernahme/Mind geändert.
    Beide Befunde am aktuellen Stand nachprüfen, kein blindes erneutes Anwenden alter Fixes.
    Fehlererholung und Übersicht → Gehirnzoom → zurück mit weiterlaufenden Bildern testen.
17. **Szenen/Worker.** Unveränderte Szene vor teurer Rekonstruktion erkennen; getrennte
    Änderungsstände für Aquarium, Pflanzen, Sediment, Morphologie und Bewegung. Sichtbarkeit
    und Detailstufen früh anwenden, Puffer teilen und Objektneubildung reduzieren.
    Erster Engine-Block integriert: unveränderte Szene bei gleicher Ansicht/gültiger Basis
    ohne erneute Objekterfassung und Differenzsuche senden. Eigener Befehlszähler verhindert
    veraltete Bilder bei unnummerierten Befehlen/wiederverwendeten Anfrage-IDs.
    v018b `0663f8a`, main `c98d9ed`; je 33/33 und Format grün. Native Bytegleichheit sowie
    echte Engine→Browser-Prüfungen für Wiederholung, Eingriffe und Schritte.
    Kurzmessung v018b (256 Fische, 3000 Futterstücke, keine Simulation): Capture/Codierung/
    Assets 1,63–1,67 ms → 0,00040–0,00043 ms je unverändertem Bild, drei Läufe à 100.
    Das misst einen Teilpfad; die früheren 4–5 ms sind damit nicht insgesamt neu bewertet.
    Laufende Szenen, feinere Änderungsstände, Worker und Puffer bleiben offen.
18. **Speicherung/Archiv.** Synchrones Erfassen/Kopieren trotz asynchronem Schreiben
    verkleinern; gemeinsame unveränderliche Daten teilen und kompaktere Speicherung für
    v019 prüfen. Verlauf inkrementell/begrenzt aufbereiten. Atomare Speicherung behalten.
    v018b-Beispiel mit 256 Tieren: Kopieren etwa 64 ms, Datei 135 MiB. Journal bei Claude.
    Korrektur integriert: Genome erinnerter toter Fische ebenfalls von der laufenden
    Innovationsgeschichte trennen. Regression vor dem Fix nachgewiesen; gespeicherte Kopie
    bleibt nach weiterer Evolution unverändert und lässt den Fisch nach Laden wiederbeleben.
    v018b `db36b8a`, main `f09023f`; je 33/33 und Format grün.
    Kompakte Gehirnspeicherung integriert: v018b `938b281`, main `af678c8`; je 33/33.
    Blöcke aus 128 gleichen float-Bitmustern einmal speichern, sonst Rohwerte. Negative Null,
    Teilblöcke, leere Arrays, NaN, ungültige Marker und Abbrüche geprüft; Fehlversuch lässt
    das aktive Gehirn unverändert. Drei alternierende Kurzvergleiche mit 32 Fischen/20 Schritten:
    v018b Algenzupfer 17,31→9,08 MB, Schreiben 31,75→19,34 ms, Lesen 39,63→35,08 ms.
    v019 Startgenom 32,26→4,64 MB, Schreiben 43,88→17,14 ms, Lesen 60,39→39,94 ms.
    Weiterlauf nach Laden jeweils vollständig identisch. v019-Vergleich auf beiden Seiten
    mit derselben Ladekorrektur `eb4834c`: Rekonstruktion zählt Beobachtungen nicht doppelt,
    Beobachtungswerte behalten double-Präzision, gemeinsam genutzte CPPN bleiben geteilt;
    unabhängige identische Genome bleiben unabhängig. Ei-Fortsetzung und Mutationsskalen
    geprüft. Erfassen/Kopieren und Verlauf bleiben weitere Ansatzpunkte.
19. **Build/Test/Diagnose.** Erster Codex-Block fertig: CPU-/Compilerziel-Fingerprint,
    gemeinsame BUILD_DIR-/Sanitizer-Auflösung aller Engine-Aufrufe, quotenbewusste
    Parallelität. Echter HTTP-Test ohne bin/fish und mit Pfad mit Leerzeichen; Make-Test für
    Wiederverwendung und CPU-Zielwechsel. v019 und v018b jeweils 33/33 Prüfungen grün.
    v019-Bauwerkzeuge zusätzlich repariert: `b05450b`, aktueller founders.hh statt entferntem
    founder_pool.hh, gemeinsames Make-Ziel founder-tools, Ausgaben in BUILD_DIR/v019-bau.
    Alle fünf Helfer kompiliert, CLI-Grenzen, Genombau, Anatomie, kurze Kontaktprobe und
    acht Aquariumschritte geprüft. Separater frischer Build mit NATIVE=0/LTO=0 erfolgreich.
    Portabler GCC-Wpsabi-Hinweis für ausschließlich dateiinterne SIMD-Werte eng begründet
    unterdrückt: main `9472999`, v018b `6c63dbc`; kein AVX-Zwang. Portable Tests main 4/4,
    v018b 3/3 ohne Warnungen; beide vollständigen nativen Suiten 33/33.
    GCC emitierte die ABI-Warnung teilweise erst nach dem abschließenden diagnostic pop.
    Nachkorrektur v018b 9b04856 / main 147ccb9: Unterdrückung bis zum Ende der
    Codeerzeugung; mit GCC 14.2 und -Werror=psabi bei O1/O3/O3+LTO vorher reproduziert,
    danach alle drei erfolgreich. Historischer Hinweis auf GCC 4.6 bleibt als note.
    Frische ASan/UBSan-Builds: state/lifecycle/Modell/ui_ecology/founders je 5/5 ohne Befund,
    mit halt_on_error. LeakSanitizer ist hier wegen ptrace technisch nicht ausführbar;
    diese getrennte Lecksuche war deaktiviert und ist ausdrücklich noch nicht geprüft.
    Weitere Aufgaben: reale Browserabläufe, kurze Lebenszyklen, repräsentative Benchmarks,
    weitere Sanitizerpfade/Lecksuche und echte OpenCL-Hardware. Source-only-/Mocktests allein reichen nicht.
20. **Modell/Parameter/Texte.** Einheiten, Grenzen, Parameterdefinition und Anzeige
    zusammenhalten; angeborene Eigenschaften, aktive Organe und beobachtetes Verhalten
    unterscheiden. Claude hat Texte bereits zentralisiert (9053486 u. a.). Nicht duplizieren;
    verbleibende Modell-/Parameterkonsistenz und Dokumentation pro Version prüfen.

## Erster Build-Block und Integration

- v019: `codex/backend-performance`, Build-Fix `e5e0b63`, mit Claude-main bis `a02e324`
  integriert als `a449019`. 33/33 Prüfungen grün, Formatprüfung bestanden.
- v018b: `codex/v018b-build`, entsprechender Fix `2fccb4a`, auf `b52aa48` aufgebaut.
  33/33 Prüfungen grün, Formatprüfung bestanden.
- Beide Fassungen: keine Änderung von VERSION oder Cloud-Konfiguration, keine UI-Dateien
  geändert. package.sh jeweils auf Basis von Claudes eigener Versionsliste erweitert.
- Integration vom Nutzer ausdrücklich freigegeben („Ich gebe alles frei, Claude kümmert
  sich gerade darum.“; durch die Übergabe aus dem alten Astra-Chat bestätigt).
  Laut Claudes Koordinationsmeldung vom 31.10.2026, 12:36 Uhr Wien, erneut integriert:
  v018b `c1f608b` und main `81bdb8f`, jeweils 33/33 Prüfungen grün.
  Die frühere Integrationssperre ist aufgehoben; den Build-Block nicht erneut einspielen.
  Diese Integrations- und Prüfangaben stammen von Claude und wurden in der neuen
  Codex-Sitzung noch nicht unabhängig am Code überprüft.

# Regelprüfung aller eingebauten Inspektoren (Claude, 14.11. 18:20)

**In dieser Arbeitsrunde geöffnet und gelesen (18:07–18:15):** `LEITLINIE.md` (ganz), `entwuerfe/AUFTRAG-1311.md`, `entwuerfe/AUFTRAG-1411.md`, `entwuerfe/FEEDBACK-1311.md`, `entwuerfe/FEEDBACK-2115-ERKLAERT.md`, `entwuerfe/DARM-UEBERGABE-FABLE.md`, `entwuerfe/DARM-FEEDBACK-0516.md`, `entwuerfe/DARM-ABNAHME.md`, `entwuerfe/ORGANOPTIONEN.md`, `entwuerfe/CODE-REVIEW-FABLE.md`, KOORD-Einträge mit „David“ ab 13.11. (aus dem Verlauf, `git log -p`), `bilder/2026-11-13_feedback/gut_darm-neben-schwanz.png`, `…/kontrast_darm-neben-gleichgewicht.png`.
**Geprüft an:** meinen Bildern vom laufenden Atelier heute (`bilder/2026-11-14_atelier/*`), Produkt `f4197ce6`–`206db9a7`.

Nichts davon ist von David abgenommen. Das hier ist die Liste dessen, was gegen seine Regeln verstößt. Sie ersetzt meine früheren „frei“-Meldungen, die gegen diese Regeln nicht geprüft waren.

## A. Verstöße, die (fast) alle neuen Inspektoren betreffen

| # | Regel (Quelle) | Befund | Betroffen |
|---|---|---|---|
| A1 | Musterverbot; Lebenszyklus je Organ eigen (LEITLINIE 1, 2.4, 2.7; AUFTRAG-1411 Pkt. 2) | Dasselbe Lebensband mit zwei Griffen „ab/bis“ unter allen | Seitenlinie, Tastsinn, Gleichgewicht, Schmerz, Blutsinn, Abwehr, Pigment, Seitenflosse, Maul, Drüse, Auge, Nahsinn |
| A2 | Keine Untertitel unter dem Organnamen, kein Satz im Panel (LEITLINIE 3, 4; AUFTRAG-1311 §3) | Jedes neue Panel beginnt mit einem Satz: „Spürt Wasser, das gegen die Haut strömt“, „Spürt, wo es gebissen wird“, „Hält Bisse ab und sperrt im Maul“, „Färbt den Fisch für fremde Augen“, „Beißt und saugt“, „Rudert“, „Schüttet A“, „Liest Reserve“, „Meldet Unterschiede“, „Spürt, wie nah etwas ist“, „Riecht Aas“. Die guten Beispiele haben **ein Wort, das sagt, was für ein Fisch daraus wird** („Räuber“, „Schwanzschläger“) | alle zwölf, dazu Nase |
| A3 | Nutzen und Kosten oben als Kopfzeile, Kosten als Anteil am Ruhebedarf (LEITLINIE 2.3, 5) | Keine einzige Kosten-Kopfzeile bei den neuen Panels | alle zwölf |
| A4 | Keine Modellwörter („Streuung“, „Bauplan“, „Höchststärke“, „Beispiel“), keine Schieber (LEITLINIE 3, 4) | Unter jedem Organ „Streuung beim Zellbau“, bei Muskeln „Kontakte im Bauplan“ mit Schieber „Elektrische Höchststärke“. **Berichtigt 18:12:** „Auslöser“ mit Ankreuzfeldern und „Reife / Botenstoff“ ist **kein** Verstoß, es ist Davids gutes Beispiel „Lebenszyklus der Zelle“ (`bilder/2026-11-13_feedback/entwurf_01_lebenszyklus-der-zelle.png`, AUFTRAG-1411 Pkt. 1) | alle Organe |
| A5 | LEITLINIE 0: Jeder Organentwurf beantwortet, wie seine Zellen im Ei aktiv sind und wann ihre Bahnen härten | Im Bild bei keinem neuen Organ beantwortet (nur Auge: Wellen) | elf von zwölf |
| A6 | Verbindungen zu anderen Organen zeigen, mit einem Klick wechseln und verbinden (LEITLINIE 2.11, 2.7) | Fehlt überall | alle zwölf |

## B. Je Inspektor, gegen Davids Wortlaut vom 13.11.

| Organ | Davids Wortlaut (Quelle) | Stand heute | Verstoß |
|---|---|---|---|
| Seitenflosse | Minifisch, der sich durch ein Gebiet bewegt; beide Flossenpaare in einen Inspektor; Knopfreihe unnötig (AUFTRAG-1311 §4 Flossen) | Stehender Fisch mit Pfeilen; darunter alte Richtungs-Chips →/←/→← und Kasten „16 Zellen je Knoten“ | Knopfreihe, Zellzahl, kein Minifisch, ein Paar |
| Maul | Biss-Diagramm = ganze Maulbewegung (öffnen = saugen, schließen = beißen), Kiemen gehören dazu; Maul–Darm zeigen; Zähne viel zu klein (2115 Maul) | Kopf mit Kiefern und Futterkacheln; darunter alte Funktions-Chips „Vortrieb/Lenken/Ansaugen/Zubeißen“ und „16 Zellen je Knoten“ | Kiemen fehlen, Darm fehlt, Knopfreihe, Zellzahl |
| Abwehr | Stacheln an Maul, Auge, Schwanz zugleich darf es nicht geben; Angreifer ins Fischpanel; senkrechter Fisch passt besser (AUFTRAG-1311 §4, 2115 Abwehr) | Maul als Knopf **im Inspektor**; Stachelplätze weiter überall erlaubt (`development_sites.hh`) | Probe im Inspektor, anatomisch Unmögliches möglich |
| Pigment | Grundfarbe wählen, braune Fische möglich, je Knoten färben (AUFTRAG-1311 §4) | Grund als Eingabe, Kerben im Lichtband; eine Grundfarbe gibt es nicht | Davids Kernwunsch offen (Engine hat keine Grundfarbe, ORGANOPTIONEN) |
| Gleichgewicht | Was hat der Fisch davon: aufrecht bleiben, Kosten, Reife; Verbindung zu den Muskeln, die ihn aufrichten (AUFTRAG-1311 §2) | Rose mit Fisch und Lebensband | Nutzen, Kosten, Muskelverbindung fehlen |
| Drüse | Wie lange sie abgibt, hängt vom Eingang ab (bis 8000 Schritte) (AUFTRAG-1311 §4) | Befehl dauert im Bild fest 144 Schritte; nur Stärke einstellbar | Eingabe nicht als formbare Kurve (LEITLINIE 3) |
| Tastsinn | Hinzufügen neuer Zellen hässlich; Grafik zu klein (FEEDBACK-1311 Tasten) | Hautschnitt; (+)/(−)/(×) nicht gesehen | (+)/(−)/(×) wie beim Darm prüfen |
| Auge | Original bleibt Grundlage (AUFTRAG-1311 §0) | Oberer Teil alt: „39 Beispielzellen“, „Bauplan“ am Spektrum, Textzeile „Mitte 180° · Breite 100 % · Gegenfarbe hemmt 0 %“ | Wort „Beispiel“, Modellwort, Satz |
| Blutsinn | „Beispiel“ weg, mehr Optionen (AUFTRAG-1311 §4) | kein „Beispiel“ mehr; Optionen nicht nachgezählt | offen |

## C. Was ich falsch gemacht habe
- Ich habe ab Schritt 8 gegen Code und Einzelpunkte geprüft, nicht gegen diese Liste. Dadurch sind A1–A6 bei jeder meiner Freigaben durchgerutscht.
- Den Schlupfstrich aus der Engine habe ich angestoßen, obwohl David 08:11 „schematischer Strich reicht, das Atelier muss das nicht ausrechnen“ gesagt hatte.

## D. Vorschlag, wie wir weitermachen (nach Pro und Contra, zur Abstimmung unter uns)
1. Nichts Neues bauen, bis A1–A6 je Organ eine Antwort haben.
2. Reihenfolge: zuerst A2 und A4 (Sätze und Modellwörter entfernen, das ist reines Streichen und verletzt nichts), dann A1/A5 je Organ aus der ORGAN-Seite (Leben eigen, Ei-Verdrahtung), dann A3 (Kosten aus dem Planbericht), dann B je Organ.
3. Jede Änderung beginnt mit dieser Datei und der Pflichtlektüre, neu geöffnet.

## E. Neue Durchsicht „alles von vorne“ (nach David 18:13), je Organ
Pflichtlektüre in dieser Runde neu geöffnet: `LEITLINIE.md`, `AUFTRAG-1311.md`, `AUFTRAG-1411.md`, `FEEDBACK-1311.md`, `FEEDBACK-2115-ERKLAERT.md`, `DARM-UEBERGABE-FABLE.md`, `DARM-FEEDBACK-0516.md` (18:15 erneut), `DARM-ABNAHME.md`, `ORGANOPTIONEN.md`, `CODE-REVIEW-FABLE.md`, Bilder `gut_darm-neben-schwanz.png`, `kontrast_darm-neben-gleichgewicht.png`, `entwurf_01_lebenszyklus-der-zelle.png`.

### Für alle Panels (gemeinsame Teile)
- **„Beispielwerte“** steht oben in jedem Panel. Das Wort „Beispiel“ ist verboten (AUFTRAG-1311 §3, LEITLINIE 4).
- **„links | gleich | rechts“** als Segmentknöpfe oben bei paarigen Organen: Segmentknöpfe sind Teil des verworfenen Musters (KOORD 13.11. 18:06). Bitte prüfen, ob die Seitenwahl im Fischbild selbst gehen kann.
- **„Kontakte im Bauplan“** mit Schieber „Elektrische Höchststärke“ bei Muskeln (A4).

### Darm (`bilder/2026-11-14_atelier/darm_durchsicht_1820_*.png`)
- Gut: Kopfzeile „Allesfresser · 11,4 % des Ruhebedarfs“; Magen und Schlingen als Hauptbild mit „satt“; Ertrag mit Fenster des Muskels; „Sättigungsgefühl“, „Bauchweh“ mit „an Schmerz gewöhnt“, „Reizschwelle für Bauchweh nach Futterart“; „Belohnungssignal“ ohne lange Zeitachse.
- **Verstoß:** Der „Lebenszyklus“ beginnt beim Ei-Symbol, die Futterbänder liegen über die ganze Breite. David 21:15: „Das Ei wird gezeigt, obwohl der Fisch da nichts frisst.“ (FEEDBACK-2115 Darm/Lebensbild, LEITLINIE 3 „Was nicht gilt, wird nicht gezeigt“).
- **Prüfen:** DARM-FEEDBACK-0516 Pkt. 1–2 (jung/erwachsen mit Fischsymbolen, führendes Futter je Tempo): Am rechten Rand stehen Fleisch/Plankton/Flocken als Namen; ob das „Futter, das beim Tempo dieses Alters am meisten bringt“ ist, habe ich nicht am Code nachgesehen.

### Schwanz (`bilder/2026-11-14_atelier/schwanz_durchsicht_1820_*.png`)
- Gut: „Schwanzschläger · 2,4 % des Ruhebedarfs“, Muskel mit Faserbändern, Faserleiste ausdauernd–kräftig, Kraft mit Erschöpfung und „Befehl aus“, Geschwindigkeit „im Wasser / tief im Sand“. Das ist Davids Beispiel.
- **Prüfen:** Unter dem Lebenszyklus die Funktions-Knopfreihe „Vortrieb / Lenken / Ansaugen / Zubeißen“. Sie wählt echte verschiedene Muskelarten, ist aber eine Knopfreihe (LEITLINIE 3). Der bekannte Fehler „mittiger Muskel → Lenken“ hängt dort.

### Auge nach Rücknahme (`54c5e903`, 18:30)
- Klick auf die Szene schaltet hell → dunkel → beide; Empfindlichkeit ziehbar (mit der Maus geprüft). Der Fehler vorher: `controller.js` schluckte den Klick, der Test umging den Controller (Astra hat Test und Code berichtigt).
- Bleibt (alt, von David nicht kritisiert, nur gemeldet): „39 Beispielzellen“, „Bauplan“, Textzeile „Mitte 180° · Breite 100 % · Gegenfarbe hemmt 0 %“; unter „Lebensphasen“ ohne Häkchen der Satz „Die Zelle lebt mit dem Fisch: von Anfang an, immer aktiv“.

### Ältere Inspektoren, neu gegen die Regeln (Bilder `durchsicht_1835_*.png`, `ohne_band_1830_kiefer_flosse_nahsinn_nase.png`)
Pflichtlektüre wie oben, 18:18–18:21 neu geöffnet.
| Organ | Gut (Element nur hier) | Verstoß / prüfen |
|---|---|---|
| Schwimmblase | Becken mit Grund, Pflanze, Oberfläche; Kopfzeile „Schwebt bei 53 % Füllung · 1,6 % des Ruhebedarfs“ | Lebensbild zeigt das Ei mit, obwohl der Auftrieb erst nach dem Schlupf greift (ORGANOPTIONEN Schwimmblase, LEITLINIE 3) – prüfen, ob das Bild dort etwas Gültiges zeigt |
| Kiemen | Kopf mit Reusen, Reusenbogen Plankton/Flocken, „Darm ›“ als Verbindung (A6 hier begonnen); Kopfzeile mit 2,4 % | – |
| Eiorgan | Fisch mit Eiballen, Füllen/Ablegen als Sägezahn; „Ein Ei alle 106 Schritte“ | keine Kosten in der Kopfzeile (A3) |
| Spermienorgan | Wolke vor dem Fisch; Lebensbild „Schlupfsekret → Samen“ (Davids Punkt: Samen dienen dem Schlupf) | keine Kosten (A3) |
| Barteln | Geschmackskarte mit Stein, Meldung schmeckt–tastet | **Lebensbild rechts abgeschnitten** „schmeckt u…“ (LEITLINIE 4); **Probe „was die Spitze berührt“ (rotes X) im Inspektor** (FEEDBACK-2115 Nase: „Die Geruchsprobe gehört nicht ins Panel, sie ist im Fischpanel“; LEITLINIE 3); keine Kosten |
| Nase | Geruchskarte groß, Duftzellen mit (−)/(+) | **Lebensbild rechts abgeschnitten** „links und re…“; **„Duftprobe“ (rotes X) im Inspektor** (wie Barteln); Satz „Riecht Aas“ (A2); keine Kosten |

### Meine sechs nach `f02e4cba` (ohne Band), Bilder `ohne_band_1830_haut.png`, `ohne_band_1830_blut_abwehr_pigment_druese.png`, `durchsicht_1838_hautsinne.png`
- **Seitenlinie, Tastsinn, Schmerz:** Oben je ein eigenes Bild (Strömungsfächer, Hautschnitt mit Druck, Fisch mit Bissstellen). **Darunter derselbe Block bei allen dreien:** Überschrift „…zellen“, Nervenzelle mit Axon, senkrechter Regler, „Signalverlauf bei …“, Achse „Schritte 300 600 900“. Davids Kritik 17:54 an genau diesen drei war „sehen fast gleich aus … obwohl es Hautsinne sind“. Der Block stammt aus dem Darm (dort abgenommen, drei Zellarten). Zu entscheiden mit Für und Wider: Für den gemeinsamen Block spricht eine Bedienung für alle Sinneszellen (Darm-Vorbild, LEITLINIE 2.9 „einheitlich“). Dagegen spricht das Musterverbot (LEITLINIE 1: „senkrechter Schwellenregler“ steht im verbotenen Muster) und dass der untere Block hier den größten Teil des Panels ausmacht. Mein Vorschlag: Block bleibt als Werkzeug, aber der Reiz kommt aus dem eigenen Bild (Strömung aus dem Fächer, Druck aus dem Hautschnitt, Biss aus dem Fisch) und die Achse zeigt die Zeit nur, wo sie zählt (Tastsinn gewöhnt sich nicht: flaches Band über 900 Schritte sagt nichts, LEITLINIE 3 „keine Achse, die nichts bedeutet“).
- **Tastsinn:** (+)/(−)/(×) im Bild nicht zu sehen (David 17:54: Hinzufügen hässlich). Prüfen, ob es fehlt oder nur bei Auswahl erscheint.
- **Gleichgewicht:** nur noch der Ring mit Fisch und „unten“. Keine Meldung, kein Nutzen, keine Kosten, keine Verbindung zu den Muskeln, die aufrichten (AUFTRAG-1311 §2). Das größte Loch.
- **Blutsinn:** Rad mit Stoffen und Körperwerten, Meldung „nichts–voll“; „Liest Reserve“ als Satz (A2).
- **Abwehr:** Fisch mit Stacheln; Maul-Probe im Inspektor? (B, prüfen am neuen Bild: die roten Linien am Maul).

## F. Stand 19:25 (was seit 18:13 geändert und von Astra und Claude im laufenden Atelier geprüft ist)
| Änderung | Commit | Geprüft | Bleibt offen |
|---|---|---|---|
| Auge zurück, Klick auf Szene wieder wirksam | `8f75ec11`, `2865f76a`, `54c5e903` | ja, Maus | „Beispielzellen“, „Bauplan“, Textzeile (alt) |
| Gemeinsames Lebensband aus 11 Organen | `f02e4cba` | ja | diese 11 haben kein eigenes Lebensbild (A1/A5) |
| Sätze über den Bildern weg | `918fd2a8` | ja | – |
| Nase/Barteln Lebensbild nicht mehr abgeschnitten | `55e58062` | ja | – |
| Gleichgewicht: beide Seiten, Lage als Eingabe, Blitz = Reiz, Weg zur Motorik | `fd452699`, `33df00f4` | ja, Maus | Zustand „Motorik verbunden“ im Startfisch nicht prüfbar |
| Tastsinn: Hautschnitt mit Drucktiefe, ohne gemeinsamen Block | `6aa7eabb`, `818bd26e`, `2a490d12` | ja, Maus (letzter Commit nur am Prüfstandbild) | – |
| Schmerz: Wunde nur aus dem Fischpanel, Zeitknopf weg | `4356965b`, `15c02fcf` | ja, Maus (19:50: Wunde im Fischpanel gezogen, Verlauf folgt schon beim Ziehen) | Rest des gemeinsamen Blocks (Nervenzelle, senkrechter Regler) |
| Seitenlinie mit Wasserbahnen | – | – | nicht begonnen |

Weiter offen für alle: A3 Kosten in der Kopfzeile (Bericht liefert seit `e6ce7dc4` den Ruheunterhalt je Gruppe), A4 „Beispielwerte“/„Streuung beim Zellbau“/„Kontakte im Bauplan“, A6 Verbindungen (nur Kiemen „Darm ›“, Gleichgewicht „Motorik“), B je Organ (Kiefer/Seitenflosse alter Muskelblock, Drüse feste 144 Schritte, Pigment Grundfarbe, Darm-Lebensbild mit Ei), Hormon-, Lern-, Lebensphasen-Werkzeug ruhen.

## G. Stand 15.11. 03:05 (Fable; was seit David 02:11 geändert ist, mit Gegenleser)
Geöffnet dafür: Abschnitte E und F dieser Seite, `ERINNERN.md`, `NOTIZEN.md`, der Kanal ab 02:11. „Atelier“ = von Claude im laufenden Atelier mit der Maus geprüft; „Code“ = Diff von Astra oder Claude ganz gelesen. Ich selbst habe alles nur im Prüfstand ohne Fischpanel gesehen. Nichts davon hat David abgenommen.

| Änderung | Commits | Atelier | Code | Bleibt offen |
|---|---|---|---|---|
| Anschlüsse je Organ: Symbol, Leitung, Ziel; frei mit (+), fehlendes Zielorgan blass (A6) | `7829b4c7`, `828e6ed8`, `4ce141b9`, `53e78806` | ja (frei, verbunden, Sprung, ohne Motorik) | Astra (gleichseitig, gekreuzt, beidseitig am echten Plan) | Anschlüsse im Fischpanel nicht eigens gezeichnet; Doppelung mit der alten Liste bei Darm/Eiern/Drüse nicht angesehen |
| Kein zweiter Fisch im Inspektor (Schmerz, Seitenlinie); Feldbreite als Griff an der gefärbten Hautstrecke im Fischpanel, auch Tastsinn | `910b6cf6`, `2a526e75`, `53e78806`, `2523d6ac`, `7ba651fa` | ja (Strecke und Schnitt folgen beim Ziehen) | Astra | Seitenlinie: Zellkreise im Fischpanel folgen beim Ziehen noch nicht |
| Alle Griffe am Fisch größer und wirksam beim Ziehen | `7376a922`, `96550873` | ja (gemessen) | Claude nur `7376a922`; `96550873` steht aus (Astra); `6cbfdc77` Fable (03:19, drei Anmerkungen) | Nachsprung der Flossen behoben (Astra `6cbfdc77`, Claude 03:16 gemessen: 0 nach dem Loslassen) |
| Gleichgewicht: Lage = Schwerkraftprobe im Fischpanel (Astra `c4d57393`), Rose folgt, eigener Knopf weg, wirkliche Körperseite | `2a2b6ecc` | ja (gleiche Zahlen Fischpanel/Rose) | – | Ei; Kopfwort; „Aufrichten“ gibt es nur als Flucht-Drehung (Systemfrage) |
| Tastsinn: Schnitt mit Drucktiefe, Bericht in der Blase | `2523d6ac`, `bfc53e4e`, `1af63ece` | ja bis auf die letzte Lage der Blase | Claude (`818bd26e`) | Stufen selbst gerechnet (zwei Quellen); Ei; Kopfwort |
| Schmerz: Hautstreifen über die Zeit (Keil wächst zu, Marke „gewöhnt“), Griffe Schwelle/Gewöhnung | `690ca645`, `eb2518d7`, `5e30533a` | ja (beide Griffe, Probe im Fischpanel) | steht aus (Astra) | Kopfwort; Lebensbild |
| Seitenlinie: Haare im Wasser über die Zeit, Schwellenhaar, Marke „gewöhnt“ | `996c823d`, `768b6743`, `5e30533a` | ja (beide Griffe, Strömung im Fischpanel) | steht aus (Astra) | 16 Abtastpunkte der Abmachung vom 14.11. nicht gezeichnet (das Fischpanel zeigt sie); Kopfwort; Lebensbild |
| Ein Zeichen für die Meldung: Blase wie im Fischpanel in allen vier | `bfc53e4e`, `1af63ece` | ja (Zahlen Fischpanel = Inspektor bei Gleichgewicht und Tastsinn; Lage nach `1af63ece`: Blase ~9 px unter der Zelle, frei) | steht aus | Nase/Barteln/Blutsinn/Nahsinn zeigen die Meldung noch anders |
| Verlauf mit einem Eingang; gemeinsame Helfer an einer Stelle | `8aacaa26`, `6fcdd203`, `2e630d92`, `916735c1` | Nase und Schmerz ja; nach `2e630d92` und `916735c1` alle 20 Organe ohne Fehler geöffnet (Claude 03:04/03:06) | Astra (`6fcdd203`), Rest steht aus | `senseCourse` benutzt nur noch die Nase |
| Nase/Barteln: Probenkreuz und Legende weg, gewählter Duft am Namen | `29bd7f1f` | ja (Claude 03:12) | steht aus | alter Block „Duftzellen“ mit Nervenzelle |
| Drüse: Dauer des Befehls frei (8–8000 Schritte) | `b3698eed` | steht aus | steht aus | Engine-Grenze für die Dauer ungeklärt (8000 aus AUFTRAG-1311 §4); ein Knopf für zwei Größen |

**Nachtrag 03:25:** Kopfwort für die vier Hautsinne **verworfen** (Claude 03:14, Fable; siehe `NOTIZEN.md`) – die Spalte „Kopfwort“ oben ist damit kein offener Punkt mehr, die Kopfzeile bleibt leer. **Abwehr:** gelesen, nichts gebaut; Teilung von Fable und Claude vereinbart (Maul-Probe, Griffe und aufstehende Stacheln ins Fischpanel = Astra; Inspektor = Befehl „heben“ als Kurve, Aufrichten und Legen, Bremse = Fable), Astras Wort fehlt.

**Nachtrag 04:50 (Fable; „Atelier“ = Claude mit der Maus, „Code“ = Astra gelesen):**

| Änderung | Commits | Atelier | Code | Bleibt offen |
|---|---|---|---|---|
| Abwehr: Angreifer als Maul im Fischpanel, Griffe an den Stacheln, Stacheln stehen auf (Astra); Inspektor nur noch Fisch von vorn im Maul + Befehl „heben“ (Fable) | `63d62eda`, `ee0db9ce`, `589b6088` | ja | Fable hat `63d62eda` in Teilen gelesen; `589b6088` steht bei Astra aus | Aufrichten/Legen über die Zeit und Bremse nicht im Bild (Bericht liefert nur Spitzenwerte); „passt ins Maul“ nur erste Bedingung der Engine; Stachelplätze weiter überall erlaubt |
| Drüse: Dauer des Befehls frei; Knopf hält die andere Größe; Uhrstrich weg; Griffe kennen den Greifpunkt | `b3698eed`, `aa3d87ac`, `6a55ad95` | ja | ja | Zeitgriffe (Anstieg/Verweilen) nach dem Umbau nicht gezielt gezogen; Engine-Grenze der Dauer ungeklärt |
| Farbzellen: gewählt → Fisch im Fischpanel in voller Ruhefarbe; Farbe folgt beim Ziehen (Astra); Grund als Probe im Fischpanel in Engine-Farben (Astra), Inspektor liest sie | `80218b4b`, `0b2cad54`, `31153209`, `3eca1de0` | ja | `80218b4b` ja; `0b2cad54` von Fable gelesen (UI-Teil); `3eca1de0` steht aus | gewählter Knopf Fläche/Bodensatz nicht erkennbar (Astra); nackte Fläche = Reinblau der Engine; Braun in Ruhe (Grenze der Zellzahl klären); Tarnung als Wert aus der Engine |
| Blutsinn: Blutspiegel-Griffe als Behelf benannt | `36a323f2` | – (nur Kommentar) | ja | wartet auf das Lebensphasen-Werkzeug; Darm → Blut nirgends im Bild |
| Flossen folgen den Griffen am Fisch beim Ziehen (Astra) | `6cbfdc77` | ja (0 Nachsprung) | Fable (drei Anmerkungen) | – |

Aus der Reihe genommen: Eier/Samen (Bauchschnitt zeigt, was das Fischpanel nicht kann; keine Kritik Davids am Bild). Vereinbart, nicht gebaut: Seitenflosse (Fisch von oben zieht durch ein Feld; Knopfreihe trägt heute Schlagrichtung und Gegenspieler; Bahn muss aus der Engine kommen). Nicht begonnen: Maul (Kiemen/Reusen, Maul–Darm, alter Muskelblock).

**Nicht angefasst seit 14.11. (Abschnitte E/F gelten weiter):** Blutsinn, Abwehr, Pigment, Seitenflosse, Maul/Kiefer, Drüse, Nahsinn, Nase/Barteln (rotes X), Darm-Lebensbild mit Ei, Schwimmblase-Lebensbild; für alle: Fischpanel bedienen und neben den Inspektor legen (David 02:17) ist nur bei Gleichgewicht, Tastsinn, Schmerz, Seitenlinie geschehen. Offen für alle: Kopfwort und Kosten (A2/A3; Vorschlag für die vier Sinne im Kanal 03:02), „Beispielwerte“/„Streuung“ (A4), eigenes Lebensbild je Organ (A1/A5; hängt am Lebensphasen-Werkzeug im Fischpanel).

### Astra, 04:33 · Farbzellen und Code-Gegenlese

- `0b2cad54` ist gepusht. Beim Ziehen von Stärke, Farbton oder Breite färben sich Fischpanel und Inspektor mit dem nativen Zwischenbericht. Der Zeitgriff fragt erst nach dem Loslassen. Gezielter Test: Farbe änderte sich vor dem Loslassen und blieb beim Loslassen gleich.
- Fable: `SEABED.sediment_color`, `SEABED.bare_surface_color` und `SEABED.algae_color` stehen zur Verfügung. Nach deinem Eintrag 04:25 übernehme ich jetzt die Grundprobe im Fischpanel. Du behältst den Inspektor; ich gebe `{kind:'ground', strength, buried}` und die gemeinsame Farbpalette frei und melde den Commit.
- `80218b4b` und `36a323f2` gegengelesen. Auswahl zeigt volle Ruhefarbe; Blutsinn-Änderung ist nur Kommentar.
- `aa3d87ac` gegengelesen. Achsen bleiben beim Ziehen getrennt. Eine Kante bleibt: `taken` liest die erste Zeigerbewegung als Start. `kit.drag` ruft `move` erst bei `pointermove` auf; eine Bewegung mit nur einem Ereignis wird dabei verschluckt.
- Blaue Fläche: `surface_color` liefert reines Blau auch dann, wenn gar keine nahe Fläche im Suchradius liegt. Es ist der Rückfallwert bei Bewuchs null, kein separat ermittelter Steinfarbwert.

### Astra, 04:40 · Grundprobe zur Übernahme im Inspektor

- Fable: `31153209` steht im Produktzweig. `senseProbe.kind === 'ground'`, `strength` = Algenbewuchs, `buried` = Bodensatz. `groundColour(senseProbe)` aus `model/probe.js` liefert RGB für denselben Hintergrund im Inspektor. Die bisherigen lokalen Grundfarben und den Grundknopf kannst du damit ersetzen. Beim Ziehen oder Umschalten geht keine Engine-Anfrage raus. Gezielter Test: Auswahl, beide Grundarten, Griffweg und laufende native Anfrage. Claude: Bitte das Fischpanel im laufenden Atelier gegenprüfen.
- `6a55ad95` gegengelesen. `kit.drag` liest den SVG-Greifpunkt bei `pointerdown`; `gland.js` berechnet daraus beide deltas. Die erste Bewegung zählt. Danke für die schnelle Korrektur.
- Ruhepigment: `effector_upkeep` berechnet festen Unterhalt aus Kapazität. Separat berechnet `anatomical_action` laufende Arbeit aus `pigment_cost * sum[pigment]`; ohne positiven Befehl ist die Summe null. Die Basisspreizung `pigment_rest` steht nur in der Farbformel `visible_absorption`. Würde man nur den Ruheanteil erblich machen, wäre mehr Farbe in Ruhe bei gleicher Kapazität energetisch kostenlos.

### Astra, 05:18 · Seitenflossenbahn

Fable und Claude, ich bin an der nativen Bahn für die Seitenflossen. Ich folge dem bestehenden Weg über `Body::set_actuation_probe`, die Muskelaktuation und `move_body`. Ich melde den genauen Bericht und welche Eingaben er hat, sobald der Weg am frischen Plan geprüft ist. Die Bahn selbst kommt aus dem Bewegungsschritt.

Zur Braun-Rückfrage: Im heutigen Inspektor legt jeder der höchstens vier Typen genau eine Effektorstelle an. `copies` wird in `atelier_compiler.hh:outputs` als `copies/16` in die Kapazität übersetzt. `CellCopies` in `development.cc` expandiert Effektoren nicht. Ein Typ mit neun „Kopien“ hat daher Gewicht 9/16. Das Bauplanmodell kann über `setOrganNodes` mehrere Stellen je Typ setzen; darüber lässt sich Ruhebraun schon mit dem heutigen Farbmodell erreichen. Ich ergänze auch das Auswahlzeichen der Grundprobe.

### Astra, 05:30 · Native Seitenflossenbahn steht

Fable, `5fcf70ca` ist auf `feature/v019-design-studio`. Mit dem bestehenden kompilierten Plan an `operation: 'design'` senden:

```js
sense: {kind: 'fins', pair: 0, steps: 96, left: {stroke: 0, strength: 1}, tail: 0}
```

`pair` ist 0 Brust-, 1 Bauchflossenpaar nach Zuordnung der Engine. `stroke` ist 0 Rückschlag, 1 Vorschlag. `right` hat dieselben Felder wie `left`. Ohne Befehl bleibt die Seite in Ruhe. Stärke und Schwanzantrieb liegen zwischen 0 und 1. Mit `sense: {kind: 'fins', phases: [{steps: 8, left: {stroke: 0, strength: 1}}, {steps: 30}]}` lassen sich Ansteuerung und Ausgleiten verbinden. Maximal 16 Phasen und insgesamt 512 Schritte. Der Bericht `finCourse` enthält je Zeile `[xInKörperradien, yInKörperradien, WinkelInRadiant, Schritt, [Schwanz, BrustLinks, BrustRechts, BauchLinks, BauchRechts]]`, mit Start, jedem vierten und dem letzten Schritt. Ruhiges freies Wasser, ohne Bodenkontakt; gleiche Muskel- und Bewegungsregeln wie im Aquarium. Die Bahn darf jetzt den Pfeil ersetzen.

Gezielt geprüft: links und rechts drehen spiegelbildlich, beide gemeinsam treiben den symmetrischen Testfisch geradeaus. Acht Schritte Ansteuerung links plus 30 Ausgleiten ergaben 0,69 Körperradien Weg vom Start und 64° Drehung bei durchgehend ruhigem Schwanz. Ohne Ansteuerung und ohne passenden Muskel blieb der Plan am Start. Auch Bauchflosse, Schwanz allein und Phasenwechsel geprüft. Native Berechnung für diesen Plan je 7–10 ms. Der vorhandene Atelier-Lichtsnapshot läuft weiter.

Claude, die aktive Grundauswahl ist jetzt zusätzlich unterstrichen. `3eca1de0` gegengelesen: der Inspektor liest die Grundprobe des ausgewählten Pigmentorgans und verwendet dieselbe Farbpalette wie das Fischpanel. `30ab92fd` ebenfalls gegengelesen: keine der fünf entfernten Klassen wird im Atelier referenziert.

### Astra, 05:34 · Seitenflosse mit Sinken, Ursache für „Ansaugen“

Claude und Fable, die Bahn soll mit der üblichen Sinkkraft laufen. Ich habe `sinking = 0` entfernt. Die Schnittstelle bleibt gleich, y nach unten. Ohne Befehl sank der Testfisch in 38 Schritten um 0,40 Körperradien. Mit dem linken Flossenschlag lag er nach derselben Zeit bei x = −0,26 und y = 1,81, Nase −64°; die gleiche Drehung wie im Vergleich ohne Sinkkraft. Der Vergleich zeigt, dass ein kurzer Schlag je nach Flosse auch abwärts tragen kann. Bodensatz ist weiter eine eigene Probe. Ich pushe diese Korrektur nach der gezielten Prüfung.

„Ansaugen tut nichts“ ist über den tatsächlichen Klickhandler `FISH_CLICKS` reproduziert: Ein frischer Kiefer auf Stelle 0 nimmt den Klick an, `changeDocument` bekommt wieder einen Kiefer und es gibt keine Meldung. Ein Kiefer auf Stelle 2 wechselt dagegen zum Öffner. `closestSiteDoing` findet den passenden Öffner, aber `moveOrgan` erhält nur x/y, sucht darin erneut unter allen Muskelarten und kann auf der alten Kieferstelle landen. Ich korrigiere die Funktionswahl an dieser Stelle, auch für die anderen Muskeln. Offene nächste Arbeit bei mir: nativer Maulschlag und Fischpanel-Kopf, wie in `a1599491` beschrieben.

Zur Wasserteilung im Maulvorschlag: `MouthState.filtered` ist **geschluckte Planktonmenge** und in `swallowed` enthalten (`feeding.cc:136–143`). Durchströmendes Wasser kommt aus `gill_water` (`physiology.hh:410–415`), durch die Reusen hält `raker_retention` einen Teil des Planktons zurück (`feeding.cc:535–544`). Ich werde die Größen beim Bericht getrennt halten.

### Astra, 05:36 · Sinkkraft und Muskelwahl gepusht

`ced0a78e` ist auf `feature/v019-design-studio`. Die Flossenbahn nimmt jetzt die reguläre Sinkkraft des Aquariums mit. Die Felder für Fables Anzeige sind dieselben. Beim Wechsel der Muskelart sucht das Dokumentmodell nur noch an Stellen der gewählten Funktion. Getestet über `FISH_CLICKS`: 40 frische Kieferpositionen wechseln auf derselben Seite zum Öffner und zurück. Die Aussage von Claude 05:34 erklärt sich für Vortrieb und Lenken genauso durch die zweite, zuvor ungefilterte Suche. Solange die Auswahlreihe im Produkt ist, funktioniert damit auch der Weg zum Öffner.

Claude, bitte den kurzen Diff gegenlesen und die drei Klicks von 05:34 im Atelier wiederholen. Fable, beim Einbau des Mauls kann die Reihe wie besprochen entfallen. Ich gehe jetzt an den Maulschlag aus der Engine.

### Astra, 05:40 · Gegenlese Flossenanzeige und Maulbericht

Fable, `13e8922b` ganz gelesen. `setFinCommand` und `senseScene` reichen Phasen bis zur Engine durch; der Schlüssel verhindert die erneute Anfrage auf den eigenen Bericht. Drei konkrete Stellen:
- `group_side_fins` (`body_plan.cc`) ordnet die vorderste Gruppe **je Seite** dem Brustpaar zu. Ein einziger hinterer Atelier-Muskel kann deshalb im Plan den nativen Kanal 0 haben. `isPelvicMuscle` allein reicht für die Auswahl des Kanals und der Spurfarbe nicht. Ich ergänze die Zuordnung aus der Engine und gestatte Befehle für beide Paare in derselben Phase. Dein bestehender Aufruf bleibt verwendbar.
- `move_body` faltet den Winkel mit `std::remainder` in [−π,π]. In der Interpolation braucht es die kürzere Winkeldifferenz, etwa mit dem vorhandenen `turnTo` auf der Differenz in Grad. Sonst dreht der Fisch beim Übergang fast einmal herum.
- `body_radius` ist der Kollisions- und Strukturmaßstab (`physiology.hh:88–94`), die Umrisslänge ergibt sich zusätzlich aus der Körperform. Der Maßstab für die Bahn stimmt. `fishLeft` zeichnet einen generischen Rumpf mit Schwanz und Rückenflosse, aber keine Seitenflossen (`skin.js:51–68`). Für „mit diesen Flossen“ können die vorhandenen `anatomy.fins` die tatsächlichen Ansätze liefern, `finCourse[row][4]` die jeweilige Spannung.

Der native Maulversuch läuft lokal über die Anlage aus dem Bauplan und `anatomical_action`. Ein einziger Schnappimpuls nach 8 Schritten bei Schließerbeginn 4, nach −3 bei Schließerbeginn −7. Ohne Schließer kein Schnappen. Mit Kiemen messbarer Wasserstrom durch die Kiemen, ausgeschaltet genau null. Ich liefere den Kurvenvertrag nach dem Push. Er misst Wasser und Schluckkapazität. Geschluckte Futtermenge braucht zusätzlich die Probe vor dem Maul.

### Astra, 05:44 · Beide Seitenflossenpaare und Maulkurve stehen

Fable, `d400c222` ist im Produktzweig. Für beide Paare in derselben Phase:

```js
sense: {kind: 'fins', phases: [
  {steps: 40, pairs: [{left: {stroke: 0, strength: 1}}, {right: {stroke: 0, strength: 1}}]},
  {steps: 88, pairs: [{}, {}]}
]}
```

Die zwei Einträge in `pairs` sind Brust, Bauch. Der bisherige Aufruf `{pair,left,right}` geht weiter. `groupReport(document, anatomy, 'finChannels', center.id)` liefert ein Array der tatsächlichen Indizes in `finCourse[…][4]`, passend zu `FIN.left`, `FIN.right`, `FIN.pelvic_left`, `FIN.pelvic_right`. Die Zuordnung kann je Seite verschieden sein. Native Gegenprobe: Brust links und Bauch rechts ziehen im selben Schritt. Ein einziger hinterer Muskel meldet Kanal Brust links und wirkt genau dort. `bf6cad57` gegengelesen: `atan2(sin Δ, cos Δ)` nimmt den kurzen Weg über ±π und das Spiegeln für den Blick nach links bleibt richtig. Für die Anzeige bitte Claudes Gegenprüfung am laufenden Atelier einholen.

Maul: `sense: {kind: 'mouth', delay: 4, gills: true}` mit bestehendem `operation: 'design'`. `delay` ist der Beginn des Schließers relativ zum Öffner, ganze Schritte von −48 bis +48. `anatomy.mouthCourse` enthält `{firstStep, rakerRetention, samples}`, ein Sample je Schritt: `[opening, flow, gillWater, snap, gape, credit]`. `firstStep` ist relativ zum Öffner, `snap` boolesch. Öffnung und Wasserbewegung kommen aus der Muskelaktuation, der wirkliche Kiemenstrom aus `gill_water`. `credit` ist Schluckkapazität. Die Menge eines konkreten Futters kommt mit der Futterprobe. Einschaltdauer der drei Muskeln kommt aus dem Bauplan. Geprüft: Schließer beginnt bei 4, schnappt bei 8. Beginnt er bei −7, schnappt er bei −3. Ohne Schließer kein Schnappen. Bei abgeschalteten Kiemen ist der Kiemenstrom null, Länge der Kurve bleibt gleich.

Claude, bitte `d400c222` gegenlesen. Den Kopf im Fischpanel übernehme ich. Fables Maul-Inspektor soll dieselbe Kurve abspielen.

### Astra, 05:49 · Fischpanel-Kopf und schnelle Flossendrehung

Fable, `caa0557a` ist im Produktzweig. Im Takt deines Maulbilds bitte `studio.showMouthStep(organId, sample)` aufrufen, mit demselben Sample aus `anatomy.mouthCourse.samples`. Die Methode nimmt Öffnung und Strom, malt nur das ausgewählte Organ und baut die Szene dabei nicht neu auf. Lippen und Zähne sind größer und sitzen in der Zeichnung vor den Muskeln. Der Weg vom Maulwert bis zu den SVG-Attributen ist gezielt geprüft. Claude, bitte den Diff gegenlesen, Form und Zusammenspiel nach Einbau des Maul-Inspektors im laufenden Atelier prüfen.

Zur Drehung aus 05:45: Das sind laut deinem Mitschnitt **zwei** Schläge. Der Motor addiert den Drehimpuls je Schritt zur Winkelgeschwindigkeit (`movement.cc:81–109`), bremst sie durch Querwiderstand und begrenzt sie auf 54° je Schritt. `stroke_turn=4,68` ist seit der Überarbeitung der Schläge `6191e420` als Stärke dieser Umsetzung vorhanden; kein Sollwert für eine Drehung je Schlag. Mein kleiner Referenzplan mit einem kurz angesteuerten Muskel drehte um rund 64°. Ein starker frischer Plan erreicht vier Schritte am Limit: 216° zwischen zwei Bahnpunkten. Das liegt im gegenwärtigen Modell, ist aber keine anatomische Zusicherung. Ich stelle den physikalischen Parameter ohne eigenen Auftrag dazu nicht um.

**Folge für die Wiedergabe:** Bei 216° zwischen zwei Punkten würde die kürzeste Winkeldifferenz 144° in Gegenrichtung anzeigen. Ich ergänze `finCourse[row][5]` als aufaddierten, ungefalteten Winkel. Verwende bei diesem Feld eine direkte Interpolation von `a[5]` nach `b[5]`; der gefaltete Winkel `[2]` bleibt verfügbar.

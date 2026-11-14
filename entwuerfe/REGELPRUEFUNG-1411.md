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

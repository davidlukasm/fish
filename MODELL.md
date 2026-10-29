# Körper- und Gehirnmodell

## Entwicklung

Das CPPN wird an 360 festen Plätzen abgefragt: Gesicht 48, Kopf 96, Brust 96, Hinterteil 120. Die lokalen Koordinaten u/v/w laufen von 0 bis 1; linke und rechte Mittellinienplätze bleiben getrennte Gruppen. Körpermerkmale bestimmen einmal die Zonengrößen und gemeinsamen Positionen. Die vorhandene Kreisnäherung bleibt für Kollisionen zuständig.

Zehn Eingänge: vier Zonenschalter, u/v/w, Seite, Hormonabfrage, Bias. Zwanzig Ausgänge: Ausdruck, Rolle, vier Identitätswerte, Kapazität, Schwelle, Zeitkonstante, Breite, zwei Qualitätswerte, Qualitätsbreite, zwei Angebote, zwei Suchen, Suchbreite, Kreuzneigung, Reichweite. Die Ausgabe liegt in [−1,1].

Rollenintervalle: unter −1/3 Sinn, bis +1/3 Nerv, darüber Organ. Die größte Identitätsecke wählt eine zulässige Funktion. Ist die bevorzugte Ecke unzulässig, muss die größte zulässige Ecke mindestens 0,5 Anteil haben. Sonst bleibt der Platz leer. Es gibt eine körperliche Funktion je Zelle.

Sinnes- und Nervengruppen erhalten 1–16 Kopien aus Kapazität und Ausdruck; ihre Gruppenstärke wird aufgeteilt. Organe erhalten eine Zelle mit abgeleiteter Kapazität. Zellkennungen enthalten festen Platz, Seite und Kopienindex. Die Zellzeit τ = 4·12^t beträgt 4–48 Schritte.

TOR begrenzt die gewichtete Summe jedes seiner zwei Ports auf [−1,1] und multipliziert beide. Ports gehören zur Innovation, Mutation, Kreuzung und Speicherung. Zell-CPPNs besitzen keine Regionen, Verbindungsabfragen oder Zweige.

## Verdrahtung und Lernen

Für Quelle Q und Ziel Z gilt:

- μ = exp(−|Angebot_Q−Suche_Z|²/(2σ_Z²)); σ = 0,03·(2/0,03)^Suchbreite.
- L = 0,1+0,9·Reichweite; räumlicher Faktor exp(−Abstand/L).
- Gleichseitig s = clamp(1−Kreuzneigung); gegenseitig s = clamp(1+Kreuzneigung); mittig s = 1.
- Kontaktwahrscheinlichkeit p = μ·s·exp(−Abstand/L); Geburtsgewicht = Vorzeichen_Q·μ.

Zulässig: Sinn→Nerv, Nerv→Nerv, Nerv→Organ. Jede Einzelkontaktchance wird einmal gezogen; bei Platzmangel erfolgt eine gleichverteilte Auswahl ohne Zurücklegen. Keine Selbstkontakte einer Einzelzelle oder Doppelkontakte. Nerven besitzen round(4·128^Breite) Eingangsplätze, Organe 32. Laufende Neubildung verwendet dieselbe Kontaktpassung.

Die angeborene absolute Gewichtssumme ist der Lernvorrat. Modell 19 verteilt ihn anhand zentrierter Aktivitäten, eigener Zeitkonstanten, Taktgeber und Modulatoren um. Ein zusätzlicher synaptischer Mittelwert folgt dem Eingang über 10τ:

ū ← ū+(u−ū)/(10τ); Ausgabe = tanh(Ruhe+Hormon+Rhythmus+u−ū).

Angeborene Ruhe, Hormone und Rhythmus werden dabei nicht abgezogen. Ausgabedämpfung gilt vor Signalweitergabe und Organansteuerung. Zelltod deaktiviert dauerhaft, entfernt Kontakte und aktive Organleistung; Gewebe und Zellkennung bleiben bestehen.

## Mutationen

Gewichte erhalten normalverteilte Schritte aus während der Entwicklung gemessenen Amplituden, Ableitungen und nachgeschalteter Verstärkung. Auch zwischengespeicherte Auswertungen und zusammengefasste CPPN-Knoten zählen mit. TOR-Ableitungen werden je Port erfasst. Ein gemeinsamer Schritt über m Kanten wird durch √m geteilt; 10 % der Ereignisse verwenden Faktor 10. Technische Grenzen: ε=10⁻⁶, σ_min=δ/100, σ_max=min(1,10δ).

Strukturmutationen ergänzen Kanten, fügen LINEAR-Knoten ein, ändern gewöhnliche Knotentypen, verdoppeln Knoten/Teilnetze, ergänzen/ändern/entfernen Tore oder übertragen ein Teilnetz in eine andere Zone. Eine übertragene Kopie hat an ihren Ausgangsverbindungen ein abschließendes Zonentor. Funktionserhaltende Verdopplungen teilen Ausgangsgewichte. Zyklen sind ausgeschlossen.

Zufallsgründer variieren Netzgröße, Knotentypen und räumliche Felder. Drei Viertel besitzen keine Seitenkante; ein Viertel eine. Die hormonelle Ausgangslage ist neutral. Erfolgreiche Sinn-Motor-Schaltungen werden nicht vorgegeben.

## Sinne und Organe

Lichtzellen im Kopf messen Helligkeit oder sichtbare Nähe. Blickwinkel und Kopienintervalle folgen dem festen Kopfraster. Beide Augen teilen die Objektsuche. Streulicht, lokale Adaptation, Farbgegensatz und Hemmung je Auge bleiben für Helligkeit erhalten. Nähezellen benutzen vorhandene Tiefen mit acht logarithmischen Reichweiten; leeres Wasser erzeugt keinen Entfernungsreiz. Nur benötigte Reichweiten werden berechnet.

Oberflächenchemie liest das mitströmende Duftfeld am Zellort. Strömungszellen messen Wasser relativ zur Haut. Berührung wirkt örtlich; innere Druckzellen erhalten das nächstgelegene geeignete Messziel aus Muskeln, Gonaden, Blase oder Darmform. Schadenszellen lesen 16 örtliche Sektoren, deren Summe 1−Gesundheit ist. Heilung verringert sie proportional.

Chemie, Strömung und Schaden: Antwort x/(x+K+m), danach m←m+(x−m)/τ. Kopien mit identischem Reiz teilen die Messung. Innere Brust-/Hinterteilchemie meldet verwertbare Aufnahme, innere Kopfchemie Blutwerte. Druck und Nähe verwenden die begrenzte Kennlinie.

Muskelzellen bilden im Gesicht Kiefer, im Kopf Pumpe, in der Brust Seitenflossen, hinten Schwanz. Seitenflossen besitzen einen festen Drehsinn; negative Aktivität kehrt ihn nicht um. Drüsen bilden im Kopf Hirndrüse, in der Brust Gasdrüse und hinten Gonaden. Innere Gonadenzellen speichern, äußere geben ab. Pigment und Stacheln liegen an der Oberfläche.

Vier freie Hormone, Reife und Reserve liegen auf sechs festen Stoffraumpositionen. Drüsen verwenden die vier freien Stoffe; Regulationsrezeptoren zusätzlich Reife; Blutfühler alle sechs. Reife=Gewebe/Zielgewebe, Reserve=Energie/Reservekapazität. Sieben Wirkungen: Erregung, Lerngewinn, Konkurrenz, Spurmischung, Rhythmus, Ausgabe, Absterben. Antwort R=clamp(b+s·c/(c+K),−1,1). K liegt logarithmisch bei 0,0003–1; Ausgabefaktor (1+R)/2, dauerhafter Zelltod bei R>0,5.

Im Ei wird der Bauplan aus Dotter aufgebaut. Sekret und eigener Muskelstoß bleiben für den Schlupf nötig. Lernaktivität beginnt im Ei; nach Schlupf werden äußere Reize allmählich eingeblendet.

## Nahrung und Kosten

Pumpen-Qualität1 bestimmt die Darmlänge L. Ohne Pumpe gilt L=0,5, die Aufnahmeleistung fehlt weiterhin. Verwertung:

- Tierisch: 1−0,5L−0,4L².
- Pflanzlich: 1−0,5(1−L)−0,4(1−L)².
- Kunstfutter und Bodennahrung: 0,8.
- Füllfaktoren: Tierisches/Kunstfutter 1, Pflanzen 2, Bodennahrung 3.

Mit Reservekapazität R und q=(1+L)/1,5 gilt Darmfassung V=Rq, Durchgangszeit τ=400q. E/D/F speichern rohe Energie, verdauliche Energie und Füllung. Gemeinsamer Durchgang h vermindert alle drei proportional: 0,88hD geht in Reserve, 0,12hD wird verbraucht, h(E−D) wird Kot. Reserveknappheit begrenzt h; volle Reserve stoppt den Darm. Tod überträgt E einmal. Schlundsignal und Ernährungsanteile verwenden verwertbare Aufnahme beim Schlucken; Wachstum den tatsächlichen Nettozugang.

Grundumsatz: 0,036·(Gewebe/40)^0,75. Gewebeaufbau kostet 1,5 je Einheit: 1 gespeichert, 0,5 verbraucht. Hungerabbau liefert 0,8. Mutterreserve und Beginn der Gonadenfüllung: egg_reserve·√(Gewebe/40), gemeinsam begrenzter Überschuss für Ei und Sperma.

Gemeinsamer Muskelarbeitspreis c=0,036·0,0273/(0,028512·1,5·0,5·√2,4). Das ist die feste Reisereferenz G=40, Masse=2,4, Geschwindigkeit=0,5, ohne zusätzliche Stacheln und Wellenanteil. Kieferarbeit kostet 2c, andere Schläge c. Muskelunterhalt ist auf 30 % des Referenzgrundumsatzes bei dreißig Kapazitätseinheiten geeicht. Pumpen kostet 0,017 je tatsächlich transportiertem px²; dasselbe bezahlte Volumen begrenzt Aufnahme. Geschlossenes Maul pumpt nicht; voller Darm verhindert keine bezahlte Arbeit. Treffer berechnen keine zweite Muskelgebühr.

## Zufuhr und Bestände

T folgt der nutzbaren Wasserfläche. Standardanteile: Kunstfuttermaximum 0,5, Plankton 0,12, Bodentiere 0,18. Pflanzen erhalten den Rest. K=K_max/(1+Naturaufnahme/K_max); sinkendes K erweitert den Pflanzenanteil. Anteile werden gemeinsam validiert. Global knapper Spielraum wird proportional auf tatsächlich nutzbare Nachfrage verteilt; ungenutzte Gruppenbudgets werden nicht angespart.

Plankton: maximale Dichte 0,16, Einsaatvorschlag 144 E; externe Einsaat und Wachstum teilen ein Budget. Würmer/Krabben/Muscheln teilen ihr Budget nach relativen habitatabhängigen Bestandslücken. Wurmkopf 40 E, erwachsene Referenzkrabbe 1.500 E, Muschel 400 E, neue Muschel 20 E. Aufnahme vorhandener Nahrung ist ein interner Transfer.

Ganze künstliche Körner und externe Tiergeburten werden mit budgetabhängiger Wahrscheinlichkeit erzeugt. Ihre mittlere Zufuhr entspricht dem Gruppenbudget; gebucht wird die volle tatsächlich erzeugte Energie. Das vermeidet unsichtbare Untergrößen oder ein Ansparen über Schritte. Die harte Bestandsgrenze gilt auch bei solchen Ereignissen. Pflanzen und Felder werden kontinuierlich begrenzt.

Lose Stücke: Radius=4√(E/100), ohne Größen-Clamp. Kunstfutter: 25–400 E, quadratische Zufallsverteilung, Clustergröße 4. Krümelgrenze 25 E; echte Fischbisse erlauben 12,5 E und markieren Stück sowie Rest. Herausgetrennte Körper-/Pflanzenteile behalten die Flächendichte ihrer Quelle. Krümelenergie geht einmal in Bodennahrung. Bodennahrung düngt Pflanzen im vorhandenen budgetierten Wachstumsweg.

## Anzeige und Speicherung

Die Simulation liefert gemeinsame Körpergeometrie und relevante Ansätze. Detailzeichnungen ergänzen Form und Animation; entfernte LOD bleiben begrenzt. Netzansichten zeigen Zellrolle, Zone, Kennungen, synaptischen Mittelwert, hormonelle Wirkung und dauerhaften Zelltod. Anatomische Verwertung und beobachtete Ernährung bleiben getrennt.

Gespeichert werden die aktuelle CPPN-Struktur samt TOR-Ports und Mutationsmesswerten, Entwicklungsseeds, individuelle Aktivmaske, Lern-/Adaptationszustände, lokale Schadenssektoren, Darm E/D/F und Energiebuchungen. Frische Daten je Version; keine Formatmigration.

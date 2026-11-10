# Koordination

Ziel: Startfische erhalten sich ohne Bestandshilfe bis mindestens Generation 5 in mehreren normalen Aquarien. Aktuelle Befunde und Zuständigkeiten hier pflegen; erledigte Punkte kürzen.

## Codex — 11. November 2026

Arbeitsstand: `6476236`. Übernommen: Claudes automatische Kontaktkapazität im Atelier-Compiler und Muschelzähler im Beobachter.

Ich bearbeite Liora und ihre Nachkommen: Futteraufnahme, Verlassen erschöpfter Pflanzen, Sediment, Eiablage und Schlupf. Zuerst vorhandene Verläufe auswerten, danach gezielte Vergleiche unterschiedlicher Aquarien bzw. einer belegten Ursache. Keine parallele Überarbeitung der Muschelfische oder des Verhaltenslabors.

Liora 32, Aquarium 817233, 32 Gründer, Mutation 0,03, Bestandshilfe aus: 26 gelegte Eier, 22 geschlüpfte G1, 3 G2, ausgestorben bei Schritt 6867. Weiterhin Atelier-Entwurf; Brisa bleibt der einzige automatische Startfisch.

Beobachtet:
- Der Seitenvergleich hat nach der Kapazitätskorrektur beide Eingänge: G2 #55, Schritt 6300, Geruch links/rechts 0,492/0,497, Kommando 0, jeweils 32 erregende/hemmende Kontakte.
- G2 #55 sucht bei Schritt 6000 mit Reserve 73 und fast leerem Darm 171 px von der nächsten Blattfläche entfernt.
- G2 #58 liegt als Ei unterhalb seiner Mutter #56 am Pflanzenrand (Schritt 5400: Mutter y=370,4, Ei y=376,7), schlüpft vollständig im Sediment und verhungert trotz voller Schwimmblase. Bei Schritt 6100: Alter 714, Reserve 0,93, kein Futter aufgenommen; kaum Ortsveränderung.
- G1 #56 bleibt satt, legt ein Ei und stirbt nach schrittweisem Gesundheitsverlust im Alter von etwa 3600. Bei Schritt 6800: Reserve 122, Darm 87 %, Gesundheit 0,093, zweites Ei erst 89. Der Verlauf passt zur Seneszenz; der Hungerzähler bleibt bis zum Aussterben unverändert.
- Frühere Liora 30: #41 biss trotz aktiver Pflanzenbarteln 12–13-mal je 100 Schritte; der Pflanzenverzehr stieg spät nur um 0,038 über 900 Schritte. Zu prüfen: erschöpfter Pflanzenteil als wiederholtes Ziel. Maulstillstand war hier keine Ursache.

An Claude: Bitte deinen aktuellen Arbeitsbereich und Befunde hier ergänzen. Arbeitest du bereits an Eiablage/Schlupf im Sediment oder an der Auswahl nahezu leerer Pflanzenteile? Bitte mögliche Engine-Ursachen zuerst hier abgleichen, bevor wir dieselben Stellen ändern. Ich prüfe zunächst die Nachkommenverläufe und ändere noch keine gemeinsame Engine-Mechanik.

### Laufende Änderung: Liora 33

Zweite unveränderte Liora-32-Welt (1296047): ausgestorben bei 5759; 16 geschlüpfte G1, keine geschlüpfte G2. Zehn G1 starben ohne jede Nahrungsaufnahme, sechs schlüpften ohne Blattnahrung im Umkreis von 64 px. Die Ausfälle sind damit in zwei Welten belegt, ihre Häufigkeit variiert.

Liora 33 läuft zunächst in der bekannten Welt 817233:
- Ei-Freigabe erhält Nahrungseingang statt Eierdruck. Die Engine prüft bereits mindestens 95 % Eifüllung; Nahrung als Freigabe hält volle Eier bis zu einem tatsächlichen Fressplatz zurück. Embryonale Spermasekretion bleibt erhalten.
- Sättigungsschwelle 0,80 → 0,94: Beim gut fressenden #56 begrenzte die bisherige Füllung um 77 % die Verdauung auf etwa 0,255 pro Schritt. Die höhere Füllung soll den knappen Überschuss für Nachwuchs erhöhen.
- Schlängeln 0,5 → 1: Die bestehende Physik senkt damit den Sedimentwiderstand von 10 auf 1. Im Freiwasser sinkt dafür der Vortrieb pro Schlag; diese Kosten müssen sich im Lauf bewähren.

Keine Engine-Änderung. Bitte insbesondere die Ei-Freigabe und den Sedimentbefund gegenprüfen. Generation 5 ist noch nicht erreicht.

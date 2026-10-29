Projektpflege:
- README.md enthält Start, Bedienung und Prüfbefehle; höchstens 4 KiB.
- Prüfergebnisse im Chat; nur das Programmpaket ausliefern. Arbeitsnotizen außerhalb des Projekts.
- Änderungen ersetzen veraltete Angaben. Keine Release-Chroniken oder parallelen Erklärdateien.
- Texte kurz und sachlich halten.
- GPU-Berechnungen mit OpenCL umsetzen.
- package.sh führt die ausgelieferten Dateien einzeln auf. Neue Dateien begründet ergänzen.
- Gemessene, verifizierte Performanceoptimierungen automatisch in die ausgelieferte Fassung übernehmen.
- C++ und JavaScript mit clang-format 18 formatieren: ./format.sh --write. ./test.sh erzwingt die Prüfung.
- Modulzustände über ihre zuständigen APIs ändern; Initialisierungsschritte benennen.
- Versionsnummer nur auf Nutzeranweisung ändern; veröffentlichte Pakete unverändert lassen.
- Jede Version setzt frische Daten voraus; keine Migrationen oder Legacy-Leser.

- Keine Langläufe; nur kurze automatisierte Funktions- und Kompilierprüfungen.

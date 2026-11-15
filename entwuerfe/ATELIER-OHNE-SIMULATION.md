# Atelier ohne Simulation (David 15.11. 14:53)

> „Das Atelier ist ein Design Studio, kein Simulator. Wird dafür ein CPPN gebaut und dann ein Gehirn gemacht, nur damit das Atelier funktioniert, ist das falsch. Werden nur Berechnungen aus der Engine genutzt, die auch fürs Atelier eigens optimiert sind, ist das in Ordnung. Das Atelier dient dem Designen, nicht dem Züchten, nicht dem Simulieren. Es muss responsiv und schnell sein und sofort Dinge anzeigen.“

**Regel daraus:** Das Atelier ruft dieselben **Funktionen** der Engine auf, also Antwort einer Zelle, Drehung je Zucken, Füllung, Schwelle. Es lässt **keine Welt laufen**: kein CPPN, kein wachsendes Gehirn, kein Körper, der Schritt für Schritt durch `move_body` oder ein `Ecosystem` geht, nur damit ein Bild entsteht.

> David 14:54: „Jedenfalls soll das Atelier auch nicht Code duplizieren – das wäre wartbarkeitsmäßig ein Horror.“

**Zweite Regel daraus:** Wo das Atelier eine Formel braucht, die heute nur in einem Simulationsschritt steckt, wird diese Formel **in der Engine** als eigene Funktion herausgelöst. Die Simulation und das Atelier rufen dann **dieselbe** Funktion. Es gibt keine Kopie im Atelier, weder in C++ noch in JavaScript. Beispiel Flosse: Die Engine bekommt eine Funktion „Drehung aus einem Zucken“, die `move_body` selbst benutzt; das Atelier ruft sie direkt. Bestehende Nachbauten im Atelier-JavaScript (z. B. `cellGates`, Antwortkurven in `sense.js`, `tuning.js`) gehören auf dieselbe Liste: herausfinden, ob die Engine sie liefern kann, sonst als Behelf benennen.

## Seite des Ateliers (Claude, 15:00, gelesen, nicht gemessen)

### Wie ein Bild an Engine-Werte kommt

- Jede Änderung am Dokument schickt `design` an `atelier_service.py:303`. Der Dienst startet dafür **jedes Mal einen neuen Prozess** `atelier design` (`subprocess.run`) und gibt Plan und Proben über stdin hinein.
- Beim **Ziehen** eines Griffs kommt ein „Entwurf“-Lauf (`design.js:205`, `draft`), also auch während der Maus sich bewegt. Danach kommt der volle Lauf.
- Ein voller Lauf trägt `lightSpread: true`, sobald sich das Dokument geändert hat (`design.js:206`). Das ist also praktisch **jeder** Lauf nach einer Änderung.

### Was `design_report` (`werkzeug/atelier.cc:1271`) heute tut

| Teil | Was er baut oder rechnet | Simulation? | Wer ruft ihn |
|---|---|---|---|
| `planned_substrate` + `body_interface` | Plan-Zellen je Gruppe, eine Zelle je Platz (`atelier_compiler.hh:293`), Schnittstelle des Körpers | kein CPPN; baut aber einen Zellbestand. **Astra: wie teuer?** | jeder Lauf |
| `anatomy_report` | Körpermaße, Budgets, Organe | zu prüfen | jeder Lauf |
| `light_example` + Licht-/Sinnesstreuung (mein `ae733770`/`dfed885f`) | zieht Merkmale je Platz und **vervielfältigt Zellen** (`cell_copies`) | eigens fürs Atelier (`werkzeug/atelier_compiler.hh`), kein CPPN, kein Gehirn, kein Schritt; **eher erlaubt**. Bleibt, wenn es schnell genug ist (Astras Zeiten); Umbau auf `draw_traits` allein hieße, die Schwellenrechnung von `body_interface` nachzubauen | jeder volle Lauf nach Änderung |
| `sight_report` mit `Ecosystem probe_tank` | baut ein **ganzes Ökosystem**, um Licht an der Probe zu werfen | Welt, auch wenn keine Schritte laufen. **Kandidat** | wenn Sehprobe |
| `sense_report` mit `probe_tank->field` | Feld des Ökosystems für Duft und Strömung | Welt. **Kandidat** | wenn Sinnesprobe |
| `fin_course_report` | Körper läuft **128 Schritte** durch `anatomical_action` und `move_body` | **Simulation** | Seitenflossen-Inspektor |
| `mouth_course_report` | Körper läuft Schritte durch `anatomical_action` | **Simulation** | Maul-Inspektor |
| Wirbelsäulen-Vorschau (`atelier.cc:521`) | `stroke_step` über `SPINE_PREVIEW_STEPS` | Schritte einer einzelnen Formel, kein Körper; **zu prüfen** | Abwehr |

### Außerhalb von `design`

- `build-start`/`check`/`new`/`inspect` bauen ein CPPN. Das ist „CPPN erzeugen“ und damit gewollt. **Aber:** `report()` ruft `incubation_probe` (`atelier.cc:46`). Das legt ein `Ecosystem` an, setzt den Fisch hinein und lässt ihn bis zu 1024 Schritte brüten. Das ist Züchten im Atelier. **Kandidat.**

### Was das für die Bilder heißt (Vorschlag, Entscheidung gemeinsam)

1. **Seitenflossen und Maul:** Statt einer Bahn aus Schritten eine geschlossene Form aus den Engine-Funktionen. Für die Flosse sind das Zuwachs je Zucken (`stroke_turn` · Drehmoment / Masse), Grenze 54° je Schritt und Abnahme 38 % je Schritt; daraus ergibt sich die Gesamtdrehung als Formel. Für das Maul ist es dieselbe Zuckungsform (`stroke_shape`) ohne Körper. Die Engine bekommt dafür eine kleine Funktion, die beides direkt rechnet. Das ist dann die „fürs Atelier optimierte Berechnung“.
2. **Sicht und Sinne:** Licht und Duft an der Probe aus den Formeln selbst (`hue_light`, Feld der einen Quelle), ohne `Ecosystem`.
3. **Streuung:** `light_example` bleibt, solange es schnell ist (eigens fürs Atelier, ohne Lauf).
4. **Brüten:** `incubation_probe` aus dem Atelier nehmen. Wenn das Bild „Schlupfreife“ braucht, dann als Formel aus Dottervorrat und Bedarf.
5. **Prozess je Anfrage:** Ein Dienst, der einmal startet und Anfragen nacheinander beantwortet, spart den Start bei jedem Zug. Das ist nur dann nötig, wenn Astras Zeiten zeigen, dass der Start zählt.

**Offen für Astra:** Zeiten je Teil (deine Entscheidung, ob gemessen wird) und welche Engine-Funktionen sich ohne Körper aufrufen lassen.

# Organe vor dem Schlupf: Bestandsaufnahme und Lösung (Claude, 14.11. 02:45)

**Auftrag (David 02:26):** Jedes Organ sorgt selbst dafür, dass seine Zellen vor dem Schlupf aktiv sind, ihre Bahnen wachsen (Lernen = Hirnwachstum) und rechtzeitig härten. Ein Gestalter muss davon nichts wissen. Wir erarbeiten die Lösung, setzen sie um, David sieht das Ergebnis. Nur erblich steuerbare Mittel der Zellen sind erlaubt (LEITLINIE 0).

Gelesen: Engine (`src/body_plan.cc`, `src/cppn_brain.cc`, `colony-core/field/substrate.cc`) und Atelier-Vorlagen (`ui/studio/model/organs.js`, `document.js`, `region_cells.js`, `regions.js`, `*_region.js`). Kommentare zählen nicht als Beleg.

## 1. Wie eine Bahn wächst (Engine)

- **Entstehen und Wachsen:** Ein Kontakt beginnt bei 0. Er entsteht, wenn Sender und Empfänger gemeinsam vom Gewohnten abweichen, sonst mit 2 % Zufall (`substrate.cc:681-693`). Er wächst mit Signal des Senders × Aktivität des Empfängers (`:913-921`).
- **Lernende Zelle:** Das ist der Empfänger, nur bei Kontakten in einen Muskel der Sender (`:888-903`).
- **Vergessen:** Ohne Festigung vergisst er mit Halbwertszeit 500 Schritte, ungenutzt schneller (`:352-357`).
- **Abbau:** Unter 5 % und weniger als halb gefestigt wird er abgebaut (`:982`).
- **Festigung:** Die Festigungsantwort der lernenden Zelle hält fest, was der Kontakt in der Zeit selbst lernt, in der sie positiv ist. Ist sie negativ, löst sie Festigung wieder (`:944-955`).

## 2. Was jede Zelle im Ei bekommt

### Sinneszellen

**Was sie im Ei spüren** (Engine `cppn_brain.cc:276-412`, `body_plan.cc:1088-1210`; `exposure` ist im Ei 0):

| Organ (Zelle) | Reiz im Ei | Eigenaktivität im Ei | wächst etwas? |
| --- | --- | --- | --- |
| Auge (retina) | kein Kontrast, Sehen erst nach dem Schlupf (`:389, 407-412`) | Wellen; Atelier-Vorgabe Erregung 1 → −1 über Reife, Halbwert 0,2 (`document.js:474-482`) | ja |
| Nahsinn (distance) | 0, Sehen erst nach dem Schlupf | keine | **nein** |
| Nase (scent) | gleichmäßiger Mittelwert beider Seiten, fast konstant (`cppn_brain.cc:368`) | keine | **kaum** |
| Barteln (taste) | 0, Faktor `exposure` (`:382`) | keine | **nein** |
| Seitenlinie (current, außen) | eigene Zuckungen gegen die Schale (`embryo.cc:10-26`, `body_plan.cc:1191-1209`) | keine | nur wenn Muskeln zucken |
| Tastsinn (contact) | Schalendruck und eigene Zuckungen (`embryo.cc:25`) | keine | teils |
| Gleichgewicht (gravity, innen) | Lage des Körpers, im Ei unveränderlich (`body_plan.cc:1102-1103`) | keine | **nein** |
| Schmerzsinn (injury, außen) | nur bei Verletzung des Eis | keine | **nein** |
| Blutsinn (chemistry) | Hormone, Reife, Reserve, Erschöpfung (`:1186`): langsam | keine | wenig |
| Darm (food) | Wachstum speist den Nährsinn (`physiology.cc:478`) | keine | etwas |
| Darm (fullness) | 0, Darm leer | keine | **nein** |
| Darm (ache) | 0, keine Verdauung im Ei (`physiology.cc:233`) | keine | **nein** |
| Schwimmblase (pressure) | Tiefe (`body_plan.cc:1166`): im Ei fast konstant | keine | **nein** |
| Eier- und Samenorgan (pressure) | Füllung der Gonaden, im Ei 0 | keine | **nein** |

### Muskel- und Ausgabezellen

Alle Muskelzellen tragen im Atelier eine Erregungsantwort mit Grundwert 0,5 (`document.js:471-473`). Damit sind sie leicht aktiv, und ihre Eingänge können wachsen, sobald ein Sender aktiv ist.

### Hirnregionen

- **Relais:** Sie tragen `DEVELOPING_RELAY`, einen Rhythmus im Ei, der über die Reife endet (Halbwert 0,8).
- **Lebenslanger Rhythmus:** Zuhörer und Zellen für späte Eingänge tragen `TONIC_LEARNING`.
- **Schrittmacher:** Wirbelsäule (`oscillator`, `finClock`), Motorik (`beat`, `pump`), Körperzustand (`hatch`) (`region_cells.js`, `*_region.js`).
- **Einzelne Nervenzellen:** Aus dem Baukasten gesetzt, haben sie keine dieser Vorgaben (`document.js:718-731`).

### Härtung

Keine Vorlage härtet etwas vor dem Schlupf. Festigung gibt es nur über das Hormonsystem „Festigung“ nach Sattheit (`systems.js:40-50`).

## 3. Die Lücken

1. **Zehn Sinneszellarten sind im Ei stumm oder fast konstant.** Ihre Bahnen wachsen dort nicht. Betroffen sind:
   - Nahsinn, Nase, Barteln, Gleichgewicht, Schmerz außen
   - Füllung und Bauchweh im Darm
   - die Druckzellen von Blase, Eier- und Samenorgan
   - beim Blutsinn wenig
2. **Nichts härtet die Bahnen.** Was im Ei wächst, vergisst sich in Hunderten Schritten wieder, wenn der Sinn danach selten meldet.
3. **Einzelne Nervenzellen aus dem Baukasten** schwingen im Ei nicht und härten nicht.

## 4. Lösung

**Jedes Sinnesorgan bringt die Eigenaktivität seiner Zellen selbst mit.** Das geschieht als Vorgabe der Vorlage, so wie die Netzhaut ihre Erregungsantwort mitbringt.

- **Rhythmusantwort auf Reife** für die Sinneszellen der zehn stummen Arten aus 3.1, dazu für Seitenlinie, Tastsinn, Blutsinn und Nährzellen. Mechanismus seit Engine `8579edf5`.
  - Grundwert 1, Empfindlichkeit −2, Halbwert 0,3, Steilheit 3.
  - Damit feuern die Zellen im Ei in Stößen, im Takt ihrer Zellzeit und zu eigenen Zeitpunkten nach ihrer Lage. Bei Reife 0,22 liegt die Antwort noch bei +0,85, bei 0,3 bei 0, ab 0,35 ist sie aus.
  - Der Schlupf liegt bei Reife ≥ 0,22, bei großen Eiern höher (Gewebe beim Schlupf ÷ `tissue_capacity`, `physiology.hh:101-106`, 420-423; Fable 02:36). Bei kleinen Eiern endet die Eigenaktivität also kurz nach dem Schlupf, bei großen davor.
  - Den Zeitpunkt kann die Evolution oder der Gestalter über den Halbwert verschieben.
- **Die Netzhaut** bleibt bei ihren Wellen.
- **Beleg aus echten Fischen:**
  - Riechzellen haben Grundaktivität mit gleichem Muster je Rezeptor, aber nicht gleichzeitig.
  - Die Netzhaut hat Wellen.
  - Der Darm hat spontane Wellen vor dem ersten Fressen.
  - Für die übrigen Sinne ist es ein Behelf ohne Beleg.

**Jede Hirnregion härtet, was sie im Ei an ihren Eingängen gelernt hat.** Das ist dieselbe Vorgabe wie ihr Rhythmus und gilt für alle Zellen mit `DEVELOPING_RELAY`, `TONIC_LEARNING` und `ACTIVE_LEARNING`.
- **Festigungsantwort auf Reife:** Grundwert 0,5, Empfindlichkeit −0,5, Halbwert 0,3, Steilheit 3.
  - Verlauf: 0,46 bei Reife 0,22, 0,25 bei 0,3, 0,05 bei 0,4. Nie unter 0, gehärtete Kontakte bleiben also.
  - Die Härtung reicht damit als **Prägungszeit** über den Schlupf hinaus bis etwa Reife 0,4. Was der Jungfisch in seinen ersten Erfahrungen lernt, härtet also mit. Fable 02:36: Das muss so dastehen, nicht „endet beim Schlupf“.
- **Warum in der Region:** Die Region empfängt die Bahn und ist die lernende Zelle. Die Sinneszelle kann ihre Bahn in einen Nerv nicht selbst festigen.
- **Für:** Ein Gestalter, der ein Sinnesorgan an eine Region hängt, bekommt die gehärtete Bahn ohne eigenes Zutun.
- **Wider:**
  - Was im Ei aus Zufallsaktivität gelernt wurde, wird gehärtet, auch falsche Kopplungen. Echte Fische verfeinern ihre Bahnen nach dem Schlupf weiter. Gehärtete Kontakte lernen ebenfalls weiter, sie werden nur nicht verdrängt.
  - **Konflikt mit dem System „Festigung“:** Es setzt seine Antwort nur bei Zellen, deren Festigungsantwort noch nichts liest (`systems.js:76-83`, `answering`). Mit der neuen Vorgabe würde es diese Zellen überspringen, und die Sattheit härtete dort nicht mehr. Ein Rezeptor bindet nur einen Stoff, Reife oder das Festigungshormon, nicht beide.
    - **Lösungsidee:** Das System „Festigung“ ersetzt beim Einbau die Reife-Vorgabe der Region. Die Reife-Vorgabe gilt nur, solange kein Festigungssystem da ist.
    - Damit endet die Härtung im Ei, sobald der Gestalter das System einbaut. Fable bitte hier eine bessere Idee, falls es eine gibt.

**Einzelne Nervenzellen aus dem Baukasten** bekommen dieselben Vorgaben wie die Relais der Regionen: Rhythmus im Ei und Festigung im Ei.

**Bauprüfung im Atelier:** Sie warnt, wenn der Ausgang eines Sinnesorgans an nichts angeschlossen ist, das lernt. Astra prüft, ob es dafür schon einen Befund gibt.

**Zahlen:** Die Halbwerte 0,2 übernehme ich von der Netzhaut-Vorgabe, sie sind nicht nachgemessen. Astra misst an einem im Atelier gebauten Fisch mit allen Sinnen nur zwei Dinge:
- wie viele Bahnen je Sinn bis zum Schlupf über 5 % wachsen,
- wie viele davon 2000 Schritte nach dem Schlupf noch stehen,

jeweils vorher und nachher.

## 5. Umsetzung: Produkt `88a99acc` (Claude, 02:55)

- `document.js` `defaults`: Sinneszellen außer Licht bekommen die Rhythmusantwort auf Reife.
- `region_cells.js`: `DEVELOPING_RELAY`, `TONIC_LEARNING` und `ACTIVE_LEARNING` bekommen die Festigungsantwort im Ei. Einzelne Nervenzellen in `addNeuron` ebenso.
- Atelier-Lebenszyklus: Die neuen Vorgaben sind dort sichtbar und änderbar, wie jede Antwort.
- Keine Engine-Änderung.

**Umgesetzt in `88a99acc`:**
- `EGG_RHYTHM` in `document.js` (Sinneszellen außer Licht)
- `EGG_HARDENING` in `ACTIVE_LEARNING` (`region_cells.js`, wirkt damit auch in `DEVELOPING_RELAY`, `TONIC_LEARNING` und `pacemakerCell`)
- `addNeuron` mit `DEVELOPING_RELAY`
- `systems.js`: Das System „Festigung“ ersetzt die Härtung im Ei, statt die Zelle zu überspringen.

**Nach Fables Gegenlesen 02:44 berichtigt bzw. nachgetragen (selbst gelesen):**
- **`DEVELOPING_RELAY`:** Bei Nervenzellen wirkt der Rhythmus mit ½ × (1 + Antwort). Die Antwort läuft von 0,5 nach −1,5, aus ist er also erst ab Reife ≈ 0,8.
- **`TONIC_LEARNING`:** Die inaktive Rhythmusantwort kompiliert zu 0 (`atelier_compiler.hh:590-595`, nur aktive Antworten werden gesetzt). Der Rhythmus ist dann pace × ½ × sin, und Regionszellen haben `pace : 0,6` (`region_cells.js` `regionCell`) → `cell_class` pace = smooth(0,8; 0,7; 0,9) = 0,5 (`substrate.hh:106-121`). Der Rhythmus ist also lebenslang, mit einem Viertel der Stärke.
- **Sinneszellen gegen Nervenzellen:**
  - Sinneszellen feuern nur bei einer Antwort > 0. So ruht der neue Mechanismus ohne Vorgabe (`8579edf5`).
  - Nervenzellen schwingen schon bei einer Antwort von 0 mit halber Stärke, wenn sie `pace` haben.
  - Der Unterschied ist gewollt, damit bestehende Sinneszellen nicht plötzlich feuern.
- **Streuung:** Der Streuungsgriff streut auch die Zellzeit (Astra 23:20). Damit streut er auch den Takt der Stöße. Das ist erwünscht: Zellen einer Gruppe haben dann ähnliche, aber nicht gleiche Takte.
- **Tabellenzeilen, die Fable nicht gelesen hat:**
  - Gleichgewicht (`body_plan.cc:1102-1103`, innen = Lage des Körpers)
  - Schmerz außen und innen (`:1149-1157`)
  - Druckzellen (`:1158-1170`, Gonaden, Samen, Tiefe, Dehnung im Muskel)
  - Blutsinn (`:1185-1188`)

  Alles von Claude gelesen. Fable bitte stichprobenartig gegenlesen.

**Nachtrag 03:05 (Fable 03:01):**
- `EGG_RHYTHM` hat jetzt den Halbwert 0,2 (Produkt `a14a8d93`). Bei Reife 0,22 ist die Antwort −0,36, das Eigenfeuern ist also beim Schlupf vorbei. Ein geschlüpfter Fisch spürt keinen Schmerz, keine Füllung und keinen Geruch, die nicht da sind.
- Steilheit 3 heißt Exponent 2³ = 8, nicht 3 (`hormones.hh:83`, `pow(c/half, exp2(steepness))`).
- Die Härtung (Halbwert 0,3) liegt damit bei Reife 0,4 bei 0,045 und ist ab 0,5 ≈ 0. Der Kommentar „near nothing from 0.4“ stimmt.

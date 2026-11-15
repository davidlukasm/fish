# Hormone in der Engine – Leseseite von Claude, 15.11. 15:05

Anlass: David 14:51: „Hormon- und Lernen bitte jetzt ebenfalls sofort beginnen, mit Engine-Untersuchung und Plan für Arbeitsteilung und wechselseitigen Code-Reviews, Inspektion von Design und Intuition …“ Dazu David 14:53/14:54: Das Atelier simuliert nicht und dupliziert keinen Code (`ATELIER-OHNE-SIMULATION.md`).

**Selbst gelesen:**
- `colony-core/field/hormones.hh` ganz
- `src/hormone_state.hh` und `src/hormone_state.cc` ganz
- `src/body_plan.cc:180–200` (Zeiten der Drüse), `:1309–1352` (`effector_activity`, Drüsenanteil), `:1640–1660` (Schritt der Blutwerte)
- `colony-core/field/substrate.cc` an den Stellen, wo Wirkungen greifen: `:520–522, 590, 612, 718, 753–770, 812–856, 903–917, 1505–1520`
- `ui/studio/model/systems.js:19–64`
- Funktionsliste von `ui/studio/view/substances.js`

**Nicht gelesen:**
- wie die Rezeptoren aus dem CPPN entstehen (`development.cc:180–190, 470–570`)
- Kosten im Einzelnen
- die Hormonanalyse im Aquarium (`hormone_analysis.cc`, `hormone_view.cc`)

@Astra: bitte gegenlesen und berichtigen.

## 1. Was es gibt

- **Sechs Hormone** (`HORMONES = 6`), dazu drei Körpersignale im Blut:
  - Reife
  - Energiereserve
  - Erschöpfung der schnellen Fasern

  Ein Rezeptor kann statt des Bluts auch die **eigene Zellreife** lesen: das Alter der Zelle über 4096 Schritte (`CELL_MATURITY`).
- **Das Rad:** Jeder Stoff hat einen festen Platz auf einem Kreis (`SUBSTANCE_TURNS`). Die Hormone teilen sich drei Viertel, die Körpersignale das letzte Viertel. Ein Rezeptor hat einen Punkt (x, y) und eine Breite. Seine **Affinität** zu jedem Stoff ist eine Glocke um diesen Punkt (`hormone_affinity`). Der Reiz ist die gewichtete Summe der Spiegel (`blood_stimulus`).
- **Antwort eines Rezeptors** (`HormoneReceptor::response`), begrenzt auf −1…1:

  `Grundwert + Empfindlichkeit · x/(1+x)` mit `x = (c/half)^(2^Steilheit)`.

## 2. Wie Stoffe ins Blut kommen (Drüse)

- **Drüsenzellen** sind Effektoren am Port `gland`. Jede Drüsenzelle hat einen Anteil je Hormon (`e.hormones[k]`). Ein **positives** Signal gießt aus (`secretion`), ein **negatives** bindet (`binding`) (`effector_activity`, `body_plan.cc:1342–1346`).
- **Spiegel je Schritt** (`HormoneState::advance`):
  - Ziel = `height · Ausschüttung`.
  - Hin zum Ziel mit der **Anstiegszeit**, wenn der Spiegel darunter liegt, sonst mit der **Verweilzeit**.
  - Danach nimmt die Bindung `exp(−binding_rate · Bindung)` weg.
  - Der Spiegel ist auf 0…1 begrenzt.
- **Anstiegszeit und Verweilzeit** jedes Hormons sind das gewichtete Mittel der Zellzeiten der Drüsenzellen dieses Hormons (`body_plan.cc:191–199`). Ohne Drüse gilt die Standardzeit.
- **Kosten:** `work_cost · Σ(Ausschüttung + Bindung)`.

## 3. Was Stoffe in Zellen bewirken (neun Wirkungen)

Jede Zelle hat für jede Wirkung einen Rezeptor (`hormone_receptors[e]`). Er wird je Schritt aus den Blutwerten neu ausgewertet (`substrate.cc:1517–1520`). Wo die Wirkung greift, laut Code:

| Wirkung | Wo | Was sie tut |
|---|---|---|
| Excitation | `substrate.cc:718, 818, 826, 840` | hebt die Erregbarkeit (Netzhautwellen) und den Ruhewert; bei Organausgängen verstärkt sie den Antrieb `(1+E)` |
| Output | `:753–770, 821–841` | skaliert, was die Zelle weitergibt, mit `½(1+O)` |
| Rhythm | `:765, 812` | treibt den Taktgeber, skaliert das Tempo |
| Learning | `:856, 913` | Lernrate |
| Eligibility | `:845` | wie stark eigene Aktivität für das Lernen zählt (nicht bei Effektoren) |
| Teaching | `:849` | Lehrsignal, zusammen mit dem Modulator |
| Competition | `:903, 915` | Konkurrenz der Kontakte |
| Consolidation | `:904, 917` | Gelerntes festigen; negativ macht es wieder formbar |
| Death | `:522, 590, 612` | über 0,5 stirbt die Zelle |

Dazu der **Wachstumsrezeptor** (`GROWTH_RECEPTOR`). Er wirkt in der Entwicklung (`development.cc:188, 481–482, 568`): Zellbildung und Körperwachstum. Das habe ich nicht im Einzelnen gelesen.

## 4. Was das Atelier heute dazu zeigt (nur Funktionsliste gelesen)

- **Bibliothek „Hormone“:**
  - Regelkreise (`systems.js`):
    - Belohnung: Darm → Körperzustand, Lehrsignal an Lernzellen
    - Wachstum
    - Festigung: Sättigung → Festigung an Lernzellen
    - Alarm: Schmerz → Handlungswahl „meiden“ → Erregung an Muskeln
  - Körpersignale: Zellbildung ab Reife, arbeitet ab Reife, stirbt ab Reife, Energie im Blut fühlen
  - „Stoff hinzufügen“
- **Inspektor** (`substances.js`): Stoff mit Blutverlauf (`bloodCurves`), Quellen (`substanceSources`), Rad des Rezeptors (`substanceWheel`/`receptorWheel`), Antwortkurven (`effectCurve`), Zeit (`hormoneTime`).
- **Drüse im Fischpanel:** eigener lebender Inspektor `live/gland.js`.

## 5. Was der Gestalter einstellen kann (Engine-Seite)

- **je Drüsenzelle:** welche Hormone sie ausgießt (Anteile), ihre Zellzeit (Anstieg) und ihre Verweilzeit, und wer sie antreibt (Leitungen)
- **je Zelle und Wirkung:**
  - Rezeptor: Punkt auf dem Rad und Breite, also welche Stoffe er liest
  - Grundwert, Empfindlichkeit, Halbwert, Steilheit
  - oder statt des Bluts die eigene Zellreife
- **nicht einstellbar je Fisch** (Weltwerte): `height`, `binding_rate`, `work_cost`

## 6. Was sich daraus fürs Atelier ergibt (für den gemeinsamen Plan, noch kein Entwurf)

- **Ohne Simulation darstellbar:**
  - Der Spiegel bei fester Ausschüttung folgt geschlossen aus `HormoneState::advance`: Annäherung mit Anstiegs- bzw. Verweilzeit.
  - Die Antwort eines Rezeptors ist eine Formel (`response`).

  Das Atelier braucht also keinen Lauf, nur diese zwei Engine-Funktionen, aufgerufen statt nachgebaut (David 14:54).
- **Zu prüfen:** Ob `bloodCurves`, `effectCurve` und `hormoneTime` im JavaScript heute die Engine-Formeln **nachbauen**. Wenn ja, sind das Kopien und kommen auf die Liste in `ATELIER-OHNE-SIMULATION.md`.
- **Wirkung statt Zahl:** Jede der neun Wirkungen hat einen sichtbaren Ort, der schon gezeichnet wird:
  - Erregung und Ausgabe am Muskel- oder Organbild
  - Takt am Taktgeber
  - Lernen, Lehren, Konkurrenz und Festigung im Lernbild (Fables Teil)
  - Tod am Lebenszyklus

  Der Hormoninspektor soll zeigen, **wo** ein Stoff wirkt (Kette Drüse → Blut → Rezeptor → Wirkung am Organ) und nicht neun Kurven nebeneinander. Das gehört in den gemeinsamen Plan.

## 7. Kopien im Atelier heute (nach David 14:54 auf die Liste)

Gelesen, nicht gemessen:
- `ui/studio/model/document.js:262` baut die Affinitätsglocke nach (`hormone_affinity`). `:272` `receptorAffinity` und `:301` `receptorResponse` bauen die Rezeptorantwort nach (`blood_stimulus` + `HormoneReceptor::response`).
- `ui/studio/view/substances.js:81` `bound()` ist eine Kopie von `HormoneReceptor::bound`.
- `bloodCurves`, `effectCurve` und die Rezeptorkurven rechnen ihre Kurven mit diesen Kopien. Beim Ziehen eines Rezeptorgriffs kommt die neue Kurve also aus dem JavaScript, nicht aus der Engine.
- `hormoneTime` liest Anstiegs- und Verweilzeit dagegen aus dem Bericht (`anatomy.hormoneTimes`). Das ist richtig so.

**Folge für den Plan:** Die Engine liefert je Rezeptor die Antwortkurve als Werte (wie heute `senses[i].response` für Sinneszellen), aus derselben Funktion `HormoneReceptor::response`. Das Atelier zeichnet nur. Beim Ziehen ist es dieselbe Frage wie bei allen Griffen: Entwurfslauf statt eigener Rechnung, wenn der Lauf schnell genug ist (siehe `ATELIER-OHNE-SIMULATION.md`).

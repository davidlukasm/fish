# Hirnwachstum im Ei: spontane Aktivität und Festigung (Claude, 14.11. 01:10)

David 00:50–00:59: Lernen ist Hirnwachstum, vor allem im Ei. Alle Verbindungen beginnen bei 0 und müssen gelernt werden. „Wie soll es sein“ müssen wir uns selbst überlegen: wie es echte Fische machen. Härtung und Festigung gehören mit hinein.

## Was die Engine heute tut (im Code geprüft, nicht in Kommentaren)

| Zellen | spontane Aktivität | Stelle |
| --- | --- | --- |
| Netzhaut | synchronisierte Wellen: Nachbarn ziehen sich mit | `substrate.cc:696-722` |
| Nervenzellen der Hirnregionen | Sinusrhythmus, Phase aus der Lage, je Zelle eigen. Stärke 0,75 im Ei, 0,25 bei Reife 0,8, fast 0 ab etwa 0,95. Schlupf liegt bei etwa 0,22. | `substrate.cc:790-804`, `region_cells.js:7-17`, `regions.js:94,106` |
| Strömung und Tasten außen | im Ei die eigenen Zuckungen gegen die Schale | `embryo.cc:10-26`, `body_plan.cc:1191-1209` |
| alle übrigen Sinneszellen | keine. Sie melden nur ihren Reiz, im Ei meist 0 oder konstant. | `substrate.cc:742-745` |
| Festigung | nur über eine Festigungsantwort der lernenden Zelle. Im Atelier gibt es sie nur mit dem System „Festigung“ (Sattheit, also erst nach dem Schlupf). Im Ei wird nichts gefestigt. | `systems.js:40-50`, `substrate.cc:930-969` |

**Folgen:**
- Ein Kontakt entsteht nur, wenn der Sender vom Gewohnten abweicht, und wächst nur mit dem Signal des Senders (`substrate.cc:681-693, 913-921`). Stumme oder konstante Sinneszellen bekommen im Ei keine Bahn.
- Ein ungefestigter Kontakt vergisst mit Halbwertszeit 500 Schritte, schneller noch, wenn er nicht genutzt wird: (1 − Nutzung)/(4 τ) je Schritt (`substrate.cc:343-348`).
- Er wird entfernt, sobald er unter 5 % fällt (`:965-970`).
- Selten meldende Sinne verlieren ihre Bahn also zwischen zwei Ereignissen immer wieder: Füllung bei Mahlzeiten, Bauchweh.

**Mein Commit `14762028` von 00:53** gibt allen Sinnen Netzhautwellen. Das war zu schnell und passt nur für die Netzhaut, siehe unten.

## Wie es echte Fische machen

- **Netzhaut:** spontane Wellen in Bipolar- und Ganglienzellen, beim Zebrafisch etwa 66–84 h nach Befruchtung, also um den Schlupf. Sie sind synchronisiert und laufen bis ins Tectum, meist von temporal aus ([Zhang et al. 2016, Nat Commun](https://link.springer.com/10.1038/ncomms12650)).
- **Rückenmark und Bewegung:** Ab etwa 17,5 h zuckt der Embryo spontan, ohne Sinne. Elektrisch gekoppelte Schrittmacher-Interneurone treiben das, 84 % der Ereignisse sind synchron ([bioRxiv 2023.08.25.554828](https://www.biorxiv.org/content/10.1101/2023.08.25.554828.full.pdf)). Die Engine hat dieses Zucken im Ei.
- **Riechzellen:** Sie haben Grundaktivität ohne Duft. Diese ist nicht wellenförmig und nicht gleichzeitig. Zellen desselben Rezeptors haben aber ähnliche zeitliche Muster. Für die Glomeruli zählt diese Grundaktivität mehr als echte Düfte ([Frontiers Neural Circuits 2024, Maus](https://frontiersin.org/articles/10.3389/fncir.2024.1409680/full)).
- **Darm:** Spontane, nervengesteuerte Darmwellen setzen beim Zebrafisch ein, bevor er frisst: vereinzelt ab Tag 3, regelmäßig ab Tag 4. Die erste Nahrung folgt an Tag 5–6, der Schlupf ist an Tag 2–3 ([Holmberg et al. 2004, J Exp Biol](https://cob.silverchair.com/jeb/article/207/23/4085/15022/Ontogeny-of-the-gut-motility-control-system-in)). Dehnungszellen spüren diese eigenen Wellen der Darmwand.
- **Allgemein:**
  - Synchronisierte Spontanaktivität macht stumme Synapsen innerhalb von Minuten aktiv und räumt überzählige Axone ab.
  - Danach folgen kritische Phasen, in denen die Verbindungen sich festigen.
  - Die Spontanaktivität klingt ab, wenn die Hemmung reift ([Frontiers Neural Circuits 2016](https://frontiersin.org/journals/neural-circuits/articles/10.3389/fncir.2016.00040/full)).

## Vorschlag

1. **Jeder Sinn feuert auf seine eigene Art, wie echte Fische:**
   - **Netzhaut:** synchronisierte Nachbarwellen, wie bisher.
   - **Alle anderen Sinneszellen:** Grundaktivität, jede Zelle in Stößen für sich. Zellen derselben Gruppe (gleiche Herkunft im Bauplan, also gleicher „Rezeptor“) haben dasselbe Muster aus Rate und Stoßlänge, aber eigene Zeitpunkte.
     - Belegt ist das für Riechzellen (Maus).
     - Für Barteln, Schmerz, Gleichgewicht, Blase und Blut ist es eine Annahme. Ein Behelf, bis wir Belege haben.
   - **Seitenlinie und Tasten:** dazu weiter die eigenen Zuckungen.
   - **Füllzellen des Darms:** spüren zusätzlich die Wand des eigenen Darms, wenn der Darmmuskel zuckt. Das entspricht den Dehnungszellen bei den echten spontanen Darmwellen vor dem ersten Fressen.
2. **Ausblenden:**
   - Die Grundaktivität läuft im Ei voll.
   - Nach dem Schlupf blendet sie über die Zellzeit aus, so wie die Welt über `birth_exposure` einblendet. Das ist schon gebaut.
   - Die Reifeantwort der Zelle (Erregung) kann sie früher beenden, wie heute bei der Netzhaut.
3. **Härtung (Festigung) des im Ei Gelernten:**
   - Lernende Zellen bekommen eine Festigungsantwort auf Reife. Sie ist im Ei an und reicht bis kurz nach dem Schlupf, Halbwert etwa bei Schlupfreife.
   - Was im Ei an der Spontanaktivität gelernt wurde, wird so mindestens halb gefestigt. Es bleibt erhalten, auch wenn der Sinn danach lange schweigt, und lernt weiter.
   - Ohne das baut sich die Bahn eines selten meldenden Sinns nach dem Schlupf wieder ab.
   - **Wider:** Gefestigte Kontakte werden schwerer verdrängt, also lernt der junge Fisch Falsches langsamer um. Abhilfe: Die Festigung endet kurz nach dem Schlupf. Spätere Festigung kommt wie bisher über Sattheit.
4. **Zahlen** (Rate, Stoßlänge, Halbwert der Härtung) **nicht schätzen.** Astra misst, wie viele Kontakte bis zum Schlupf wachsen und wie viele 2000 Schritte danach noch stehen, je Sinn, ohne Entwurfsfische.

## Offen für Fable und Astra

- Fable: Bitte lies 1 bis 3 gegen die Engine gegen. Gibt es eine einfachere Stelle für die Härtung als eine Zellantwort, etwa einen festen Entwicklungsanteil in `substrate.cc:944-955`?
- Astra: Messplan zu Punkt 4.

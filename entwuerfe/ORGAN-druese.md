# Organ Drüse (Schritt 11) – Fable, 14.11.

Selbst gelesen: `src/body_plan.cc:1343–1347` (Befehl wird Schütten oder Binden), `src/hormone_state.cc:26–60` (`advance`: Ziel, Anstieg, Verweilen, Binden), `src/hormone_state.hh:8–14` (`height`, `binding_rate`), `colony-core/field/hormones.hh:29–48, 70–79` (Plätze, Affinität), `src/brain_interface.hh:105–108`, `ui/studio/view/gland_effect.js:1–40` und `substances.js:60–86` (heutiges Drüsenbild), `ui/studio/model/organs.js:160–165`.
Nicht gelesen: `work_cost` im Einzelnen, `residence_steps`/`time_constant_steps` (welches Gen), wie viele Typen eine Drüse hat, was die Empfänger der Zellen daraus machen (kommt mit dem Hormonwerkzeug).

## Was die Engine tut
- Eine Drüsenzelle hat einen Ort auf dem Stoffrad und eine Breite; sie schüttet die sechs Hormone in den Anteilen, die daraus folgen.
- Ein erregender Befehl lässt sie schütten, ein hemmender lässt sie die Stoffe binden; Gebundenes verlässt das Blut schneller (`binding_rate` 1/32 je gebundener Einheit und Schritt).
- Der Spiegel eines Hormons geht auf `height` × Geschüttetes zu; er steigt in der Zellzeit seiner Drüsen und klingt in ihrer Verweilzeit ab.
- Schütten und Binden kosten Arbeit; was der Fisch nicht bezahlen kann, wird nicht geschüttet (`paid`).

## Lebenszyklus, drei Fragen
- **Automatisch:** Abklingen in der Verweilzeit; nur bezahlte Arbeit wirkt.
- **Das Organ entscheidet:** nichts; es folgt dem Befehl.
- **Der Designer setzt:** welchen Stoff die Drüse schüttet (Ort, Breite), wie viele Zellen (wie hoch der Spiegel wird), Anstiegszeit und Verweilzeit, von wann bis wann die Drüse lebt.

## Entwurf (Panel Drüse)
1. **Das Blut, wie es durch die Zeit fließt** (gibt es nur hier): sechs Stränge, einer je Hormon, von links nach rechts über 900 Schritte; ein Strang ist so dick wie der Spiegel dieses Hormons in diesem Schritt. Die Drüse steht links vor den Strängen, in die sie schüttet: Griff in ihrer Mitte (welcher Stoff), runder Griff an ihrem Ende (Breite), Griff an ihrer Kante (Zellen). Auf dem Hauptstrang zwei Griffe: Anstiegszeit und Verweilzeit.
2. Eingabe (rund): der Befehl des Gehirns. Über dem Blut schüttet die Drüse, unter dem Blut bindet sie; je weiter weg, desto stärker; wo der Knopf steht, endet der Befehl. Beim Binden beginnt das Blut mit dem Stoff darin, die gestrichelte Linie zeigt das Abklingen ohne Drüse.
3. Leben: Die Drüse der Vorlage lebt von Anfang an (keine spätere Bildung in `organs.js`/`document.js`; meine frühere Angabe „erst nach dem Schlupf“ war nicht belegt und ist gestrichen). Ei, kleiner und großer Fisch tragen den Stoff, soweit das Zellfenster am Band reicht; eine späte Drüse entsteht nur durch die Griffe.

Angenommen fürs Bild: Der Ort liegt auf dem Radrand (zwischen zwei Hormonen, nicht im Inneren des Rads); der Spiegel vor einem bindenden Befehl; wie stark das Binden ausdünnt. Beim Einbau kommen Rad, Namen und Farben aus dem Produkt (`wheelAffinity`, `substanceName`). Nicht im Bild: Kosten; was der Stoff in den Zellen bewirkt (Hormonwerkzeug).

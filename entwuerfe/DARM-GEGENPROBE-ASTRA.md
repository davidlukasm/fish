# Darm: Mittleres Tempo und Verdauung je Schritt

Produktstand `970cb242`.

- `src/physiology.hh:374–405`: Die Darmmuskulatur ändert die Passage abhängig von der momentanen Pose. Das Tempo bei dauerhaft vollem Befehl liegt im Mittel höchstens beim Vierfachen. In der Mitte einer Zuckung kann das Tempo bis zum Siebenfachen steigen. Der Ertrag des geschluckten Bissens verwendet die momentane Passage.
- `src/physiology.cc:233–262`: Die tatsächliche Verdauung berechnet pro Schritt Schmerz, Öffnung, Verderb und Passage aus der momentanen Verweildauer; Schmerz beschleunigt die Passage. Der Ertrag bei mittlerem Tempo ist eine Näherung.
- Eine Gegenprobe mit künstlichem Darm und gesättigter Muskelstärke verwendete eine konstante Pose von 0,5 und eine sinusförmige Pose zwischen 0 und 1 (Periode acht Schritte, gleicher Mittelwert). Die Reserve hatte immer Platz, die Mahlzeit begann mit vollem Darm. Beim langen Darm nahm er aus Blatt 4,4 % bei konstanter Pose und 22,1 % bei Zuckungen auf; aus Plankton 70,6 % bzw. 39,8 %. Maß war der verdaute Anteil vor Verdauungskosten. Die Zahlen gehören zu diesem kontrollierten Fall und sind keine Werte für einen Fischbauplan.
- `src/physiology.hh:385–390`: Sinkt die Fleischgrenze von 375 auf 334, beginnt Plankton-Bauchweh oberhalb 750,56 Schritten und Fleisch-Bauchweh oberhalb 334. Sinkt die Faserschwelle von 0,55 auf 0,43, beginnt Algen-Bauchweh unterhalb 108 und Blatt-Bauchweh unterhalb 228 Schritten. Die Änderung gemeinsamer Parameter verschiebt damit vier Kurven.

// Motor coordination: where a stimulus lies, how urgent swimming is and whether to stop become the
// commands of fins, tail, mouth, jaw and buoyancy. "back" makes the fish retreat: the forward
// strokes of the pectoral fins push it back while the tail rests. Inputs name the side of the
// stimulus: "toward" turns to it, "away" and "feel" turn from it. With competing sides a request on
// one side also inhibits turning to the other, so two requests compete instead of cancelling at the
// muscle. Every node answers any input: contacts learn only between cells that both vary, so a cell
// held silent would never learn its inputs. "beat" and "pump" add inner pacemakers for swimming
// bouts and for a rhythmic mouth.
import {RHYTHM_TAU, TONIC_LEARNING, neuralPlan, pacemakerCell, regionCell} from './region_cells.js';

// Swim threshold for the resting command: silent, gentle cruising, steady cruising.
const SWIM_TONE = Object.freeze([ 0, -.5, -1 ]);
// The output nodes drive muscles directly, like motor neurons: more cells and full contacts.
const DRIVER = Object.freeze({copies : 8, electrical_limit : 1});
// Listeners keep their resting rhythm for life: a meal or a second smell first arrives after
// hatching, and a contact grows only while its target cell is active.
const listener = (node, preset, set = {}) => regionCell(node, preset, 'in', set, TONIC_LEARNING);
export function motorPlan(doc, organ) {
  const r = organ.region;
  const nodes = [
    regionCell('turn', 'relay', 'out', DRIVER),
    regionCell('swim', 'relay', 'both', {...DRIVER, threshold : SWIM_TONE[r.tone]}),
    regionCell('mouth', 'relay', 'both', DRIVER), regionCell('bite', 'relay', 'both', DRIVER),
    // The bladder empties only on a negative command, so lift answers with both signs.
    regionCell('lift', 'relay', 'both', {...DRIVER, q1 : 0}),
    // Stop signals: brake slows swimming; a full gut silences mouth and jaw; food at the mouth
    // holds the fish down while it eats. Brake and hold are as strong as the drivers, or a touch
    // could not stop the swimming drive.
    listener('brake', 'inhibit', DRIVER), listener('sated', 'inhibit'),
    listener('hold', 'inhibit', DRIVER)
  ];
  const inner =
      [ [ 'brake', 'swim' ], [ 'sated', 'mouth' ], [ 'sated', 'bite' ], [ 'hold', 'lift' ] ];
  if (r.retreat) {
    // Retreating pushes with the antagonist fin muscles and brakes the tail.
    nodes.push(regionCell('reverse', 'relay', 'out', DRIVER), listener('retreat', 'relay'));
    inner.push([ 'retreat', 'reverse' ], [ 'retreat', 'brake' ]);
  }
  const cross = [];
  // Mirrored pacemakers beat in antiphase. One pool on the left side drives both sides, so a beat
  // starts and stops the whole tail or mouth.
  const pacing = !organ.pair || organ.side < 0;
  const pacemakers = [ [ 'beat', r.beat, [ 'swim' ] ], [ 'pump', r.pump, [ 'mouth', 'bite' ] ] ];
  for (const [node, level, targets] of pacemakers)
    if (level && pacing) {
      nodes.push(pacemakerCell(node, RHYTHM_TAU[level - 1]));
      for (const to of targets) {
        inner.push([ node, to ]);
        if (organ.pair)
          cross.push([ node, to ]);
      }
    }
  if (organ.pair) {
    nodes.push(listener('flee', 'relay'));
    cross.push([ 'flee', 'turn' ]);
    if (r.compete) {
      nodes.push(listener('oppose', 'inhibit'));
      cross.push([ 'oppose', 'turn' ]);
    }
  }
  return neuralPlan(nodes, inner, cross);
}

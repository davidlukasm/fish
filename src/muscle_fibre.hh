#pragma once
#include <algorithm>
#include <cmath>
#include "protocol_schema.hh"
#include "field/substrate.hh"
namespace fishsim::fibre {
// Muscle fibres run from slow (0: red, oxidative) to fast (1: white, glycolytic). The cell's time
// constant gene sets the mix: a fast fibre contracts in a short stroke. What tells the kinds
// apart is the force they give fresh and the force they can hold. Fast fibres give by far the
// strongest stroke and lose nearly all of it within a few strokes; slow fibres give a weak one
// that never tires; a mix gives a middling stroke and holds almost all of it, more than twice
// what either end holds. Work is cheapest with slow fibres and rest with fast ones. Upkeep follows
// the cells, not the force they give, so slow fibres cost a fish that seldom swims.
namespace M = muscle_fibre;
// Fast fibres burn a glycogen reserve that the blood refills. A stroke spends M::drain of it per
// unit of work at full capacity, weighted by the square of the fast share. The slow fibres beside
// them burn what they leave behind, so the reserve of a cell refills the sooner the more slow
// fibres it has: within M::recovery_fast steps in a cell of fast fibres only, by the same factor
// faster per share of slow ones, towards M::recovery_slow.
inline double fast_share(const field::CellParameters &p) {
  return 1 - std::clamp(double(p.time_constant), 0., 1.);
}
// Each property changes by the same factor per share of fast fibres; a half mix has the force
// and the price of work of an ordinary muscle.
inline double between(double slow, double fast, double share) {
  return slow * std::pow(fast / slow, std::clamp(share, 0., 1.));
}
inline double force(double fast) {
  return between(M::force_slow, M::force_fast, fast);
}
inline double cost(double fast) {
  return between(M::cost_slow, M::cost_fast, fast);
}
inline double upkeep(double fast) {
  return between(M::upkeep_slow, M::upkeep_fast, fast);
}
// Share of the force left: slow fibres keep theirs, fast ones only what their reserve holds.
inline double available(double fast, double reserve) {
  return 1 - fast + fast * reserve;
}
inline double drained(double fast, double work, double capacity) {
  return capacity > 0 ? M::drain * fast * fast * work / capacity : 0;
}
inline double refilled(double fast, double reserve) {
  return (1 - reserve) / between(M::recovery_slow, M::recovery_fast, fast);
}
}

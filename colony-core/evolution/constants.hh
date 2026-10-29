#pragma once
namespace evolution {
constexpr int NODE_TYPES = 10;
constexpr float WEIGHT_ABS_RANGE = 3.f, WEIGHT_RANGE = 6.f;
constexpr float WEIGHT_MIN = -3.f, WEIGHT_MAX = 3.f;
constexpr float MUTATION_ADD_NODE_PROBABILITY = .03f;
constexpr float MUTATION_ADD_CONNECTION_PROBABILITY = .05f;
constexpr float MUTATION_NODE_TYPE_CHANGE_PROBABILITY = .02f;
constexpr float MUTATION_CONNECTION_TOGGLE_PROBABILITY = .01f;
constexpr float WEIGHT_MUTATION_PROBABILITY = .8f;
constexpr float WEIGHT_MUTATION_STDDEV = WEIGHT_RANGE / 16.f;
constexpr float EXCESS_DISTANCE_FACTOR = 1.f, DISJOINT_DISTANCE_FACTOR = 1.f;
constexpr float WEIGHT_DISTANCE_FACTOR = .4f, SPECIATION_THRESHOLD = 3.f;
constexpr int SPECIES_STAGNATION = 15;
constexpr float SURVIVAL_FRACTION = .2f, CROSSOVER_PROBABILITY = .75f;
}

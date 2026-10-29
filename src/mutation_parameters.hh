#pragma once
namespace fishsim {
// Micro changes, neutral growth, and rare topology/type changes.
struct MutationRates {
  double weight_share = .25, subgraph_mutation = .25, step_evolution = 1, gate_insert = .03,
         gate_switch = .03, gate_remove = .01, transfer = .02, add_node = .12, duplicate = .12,
         add_connection = .02, disable = .01, node_edit = .08, type_change = .10, gain_rate = .10,
         gain_step = .15, lateral_connection = .005;
};
}

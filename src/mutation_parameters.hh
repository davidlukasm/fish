#pragma once
namespace fishsim {
// Micro changes, neutral growth, and rare topology/type changes.
struct MutationRates {
  double weight_share = .25, branch_mutation = 1, broad_mutation = .03, step_evolution = 1,
         neutral_structure = 1, add_node = .12, duplicate = .12, add_connection = .02,
         disable = .01, node_edit = .08, type_change = .10, gain_rate = .10, gain_step = .15,
         lateral_connection = .005;
};
}

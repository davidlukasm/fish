#pragma once
#include <array>
#include <cstddef>
namespace fishsim {
enum class FishColumn : std::size_t {
  x = 0,
  y = 1,
  angle = 2,
  eaten = 3,
  id = 4,
  energy = 5,
  age = 6,
  niche = 7,
  hatched = 8,
  development = 9,
  origin = 10,
  offspring = 11,
  depth = 12,
  fertilised = 13,
  egg_role = 14,
  father = 15,
  red = 16,
  green = 17,
  blue = 18,
  mouth_pose = 19,
  egg_organs = 20,
  sperm_organs = 21,
  species = 22,
  health = 23,
  thrust = 24,
  torque = 25,
  defense = 26,
  aggression = 27,
  window_corpses = 28,
  maternal_species = 29,
  paternal_species = 30,
  clonal = 31,
  organs = 32,
  speed = 33,
  impact = 34,
  parent = 35,
  nutrition = 36,
  nutrition_steps = 37,
  nodes = 38,
  edges = 39,
  born = 40,
  generation = 41,
  impulse_left = 42,
  impulse_right = 43,
  tail = 44,
  relative_speed = 45,
  egg_yolk = 46,
  egg_laying = 47,
  sperm_store = 48,
  nutrient_egg = 49,
  mass = 50,
  radius = 51,
  disease = 52,
  reserve_capacity = 53,
  adult_age = 54,
  impulse_forward = 55,
  motor_factor = 56,
  fin_pose = 57,
  fins = 58,
  forms = 59,
  mean_aggression = 60,
  neuron_budget = 61,
  eat_signal = 62,
  mouth_aperture = 63,
  bite_pose = 64,
  suction_pose = 65,
  contour = 66,
  egg_capacity = 67,
  sperm_capacity = 68,
  tissue = 69,
  regions = 70,
  bladder_fill = 71,
  satiety = 72,
  damage = 73,
  hatch_shape = 74,
  body_geometry = 75,
  morphology_asset = 76,
  gut_fill = 77,
  gut_energy = 78,
  gut_digestible = 79,
  digestion = 80,
  digested = 81,
  feeding_action = 82,
  feeding_action_age = 83,
  mouth_phase = 84,
  mouth_budget = 85,
  swallowed = 86,
  mouth_offset = 87,
  mouth_biting = 88,
  filtered = 89,
  mouth_cycle = 90,
  eye_pull_left = 91,
  eye_pull_right = 92,
  immortal = 93,
  assisted = 94,
  remembered = 95,
  count = 96
};
namespace fish_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t angle = 2;
inline constexpr std::size_t eaten = 3;
inline constexpr std::size_t id = 4;
inline constexpr std::size_t energy = 5;
inline constexpr std::size_t age = 6;
inline constexpr std::size_t niche = 7;
inline constexpr std::size_t hatched = 8;
inline constexpr std::size_t development = 9;
inline constexpr std::size_t origin = 10;
inline constexpr std::size_t offspring = 11;
inline constexpr std::size_t depth = 12;
inline constexpr std::size_t fertilised = 13;
inline constexpr std::size_t egg_role = 14;
inline constexpr std::size_t father = 15;
inline constexpr std::size_t red = 16;
inline constexpr std::size_t green = 17;
inline constexpr std::size_t blue = 18;
inline constexpr std::size_t mouth_pose = 19;
inline constexpr std::size_t egg_organs = 20;
inline constexpr std::size_t sperm_organs = 21;
inline constexpr std::size_t species = 22;
inline constexpr std::size_t health = 23;
inline constexpr std::size_t thrust = 24;
inline constexpr std::size_t torque = 25;
inline constexpr std::size_t defense = 26;
inline constexpr std::size_t aggression = 27;
inline constexpr std::size_t window_corpses = 28;
inline constexpr std::size_t maternal_species = 29;
inline constexpr std::size_t paternal_species = 30;
inline constexpr std::size_t clonal = 31;
inline constexpr std::size_t organs = 32;
inline constexpr std::size_t speed = 33;
inline constexpr std::size_t impact = 34;
inline constexpr std::size_t parent = 35;
inline constexpr std::size_t nutrition = 36;
inline constexpr std::size_t nutrition_steps = 37;
inline constexpr std::size_t nodes = 38;
inline constexpr std::size_t edges = 39;
inline constexpr std::size_t born = 40;
inline constexpr std::size_t generation = 41;
inline constexpr std::size_t impulse_left = 42;
inline constexpr std::size_t impulse_right = 43;
inline constexpr std::size_t tail = 44;
inline constexpr std::size_t relative_speed = 45;
inline constexpr std::size_t egg_yolk = 46;
inline constexpr std::size_t egg_laying = 47;
inline constexpr std::size_t sperm_store = 48;
inline constexpr std::size_t nutrient_egg = 49;
inline constexpr std::size_t mass = 50;
inline constexpr std::size_t radius = 51;
inline constexpr std::size_t disease = 52;
inline constexpr std::size_t reserve_capacity = 53;
inline constexpr std::size_t adult_age = 54;
inline constexpr std::size_t impulse_forward = 55;
inline constexpr std::size_t motor_factor = 56;
inline constexpr std::size_t fin_pose = 57;
inline constexpr std::size_t fins = 58;
inline constexpr std::size_t forms = 59;
inline constexpr std::size_t mean_aggression = 60;
inline constexpr std::size_t neuron_budget = 61;
inline constexpr std::size_t eat_signal = 62;
inline constexpr std::size_t mouth_aperture = 63;
inline constexpr std::size_t bite_pose = 64;
inline constexpr std::size_t suction_pose = 65;
inline constexpr std::size_t contour = 66;
inline constexpr std::size_t egg_capacity = 67;
inline constexpr std::size_t sperm_capacity = 68;
inline constexpr std::size_t tissue = 69;
inline constexpr std::size_t regions = 70;
inline constexpr std::size_t bladder_fill = 71;
inline constexpr std::size_t satiety = 72;
inline constexpr std::size_t damage = 73;
inline constexpr std::size_t hatch_shape = 74;
inline constexpr std::size_t body_geometry = 75;
inline constexpr std::size_t morphology_asset = 76;
inline constexpr std::size_t gut_fill = 77;
inline constexpr std::size_t gut_energy = 78;
inline constexpr std::size_t gut_digestible = 79;
inline constexpr std::size_t digestion = 80;
inline constexpr std::size_t digested = 81;
inline constexpr std::size_t feeding_action = 82;
inline constexpr std::size_t feeding_action_age = 83;
inline constexpr std::size_t mouth_phase = 84;
inline constexpr std::size_t mouth_budget = 85;
inline constexpr std::size_t swallowed = 86;
inline constexpr std::size_t mouth_offset = 87;
inline constexpr std::size_t mouth_biting = 88;
inline constexpr std::size_t filtered = 89;
inline constexpr std::size_t mouth_cycle = 90;
inline constexpr std::size_t eye_pull_left = 91;
inline constexpr std::size_t eye_pull_right = 92;
inline constexpr std::size_t immortal = 93;
inline constexpr std::size_t assisted = 94;
inline constexpr std::size_t remembered = 95;
inline constexpr std::size_t count = 96;
}
enum class FoodColumn : std::size_t {
  x = 0,
  y = 1,
  energy = 2,
  id = 3,
  age = 4,
  bottom_steps = 5,
  radius = 6,
  origin = 7,
  red = 8,
  green = 9,
  blue = 10,
  count = 11
};
namespace food_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t energy = 2;
inline constexpr std::size_t id = 3;
inline constexpr std::size_t age = 4;
inline constexpr std::size_t bottom_steps = 5;
inline constexpr std::size_t radius = 6;
inline constexpr std::size_t origin = 7;
inline constexpr std::size_t red = 8;
inline constexpr std::size_t green = 9;
inline constexpr std::size_t blue = 10;
inline constexpr std::size_t count = 11;
}
enum class InvertebrateColumn : std::size_t {
  x = 0,
  y = 1,
  energy = 2,
  id = 3,
  age = 4,
  bottom_steps = 5,
  radius = 6,
  kind = 7,
  red = 8,
  green = 9,
  blue = 10,
  angle = 11,
  algae = 12,
  length = 13,
  morph = 14,
  state = 15,
  direction = 16,
  closed = 17,
  ground = 18,
  bed_depth = 19,
  body_length = 20,
  feeding_rate = 21,
  food_x = 22,
  food_y = 23,
  food_kind = 24,
  filtered = 25,
  count = 26
};
namespace invertebrate_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t energy = 2;
inline constexpr std::size_t id = 3;
inline constexpr std::size_t age = 4;
inline constexpr std::size_t bottom_steps = 5;
inline constexpr std::size_t radius = 6;
inline constexpr std::size_t kind = 7;
inline constexpr std::size_t red = 8;
inline constexpr std::size_t green = 9;
inline constexpr std::size_t blue = 10;
inline constexpr std::size_t angle = 11;
inline constexpr std::size_t algae = 12;
inline constexpr std::size_t length = 13;
inline constexpr std::size_t morph = 14;
inline constexpr std::size_t state = 15;
inline constexpr std::size_t direction = 16;
inline constexpr std::size_t closed = 17;
inline constexpr std::size_t ground = 18;
inline constexpr std::size_t bed_depth = 19;
inline constexpr std::size_t body_length = 20;
inline constexpr std::size_t feeding_rate = 21;
inline constexpr std::size_t food_x = 22;
inline constexpr std::size_t food_y = 23;
inline constexpr std::size_t food_kind = 24;
inline constexpr std::size_t filtered = 25;
inline constexpr std::size_t count = 26;
}
enum class CorpseColumn : std::size_t {
  x = 0,
  y = 1,
  energy = 2,
  age = 3,
  red = 4,
  green = 5,
  blue = 6,
  id = 7,
  angle = 8,
  radius = 9,
  initial_energy = 10,
  hatched = 11,
  bone_age = 12,
  morphology_asset = 13,
  source_id = 14,
  species = 15,
  death_cause = 16,
  bone_time = 17,
  resting = 18,
  sink_phase = 19,
  count = 20
};
namespace corpse_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t energy = 2;
inline constexpr std::size_t age = 3;
inline constexpr std::size_t red = 4;
inline constexpr std::size_t green = 5;
inline constexpr std::size_t blue = 6;
inline constexpr std::size_t id = 7;
inline constexpr std::size_t angle = 8;
inline constexpr std::size_t radius = 9;
inline constexpr std::size_t initial_energy = 10;
inline constexpr std::size_t hatched = 11;
inline constexpr std::size_t bone_age = 12;
inline constexpr std::size_t morphology_asset = 13;
inline constexpr std::size_t source_id = 14;
inline constexpr std::size_t species = 15;
inline constexpr std::size_t death_cause = 16;
inline constexpr std::size_t bone_time = 17;
inline constexpr std::size_t resting = 18;
inline constexpr std::size_t sink_phase = 19;
inline constexpr std::size_t count = 20;
}
enum class GameteColumn : std::size_t {
  x = 0,
  y = 1,
  density = 2,
  red = 3,
  green = 4,
  blue = 5,
  id = 6,
  count = 7
};
namespace gamete_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t density = 2;
inline constexpr std::size_t red = 3;
inline constexpr std::size_t green = 4;
inline constexpr std::size_t blue = 5;
inline constexpr std::size_t id = 6;
inline constexpr std::size_t count = 7;
}
enum class PlantColumn : std::size_t {
  id = 0,
  ax = 1,
  ay = 2,
  bx = 3,
  by = 4,
  nx = 5,
  ny = 6,
  algae = 7,
  grass = 8,
  stump = 9,
  capacity = 10,
  sediment = 11,
  length = 12,
  fiber = 13,
  width = 14,
  sediment_left = 15,
  sediment_right = 16,
  root = 17,
  color = 18,
  form = 19,
  organs = 20,
  trait = 21,
  detritus = 22,
  worms = 23,
  mussel_arc = 24,
  algae_start = 25,
  algae_end = 26,
  count = 27
};
namespace plant_column {
inline constexpr std::size_t id = 0;
inline constexpr std::size_t ax = 1;
inline constexpr std::size_t ay = 2;
inline constexpr std::size_t bx = 3;
inline constexpr std::size_t by = 4;
inline constexpr std::size_t nx = 5;
inline constexpr std::size_t ny = 6;
inline constexpr std::size_t algae = 7;
inline constexpr std::size_t grass = 8;
inline constexpr std::size_t stump = 9;
inline constexpr std::size_t capacity = 10;
inline constexpr std::size_t sediment = 11;
inline constexpr std::size_t length = 12;
inline constexpr std::size_t fiber = 13;
inline constexpr std::size_t width = 14;
inline constexpr std::size_t sediment_left = 15;
inline constexpr std::size_t sediment_right = 16;
inline constexpr std::size_t root = 17;
inline constexpr std::size_t color = 18;
inline constexpr std::size_t form = 19;
inline constexpr std::size_t organs = 20;
inline constexpr std::size_t trait = 21;
inline constexpr std::size_t detritus = 22;
inline constexpr std::size_t worms = 23;
inline constexpr std::size_t mussel_arc = 24;
inline constexpr std::size_t algae_start = 25;
inline constexpr std::size_t algae_end = 26;
inline constexpr std::size_t count = 27;
}
enum class PlantRootColumn : std::size_t {
  height = 0,
  depth = 1,
  drift_age = 2,
  id = 3,
  visual_depth = 4,
  count = 5
};
namespace plant_root_column {
inline constexpr std::size_t height = 0;
inline constexpr std::size_t depth = 1;
inline constexpr std::size_t drift_age = 2;
inline constexpr std::size_t id = 3;
inline constexpr std::size_t visual_depth = 4;
inline constexpr std::size_t count = 5;
}
enum class PlantOrganColumn : std::size_t {
  id = 0,
  kind = 1,
  parent = 2,
  curve = 3,
  width = 4,
  hardness = 5,
  energy = 6,
  vitality = 7,
  attach = 8,
  color = 9,
  bite_hardness = 10,
  notches = 11,
  cut = 12,
  count = 13
};
namespace plant_organ_column {
inline constexpr std::size_t id = 0;
inline constexpr std::size_t kind = 1;
inline constexpr std::size_t parent = 2;
inline constexpr std::size_t curve = 3;
inline constexpr std::size_t width = 4;
inline constexpr std::size_t hardness = 5;
inline constexpr std::size_t energy = 6;
inline constexpr std::size_t vitality = 7;
inline constexpr std::size_t attach = 8;
inline constexpr std::size_t color = 9;
inline constexpr std::size_t bite_hardness = 10;
inline constexpr std::size_t notches = 11;
inline constexpr std::size_t cut = 12;
inline constexpr std::size_t count = 13;
}
enum class AnatomyColumn : std::size_t {
  mouth = 0,
  eye_left = 1,
  eye_right = 2,
  turn_left = 3,
  turn_right = 4,
  eggs = 5,
  sperm = 6,
  defense = 7,
  aggression = 8,
  smell_left = 9,
  smell_right = 10,
  lateral_left = 11,
  lateral_right = 12,
  touch_left = 13,
  touch_right = 14,
  red_left = 15,
  green_left = 16,
  blue_left = 17,
  red_right = 18,
  green_right = 19,
  blue_right = 20,
  suction_strength = 21,
  eye_strength_left = 22,
  eye_strength_right = 23,
  turn_strength_left = 24,
  turn_strength_right = 25,
  egg_strength = 26,
  sperm_strength = 27,
  defense_strength = 28,
  aggression_strength = 29,
  attack_left = 30,
  attack_right = 31,
  armor_left = 32,
  armor_right = 33,
  head = 34,
  smell_outer_left = 35,
  smell_outer_right = 36,
  cord = 37,
  bladder = 38,
  gland = 39,
  satiety = 40,
  damage = 41,
  gonad = 42,
  jaw_length = 43,
  gut_length = 44,
  blunt_teeth = 45,
  undulation = 46,
  count = 47
};
namespace anatomy_column {
inline constexpr std::size_t mouth = 0;
inline constexpr std::size_t eye_left = 1;
inline constexpr std::size_t eye_right = 2;
inline constexpr std::size_t turn_left = 3;
inline constexpr std::size_t turn_right = 4;
inline constexpr std::size_t eggs = 5;
inline constexpr std::size_t sperm = 6;
inline constexpr std::size_t defense = 7;
inline constexpr std::size_t aggression = 8;
inline constexpr std::size_t smell_left = 9;
inline constexpr std::size_t smell_right = 10;
inline constexpr std::size_t lateral_left = 11;
inline constexpr std::size_t lateral_right = 12;
inline constexpr std::size_t touch_left = 13;
inline constexpr std::size_t touch_right = 14;
inline constexpr std::size_t red_left = 15;
inline constexpr std::size_t green_left = 16;
inline constexpr std::size_t blue_left = 17;
inline constexpr std::size_t red_right = 18;
inline constexpr std::size_t green_right = 19;
inline constexpr std::size_t blue_right = 20;
inline constexpr std::size_t suction_strength = 21;
inline constexpr std::size_t eye_strength_left = 22;
inline constexpr std::size_t eye_strength_right = 23;
inline constexpr std::size_t turn_strength_left = 24;
inline constexpr std::size_t turn_strength_right = 25;
inline constexpr std::size_t egg_strength = 26;
inline constexpr std::size_t sperm_strength = 27;
inline constexpr std::size_t defense_strength = 28;
inline constexpr std::size_t aggression_strength = 29;
inline constexpr std::size_t attack_left = 30;
inline constexpr std::size_t attack_right = 31;
inline constexpr std::size_t armor_left = 32;
inline constexpr std::size_t armor_right = 33;
inline constexpr std::size_t head = 34;
inline constexpr std::size_t smell_outer_left = 35;
inline constexpr std::size_t smell_outer_right = 36;
inline constexpr std::size_t cord = 37;
inline constexpr std::size_t bladder = 38;
inline constexpr std::size_t gland = 39;
inline constexpr std::size_t satiety = 40;
inline constexpr std::size_t damage = 41;
inline constexpr std::size_t gonad = 42;
inline constexpr std::size_t jaw_length = 43;
inline constexpr std::size_t gut_length = 44;
inline constexpr std::size_t blunt_teeth = 45;
inline constexpr std::size_t undulation = 46;
inline constexpr std::size_t count = 47;
}
enum class NoseSampleColumn : std::size_t { x = 0, y = 1, contact = 2, odor = 3, count = 4 };
namespace nose_sample_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t contact = 2;
inline constexpr std::size_t odor = 3;
inline constexpr std::size_t count = 4;
}
enum class CppnOutputColumn : std::size_t {
  expression = 0,
  identity_role = 1,
  identity1 = 2,
  identity2 = 3,
  identity3 = 4,
  identity4 = 5,
  capacity = 6,
  threshold = 7,
  time_constant = 8,
  field_width = 9,
  quality1 = 10,
  quality2 = 11,
  quality_width = 12,
  sender1 = 13,
  sender2 = 14,
  receiver1 = 15,
  receiver2 = 16,
  search_width = 17,
  crossing = 18,
  range = 19,
  count = 20
};
namespace cppn_output_column {
inline constexpr std::size_t expression = 0;
inline constexpr std::size_t identity_role = 1;
inline constexpr std::size_t identity1 = 2;
inline constexpr std::size_t identity2 = 3;
inline constexpr std::size_t identity3 = 4;
inline constexpr std::size_t identity4 = 5;
inline constexpr std::size_t capacity = 6;
inline constexpr std::size_t threshold = 7;
inline constexpr std::size_t time_constant = 8;
inline constexpr std::size_t field_width = 9;
inline constexpr std::size_t quality1 = 10;
inline constexpr std::size_t quality2 = 11;
inline constexpr std::size_t quality_width = 12;
inline constexpr std::size_t sender1 = 13;
inline constexpr std::size_t sender2 = 14;
inline constexpr std::size_t receiver1 = 15;
inline constexpr std::size_t receiver2 = 16;
inline constexpr std::size_t search_width = 17;
inline constexpr std::size_t crossing = 18;
inline constexpr std::size_t range = 19;
inline constexpr std::size_t count = 20;
}
enum class PlacementSurfaceColumn : std::size_t {
  ax = 0,
  ay = 1,
  bx = 2,
  by = 3,
  nx = 4,
  ny = 5,
  sediment_left = 6,
  sediment_right = 7,
  algae_start = 8,
  algae_end = 9,
  count = 10
};
namespace placement_surface_column {
inline constexpr std::size_t ax = 0;
inline constexpr std::size_t ay = 1;
inline constexpr std::size_t bx = 2;
inline constexpr std::size_t by = 3;
inline constexpr std::size_t nx = 4;
inline constexpr std::size_t ny = 5;
inline constexpr std::size_t sediment_left = 6;
inline constexpr std::size_t sediment_right = 7;
inline constexpr std::size_t algae_start = 8;
inline constexpr std::size_t algae_end = 9;
inline constexpr std::size_t count = 10;
}
enum class BehaviorFeatureColumn : std::size_t {
  travel = 0,
  turn = 1,
  pauses = 2,
  range = 3,
  pulses = 4,
  glides = 5,
  diet_feed = 6,
  diet_fish = 7,
  diet_egg = 8,
  diet_carrion = 9,
  bottom = 10,
  top = 11,
  spawn = 12,
  sperm = 13,
  mouth = 14,
  aggression = 15,
  defense = 16,
  red = 17,
  green = 18,
  blue = 19,
  diet_algae = 20,
  diet_plant = 21,
  surface = 22,
  grass = 23,
  turbidity = 24,
  current = 25,
  diet_plankton = 26,
  diet_worm = 27,
  diet_crab = 28,
  diet_mussel = 29,
  diet_benthic = 30,
  count = 31
};
namespace behavior_feature_column {
inline constexpr std::size_t travel = 0;
inline constexpr std::size_t turn = 1;
inline constexpr std::size_t pauses = 2;
inline constexpr std::size_t range = 3;
inline constexpr std::size_t pulses = 4;
inline constexpr std::size_t glides = 5;
inline constexpr std::size_t diet_feed = 6;
inline constexpr std::size_t diet_fish = 7;
inline constexpr std::size_t diet_egg = 8;
inline constexpr std::size_t diet_carrion = 9;
inline constexpr std::size_t bottom = 10;
inline constexpr std::size_t top = 11;
inline constexpr std::size_t spawn = 12;
inline constexpr std::size_t sperm = 13;
inline constexpr std::size_t mouth = 14;
inline constexpr std::size_t aggression = 15;
inline constexpr std::size_t defense = 16;
inline constexpr std::size_t red = 17;
inline constexpr std::size_t green = 18;
inline constexpr std::size_t blue = 19;
inline constexpr std::size_t diet_algae = 20;
inline constexpr std::size_t diet_plant = 21;
inline constexpr std::size_t surface = 22;
inline constexpr std::size_t grass = 23;
inline constexpr std::size_t turbidity = 24;
inline constexpr std::size_t current = 25;
inline constexpr std::size_t diet_plankton = 26;
inline constexpr std::size_t diet_worm = 27;
inline constexpr std::size_t diet_crab = 28;
inline constexpr std::size_t diet_mussel = 29;
inline constexpr std::size_t diet_benthic = 30;
inline constexpr std::size_t count = 31;
}
enum class FinEventColumn : std::size_t {
  age_tail = 0,
  age_left = 1,
  age_right = 2,
  peak_tail = 3,
  peak_left = 4,
  peak_right = 5,
  steps_tail = 6,
  steps_left = 7,
  steps_right = 8,
  count = 9
};
namespace fin_event_column {
inline constexpr std::size_t age_tail = 0;
inline constexpr std::size_t age_left = 1;
inline constexpr std::size_t age_right = 2;
inline constexpr std::size_t peak_tail = 3;
inline constexpr std::size_t peak_left = 4;
inline constexpr std::size_t peak_right = 5;
inline constexpr std::size_t steps_tail = 6;
inline constexpr std::size_t steps_left = 7;
inline constexpr std::size_t steps_right = 8;
inline constexpr std::size_t count = 9;
}
enum class NeuronColumn : std::size_t {
  x = 0,
  y = 1,
  role = 2,
  activity = 3,
  functional = 4,
  index = 5,
  id = 6,
  ready = 7,
  z = 8,
  port = 9,
  muted = 10,
  strength = 11,
  internal = 12,
  senses = 13,
  motors = 14,
  bias = 15,
  time_constant = 16,
  identity = 17,
  state = 18,
  signal = 19,
  parameters = 20,
  usable = 21,
  role_margin = 22,
  role_gain = 23,
  zone = 24,
  sender = 25,
  receiver = 26,
  hormone_response = 27,
  site = 28,
  dead = 29,
  synaptic_mean = 30,
  expression = 31,
  search_width = 32,
  crossing = 33,
  range = 34,
  count = 35
};
namespace neuron_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t role = 2;
inline constexpr std::size_t activity = 3;
inline constexpr std::size_t functional = 4;
inline constexpr std::size_t index = 5;
inline constexpr std::size_t id = 6;
inline constexpr std::size_t ready = 7;
inline constexpr std::size_t z = 8;
inline constexpr std::size_t port = 9;
inline constexpr std::size_t muted = 10;
inline constexpr std::size_t strength = 11;
inline constexpr std::size_t internal = 12;
inline constexpr std::size_t senses = 13;
inline constexpr std::size_t motors = 14;
inline constexpr std::size_t bias = 15;
inline constexpr std::size_t time_constant = 16;
inline constexpr std::size_t identity = 17;
inline constexpr std::size_t state = 18;
inline constexpr std::size_t signal = 19;
inline constexpr std::size_t parameters = 20;
inline constexpr std::size_t usable = 21;
inline constexpr std::size_t role_margin = 22;
inline constexpr std::size_t role_gain = 23;
inline constexpr std::size_t zone = 24;
inline constexpr std::size_t sender = 25;
inline constexpr std::size_t receiver = 26;
inline constexpr std::size_t hormone_response = 27;
inline constexpr std::size_t site = 28;
inline constexpr std::size_t dead = 29;
inline constexpr std::size_t synaptic_mean = 30;
inline constexpr std::size_t expression = 31;
inline constexpr std::size_t search_width = 32;
inline constexpr std::size_t crossing = 33;
inline constexpr std::size_t range = 34;
inline constexpr std::size_t count = 35;
}
enum class NeuronStateColumn : std::size_t {
  activity = 0,
  ready = 1,
  muted = 2,
  state = 3,
  signal = 4,
  count = 5
};
namespace neuron_state_column {
inline constexpr std::size_t activity = 0;
inline constexpr std::size_t ready = 1;
inline constexpr std::size_t muted = 2;
inline constexpr std::size_t state = 3;
inline constexpr std::size_t signal = 4;
inline constexpr std::size_t count = 5;
}
enum class NeuronParameterColumn : std::size_t {
  threshold = 0,
  capacity = 1,
  quality1 = 2,
  quality2 = 3,
  quality_width = 4,
  field_width = 5,
  time_constant = 6,
  dendrites = 7,
  plasticity = 8,
  count = 9
};
namespace neuron_parameter_column {
inline constexpr std::size_t threshold = 0;
inline constexpr std::size_t capacity = 1;
inline constexpr std::size_t quality1 = 2;
inline constexpr std::size_t quality2 = 3;
inline constexpr std::size_t quality_width = 4;
inline constexpr std::size_t field_width = 5;
inline constexpr std::size_t time_constant = 6;
inline constexpr std::size_t dendrites = 7;
inline constexpr std::size_t plasticity = 8;
inline constexpr std::size_t count = 9;
}
enum class NeuronSiteColumn : std::size_t { u = 0, v = 1, w = 2, side = 3, count = 4 };
namespace neuron_site_column {
inline constexpr std::size_t u = 0;
inline constexpr std::size_t v = 1;
inline constexpr std::size_t w = 2;
inline constexpr std::size_t side = 3;
inline constexpr std::size_t count = 4;
}
enum class ReceptorColumn : std::size_t {
  neuron = 0,
  channel = 1,
  angle = 2,
  value = 3,
  threshold = 4,
  gain = 5,
  width = 6,
  strength = 7,
  hue = 8,
  senses = 9,
  identity = 10,
  view_left = 11,
  view_right = 12,
  response_threshold = 13,
  scents = 14,
  quality2 = 15,
  quality1 = 16,
  spectrum = 17,
  longitudinal = 18,
  lateral = 19,
  mechanical_angle = 20,
  hormones = 21,
  pressure_kind = 22,
  pressure_target = 23,
  proximity = 24,
  count = 25
};
namespace receptor_column {
inline constexpr std::size_t neuron = 0;
inline constexpr std::size_t channel = 1;
inline constexpr std::size_t angle = 2;
inline constexpr std::size_t value = 3;
inline constexpr std::size_t threshold = 4;
inline constexpr std::size_t gain = 5;
inline constexpr std::size_t width = 6;
inline constexpr std::size_t strength = 7;
inline constexpr std::size_t hue = 8;
inline constexpr std::size_t senses = 9;
inline constexpr std::size_t identity = 10;
inline constexpr std::size_t view_left = 11;
inline constexpr std::size_t view_right = 12;
inline constexpr std::size_t response_threshold = 13;
inline constexpr std::size_t scents = 14;
inline constexpr std::size_t quality2 = 15;
inline constexpr std::size_t quality1 = 16;
inline constexpr std::size_t spectrum = 17;
inline constexpr std::size_t longitudinal = 18;
inline constexpr std::size_t lateral = 19;
inline constexpr std::size_t mechanical_angle = 20;
inline constexpr std::size_t hormones = 21;
inline constexpr std::size_t pressure_kind = 22;
inline constexpr std::size_t pressure_target = 23;
inline constexpr std::size_t proximity = 24;
inline constexpr std::size_t count = 25;
}
enum class EffectorColumn : std::size_t {
  neuron = 0,
  port = 1,
  threshold = 2,
  strength = 3,
  lever = 4,
  hue = 5,
  outside = 6,
  count = 7
};
namespace effector_column {
inline constexpr std::size_t neuron = 0;
inline constexpr std::size_t port = 1;
inline constexpr std::size_t threshold = 2;
inline constexpr std::size_t strength = 3;
inline constexpr std::size_t lever = 4;
inline constexpr std::size_t hue = 5;
inline constexpr std::size_t outside = 6;
inline constexpr std::size_t count = 7;
}
enum class SynapseColumn : std::size_t { source = 0, target = 1, strength = 2, id = 3, count = 4 };
namespace synapse_column {
inline constexpr std::size_t source = 0;
inline constexpr std::size_t target = 1;
inline constexpr std::size_t strength = 2;
inline constexpr std::size_t id = 3;
inline constexpr std::size_t count = 4;
}
enum class StrokeColumn : std::size_t { mean = 0, recovery = 1, power = 2, steps = 3, count = 4 };
namespace stroke_column {
inline constexpr std::size_t mean = 0;
inline constexpr std::size_t recovery = 1;
inline constexpr std::size_t power = 2;
inline constexpr std::size_t steps = 3;
inline constexpr std::size_t count = 4;
}
enum class VisualSampleColumn : std::size_t {
  neuron = 0,
  light = 1,
  stimulus = 2,
  response = 3,
  red = 4,
  green = 5,
  blue = 6,
  count = 7
};
namespace visual_sample_column {
inline constexpr std::size_t neuron = 0;
inline constexpr std::size_t light = 1;
inline constexpr std::size_t stimulus = 2;
inline constexpr std::size_t response = 3;
inline constexpr std::size_t red = 4;
inline constexpr std::size_t green = 5;
inline constexpr std::size_t blue = 6;
inline constexpr std::size_t count = 7;
}
enum class VisualContributionColumn : std::size_t {
  neuron = 0,
  kind = 1,
  id = 2,
  x = 3,
  y = 4,
  radius = 5,
  light = 6,
  red = 7,
  green = 8,
  blue = 9,
  count = 10
};
namespace visual_contribution_column {
inline constexpr std::size_t neuron = 0;
inline constexpr std::size_t kind = 1;
inline constexpr std::size_t id = 2;
inline constexpr std::size_t x = 3;
inline constexpr std::size_t y = 4;
inline constexpr std::size_t radius = 5;
inline constexpr std::size_t light = 6;
inline constexpr std::size_t red = 7;
inline constexpr std::size_t green = 8;
inline constexpr std::size_t blue = 9;
inline constexpr std::size_t count = 10;
}
enum class ImageBandColumn : std::size_t {
  left = 0,
  right = 1,
  red = 2,
  green = 3,
  blue = 4,
  eye = 5,
  distance = 6,
  count = 7
};
namespace image_band_column {
inline constexpr std::size_t left = 0;
inline constexpr std::size_t right = 1;
inline constexpr std::size_t red = 2;
inline constexpr std::size_t green = 3;
inline constexpr std::size_t blue = 4;
inline constexpr std::size_t eye = 5;
inline constexpr std::size_t distance = 6;
inline constexpr std::size_t count = 7;
}
enum class EyeViewColumn : std::size_t {
  x = 0,
  y = 1,
  exposure = 2,
  left = 3,
  right = 4,
  count = 5
};
namespace eye_view_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t exposure = 2;
inline constexpr std::size_t left = 3;
inline constexpr std::size_t right = 4;
inline constexpr std::size_t count = 5;
}
enum class FeederColumn : std::size_t { x = 0, y = 1, radius = 2, rate = 3, count = 4 };
namespace feeder_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t radius = 2;
inline constexpr std::size_t rate = 3;
inline constexpr std::size_t count = 4;
}
enum class CurrentColumn : std::size_t {
  x = 0,
  y = 1,
  angle = 2,
  width = 3,
  strength = 4,
  flow = 5,
  count = 6
};
namespace current_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t angle = 2;
inline constexpr std::size_t width = 3;
inline constexpr std::size_t strength = 4;
inline constexpr std::size_t flow = 5;
inline constexpr std::size_t count = 6;
}
enum class CombatColumn : std::size_t {
  id = 0,
  tick = 1,
  kind = 2,
  source = 3,
  target = 4,
  x = 5,
  y = 6,
  angle = 7,
  radius = 8,
  strength = 9,
  red = 10,
  green = 11,
  blue = 12,
  count = 13
};
namespace combat_column {
inline constexpr std::size_t id = 0;
inline constexpr std::size_t tick = 1;
inline constexpr std::size_t kind = 2;
inline constexpr std::size_t source = 3;
inline constexpr std::size_t target = 4;
inline constexpr std::size_t x = 5;
inline constexpr std::size_t y = 6;
inline constexpr std::size_t angle = 7;
inline constexpr std::size_t radius = 8;
inline constexpr std::size_t strength = 9;
inline constexpr std::size_t red = 10;
inline constexpr std::size_t green = 11;
inline constexpr std::size_t blue = 12;
inline constexpr std::size_t count = 13;
}
enum class WaterCellColumn : std::size_t { x = 0, y = 1, vx = 2, vy = 3, count = 4 };
namespace water_cell_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t vx = 2;
inline constexpr std::size_t vy = 3;
inline constexpr std::size_t count = 4;
}
enum class PedigreeColumn : std::size_t {
  id = 0,
  species = 1,
  parent = 2,
  father = 3,
  depth = 4,
  generation = 5,
  born = 6,
  origin = 7,
  clonal = 8,
  first = 9,
  seen = 10,
  death_cause = 11,
  death_step = 12,
  count = 13
};
namespace pedigree_column {
inline constexpr std::size_t id = 0;
inline constexpr std::size_t species = 1;
inline constexpr std::size_t parent = 2;
inline constexpr std::size_t father = 3;
inline constexpr std::size_t depth = 4;
inline constexpr std::size_t generation = 5;
inline constexpr std::size_t born = 6;
inline constexpr std::size_t origin = 7;
inline constexpr std::size_t clonal = 8;
inline constexpr std::size_t first = 9;
inline constexpr std::size_t seen = 10;
inline constexpr std::size_t death_cause = 11;
inline constexpr std::size_t death_step = 12;
inline constexpr std::size_t count = 13;
}
enum class DeathRecordColumn : std::size_t { id = 0, cause = 1, step = 2, count = 3 };
namespace death_record_column {
inline constexpr std::size_t id = 0;
inline constexpr std::size_t cause = 1;
inline constexpr std::size_t step = 2;
inline constexpr std::size_t count = 3;
}
enum class OrganFormColumn : std::size_t {
  x = 0,
  y = 1,
  z = 2,
  sy = 3,
  sz = 4,
  weight = 5,
  eye_along = 6,
  eye_across = 7,
  eye_rx = 8,
  eye_ry = 9,
  pupil = 10,
  count = 11
};
namespace organ_form_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t z = 2;
inline constexpr std::size_t sy = 3;
inline constexpr std::size_t sz = 4;
inline constexpr std::size_t weight = 5;
inline constexpr std::size_t eye_along = 6;
inline constexpr std::size_t eye_across = 7;
inline constexpr std::size_t eye_rx = 8;
inline constexpr std::size_t eye_ry = 9;
inline constexpr std::size_t pupil = 10;
inline constexpr std::size_t count = 11;
}
enum class FinShapeColumn : std::size_t {
  cells = 0,
  strength = 1,
  x = 2,
  y = 3,
  spread = 4,
  count = 5
};
namespace fin_shape_column {
inline constexpr std::size_t cells = 0;
inline constexpr std::size_t strength = 1;
inline constexpr std::size_t x = 2;
inline constexpr std::size_t y = 3;
inline constexpr std::size_t spread = 4;
inline constexpr std::size_t count = 5;
}
enum class CorpseStateColumn : std::size_t {
  energy = 0,
  reserve_capacity = 1,
  egg_yolk = 2,
  egg_capacity = 3,
  sperm_store = 4,
  sperm_capacity = 5,
  mass = 6,
  tail = 7,
  fin_tail = 8,
  fin_left = 9,
  fin_right = 10,
  mouth_pose = 11,
  bite_pose = 12,
  suction_pose = 13,
  defense = 14,
  health = 15,
  aggression = 16,
  mean_aggression = 17,
  shell_radius = 18,
  birth_tissue = 19,
  mouth_aperture = 20,
  gut_fill = 21,
  gut_energy = 22,
  gut_length = 23,
  undulation = 24,
  count = 25
};
namespace corpse_state_column {
inline constexpr std::size_t energy = 0;
inline constexpr std::size_t reserve_capacity = 1;
inline constexpr std::size_t egg_yolk = 2;
inline constexpr std::size_t egg_capacity = 3;
inline constexpr std::size_t sperm_store = 4;
inline constexpr std::size_t sperm_capacity = 5;
inline constexpr std::size_t mass = 6;
inline constexpr std::size_t tail = 7;
inline constexpr std::size_t fin_tail = 8;
inline constexpr std::size_t fin_left = 9;
inline constexpr std::size_t fin_right = 10;
inline constexpr std::size_t mouth_pose = 11;
inline constexpr std::size_t bite_pose = 12;
inline constexpr std::size_t suction_pose = 13;
inline constexpr std::size_t defense = 14;
inline constexpr std::size_t health = 15;
inline constexpr std::size_t aggression = 16;
inline constexpr std::size_t mean_aggression = 17;
inline constexpr std::size_t shell_radius = 18;
inline constexpr std::size_t birth_tissue = 19;
inline constexpr std::size_t mouth_aperture = 20;
inline constexpr std::size_t gut_fill = 21;
inline constexpr std::size_t gut_energy = 22;
inline constexpr std::size_t gut_length = 23;
inline constexpr std::size_t undulation = 24;
inline constexpr std::size_t count = 25;
}
enum class CorpseVisualColumn : std::size_t {
  organs = 0,
  fins = 1,
  forms = 2,
  contour = 3,
  state = 4,
  regions = 5,
  body = 6,
  count = 7
};
namespace corpse_visual_column {
inline constexpr std::size_t organs = 0;
inline constexpr std::size_t fins = 1;
inline constexpr std::size_t forms = 2;
inline constexpr std::size_t contour = 3;
inline constexpr std::size_t state = 4;
inline constexpr std::size_t regions = 5;
inline constexpr std::size_t body = 6;
inline constexpr std::size_t count = 7;
}
enum class LateralSampleColumn : std::size_t {
  x = 0,
  y = 1,
  flow_x = 2,
  flow_y = 3,
  buried = 4,
  count = 5
};
namespace lateral_sample_column {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t flow_x = 2;
inline constexpr std::size_t flow_y = 3;
inline constexpr std::size_t buried = 4;
inline constexpr std::size_t count = 5;
}
enum class HabitatColumn : std::size_t {
  surface = 0,
  grass = 1,
  buried = 2,
  shadow = 3,
  light = 4,
  count = 5
};
namespace habitat_column {
inline constexpr std::size_t surface = 0;
inline constexpr std::size_t grass = 1;
inline constexpr std::size_t buried = 2;
inline constexpr std::size_t shadow = 3;
inline constexpr std::size_t light = 4;
inline constexpr std::size_t count = 5;
}
enum class SpeciesTraceColumn : std::size_t { step = 0, adults = 1, nutrition = 2, count = 3 };
namespace species_trace_column {
inline constexpr std::size_t step = 0;
inline constexpr std::size_t adults = 1;
inline constexpr std::size_t nutrition = 2;
inline constexpr std::size_t count = 3;
}
namespace food_kind {
inline constexpr int feed = 0;
inline constexpr int fish = 1;
inline constexpr int egg = 2;
inline constexpr int carrion = 3;
inline constexpr int algae = 4;
inline constexpr int plant = 5;
inline constexpr int plankton = 6;
inline constexpr int worm = 7;
inline constexpr int crab = 8;
inline constexpr int mussel = 9;
inline constexpr int benthic = 10;
inline constexpr int count = 11;
}
namespace invertebrate_kind {
inline constexpr int grazing = 6;
inline constexpr int worm = 7;
inline constexpr int crab = 8;
inline constexpr int mussel = 9;
}
namespace mussel_state {
inline constexpr int living = 0;
inline constexpr int empty_shell = 1;
inline constexpr int count = 2;
}
namespace death_reason {
inline constexpr int hunger = 0;
inline constexpr int injury = 1;
inline constexpr int unfertilised = 2;
inline constexpr int failed_development = 3;
inline constexpr int brain_budget = 4;
inline constexpr int eaten_egg = 5;
inline constexpr int age = 6;
inline constexpr int disease = 7;
inline constexpr int count = 8;
}
namespace feeding_effect {
inline constexpr int none = 0;
inline constexpr int wound = 1;
inline constexpr int swallow = 2;
inline constexpr int scrape = 3;
inline constexpr int filter = 4;
inline constexpr int bite = 5;
inline constexpr int crack = 6;
inline constexpr int worm = 7;
inline constexpr int pinch = 8;
inline constexpr int gulp_fish = 9;
inline constexpr int shell_closed = 10;
inline constexpr int count = 11;
}
namespace infection_source {
inline constexpr int spontaneous = 0;
inline constexpr int carrion = 1;
inline constexpr int contact = 2;
inline constexpr int food = 3;
inline constexpr int count = 4;
}
namespace fish_origin {
inline constexpr int founder = 0;
inline constexpr int natural = 1;
inline constexpr int assist = 2;
inline constexpr int immigrant = 3;
inline constexpr int count = 4;
}
namespace feeding_effect_steps {
inline constexpr int full = 48;
inline constexpr int brief = 2;
}
namespace crab_state {
inline constexpr int buried = 0;
inline constexpr int foraging = 1;
inline constexpr int digging = 2;
inline constexpr int fleeing = 3;
inline constexpr int emerging = 4;
inline constexpr int crossing = 5;
inline constexpr int count = 6;
}
namespace plant_form {
inline constexpr int grass = 0;
inline constexpr int rosette = 1;
inline constexpr int stem = 2;
inline constexpr int count = 3;
}
namespace plant_type {
inline constexpr int fine_grass = 0;
inline constexpr int ribbon_grass = 1;
inline constexpr int lance_rosette = 2;
inline constexpr int round_rosette = 3;
inline constexpr int paired_stem = 4;
inline constexpr int alternate_stem = 5;
inline constexpr int count = 6;
}
namespace probe_kind {
inline constexpr int sight = 0;
inline constexpr int smell = 1;
inline constexpr int sense = 2;
inline constexpr int count = 3;
}
namespace odor_kind {
inline constexpr int food = 0;
inline constexpr int algae = 1;
inline constexpr int plants = 2;
inline constexpr int benthos = 3;
inline constexpr int plankton = 4;
inline constexpr int carrion = 5;
inline constexpr int eggs = 6;
inline constexpr int mussels = 7;
inline constexpr int count = 8;
}
namespace organ_kind {
inline constexpr int blade = 0;
inline constexpr int stem = 1;
inline constexpr int leaf = 2;
inline constexpr int round_leaf = 3;
inline constexpr int count = 4;
}
namespace sense_kind {
inline constexpr int light = 0;
inline constexpr int odor = 1;
inline constexpr int flow = 2;
inline constexpr int touch = 3;
inline constexpr int proximity = 4;
inline constexpr int intake = 5;
inline constexpr int damage = 6;
inline constexpr int bladder_pressure = 7;
inline constexpr int gonad_pressure = 8;
inline constexpr int inner_pressure = 9;
inline constexpr int blood = 10;
inline constexpr int count = 11;
}
namespace motor_kind {
inline constexpr int forward = 0;
inline constexpr int turn = 1;
inline constexpr int suction = 2;
inline constexpr int eggs = 3;
inline constexpr int sperm = 4;
inline constexpr int aggression = 5;
inline constexpr int defense = 6;
inline constexpr int pigment = 7;
inline constexpr int bladder = 8;
inline constexpr int gland = 9;
inline constexpr int count = 10;
}
namespace rgb {
inline constexpr int red = 0;
inline constexpr int green = 1;
inline constexpr int blue = 2;
inline constexpr int count = 3;
}
namespace fin {
inline constexpr int tail = 0;
inline constexpr int left = 1;
inline constexpr int right = 2;
inline constexpr int count = 3;
}
namespace pressure_source {
inline constexpr int none = 0;
inline constexpr int eggs = 1;
inline constexpr int sperm = 2;
inline constexpr int bladder = 3;
inline constexpr int shape = 4;
inline constexpr int count = 5;
}
namespace organ_port {
inline constexpr int forward = 1;
inline constexpr int turn = 2;
inline constexpr int eggs = 4;
inline constexpr int sperm = 5;
inline constexpr int suction = 6;
inline constexpr int pigment = 7;
inline constexpr int jaw = 10;
inline constexpr int defense = 11;
inline constexpr int bladder = 12;
inline constexpr int gland = 13;
}
namespace eye {
inline constexpr int left = 0;
inline constexpr int right = 1;
inline constexpr int count = 2;
}
namespace stroke_kind {
inline constexpr int tail = 0;
inline constexpr int turn_left = 1;
inline constexpr int turn_right = 2;
inline constexpr int suction = 3;
inline constexpr int egg = 4;
inline constexpr int sperm = 5;
inline constexpr int bite = 6;
inline constexpr int defense = 7;
inline constexpr int count = 8;
}
namespace step_phase {
inline constexpr int development = 0;
inline constexpr int motion = 1;
inline constexpr int sediment = 2;
inline constexpr int plants = 3;
inline constexpr int drift = 4;
inline constexpr int gpu = 5;
inline constexpr int act = 6;
inline constexpr int resolve = 7;
inline constexpr int settle = 8;
inline constexpr int reproduction = 9;
inline constexpr int count = 10;
}
namespace plan_order {
inline constexpr int head = 0;
inline constexpr int chest = 1;
inline constexpr int torso = 2;
inline constexpr int face = 3;
inline constexpr int tail = 4;
inline constexpr int side = 5;
inline constexpr int mouth = 6;
inline constexpr int spine = 7;
inline constexpr int eye = 8;
inline constexpr int nose = 9;
inline constexpr int barbel = 10;
inline constexpr int count = 11;
}
namespace hormone_effect {
inline constexpr int excitation = 0;
inline constexpr int learning = 1;
inline constexpr int competition = 2;
inline constexpr int eligibility = 3;
inline constexpr int rhythm = 4;
inline constexpr int output = 5;
inline constexpr int death = 6;
inline constexpr int count = 7;
}
namespace hormone_context {
inline constexpr int fed = 0;
inline constexpr int injured = 1;
inline constexpr int fast = 2;
inline constexpr int spawning = 3;
inline constexpr int count = 4;
}
namespace patch_kind {
inline constexpr int replace = 0;
inline constexpr int array = 1;
inline constexpr int object = 2;
inline constexpr int rows = 3;
inline constexpr int mask = 6;
}
namespace tolerance {
inline constexpr double negligible = 1e-09;
inline constexpr double rounding = 1e-12;
inline constexpr double precision = 1e-06;
}
namespace seabed {
inline constexpr double bare_depth = 0.01;
inline constexpr double floor_normal = 0.5;
inline constexpr std::array<double, 3> sediment_color{0.55, 0.48, 0.3};
inline constexpr int algae_capacity_unit = 16;
}
namespace fauna {
inline constexpr std::array<double, 4> crab_family_size{0.82, 1.15, 0.9, 1.0};
inline constexpr double crab_size_base = 0.75;
inline constexpr double crab_size_spread = 0.5;
inline constexpr std::array<double, 4> crab_family_pace{0.65, 1.25, 0.85, 1.05};
inline constexpr double crab_pace_base = 0.55;
inline constexpr double crab_pace_spread = 0.9;
inline constexpr int crab_hash_factor = 73;
inline constexpr int crab_hash_modulus = 257;
inline constexpr double crab_radius_base = 5.625;
inline constexpr double crab_radius_growth = 3.75;
inline constexpr double crab_grown_share = 0.5;
inline constexpr double crab_bare_lift = 1.025;
inline constexpr double crab_min_lift = 0.82;
inline constexpr double crab_lift_gain = 1.23;
inline constexpr double crab_lift_flatten = 0.41;
inline constexpr std::array<double, 7> mussel_family_size{0.85, 1.15, 1.0, 0.75, 1.05, 1.2, 0.6};
inline constexpr std::array<double, 7> mussel_family_width{1.1, 0.9, 1.8, 1.5, 0.7, 2.0, 1.2};
inline constexpr double mussel_size_base = 0.65;
inline constexpr double mussel_size_spread = 0.7;
inline constexpr double mussel_radius = 6.1875;
inline constexpr double mussel_lift = 0.62;
inline constexpr double worm_head_radius = 0.72;
inline constexpr std::array<double, 4> worm_family_length{0.75, 1.0, 1.25, 1.0};
inline constexpr double worm_length_scale = 0.8;
inline constexpr int worm_length_min = 6;
inline constexpr int worm_length_spread = 19;
inline constexpr int worm_hash_factor = 37;
inline constexpr int worm_hash_modulus = 101;
inline constexpr int worm_full_depth = 8;
inline constexpr double burial_min = 0.2;
inline constexpr double burial_spread = 0.6;
inline constexpr int crab_shell_morph = 8;
inline constexpr std::array<double, 3> worm_color{0.7, 0.15, 0.15};
inline constexpr std::array<double, 3> crab_color{0.55, 0.3, 0.2};
inline constexpr std::array<double, 3> mussel_color{0.25, 0.3, 0.35};
}
namespace placement {
inline constexpr double golden_angle = 2.399963229728653;
inline constexpr int egg_spacing = 6;
inline constexpr int egg_edge_gap = 3;
inline constexpr int animal_max = 20;
inline constexpr double animal_spread = 0.4;
inline constexpr double animal_flatten = 0.25;
inline constexpr double morph_step = 0.61803398875;
inline constexpr double morph_span = 0.999;
inline constexpr int mussel_births = 4;
inline constexpr int crab_births = 2;
inline constexpr int worm_heads = 4;
inline constexpr double site_min_height = 0.5;
inline constexpr double site_depth_share = 0.5;
inline constexpr double site_probe = 0.15;
inline constexpr int animal_headroom = 10;
inline constexpr int grass_headroom = 16;
inline constexpr int grass_min_soil = 1;
}
namespace sensory_probe {
inline constexpr int object_kind = 6;
inline constexpr int energy = 120;
inline constexpr int radius = 2;
inline constexpr int scent_gain = 20;
}
namespace body_plan {
inline constexpr std::array<double, 4> phase_weights{1.13, 0.71, 0.61, 0.39};
inline constexpr double phase_volume = 0.085;
inline constexpr double phase_order = 0.137;
inline constexpr int variants = 6;
}
namespace body_shape {
inline constexpr double peak_min = 0.12;
inline constexpr double peak_span = 0.76;
inline constexpr double reach = 0.2;
inline constexpr double handle = 0.65;
inline constexpr double limit = 0.8;
inline constexpr double reserve_width = 0.28;
inline constexpr double shoulder_base = 0.95;
inline constexpr double shoulder_plan = 0.15;
inline constexpr double join_chest = 0.58;
inline constexpr double neck_chest = 0.76;
inline constexpr double tail_base = 0.028;
inline constexpr double tail_fin = 0.04;
inline constexpr double detail_base = 0.97;
inline constexpr double detail_gain = 0.06;
inline constexpr double detail_chest = 0.6;
inline constexpr double detail_hind = 0.23;
inline constexpr double eye_clearance = 1.16;
inline constexpr double skull_handle = 0.25;
inline constexpr double face_handle = 0.25;
}
namespace tuning {
inline constexpr int sigma_min = 12;
inline constexpr int sigma_span = 168;
inline constexpr int wide_power = 4;
inline constexpr int hue_half_circle = 180;
inline constexpr int channel_hue = 120;
inline constexpr std::array<double, 8> scent_latitudes{90.0, 35.0,  35.0,  35.0,
                                                       35.0, -10.0, -60.0, -60.0};
inline constexpr std::array<double, 8> scent_longitudes{0.0,   -25.0, 25.0, 155.0,
                                                        205.0, 180.0, 90.0, 270.0};
inline constexpr double default_width = 0.25;
inline constexpr double threshold_min = 0.0003;
inline constexpr double threshold_range = 333.333333;
inline constexpr double level_min = 0.03;
inline constexpr double level_span = 0.94;
inline constexpr int receptor_width_min = 8;
inline constexpr int receptor_width_span = 109;
inline constexpr int visual_width_min = 4;
inline constexpr int visual_width_max = 117;
inline constexpr double contact_width_min = 22.5;
inline constexpr double contact_width_span = 157.5;
}
namespace organ_profile {
inline constexpr int blade_power = 5;
inline constexpr double blade_shape = 0.45;
inline constexpr double stem_taper = 0.75;
inline constexpr double stem_knot = 0.5;
inline constexpr double knot_at = 0.93;
inline constexpr double knot_width = 0.06;
inline constexpr double leaf_base = 0.12;
inline constexpr double leaf_stalk = 0.08;
inline constexpr double leaf_power = 0.9;
inline constexpr double leaf_ripple = 0.06;
inline constexpr int leaf_ripples = 10;
inline constexpr double round_power = 0.65;
inline constexpr double round_taper = 0.27;
inline constexpr std::array<double, 3> stem_tint{0.62, 0.74, 0.55};
}
namespace source_limits {
inline constexpr int min_width = 32;
inline constexpr int max_width = 600;
inline constexpr int max_strength = 6;
inline constexpr int max_count = 64;
inline constexpr int max_feeder_rate = 100;
inline constexpr int min_feeder_radius = 1;
inline constexpr int max_feeder_radius = 120;
inline constexpr int erase_margin = 10;
}
namespace tank {
inline constexpr int min_width = 615;
inline constexpr int max_width = 4920;
inline constexpr int min_height = 410;
inline constexpr int max_height = 3280;
inline constexpr int standard_width = 3690;
inline constexpr int standard_height = 1640;
inline constexpr int max_obstacles = 64;
inline constexpr int min_polygon_points = 3;
inline constexpr int max_polygon_points = 32;
inline constexpr int max_coordinate = 1000000;
}
namespace behavior {
inline constexpr int min_samples = 80;
inline constexpr double group_weight = 0.2;
inline constexpr double diet_scale = 0.5;
}
namespace population_limits {
inline constexpr int max_fish = 2000;
inline constexpr int min_limit = 3;
}
namespace text_limit {
inline constexpr int word = 32;
inline constexpr int name = 64;
inline constexpr int phrase = 128;
inline constexpr int command = 4096;
}
namespace water_setting {
inline constexpr double max_flow = 2.0;
inline constexpr double max_gravity = 0.3;
}
namespace run_limit {
inline constexpr int max_threads = 64;
inline constexpr int max_food = 20000;
inline constexpr int default_fish = 200;
inline constexpr int default_food = 1200;
inline constexpr int default_brain_nodes = 8192;
inline constexpr int default_brain_edges = 65536;
inline constexpr int default_neural_budget = 64000000;
inline constexpr int max_neural_budget = 256000000;
inline constexpr int benchmark_steps = 100;
inline constexpr int max_benchmark_steps = 1000000;
}
namespace edit_limit {
inline constexpr int max_brush_radius = 120;
inline constexpr double brush_amount = 8.0;
inline constexpr double min_brush_amount = 0.5;
inline constexpr double max_brush_amount = 16.0;
inline constexpr int max_stock = 20;
inline constexpr double min_wall_width = 4.0;
inline constexpr double max_wall_width = 100.0;
inline constexpr double stone_radius = 28.0;
inline constexpr double min_stone_radius = 8.0;
inline constexpr double max_stone_radius = 120.0;
inline constexpr int spray_count = 12;
inline constexpr double spray_radius = 18.0;
inline constexpr int max_removal = 50;
inline constexpr int max_delay = 1000;
inline constexpr int observation_interval = 1200;
inline constexpr int min_observation_interval = 100;
inline constexpr int max_observation_interval = 1000000;
inline constexpr double supply_scale = 1000.0;
inline constexpr double mutant_spread = 12.0;
inline constexpr int delay = 30;
inline constexpr int max_held_steps = 10000;
inline constexpr int max_spray_count = 100;
inline constexpr double max_spray_radius = 100.0;
}
namespace generation {
inline constexpr int natural = 1;
inline constexpr int support = 2;
inline constexpr int max = 2000000;
}
namespace time_constant {
inline constexpr double min_steps = 4.0;
inline constexpr double span = 12.0;
}
namespace vision {
inline constexpr int pixels = 128;
inline constexpr double half_view = 0.65;
}
namespace water_grid {
inline constexpr double cell = 32.0;
inline constexpr int view_stride = 3;
}
namespace journal {
inline constexpr int max_pedigree = 5000;
}
namespace form_layout {
inline constexpr int internal = 0;
inline constexpr int first_sense = 1;
inline constexpr int early_organs = 8;
inline constexpr double absent_place = 0.5;
inline constexpr double absent_spread = 0.18;
}
namespace region_layout {
inline constexpr int head = 0;
inline constexpr int cord = 1;
inline constexpr int turn_fin = 2;
inline constexpr int lobes = 2;
}
namespace eye_place {
inline constexpr double default_offset = 2.4;
inline constexpr double outset = 0.88;
}
namespace plan_point {
inline constexpr int length = 0;
inline constexpr int width = 1;
inline constexpr int head_handle = 2;
inline constexpr int head_front_lift = 3;
inline constexpr int head_back_lift = 4;
inline constexpr int peak = 2;
inline constexpr int front_reach = 3;
inline constexpr int back_reach = 4;
inline constexpr int face_handle_width = 2;
inline constexpr int face_handle = 3;
inline constexpr int snout_width = 4;
inline constexpr int eye_width = 2;
inline constexpr int eye_size = 3;
inline constexpr int pupil = 4;
}
namespace contour {
inline constexpr int bins = 8;
inline constexpr int levels = 255;
}
namespace development {
inline constexpr int sites = 360;
}
namespace body_unit {
inline constexpr int radius = 4;
inline constexpr int max_radius = 32;
inline constexpr int reserve_energy_per_mass = 300;
inline constexpr int body_tissue = 40;
inline constexpr int adult_reserve = 400;
inline constexpr double trait_middle = 0.5;
inline constexpr double mouth_share_short = 0.28;
inline constexpr double mouth_share_span = 0.44;
}
namespace mouth_cycle {
inline constexpr int steps = 8;
inline constexpr std::array<double, 9> opening{0.35, 0.8, 1.0, 1.0, 0.65, 0.1, 0.0, 0.15, 0.35};
}
namespace sensory_component {
inline constexpr int neuron = 0;
inline constexpr int senses = 1;
}
namespace plankton_source {
inline constexpr int radius = 100;
inline constexpr int sigma = 44;
}
namespace rate_window {
inline constexpr int steps = 1000;
inline constexpr int display_steps = 100;
}
namespace genome_import {
inline constexpr int max_bytes = 1000000;
inline constexpr int timeout_ms = 30000;
inline constexpr int develop_ms = 25000;
}
namespace render_group {
inline constexpr int key_bits = 48;
}
namespace hormones {
inline constexpr int levels = 4;
inline constexpr int signs = 2;
}
namespace route {
inline constexpr const char *page = "/";
inline constexpr const char *assets = "/ui/";
inline constexpr const char *texts = "/ui/text/";
inline constexpr const char *genome = "/genome";
inline constexpr const char *journal = "/journal";
inline constexpr const char *population = "/population";
inline constexpr const char *population_preview = "/population-preview";
inline constexpr const char *names = "/names";
inline constexpr const char *state = "/state";
inline constexpr const char *history = "/history";
inline constexpr const char *command = "/command";
inline constexpr const char *fps_report = "/fps-report";
inline constexpr const char *scene = "/scene";
}
namespace record_sample {
inline constexpr int period = 100;
}
namespace frame_patch {
inline constexpr int mask_digit_bits = 4;
}
namespace protection {
inline constexpr int generations = 2;
inline constexpr int max_uses = 3;
}
namespace habitat_zone {
inline constexpr int surface_gap = 24;
inline constexpr double dark_light = 0.2;
inline constexpr int strong_current = 2;
inline constexpr double bottom_zone = 0.8;
inline constexpr double top_zone = 0.2;
}
namespace behavior_feature_set {
inline constexpr std::array<std::size_t, 6> movement{0, 1, 2, 3, 4, 5};
inline constexpr std::array<std::size_t, 11> diet{6, 7, 8, 9, 20, 21, 26, 27, 28, 29, 30};
inline constexpr std::array<std::size_t, 6> habitat{10, 11, 22, 23, 24, 25};
inline constexpr std::array<std::size_t, 2> reproduction{12, 13};
inline constexpr std::array<std::size_t, 6> signals{14, 15, 16, 17, 18, 19};
}
inline constexpr std::array<int, 10> motor_ports{
    organ_port::forward, organ_port::turn, organ_port::suction, organ_port::eggs,
    organ_port::sperm,   organ_port::jaw,  organ_port::defense, organ_port::pigment,
    organ_port::bladder, organ_port::gland};
namespace behavior_scale {
inline constexpr double speed = 8.64;
inline constexpr double turn_degrees = 54;
inline constexpr double cruising_speed = 0.75;
}
}

#include "random.hh"
#include "material.hh"
#pragma once
#include "food_state.hh"
#include "small_animals.hh"
#include "geometry_state.hh"
#include "plant_state.hh"
#include "food.hh"
#include "visible_body.hh"
#include "water.hh"
#include "plant_types.hh"
#include "environment_parameters.hh"
#include "light_state.hh"
#include "sediment_state.hh"
#include <deque>
#include <optional>
#include <string>
#include <functional>
namespace test {
struct StateAccess;
}
namespace fishsim {
inline double sediment_resistance(double immersion, double defense = 0, double undulation = 0) {
  return 1 + 18 * immersion * immersion * (1 + 2 * std::clamp(defense, 0., .85)) *
                 (1 - std::clamp(undulation, 0., 1.));
}
inline double sediment_vertical_resistance(double resistance, double vy) {
  return vy < 0 ? 1 + .25 * (resistance - 1) : resistance;
}

struct Body;
struct SensoryProbe;
struct PhysiologyParameters;

struct Field {
  std::vector<std::array<double, 2>> read_edges_;
  bool reading_edges_ = false;

public:
  // The fish phase reads the bed concurrently; sediment changes resume afterwards.
  struct SedimentReadScope {
    Field &field;
    explicit SedimentReadScope(Field &);
    ~SedimentReadScope() { field.reading_edges_ = false; }
    SedimentReadScope(const SedimentReadScope &) = delete;
    SedimentReadScope &operator=(const SedimentReadScope &) = delete;
  };
  const FoodWebState &food_web() const { return food_web_; }
  void sync_food_web();
  void prepare_plankton_sources();
  bool threatens(const VisibleBody &, double x, double y, double radius, double body,
                 double speed) const;
  const VisibleBody *danger_near(double x, double y, double radius, double body,
                                 double speed) const;
  std::vector<std::pair<std::size_t, double>> plankton_source_cells(Point) const;
  void advance_food_web();
  void startle_animals(double x, double y, double radius);
  bool crush_target(int kind, std::uint64_t id, int organ, double along = 0);
  bool encourage_target(int kind, std::uint64_t id);
  // A standard fish bite at one place of a plant organ (inspection: see how bites look).
  bool bite_target(std::uint64_t id, int organ, double along);
  void index_small_animals(std::vector<VisibleBody> &) const;
  double plankton_density(double, double) const;
  bool plankton_water_cell(std::size_t) const;
  // Records which cells hold water for the rest of this step; queries then need no geometry.
  void refresh_water_cells();
  double optical_turbidity(double x, double y) const {
    return turbidity(x, y) + optical_density_scale * plankton_density(x, y);
  }
  void release_excess_algae(SurfacePatch &);
  void scatter_fragments(const SmallAnimalMeal &, double force, double spread = 1);
  double feed_plankton(double x, double y, double available, double radius = 1);
  double consume_plankton(double, double, double, double);
  bool draw_food(std::size_t, double, double, double travel, double arrival);
  double filter_plankton(double, double, double, double, double);
  double graze_bed(double, double, double, double, double);
  double grip_worm(double, double, double, double);
  void deposit_feces(double, double, double);
  std::optional<std::size_t> bottom_patch(double, double) const;
  std::optional<SmallAnimalMeal> take_small_animal(int, std::size_t, double force, bool biting,
                                                   bool buried = false);
  void deposit_detritus(double, double, double, double radius = 0);
  double feed_crabs(double x, double y, double energy, double radius);
  std::array<double, 5> small_animal_stores() const;
  double small_animal_energy() const;
  double algae_capacity(const SurfacePatch &p) const {
    return env_.algae_capacity * (p.length * (p.algae_open[1] - p.algae_open[0]) + p.mussel_arc) /
           16;
  }
  double algae_thickness(const SurfacePatch &p) const {
    const double fill = std::clamp(p.algae / std::max(1e-12, algae_capacity(p)), 0., 1.);
    return env_.algae_thickness * fill * fill;
  }
  double algae_surface_density(const SurfacePatch &p) const {
    return algae_density(p.algae, p.length * (p.algae_open[1] - p.algae_open[0]) + p.mussel_arc,
                         algae_thickness(p));
  }
  const FoodState &feeding() const { return feeding_; }
  const GeometryState &geometry() const { return geometry_; }
  const PlantState &vegetation() const { return vegetation_; }
  const SedimentState &sediment() const { return sediment_; }
  const LightState &lighting() const { return lighting_; }
  const Water &water() const { return water_; }
  const EnvironmentParameters &env() const { return env_; }

  std::uint64_t environment_signature = 0;

  class EditSnapshot {
    friend struct Field;
    std::vector<Obstacle> obstacles;
    std::vector<Feeder> feeders;
    std::vector<FoodCloud> clouds;
    std::vector<CurrentSource> currents;

    std::vector<SurfacePatch> surfaces;
    std::vector<DriftingGrass> drifting;
    std::vector<double> suspended;
    FoodWebState food_web;
    std::uint64_t next_surface = 0, next_obstacle = 0;
    EditSnapshot() = default;

  public:
    std::array<double, 2> plant_energies() const;
  };
  EditSnapshot capture_edit() const;
  void restore_edit(EditSnapshot);
  void restore_moved_material(EditSnapshot, std::uint64_t obstacle_id);
  void finish_resize();
  void insert_obstacle(Obstacle);
  void remove_obstacle(std::size_t);
  std::array<std::size_t, 2> remove_covered_material(const Obstacle &);
  void reset_growth_history() { vegetation_.growth_history.clear(); }
  void set_suspended_sediment(std::size_t, double);
  void initialize_aquarium(double width, double height) {
    geometry_.width = width;
    geometry_.height = height;
  }
  FoodSupply food_supply() const;
  void top_up(FoodSupply);
  std::size_t manual_feed(double x, double y, int count, double radius);
  std::size_t clear_food();
  std::size_t erase_food(double x, double y, double radius);
  void set_energy_supply(double);
  double energy_supply() const { return env_.energy_supply * food_web_.plankton.water_area; }
  double artificial_supply() const {
    const double maximum = energy_supply() * env_.food_supply_share;
    return maximum > 0 ? maximum / (1 + env_.nature_weight * feeding_.nature_average / maximum) : 0;
  }
  double plankton_supply() const { return energy_supply() * env_.plankton_supply_share; }
  double benthic_supply() const { return energy_supply() * env_.benthic_supply_share; }
  double small_animal_supply() const { return plankton_supply() + benthic_supply(); }
  void begin_production();
  void finish_production();
  void request_production(double amount, std::function<double(double)> apply);
  double producer_supply() const {
    return std::max(0., energy_supply() - artificial_supply() - small_animal_supply());
  }
  void record_nature(double value) { feeding_.nature_intake += value; }
  void reset_nature() { feeding_.nature_average = feeding_.nature_intake = 0; }
  void rescue_nature() {
    const double keep = 1 - env_.rescue_nature_reset;
    feeding_.nature_average *= keep;
    feeding_.nature_intake *= keep;
  }
  void advance_nature() {
    const double rate = -std::expm1(-std::log(2.) / env_.nature_half_life);
    feeding_.nature_average += rate * (feeding_.nature_intake - feeding_.nature_average);
    feeding_.nature_intake = 0;
  }
  int source_count() const { return int(feeding_.clouds.size()); }
  void refresh_niche_limits();
  void refresh_algae_exposure();
  double niche_limit(int kind) const { return niche_limits_.at(kind); }
  double energy_limit() const;
  void set_food_density(int);
  void set_current_source(int, double, double, double, double, double);
  void set_feeder(int, double, double, double, double);
  std::size_t erase_feeder(double, double);
  std::size_t erase_current(double, double);
  void set_energy_headroom(double);
  int fund_from_sources(double);
  // Bite part `index`; for a stroke, at position `along_stroke` (-1 … 1) along it, from the
  // side `side` (+1 along the curve normal, -1 against it).
  std::optional<Food> bite_plant(Body &, std::size_t, double along_stroke = 0, double side = 1);
  void consume_algae(std::size_t, double);
  void collide_food(Body &, double, double, const PhysiologyParameters &);
  void append_fragment(const Food &);
  void bite_food(std::size_t, double, bool fish_bite = false);
  double crumb_limit(const Food &f) const { return (f.bitten ? .5 : 1.) * env_.crumb_min; }
  void consume_food(std::size_t);
  void configure_seed_food(int);
  void place_initial_food();
  double algae_energy() const;
  double grass_energy() const;
  double plant_growth_rate() const;
  const SurfacePatch &plant_source(std::size_t i) const {
    return i < vegetation_.surfaces.size()
               ? vegetation_.surfaces[i]
               : vegetation_.drifting_grass[i - vegetation_.surfaces.size()].plant;
  }
  void prepare_organs(SurfacePatch &, bool drifting = false);
  // Returns whether a fish body bent the plant.
  bool shape_organs(SurfacePatch &);
  void index_organs(SurfacePatch &, std::size_t);
  void cut_organ(std::size_t, int, double);
  void update_canopy_light();
  void uproot(SurfacePatch &);
  void advance_grass();
  double soil_depth(const SurfacePatch &) const;
  double grass_capacity(const SurfacePatch &) const;
  bool room_for_plant(const SurfacePatch &) const;
  double root_stability(std::size_t) const;
  void sync_environment();
  void seed_plants();
  void grow_plants(bool paced = false);
  void index_plants(bool paced = false, bool edited = false);
  double plant_reach(const SurfacePatch &) const;
  void reserve_canopy(const SurfacePatch &, PlantGeometryCache &);
  void advance_sediment(int phase = 0, int period = 1);
  void stir_sediment(const Body &);
  double settling_speed(double material) const { return std::clamp(gravity * material, -3., 3.); }
  Point drift_velocity(Point current, Point water, double material, double response) const {
    return {current.x + response * (water.x - current.x),
            current.y + response * (water.y + settling_speed(material) - current.y)};
  }
  void update_sediment_light();
  void settle_plant_geometry(const std::vector<double> &, bool grazed);
  Point nearby_flow(const Body &) const;
  Point fish_disturbance(const VisibleBody &, Point) const;
  void prepare_plankton_flow();
  std::array<Point, 2> nearby_flow_samples(const Body &, const std::array<Point, 2> &) const;
  std::array<Point, 4> nearby_flow_samples(const Body &, const std::array<Point, 4> &) const;
  double sediment_cover(double, double) const;
  bool rests_on_sediment(Point, double radius) const;
  bool bed_site_clear(const SurfacePatch &, double along, double height, double headroom) const;
  std::array<double, 3> surface_color(double, double) const;
  double daylight() const;
  double light(double, double) const;
  double turbidity(double, double) const;
  double sediment_transmission(double, double, double, double) const;
  std::array<double, 3> grass_transmission(double, double, double, double) const;
  // Foliage overlapping a body: covered share of the body area, weighted by organ opacity, and
  // the unit direction from the body towards that foliage.
  struct FoliageContact {
    double cover = 0;
    Point toward{};
    double blocked = 0; // Share of the body's diameter barred by organs, weighted by opacity.
    // Mechanical resistance: cover weighted once more by opacity, so thin translucent blades
    // bend away almost freely while dense leaves still hold a fish back.
    double stiffness = 0;
  };
  FoliageContact foliage_contact(double x, double y, double radius) const;
  // Optical depth (log2) of one perpendicular crossing through an organ, per colour channel.
  std::array<double, 3> foliage_depth(int organ_kind) const {
    const double passed = organ_kind >= 2   ? env_.foliage_leaf_transmission
                          : organ_kind == 1 ? env_.foliage_stem_transmission
                                            : env_.foliage_blade_transmission,
                 depth = -std::log2(std::clamp(passed, 1e-6, 1.)), bias = env_.foliage_green_bias;
    return {depth * (1 + bias), depth * (1 - bias), depth * (1 + bias)};
  }
  double view_ray(double, double, double, double, double reach = RANGE) const;
  std::array<double, 2> sediment_edges(std::size_t,
                                       const std::vector<double> *amounts = nullptr) const;
  double sediment_immersion(double, double, double radius = 0) const;
  Point sediment_velocity(Point, double, double, double radius = 0) const;
  double surface_gap(double, double, double radius = 0) const;
  bool in_grass(double, double, double radius = 0) const;
  bool edit_environment(const std::string &, double, double, double radius = 24,
                        int plant_type = -1, double amount = 8);

  Rng rng;

  double flow = .5;
  double gravity = .036;
  std::uint64_t time = 0;

  double energy_available = 1e12;
  bool production_pending = false;
  struct Production {
    double remaining;
    std::function<double(double)> apply;
  };
  std::vector<Production> production;

  // Food pieces: energy in [food_min,food_max], rich pieces rarer.

  double water_clarity = 90;
  double ink_density = .96;

  double draw_food_energy();
  std::array<double, 3> food_color(const Food &) const;
  std::size_t food_count() const;
  double loose_energy(int origin) const;
  void place_food(double x, double y, double vx, double vy, double energy);
  double food_energy() const;
  void distribute_start_food(const std::vector<Point> &eggs);
  int remove_deepest(double energy); // takes exactly this energy, deepest pieces first

  struct OdorSource {
    double x, y, energy;
  };
  struct SpermCell {
    double density = 0;
    std::array<double, 3> color{}; // Mean color, weighted by local sperm mass.
  };
  const std::vector<SpermCell> &sperm_field() const { return sperm_field_; }
  void set_sperm_field(std::vector<SpermCell>, double opaque);
  bool has_sperm() const { return has_sperm_; }
  void release_waterborne(double amount) { food_web_.released += std::max(0., amount); }
  double sperm_density(double, double) const;
  struct SpermOptics {
    std::array<double, 3> transmission{1, 1, 1}, scattering{};
  };
  SpermOptics sperm_optics(double, double, double, double) const;
  std::array<double, 3> filter_sperm(double, double, double, double, std::array<double, 3>) const;
  std::array<double, 2> odor_probe(const SensoryProbe &, const std::array<Point, 2> &,
                                   int channel) const;

  const std::vector<CurrentSource> &currents() const { return currents_; }
  const std::vector<OdorSource> &carrion_odor() const { return carrion_odor_; }
  const std::vector<VisibleBody> &visible() const { return visible_; }
  const SpatialGrid &body_grid() const { return body_grid_; }
  double indexed_body_radius() const { return indexed_body_radius_; }
  bool indexed() const { return indexed_; }
  void invalidate_index() { indexed_ = false; }
  void index(const std::vector<VisibleBody> &bodies, std::vector<OdorSource> odors) {
    carrion_odor_ = std::move(odors);
    index(bodies, false);
  }
  explicit Field(std::uint64_t seed, int count = 150);
  void add(int count);
  void add(int count, const FoodSupply &);
  void supply_food(Point, double spread, int count, const FoodSupply &);
  Point food_cloud(int index) const;
  void advance_food_clouds();
  int place_animals(int kind, double x, double y, double radius, int count, double morph = -1);
  void top_up();
  double wrap_x(double x) const {
    return x > 0 && x < geometry_.width ? x : x - geometry_.width * std::floor(x / geometry_.width);
  }
  double delta_x(double dx) const {
    return dx >= -.5 * geometry_.width && dx <= .5 * geometry_.width
               ? dx
               : std::remainder(dx, geometry_.width);
  }
  bool overlaps(const Obstacle &, double x, double y, double margin = 0) const;
  bool free(double x, double y, double margin = 2) const;
  bool position(Rng &, double &, double &, double radius = MAX_BODY_RADIUS) const;
  int motion_workers = 1;
  void motion(const Water *replay_water = nullptr);
  void collide(Body &, double old_x, double old_y, double radius = -1) const;
  void resize(double, double);
  void spray(double, double, int count, double radius);
  void index(const std::vector<VisibleBody> &, bool rebuild_plants = true);
  std::array<double, 3> filter_color(double x, double y, double tx, double ty,
                                     std::array<double, 3> color) const;
  void index_geometry();
  void compact_food();
  bool clear_line(double x, double y, double tx, double ty) const;
  double ray(double, double, double, double, double margin = 0, double reach = RANGE) const;
  double ray_local(double, double, double, double, double, double) const;
  // Water-borne odor field (plankton grid), read at a point; advanced once per step.
  std::array<double, 8> odor_field(double x, double y) const;
  void advance_odor();

private:
  void fit_food_clouds();
  double supply_plankton(double budget, double per_source);
  SurfacePatch &plant_source_mut(std::size_t i) {
    return i < vegetation_.surfaces.size()
               ? vegetation_.surfaces[i]
               : vegetation_.drifting_grass[i - vegetation_.surfaces.size()].plant;
  }

  void rebuild_clear_light();
  void rebuild_sediment_masks(int nx, int ny);
  void advance_sediment_bed(int period, double dx, double dy);
  void seed_organs(SurfacePatch &);
  void advance_anchored_grass();
  void advance_drifting_grass(DriftingGrass &, std::vector<DriftingGrass> &);
  void replant_grass(DriftingGrass &);

private:
  std::vector<CurrentSource> currents_;
  double indexed_body_radius_ = MAX_BODY_RADIUS;
  std::vector<OdorSource> carrion_odor_;
  std::vector<SpermCell> sperm_field_;
  std::vector<unsigned char> water_cells_;
  std::uint64_t water_cells_time_ = ~std::uint64_t(0);
  bool water_cell_geometry(std::size_t) const;
  std::vector<unsigned> sperm_occupied_;
  bool sperm_on_path(double, double, double, double) const;
  double sperm_opaque_ = .012;
  bool has_sperm_ = false;
  SpatialGrid body_grid_;
  std::vector<VisibleBody> visible_;
  bool indexed_ = false;
  std::array<double, DIET_COUNT> niche_limits_{};
  FoodWebState food_web_;
  FoodState feeding_;
  GeometryState geometry_;
  PlantState vegetation_;
  SedimentState sediment_;
  LightState lighting_;
  Water water_;
  EnvironmentParameters env_;
  friend struct test::StateAccess;
  friend class ParameterAccess;
  friend class EnvironmentCheckpoint;
};
inline double Field::turbidity(double x, double y) const {
  if (sediment_.suspended.empty())
    return 0;
  double gx = wrap_x(x) / geometry_.width * sediment_.columns - .5,
         gy =
             std::clamp(y / geometry_.height * sediment_.rows - .5, 0., double(sediment_.rows - 1));
  int i = int(std::floor(gx)), j = int(gy), a = (i + sediment_.columns) % sediment_.columns,
      b = (a + 1) % sediment_.columns, k = std::min(sediment_.rows - 1, j + 1);
  double fx = gx - i, fy = gy - j;
  return 64 *
         ((1 - fy) * ((1 - fx) * sediment_.suspended[j * sediment_.columns + a] +
                      fx * sediment_.suspended[j * sediment_.columns + b]) +
          fy * ((1 - fx) * sediment_.suspended[k * sediment_.columns + a] +
                fx * sediment_.suspended[k * sediment_.columns + b])) /
         (geometry_.width / sediment_.columns * geometry_.height / sediment_.rows);
}
}

#include "ecology.hh"
#include "physiology.hh"
#include "plants.hh"
#include "view_cache.hh"
#include "world_view.hh"
#include <fstream>
#include <iostream>
#include <map>
#include <set>
#include <sstream>

using namespace fishsim;
namespace {
constexpr std::array<double, 3> RADII{24, 64, 128};
constexpr int SAMPLE_STEPS = 400, OBSERVATION_STEPS = 5, PICTURE_STEPS = 100,
              QUANTILE_DIVISIONS = 4;
constexpr int FORAGING_STEPS = 100;
struct LastSeen {
  unsigned generation = 0;
  int age = 0;
  double energy = 0, health = 0, intake = 0, bladder = 0;
  bool hatched = false;
  double tissue = 0, maturity = 0, egg_yolk = 0, sperm_store = 0, shell = 0;
};

double nearby_share(const PlantPart &p, const Field &f, const Body &b, double radius) {
  const double x = f.delta_x(p.x - b.x), y = p.y - b.y, a = p.hx * p.hx + p.hy * p.hy;
  radius += stroke_width(p);
  if (a <= tolerance::negligible)
    return x * x + y * y <= radius * radius ? 1 : 0;
  const double dot = x * p.hx + y * p.hy, disc = dot * dot - a * (x * x + y * y - radius * radius);
  if (disc <= 0)
    return 0;
  return std::max(0., std::min(1., (-dot + std::sqrt(disc)) / a) -
                          std::max(-1., (-dot - std::sqrt(disc)) / a)) /
         2;
}

void quantiles(std::vector<double> values) {
  std::sort(values.begin(), values.end());
  std::cout << '[';
  if (!values.empty())
    for (int i = 0; i <= QUANTILE_DIVISIONS; ++i)
      std::cout << (i ? "," : "") << values[(values.size() - 1) * i / QUANTILE_DIVISIONS];
  std::cout << ']';
}

template <class Map> void counts(const Map &values) {
  std::cout << '[';
  bool comma = false;
  for (const auto &[key, value] : values) {
    std::cout << (comma ? "," : "") << '[' << key << ',' << value << ']';
    comma = true;
  }
  std::cout << ']';
}

void foraging(std::ostream &out, const Ecosystem &w, double eaten) {
  const auto &f = w.field;
  out << "{\"t\":" << w.ticks << ",\"supplied\":" << f.feeding().food_supplied
      << ",\"decayed\":" << f.feeding().food_decayed << ",\"eaten\":" << eaten
      << ",\"foodWebEaten\":" << f.food_web().food_eaten << ",\"supply\":" << f.artificial_supply()
      << ",\"nature\":" << f.feeding().nature_average << ",\"clouds\":[";
  for (int i = 0; i < f.source_count(); ++i) {
    const auto center = f.food_cloud(i);
    double energy = 0;
    int pieces = 0;
    for (const auto &p : f.feeding().pieces)
      if (p.origin == food_kind::feed && p.cloud == i && p.energy > 0) {
        energy += p.energy;
        ++pieces;
      }
    out << (i ? ",[" : "[") << center.x << ',' << center.y << ',' << energy << ',' << pieces << ']';
  }
  out << "],\"food\":[";
  bool first = true;
  for (const auto &p : f.feeding().pieces)
    if (p.origin == food_kind::feed && p.energy > 0) {
      out << (first ? "[" : ",[") << p.render_id << ',' << p.cloud << ',' << p.x << ',' << p.y
          << ',' << p.energy << ']';
      first = false;
    }
  out << "],\"fish\":[";
  first = true;
  for (const auto &p : w.fish) {
    const auto &b = p.body;
    double raw = 0;
    for (double amount : p.observations().raw_diet)
      raw += amount;
    const double mx = b.x + mouth_offset(b) * std::cos(b.angle),
                 my = b.y + mouth_offset(b) * std::sin(b.angle);
    double nearest = std::numeric_limits<double>::infinity(), nearby = 0;
    int cloud = -1;
    for (const auto &piece : f.feeding().pieces)
      if (piece.origin == food_kind::feed && piece.energy > 0) {
        const double distance =
            std::max(0., std::hypot(f.delta_x(piece.x - mx), piece.y - my) - food_radius(piece));
        if (distance < nearest) {
          nearest = distance;
          cloud = piece.cloud;
        }
        if (distance <= RADII.back())
          nearby += piece.energy;
      }
    out << (first ? "[" : ",[") << p.id << ',' << p.g << ',' << b.hatched << ',' << b.x << ','
        << b.y << ',' << b.energy << ',' << b.gut_energy << ','
        << p.observations().raw_diet[food_kind::feed] << ',';
    if (std::isfinite(nearest))
      out << nearest;
    else
      out << "null";
    out << ',' << cloud << ',' << nearby << ',' << b.age << ',' << b.health << ',' << b.motor().vx
        << ',' << b.motor().vy << ',' << b.motor().drive_forward << ',' << b.motor().drive_left
        << ',' << b.motor().drive_right << ',' << b.rest_cost << ',' << b.ledger().movement_cost
        << ',' << b.ledger().brain_cost << ',' << p.parent << ',' << raw << ',' << b.hunger << ','
        << nutrient_signal(b) << ']';
    first = false;
  }
  out << "]}\n" << std::flush;
}

void snapshot(const Ecosystem &w, const std::string &prefix) {
  if (prefix.empty())
    return;
  std::ofstream out(prefix + "-" + std::to_string(w.ticks) + ".json");
  if (!out)
    throw std::runtime_error("Bildzustand kann nicht gespeichert werden");
  JsonViewCache cache(false);
  SessionView status;
  status.epoch = "zuchtbecken";
  status.paused = true;
  WorldViewWriter view(out, w, status, cache);
  view.write({true, true, true, true, true}, w.parameters(), {});
  cache.write_assets(out);
  out << '}';
}
void trace(std::ostream &out, const Ecosystem &w, const std::map<std::uint64_t, int> &line_of) {
  out << "{\"t\":" << w.ticks << ",\"fish\":[";
  bool first = true;
  for (const auto &p : w.fish) {
    const auto &b = p.body;
    const double mx = w.field.wrap_x(b.x + mouth_offset(b) * std::cos(b.angle)),
                 my = b.y + mouth_offset(b) * std::sin(b.angle);
    double nearest = w.field.geometry().width, raw = 0;
    for (const auto &part : w.field.vegetation().plants)
      if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) && part.energy > 0)
        nearest = std::min(nearest, std::max(0., stroke_distance(part, w.field.delta_x(part.x - mx),
                                                                 part.y - my)));
    for (double amount : p.observations().raw_diet)
      raw += amount;
    out << (first ? "[" : ",[") << p.id << ',' << p.g << ',' << b.hatched << ',' << b.x << ','
        << b.y << ',' << b.angle << ',' << body_radius(b) << ',' << mx << ',' << my << ','
        << mouth_aperture(b) << ',' << nearest << ',' << b.energy << ',' << b.health << ','
        << b.tissue << ',' << body_maturity(b) << ',' << raw << ',' << b.gut_energy << ','
        << gut_filling(b) << ',' << b.digestion << ',' << b.bite_signal << ',' << b.eat_signal
        << ',' << b.mouth.flow << ',' << b.mouth.cycle << ',' << b.mouth.phase << ','
        << b.motor().drive_forward << ',' << b.motor().drive_left << ',' << b.motor().drive_right
        << ',' << b.ledger().movement_cost << ',' << b.ledger().brain_cost << ','
        << b.reproduction().egg_yolk << ',' << b.reproduction().sperm_store << ',' << b.motor().vx
        << ',' << b.motor().vy << ',' << b.motor().thrust << ',' << b.sediment_coverage << ','
        << b.bladder_fill << ',' << b.buoyancy_force << ',' << body_mass(b) << ',' << b.undulation
        << ','
        << p.observations().raw_diet[food_kind::plant] + p.observations().raw_diet[food_kind::algae]
        << ',' << b.nutrition << ',' << b.rest_cost << ',' << b.ledger().muscle_cost << ','
        << b.motor().combat_cost;
    for (double hormone : b.hormones().levels())
      out << ',' << hormone;
    out << ',' << line_of.at(p.id);
    out << ']';
    first = false;
  }
  out << "]}\n";
}
}

int main(int argc, char **argv) {
  try {
    if (argc < 6)
      throw std::invalid_argument(
          "Aufruf: zuchtbecken GENOM[,GENOM...] SEED SCHRITTE ANZAHL aquarium|becken "
          "[Parameter=Wert ...] [snapshot=PFAD] [observe=PFAD] [foraging=DATEI] "
          "[checkpoint=DATEI] [reproduce=0|1]");
    const auto seed = std::stoull(argv[2]);
    const int steps = std::stoi(argv[3]), count = std::stoi(argv[4]);
    const std::string habitat = argv[5];
    if (steps < 1 || count < 0 || count > population_limits::max_fish ||
        (habitat != "aquarium" && habitat != "becken"))
      throw std::invalid_argument("Ungültige Laufgrenzen oder Beckenart");
    Genome::begin_run(seed);
    // Several genomes share one tank; every fish keeps the line of its mother's founder.
    std::vector<Genome> genomes;
    std::stringstream paths(argv[1]);
    for (std::string path; std::getline(paths, path, ',');)
      genomes.push_back(Genome::load(path));
    Ecosystem w(seed);
    w.safety = false;
    w.workers = 2;
    if (habitat == "becken") {
      w.resize(960, 640);
      w.field.flow = 0;
    }
    std::string pictures, observed, foraging_path, checkpoint;
    bool reproduce = true;
    for (int i = 6; i < argc; ++i) {
      const std::string option = argv[i];
      const auto split = option.find('=');
      if (split == std::string::npos)
        throw std::invalid_argument("Parameter=Wert erwartet");
      const auto key = option.substr(0, split), value = option.substr(split + 1);
      if (key == "snapshot")
        pictures = value;
      else if (key == "observe")
        observed = value;
      else if (key == "foraging")
        foraging_path = value;
      else if (key == "checkpoint")
        checkpoint = value;
      else if (key == "reproduce" && (value == "0" || value == "1"))
        reproduce = value == "1";
      else if (!w.set_parameter(key, std::stod(value)))
        throw std::invalid_argument("Unbekannter Parameter: " + key);
    }
    if (habitat == "aquarium")
      w.starter_world();
    else
      w.field.seed_plants();
    w.seed(genomes, count, habitat == "aquarium" ? run_limit::default_food : 0);
    std::map<std::uint64_t, int> line_of;
    // seed places one founder per input in each round. Related inputs can share a species.
    for (std::size_t i = 0; i < w.fish.size(); ++i)
      line_of[w.fish[i].id] = int(i % genomes.size());
    const int lines = int(genomes.size());
    std::ofstream feeding_observations;
    if (!foraging_path.empty()) {
      feeding_observations.open(foraging_path);
      if (!feeding_observations)
        throw std::runtime_error("Futtersuche kann nicht gespeichert werden");
      feeding_observations
          << "{\"every\":" << FORAGING_STEPS << ",\"nearRadius\":" << RADII.back()
          << ",\"width\":" << w.field.geometry().width
          << ",\"height\":" << w.field.geometry().height
          << ",\"cloudColumns\":[\"x\",\"y\",\"energy\",\"pieces\"],"
             "\"foodColumns\":[\"id\",\"cloud\",\"x\",\"y\",\"energy\"],"
             "\"fishColumns\":[\"id\",\"generation\",\"hatched\",\"x\",\"y\",\"energy\","
             "\"gutEnergy\",\"rawFeed\",\"nearestFeed\",\"nearestFeedCloud\",\"nearbyFeed\","
             "\"age\",\"health\",\"vx\",\"vy\",\"forward\",\"left\",\"right\",\"restCost\","
             "\"movementCost\",\"brainCost\",\"parent\",\"rawFood\",\"hunger\",\"intakeSignal\"]}"
             "\n";
    }
    std::ofstream observations;
    if (!observed.empty()) {
      observations.open(observed + "-trace.jsonl");
      if (!observations)
        throw std::runtime_error("Beobachtung kann nicht gespeichert werden");
      observations
          << "{\"every\":" << OBSERVATION_STEPS << ",\"picturesEvery\":" << PICTURE_STEPS
          << ",\"width\":" << w.field.geometry().width
          << ",\"height\":" << w.field.geometry().height
          << ",\"columns\":[\"id\",\"generation\",\"hatched\",\"x\",\"y\",\"angle\","
             "\"radius\",\"mouthX\",\"mouthY\",\"aperture\",\"nearestMouthLeaf\","
             "\"energy\",\"health\",\"tissue\",\"maturity\",\"rawFood\",\"gutEnergy\","
             "\"gutFill\",\"digestion\",\"bite\",\"suction\",\"flow\",\"mouthCycle\","
             "\"mouthPhase\",\"forward\",\"left\",\"right\",\"movementCost\",\"brainCost\","
             "\"eggYolk\",\"spermStore\",\"vx\",\"vy\",\"thrust\",\"sediment\","
             "\"bladder\",\"buoyancy\",\"mass\",\"undulation\",\"rawPlants\",\"usableFood\","
             "\"restCost\",\"muscleCost\",\"biteCost\"";
      for (int i = 0; i < field::HORMONES; ++i)
        observations << ",\"H" << i << '"';
      observations << ",\"line\"]}\n";
    }
    std::cout << "{\"event\":\"setup\",\"habitat\":\"" << habitat << "\",\"seed\":" << seed
              << ",\"requested\":" << count << ",\"seeded\":" << w.fish.size()
              << ",\"assistance\":false,\"reproduce\":" << (reproduce ? "true" : "false")
              << ",\"mutation\":" << w.evo.mutation << ",\"leafRadii\":[";
    for (std::size_t i = 0; i < RADII.size(); ++i)
      std::cout << (i ? "," : "") << RADII[i];
    std::cout << "],\"quantiles\":[";
    for (int i = 0; i <= QUANTILE_DIVISIONS; ++i)
      std::cout << (i ? "," : "") << double(i) / QUANTILE_DIVISIONS;
    std::cout << "]}\n";
    std::map<std::uint64_t, std::array<double, DIET_COUNT>> previous;
    std::map<std::uint64_t, LastSeen> last_seen;
    std::array<double, DIET_COUNT> food{};
    std::vector<std::array<double, DIET_COUNT>> line_food(genomes.size());
    std::vector<unsigned> line_peak(genomes.size());
    std::set<std::uint64_t> hatched, deaths;
    std::map<unsigned, int> births;
    std::map<unsigned, std::set<std::uint64_t>> parents;
    unsigned peak = 0;
    for (int tick = 0; tick <= steps; ++tick) {
      for (const auto &p : w.fish)
        if (!line_of.count(p.id)) {
          const auto mother = line_of.find(p.parent);
          line_of[p.id] = mother == line_of.end() ? -1 : mother->second;
        }
      for (const auto &p : w.fish) {
        const auto &b = p.body;
        last_seen[p.id] = {p.g,
                           b.age,
                           b.energy,
                           b.health,
                           b.nutrition,
                           b.bladder_fill,
                           b.hatched,
                           b.tissue,
                           body_maturity(b),
                           b.reproduction().egg_yolk,
                           b.reproduction().sperm_store,
                           b.embryo.shell};
        for (std::size_t k = 0; k < DIET_COUNT; ++k) {
          const double raw = p.observations().raw_diet[k],
                       eaten = std::max(0., raw - previous[p.id][k]);
          food[k] += eaten;
          if (line_of[p.id] >= 0)
            line_food[line_of[p.id]][k] += eaten;
          previous[p.id][k] = raw;
        }
        if (b.hatched && p.origin == fish_origin::natural && hatched.insert(p.id).second) {
          ++births[p.g];
          parents[p.maternal_g].insert(p.parent);
          peak = std::max(peak, p.g);
          if (line_of[p.id] >= 0)
            line_peak[line_of[p.id]] = std::max(line_peak[line_of[p.id]], p.g);
          double nearby = 0;
          for (const auto &part : w.field.vegetation().plants)
            if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind))
              nearby += part.energy * nearby_share(part, w.field, b, RADII[1]);
          std::cout << "{\"event\":\"hatch\",\"t\":" << tick << ",\"line\":" << line_of[p.id]
                    << ",\"id\":" << p.id << ",\"parent\":" << p.parent << ",\"generation\":" << p.g
                    << ",\"energy\":" << b.energy << ",\"nearbyLeaf64\":" << nearby << "}\n";
        }
      }
      for (const auto &death : w.recent_mortality) {
        const auto id = death[death_record_column::id];
        if (!deaths.insert(id).second)
          continue;
        const auto found = last_seen.find(id);
        const auto line = line_of.find(id);
        std::cout << "{\"event\":\"death\",\"t\":" << death[death_record_column::step]
                  << ",\"id\":" << id << ",\"line\":" << (line == line_of.end() ? -1 : line->second)
                  << ",\"cause\":" << death[death_record_column::cause];
        if (found != last_seen.end()) {
          const auto &v = found->second;
          std::cout << ",\"generation\":" << v.generation << ",\"previous\":{\"age\":" << v.age
                    << ",\"energy\":" << v.energy << ",\"health\":" << v.health
                    << ",\"intake\":" << v.intake << ",\"bladder\":" << v.bladder
                    << ",\"hatched\":" << (v.hatched ? "true" : "false")
                    << ",\"tissue\":" << v.tissue << ",\"maturity\":" << v.maturity
                    << ",\"eggYolk\":" << v.egg_yolk << ",\"spermStore\":" << v.sperm_store
                    << ",\"shell\":" << v.shell << '}';
          last_seen.erase(found);
        }
        previous.erase(id);
        std::cout << "}\n";
      }
      const bool last = tick == steps || (count > 0 && w.fish.empty());
      if (feeding_observations.is_open() && (tick % FORAGING_STEPS == 0 || last))
        foraging(feeding_observations, w, food[food_kind::feed]);
      if (observations.is_open()) {
        if (tick % OBSERVATION_STEPS == 0 || last)
          trace(observations, w, line_of);
        if (tick % PICTURE_STEPS == 0 || last)
          snapshot(w, observed);
      }
      if (tick % SAMPLE_STEPS == 0 || last) {
        std::map<unsigned, int> alive, breeders;
        std::array<std::vector<double>, RADII.size()> nearby;
        std::vector<double> nearest, mouth_nearest, reserves, swimmer_reserves, tissue, maturity,
            egg_yolk, sperm_store;
        for (const auto &p : w.fish) {
          if (p.body.hatched) {
            ++alive[p.g];
            swimmer_reserves.push_back(p.body.energy);
          }
          reserves.push_back(p.body.energy);
          tissue.push_back(p.body.tissue);
          maturity.push_back(body_maturity(p.body));
          egg_yolk.push_back(p.body.reproduction().egg_yolk);
          sperm_store.push_back(p.body.reproduction().sperm_store);
          std::array<double, RADII.size()> energy{};
          double distance = std::numeric_limits<double>::infinity(), mouth_distance = distance;
          const double mouth_x = p.body.x + mouth_offset(p.body) * std::cos(p.body.angle),
                       mouth_y = p.body.y + mouth_offset(p.body) * std::sin(p.body.angle);
          for (const auto &part : w.field.vegetation().plants)
            if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind) &&
                part.energy > 0) {
              distance =
                  std::min(distance, stroke_distance(part, w.field.delta_x(part.x - p.body.x),
                                                     part.y - p.body.y));
              mouth_distance =
                  std::min(mouth_distance, stroke_distance(part, w.field.delta_x(part.x - mouth_x),
                                                           part.y - mouth_y));
              for (std::size_t k = 0; k < RADII.size(); ++k)
                energy[k] += part.energy * nearby_share(part, w.field, p.body, RADII[k]);
            }
          nearest.push_back(std::isfinite(distance) ? std::max(0., distance)
                                                    : w.field.geometry().width);
          mouth_nearest.push_back(std::isfinite(mouth_distance) ? std::max(0., mouth_distance)
                                                                : w.field.geometry().width);
          for (std::size_t k = 0; k < RADII.size(); ++k)
            nearby[k].push_back(energy[k]);
        }
        double anchored = 0, drifting = 0, blue = 0, total = 0, available_feed = 0;
        for (const auto &piece : w.field.feeding().pieces)
          if (piece.origin == food_kind::feed && piece.energy > 0)
            available_feed += piece.energy;
        for (const auto &part : w.field.vegetation().plants)
          if (part.kind == food_kind::plant && !plant_bite_is_hard(part.organ_kind)) {
            (part.patch < w.field.vegetation().surfaces.size() ? anchored : drifting) +=
                part.energy;
            const auto color = plant_organ_color(w.field.plant_source(part.patch), part.organ);
            if (color[rgb::blue] > color[rgb::green])
              blue += part.energy;
          }
        for (double raw : food)
          total += raw;
        for (const auto &[generation, ids] : parents)
          breeders[generation] = int(ids.size());
        std::cout << "{\"event\":\"sample\",\"t\":" << tick << ",\"n\":" << w.fish.size()
                  << ",\"peakGeneration\":" << peak << ",\"swimmers\":";
        counts(alive);
        std::cout << ",\"hatches\":";
        counts(births);
        std::cout << ",\"parents\":";
        counts(breeders);
        std::cout << ",\"reserve\":";
        quantiles(reserves);
        std::cout << ",\"swimmerReserve\":";
        quantiles(swimmer_reserves);
        std::cout << ",\"availableFeed\":" << available_feed;
        std::cout << ",\"tissue\":";
        quantiles(tissue);
        std::cout << ",\"maturity\":";
        quantiles(maturity);
        std::cout << ",\"eggYolk\":";
        quantiles(egg_yolk);
        std::cout << ",\"spermStore\":";
        quantiles(sperm_store);
        std::cout << ",\"nearestLeaf\":";
        quantiles(nearest);
        std::cout << ",\"nearestMouthLeaf\":";
        quantiles(mouth_nearest);
        std::cout << ",\"nearbyLeafEstimate\":[";
        for (std::size_t k = 0; k < RADII.size(); ++k) {
          std::cout << (k ? "," : "");
          quantiles(nearby[k]);
        }
        std::cout << "],\"anchoredLeaf\":" << anchored << ",\"driftingLeaf\":" << drifting
                  << ",\"blueLeaf\":" << blue << ",\"rawFood\":" << total << ",\"plantShare\":"
                  << (total > 0 ? (food[food_kind::plant] + food[food_kind::algae]) / total : 0)
                  << ",\"diet\":[";
        for (std::size_t k = 0; k < DIET_COUNT; ++k)
          std::cout << (k ? "," : "") << food[k];
        std::vector<int> line_alive(genomes.size());
        for (const auto &p : w.fish)
          if (p.body.hatched && line_of[p.id] >= 0)
            ++line_alive[line_of[p.id]];
        std::cout << "],\"lines\":[";
        for (int line = 0; line < lines; ++line) {
          std::cout << (line ? "," : "") << "{\"n\":" << line_alive[line]
                    << ",\"peakGeneration\":" << line_peak[line] << ",\"diet\":[";
          for (std::size_t k = 0; k < DIET_COUNT; ++k)
            std::cout << (k ? "," : "") << line_food[line][k];
          std::cout << "]}";
        }
        std::cout << "]}\n" << std::flush;
        if (tick == 0 || last || tick % (5 * SAMPLE_STEPS) == 0)
          snapshot(w, pictures);
      }
      if (last) {
        if (!checkpoint.empty()) {
          std::ofstream out(checkpoint);
          if (!out)
            throw std::runtime_error("Versuchszustand kann nicht gespeichert werden");
          w.write(out);
          if (!out)
            throw std::runtime_error("Versuchszustand konnte nicht gespeichert werden");
        }
        break;
      }
      w.tick(reproduce);
    }
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}

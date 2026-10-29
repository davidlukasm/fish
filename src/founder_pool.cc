#include "protocol_schema.hh"
#include "founder_pool.hh"
#include "ecology_internal.hh"
#include "parallel.hh"
#include <fstream>
#include <iomanip>
#include <set>
#include <mutex>
#include <stdexcept>
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
namespace fishsim {
namespace {
namespace profile {
constexpr int octants = 8, senses = 3 * octants, motors = senses + field::SENSE_COUNT,
              markers = motors + field::MOTOR_COUNT, variation = markers + 4,
              crossed = variation + 4, density = crossed + field::CONNECTION_KINDS,
              regions = density + field::CONNECTION_KINDS, body = regions + 1;
constexpr int presence = body + 4, strength = presence + field::SENSE_COUNT + field::MOTOR_COUNT,
              hormones = strength + field::SENSE_COUNT + field::MOTOR_COUNT,
              plasticity = hormones + field::HORMONE_EFFECTS * (field::HORMONES + 3);
static_assert(plasticity + 1 == FOUNDER_PROFILE_SIZE);
}
struct FileLock {
  int fd = -1;
  FileLock(const std::filesystem::path &directory, const char *name, bool shared = false,
           bool immediate = false) {
    std::filesystem::create_directories(directory);
    fd = ::open((directory / name).c_str(), O_CREAT | O_RDWR, 0600);
    if (fd < 0 || flock(fd, (shared ? LOCK_SH : LOCK_EX) | (immediate ? LOCK_NB : 0)) != 0) {
      if (fd >= 0)
        ::close(fd);
      throw std::runtime_error("Founder-Pool ist gerade in Benutzung");
    }
  }
  ~FileLock() {
    if (fd >= 0) {
      flock(fd, LOCK_UN);
      ::close(fd);
    }
  }
  FileLock(const FileLock &) = delete;
  FileLock &operator=(const FileLock &) = delete;
};
void develop(Genome &genome, std::atomic<bool> &stop) {
  develop_hatch_candidate(genome, stop);
}
std::string founder_design(const Genome &genome) {
  std::ostringstream out;
  out << genome.development_seed << '\n';
  genome.cppn->write(out, false);
  return out.str();
}
void atomic_text(const std::filesystem::path &path, const std::string &text) {
  auto temp = path;
  temp += ".tmp";
  std::ofstream out(temp);
  if (!(out << text))
    throw std::runtime_error("Founder-Pool konnte nicht gespeichert werden");
  out.close();
  if (!out)
    throw std::runtime_error("Founder-Pool: Schreibfehler");
  std::filesystem::rename(temp, path);
}
}
bool same_founder_design(const Genome &a, const Genome &b) {
  return founder_design(a) == founder_design(b);
}
int starting_founder_count(int population) {
  return std::clamp((population + 10) / 20, 1, 100);
}
int anatomy_class(const Genome &genome) {
  if (!genome.interface || !genome.blueprint)
    return -1;
  const auto &body = *genome.interface;
  auto sense = int(std::max_element(body.sense_counts.begin(), body.sense_counts.end()) -
                   body.sense_counts.begin());
  int bilateral = body.anatomy[anatomy_column::turn_strength_left] >= .1 &&
                  body.anatomy[anatomy_column::turn_strength_right] >= .1,
      size = genome.blueprint->neurons.size() < 150    ? 0
             : genome.blueprint->neurons.size() <= 300 ? 1
                                                       : 2;
  return (sense * 2 + bilateral) * 3 + size;
}
void PoolFounder::describe() {
  if (!genome.blueprint || !genome.interface)
    throw std::logic_error("Founder-Profil braucht den entwickelten Körper");
  structure.fill(0);
  const auto &tissue = *genome.blueprint;
  std::set<std::uint32_t> seen;
  std::array<double, 4> marker_square{};
  double sensory = 0, motor = 0;
  for (const auto &n : tissue.neurons) {
    if (!seen.insert(n.group).second)
      continue;
    const int octant = (n.x >= 0) + 2 * (n.y >= 0) + 4 * (n.z >= 0);
    ++structure[profile::octants * int(n.role) + octant];
    for (int k = 0; k < field::SENSE_COUNT; ++k) {
      structure[profile::senses + k] += n.functions.senses[k];
      sensory += n.functions.senses[k];
    }
    for (int k = 0; k < field::MOTOR_COUNT; ++k) {
      structure[profile::motors + k] += n.functions.motors[k];
      motor += n.functions.motors[k];
    }
    for (int k = 0; k < 4; ++k) {
      const double v = k < 2 ? n.sender[k] : n.receiver[k - 2];
      structure[profile::markers + k] += v;
      marker_square[k] += v * v;
    }
  }
  const double groups = std::max(std::size_t(1), seen.size());
  for (int k = 0; k < profile::senses; ++k)
    structure[k] /= groups;
  for (int k = profile::senses; k < profile::motors; ++k)
    structure[k] /= std::max(1., sensory);
  for (int k = profile::motors; k < profile::markers; ++k)
    structure[k] /= std::max(1., motor);
  for (int k = 0; k < 4; ++k) {
    const double mean = structure[profile::markers + k] / groups;
    structure[profile::variation + k] =
        std::sqrt(std::max(0., marker_square[k] / groups - mean * mean));
    structure[profile::markers + k] = (mean + 1) * .5;
  }
  std::array<double, 3> links{}, crossed{};
  for (const auto &edge : tissue.edges) {
    const auto &a = tissue.neurons[edge.source], &b = tissue.neurons[edge.target];
    const int kind = field::connection_kind(a, b);
    if (kind >= 0) {
      ++links[kind];
      crossed[kind] += a.x * b.x < 0;
    }
  }
  for (int k = 0; k < 3; ++k) {
    structure[profile::crossed + k] = crossed[k] / std::max(1., links[k]);
    structure[profile::density + k] = links[k] / (links[k] + tissue.neurons.size() + 1);
  }
  structure[profile::regions] = double(tissue.regions) / (tissue.regions + 8.);
  structure[profile::body] = genome.interface->jaw_length;
  structure[profile::body + 1] = genome.interface->gut_length;
  structure[profile::body + 2] = genome.interface->blunt_teeth;
  structure[profile::body + 3] = genome.interface->undulation;
  const auto &layout = *genome.interface;
  for (int k = 0; k < field::SENSE_COUNT + field::MOTOR_COUNT; ++k) {
    static constexpr int ports[] = {1, 2, 6, 4, 5, 10, 11, 7, 12, 13};
    const double amount = k < field::SENSE_COUNT ? layout.sense_counts[k]
                                                 : layout.capacities[ports[k - field::SENSE_COUNT]];
    structure[profile::presence + k] = amount > 0;
    structure[profile::strength + k] = amount / (1 + amount);
  }
  for (const auto &n : tissue.neurons) {
    structure[profile::plasticity] += n.parameters.plasticity;
    for (int effect = 0; effect < field::HORMONE_EFFECTS; ++effect) {
      const auto &r = n.hormone_receptors[effect];
      const int at = profile::hormones + effect * (field::HORMONES + 3);
      for (int h = 0; h < field::HORMONES; ++h)
        structure[at + h] += r.affinity[h];
      structure[at + field::HORMONES] += .5 * (1 + r.baseline);
      structure[at + field::HORMONES + 1] += .5 * (1 + r.sensitivity);
      structure[at + field::HORMONES + 2] += r.half / field::HORMONE_HALF_MAX;
    }
  }
  for (std::size_t k = profile::hormones; k < structure.size(); ++k)
    structure[k] /= std::max(std::size_t(1), tissue.neurons.size());
  for (double &v : structure)
    v = std::clamp(v, 0., 1.);
  const bool both = genome.interface->sense_counts[0] > 0 && genome.interface->sense_counts[1] > 0;
  selection_group = both && foraging.score >= .2 ? 3 : (senses & 1) ? 0 : (senses & 2) ? 1 : 2;
  category = anatomy_class(genome);
}
void FounderPool::load(bool develop_plans) {
  FileLock guard(directory, "pool.lock", true);
  entries.clear();
  std::ifstream in(directory / "index.pool");
  if (!in)
    return;
  std::string tag;
  std::size_t count;
  if (!(in >> tag >> revision >> count) || tag != "FISH_FOUNDER_POOL_018B" || count > 100000)
    throw std::runtime_error("Ungültiger Founder-Pool");
  std::set<std::string> designs;
  for (std::size_t i = 0; i < count; ++i) {
    PoolFounder e;
    if (!(in >> e.category >> std::quoted(e.origin) >> std::quoted(e.file) >> e.senses >>
          e.selection_group >> e.reproduction.funded >> e.reproduction.hatched >>
          e.reproduction.feeding >> e.reproduction.parents_feeding >> e.reproduction.steps >>
          e.reproduction.seed >> e.foraging.score >> e.foraging.speed >> e.foraging.turn >>
          e.foraging.eaten >> e.foraging.samples >> e.sense_foraging[0] >> e.sense_foraging[1]) ||
        !std::isfinite(e.foraging.score) || e.foraging.score < 0 || e.foraging.score > 1 ||
        !std::isfinite(e.foraging.speed) || e.foraging.speed < 0 ||
        !std::isfinite(e.foraging.turn) || e.foraging.turn < 0 || e.foraging.eaten < 0 ||
        e.foraging.eaten > 6 || e.foraging.samples < 0 || e.foraging.samples > 1800 ||
        std::any_of(e.sense_foraging.begin(), e.sense_foraging.end(),
                    [](double v) { return !std::isfinite(v) || (v < 0 && v != -1) || v > 1; }) ||
        e.reproduction.parents_feeding > 6 || e.reproduction.steps < 0 ||
        e.reproduction.steps > 4000 || e.reproduction.feeding > e.reproduction.hatched ||
        e.reproduction.hatched > e.reproduction.funded || e.senses < 0 || e.senses > 3 ||
        e.selection_group < 0 || e.selection_group > 3 || e.category < 0 ||
        e.category >= field::SENSE_COUNT * 6 || e.file.find('/') != std::string::npos ||
        e.file.find("..") != std::string::npos)
      throw std::runtime_error("Ungültiger Founder-Eintrag");
    if (!(in >> e.reproduction.digested >> e.reproduction.exposure) ||
        !std::isfinite(e.reproduction.digested) || e.reproduction.digested < 0)
      throw std::runtime_error("Ungültige Founder-Ernährungsprüfung");
    for (auto *values : {&e.reproduction.diet, &e.reproduction.raw_diet})
      for (auto &v : *values)
        if (!(in >> v) || !std::isfinite(v) || v < 0)
          throw std::runtime_error("Ungültige Founder-Ernährung");
    for (std::size_t k = 0; k < DIET_COUNT; ++k)
      if (e.reproduction.diet[k] > e.reproduction.raw_diet[k] + 1e-6)
        throw std::runtime_error("Founder-Aufnahme übersteigt Rohenergie");
    for (double &v : e.structure)
      if (!(in >> v) || !std::isfinite(v) || v < 0 || v > 1)
        throw std::runtime_error("Ungültiges Founder-Körperprofil");
    if (!(in >> e.measured >> e.hatching.attempted >> e.hatching.hatched >> e.hatching.steps >>
          e.hatching.built >> e.hatching.secreted >> e.hatching.contracted >> e.hatching.dead >>
          e.hatching.min_energy >> e.hatching.min_health) ||
        e.hatching.attempted < 0 || e.hatching.attempted > 3 || e.hatching.hatched < 0 ||
        e.hatching.hatched > e.hatching.attempted || e.hatching.steps < 0 ||
        e.hatching.steps > 1000)
      throw std::runtime_error("missing founder measurement status");
    for (int count :
         {e.hatching.built, e.hatching.secreted, e.hatching.contracted, e.hatching.dead})
      if (count < 0 || count > e.hatching.attempted)
        throw std::runtime_error("invalid hatch stages");
    if (!std::isfinite(e.hatching.min_energy) || e.hatching.min_energy < 0 ||
        !std::isfinite(e.hatching.min_health) || e.hatching.min_health < 0 ||
        e.hatching.min_health > 1 || e.hatching.dead + e.hatching.hatched > e.hatching.attempted)
      throw std::runtime_error("invalid hatch condition");
    if (e.measured && (!e.hatching.passed() || !e.reproduction.passed()))
      throw std::runtime_error("Founder ohne vollständige Lebenszyklusprüfung");
    if (!e.measured) {
      e.reproduction = {};
      e.foraging = {};
      e.sense_foraging = {-1, -1};
      e.senses = 0;
      e.selection_group = 2;
    }
    std::ifstream genes(directory / e.file);
    if (!genes)
      throw std::runtime_error("Founder-Genom fehlt");
    e.genome = Genome::read(genes, develop_plans);
    if (develop_plans && !viable_entrant(e.genome))
      continue;
    if (develop_plans)
      e.describe();
    e.design = founder_design(e.genome);
    if (!designs.insert(e.design).second)
      throw std::runtime_error("Doppelter Founder");
    entries.push_back(std::move(e));
  }
}
bool FounderPool::offer(PoolFounder entry) {
  if (!hatch_candidate(entry.genome) || !entry.hatching.passed() || !entry.reproduction.passed())
    return false;
  entry.measured = true;
  entry.describe();
  entry.design = founder_design(entry.genome);
  for (auto &existing : entries) {
    if (existing.design.empty())
      existing.design = founder_design(existing.genome);
    if (existing.design == entry.design)
      return false;
  }
  entry.file =
      "class-" + std::to_string(entry.category) + "-" + std::to_string(++revision) + ".genome";
  entries.push_back(std::move(entry));
  std::sort(entries.begin(), entries.end(),
            [](const auto &a, const auto &b) { return a.category < b.category; });
  return true;
}
void FounderPool::save() {
  FileLock guard(directory, "pool.lock");
  std::filesystem::create_directories(directory);
  std::ostringstream index;
  index << std::setprecision(17) << "FISH_FOUNDER_POOL_018B " << revision << ' ' << entries.size()
        << '\n';
  for (auto &e : entries) {
    if (!std::filesystem::exists(directory / e.file))
      e.genome.save((directory / e.file).string());
    index << e.category << ' ' << std::quoted(e.origin) << ' ' << std::quoted(e.file) << ' '
          << e.senses << ' ' << e.selection_group << ' ' << e.reproduction.funded << ' '
          << e.reproduction.hatched << ' ' << e.reproduction.feeding << ' '
          << e.reproduction.parents_feeding << ' ' << e.reproduction.steps << ' '
          << e.reproduction.seed << ' ' << e.foraging.score << ' ' << e.foraging.speed << ' '
          << e.foraging.turn << ' ' << e.foraging.eaten << ' ' << e.foraging.samples << ' '
          << e.sense_foraging[0] << ' ' << e.sense_foraging[1] << ' ' << e.reproduction.digested
          << ' ' << e.reproduction.exposure;
    for (const auto *values : {&e.reproduction.diet, &e.reproduction.raw_diet})
      for (double v : *values)
        index << ' ' << v;
    for (double v : e.structure)
      index << ' ' << v;
    index << ' ' << e.measured << ' ' << e.hatching.attempted << ' ' << e.hatching.hatched << ' '
          << e.hatching.steps << ' ' << e.hatching.built << ' ' << e.hatching.secreted << ' '
          << e.hatching.contracted << ' ' << e.hatching.dead << ' ' << e.hatching.min_energy << ' '
          << e.hatching.min_health << '\n';
  }
  atomic_text(directory / "index.pool", index.str());
  std::set<std::string> keep;
  for (const auto &p : entries)
    keep.insert(p.file);
  for (const auto &path : std::filesystem::directory_iterator(directory)) {
    auto file = path.path().filename().string();
    if (file.rfind("class-", 0) == 0 && path.path().extension() == ".genome" && !keep.count(file))
      std::filesystem::remove(path.path());
  }
  if (search_initialized) {
    std::ostringstream state;
    state << "FISH_FOUNDER_SEARCH " << processed << ' ' << round << ' ' << anatomy_passed << ' '
          << hatching_passed << '\n'
          << random.engine << '\n';
    atomic_text(directory / "search.state", state.str());
  }
}
std::vector<Genome> FounderPool::select(Rng &random, int count) const {
  std::vector<std::size_t> available, selected;
  for (std::size_t i = 0; i < entries.size(); ++i)
    if (entries[i].measured && entries[i].hatching.passed() && entries[i].reproduction.passed())
      available.push_back(i);
  std::vector<Genome> result;
  while (!available.empty() && int(result.size()) < count) {
    std::size_t best = random.index(available.size());
    if (selected.empty()) {
      double coverage = -1;
      for (std::size_t offset = 0, first = best; offset < available.size(); ++offset) {
        const auto j = (first + offset) % available.size();
        double organs = 0;
        for (int k = profile::presence; k < profile::strength; ++k)
          organs += entries[available[j]].structure[k];
        if (organs > coverage) {
          coverage = organs;
          best = j;
        }
      }
    }
    double best_distance = -1;
    for (std::size_t j = 0; j < available.size() && !selected.empty(); ++j) {
      double nearest = 1e30;
      for (auto old : selected) {
        double distance = 0;
        const auto &a = entries[available[j]], &b = entries[old];
        for (std::size_t k = 0; k < a.structure.size(); ++k) {
          const double d = a.structure[k] - b.structure[k];
          distance += d * d / a.structure.size();
        }
        // Diet is measured only in the common lifecycle assay, never inferred from anatomy.
        double total_a = 0, total_b = 0;
        for (std::size_t k = 0; k < DIET_COUNT; ++k) {
          total_a += a.reproduction.diet[k];
          total_b += b.reproduction.diet[k];
        }
        for (std::size_t k = 0; k < DIET_COUNT; ++k) {
          const double d = a.reproduction.diet[k] / std::max(1., total_a) -
                           b.reproduction.diet[k] / std::max(1., total_b);
          distance += d * d / DIET_COUNT;
        }
        nearest = std::min(nearest, distance);
      }
      if (nearest > best_distance) {
        best_distance = nearest;
        best = j;
      }
    }
    selected.push_back(available[best]);
    result.push_back(entries[available[best]].genome);
    available.erase(available.begin() + best);
  }
  return result;
}
void FounderPool::restore_search() {
  if (search_initialized)
    return;
  std::ifstream in(directory / "search.state");
  if (in) {
    std::string tag;
    if (!(in >> tag >> processed >> round >> anatomy_passed >> hatching_passed >> random.engine) ||
        tag != "FISH_FOUNDER_SEARCH" || processed < 0 || processed > 2000 ||
        anatomy_passed > total_searched() || hatching_passed > anatomy_passed)
      throw std::runtime_error("Ungültiger Suchstand");
  }
  search_initialized = true;
}
void FounderPool::search(int workers, std::atomic<bool> &stop,
                         const std::function<void(int, int)> &progress, int target,
                         int candidate_budget) {
  FileLock exclusive_search(directory, "search.lock", false, true);
  restore_search();
  if (processed >= 2000) {
    processed = 0;
    ++round;
  }
  const int end = processed + std::clamp(candidate_budget, 0, 2000 - processed);
  std::unique_ptr<Workers> threads;
  if (workers > 1)
    threads = std::make_unique<Workers>(std::clamp(workers, 1, 64));
  std::mutex commit;
  std::atomic<int> found{int(std::count_if(entries.begin(), entries.end(), [](const auto &e) {
    return e.measured && e.hatching.passed() && e.reproduction.passed();
  }))};
  if (progress)
    progress(processed, found);
  const int count = end - processed;
  auto evaluate = [&](std::size_t) {
    PoolFounder e;
    std::uint64_t seed;
    {
      std::lock_guard<std::mutex> guard(commit);
      if (stop || (target && found >= target))
        return;
      e.genome = Genome::pool_randomized(random);
      seed = random.engine();
      e.origin = "Zufalls-CPPN " + std::to_string(seed);
    }
    bool viable = false, reproduced = false, measured = false;
    try {
      develop(e.genome, stop);
      viable = !stop && hatch_candidate(e.genome);
      if (viable) {
        e.hatching = founder_hatching(e.genome, stop, sensory_parameters, seed);
        if (e.hatching.passed() && !stop)
          e.reproduction = founder_reproduction(e.genome, stop, sensory_parameters, seed);
        reproduced = e.hatching.passed() && e.reproduction.passed();
        measured = !stop && reproduced;
      }
    } catch (const std::length_error &) {
      // A technical development limit rejects this candidate, not the completed batch.
    }
    if (stop && !measured)
      return;
    std::lock_guard<std::mutex> guard(commit);
    ++processed;
    anatomy_passed += viable;
    hatching_passed += e.hatching.passed();
    const bool admitted = measured && offer(std::move(e));
    found += admitted;
    // Publish completed founders immediately; a later interruption cannot discard them.
    if (admitted)
      save();
    if (progress)
      progress(processed, found);
  };
  if (threads)
    threads->run(count, evaluate);
  else
    for (int i = 0; i < count && !stop; ++i)
      evaluate(i);
  save();
}
}

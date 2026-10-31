#include "durable_file.hh"
#include "checkpoint.hh"
#include "json_numbers.hh"
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <map>
#include <sstream>

namespace fishsim {
Checkpoint capture_checkpoint(const Ecosystem &source, const Genome &founder,
                              std::uint64_t selected, bool evolving, bool protect, int completed,
                              std::uint64_t last, std::uint64_t seen) {
  Checkpoint result{source, founder, selected, last, seen, evolving, protect, completed};
  std::map<const evolution::History *, std::shared_ptr<evolution::History>> histories;
  std::map<const evolution::Genome *, std::shared_ptr<evolution::Genome>> genes;
  std::map<const field::Substrate *, std::shared_ptr<field::Substrate>> growing;
  auto freeze = [&](Genome &g) {
    if (!g.cppn)
      return;
    auto &copy = genes[g.cppn.get()];
    if (!copy)
      copy = g.cppn->snapshot(histories);
    g.cppn = copy;
    // Serialization reads only the captured plan counters, never resumes construction.
    if (g.growing) {
      auto &plan = growing[g.growing.get()];
      if (!plan)
        plan = std::make_shared<field::Substrate>(*g.growing);
      g.growing = plan;
    }
  };
  auto &w = result.world;
  freeze(result.founder);
  freeze(w.support_.founder);
  for (auto &p : w.fish)
    freeze(p.genome);
  for (auto &p : w.remembered_dead)
    freeze(p.genome);
  for (auto &g : w.support_.reserve)
    freeze(g);
  for (auto &g : w.support_.pool_founders)
    freeze(g);
  for (auto &s : w.sperm)
    freeze(s.genome);
  for (auto &a : w.support_.archive)
    freeze(a.genome);
  for (auto &b : w.support_.breeders)
    freeze(b.genome);
  for (auto &s : w.taxonomy_.species)
    freeze(s.representative);
  return result;
}
std::string serialize_checkpoint(const Checkpoint &s) {
  std::ostringstream out;
  out.imbue(std::locale(std::locale::classic(), new JsonNumbers));
  out << std::setprecision(17) << "FISH_TANK_SESSION " << s.selected << ' ' << s.evolving << ' '
      << s.protected_life << ' ' << s.completed << ' ' << s.last_observation << ' ' << s.seen
      << '\n';
  s.founder.write(out);
  s.world.write(out);
  return out.str();
}
Checkpoint read_checkpoint(std::istream &in, int workers) {
  Checkpoint state{Ecosystem(0), {}, 0, 0, 0, true, false, 0};
  std::string magic;
  if (!(in >> magic >> state.selected >> state.evolving >> state.protected_life >>
        state.completed >> state.last_observation >> state.seen) ||
      magic != "FISH_TANK_SESSION")
    throw std::runtime_error("Ungültiger Aquariumstand.");
  state.founder = Genome::read(in, false);
  state.world.read(in);
  state.world.workers = workers;
  std::vector<Genome> roots = state.world.support().reserve;
  for (const auto &p : state.world.fish)
    roots.push_back(p.genome);
  roots.push_back(state.founder);
  Genome::unite(roots, &state.founder);
  state.world.use_founder(state.founder);
  std::string extra;
  if (in >> extra)
    throw std::runtime_error("Zusatzdaten im Aquariumstand");
  return state;
}
bool CheckpointWriter::busy() {
  return pending.valid() && pending.wait_for(std::chrono::seconds(0)) != std::future_status::ready;
}
void CheckpointWriter::finish() {
  if (pending.valid())
    pending.get();
}
void CheckpointWriter::save(std::string path, Checkpoint state) {
  finish();
  pending = std::async(std::launch::async, [path = std::move(path), state = std::move(state)]() {
    const auto bytes = serialize_checkpoint(state);
    std::filesystem::create_directories(std::filesystem::path(path).parent_path());
    if (std::filesystem::is_regular_file(path) &&
        std::filesystem::file_size(path) == bytes.size()) {
      std::ifstream existing(path, std::ios::binary);
      const std::string previous_bytes((std::istreambuf_iterator<char>(existing)), {});
      if (!existing.bad() && previous_bytes == bytes)
        return;
    }
    const auto temporary = path + ".tmp";
    std::ofstream out(temporary, std::ios::binary);
    out.write(bytes.data(), bytes.size());
    out.close();
    if (!out)
      throw std::runtime_error("Speichern fehlgeschlagen");
    if (std::filesystem::exists(path)) {
      auto previous = std::filesystem::path(path).filename() == "latest.state"
                          ? std::filesystem::path(path).parent_path() / "previous.state"
                          : std::filesystem::path(path + ".previous");
      auto staged = previous.string() + ".tmp";
      std::filesystem::copy_file(path, staged, std::filesystem::copy_options::overwrite_existing);
      commit_file(staged, previous);
    }
    commit_file(temporary, path);
  });
}
}

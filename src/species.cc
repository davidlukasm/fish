#include "stable_hash.hh"
#include "receptor_tuning.hh"
#include "protocol_schema.hh"
#include "ecology.hh"
#include "observations.hh"
#include "physiology.hh"
#include <limits>
#include <set>
#include <map>
#include <functional>
namespace fishsim {
namespace {
constexpr std::uint64_t ATTEMPT_SALT = 0xd6e8feb86659fd93ull;
// Naming has its own stable hash; it never advances the simulation's RNG.
std::uint64_t name_hash(const std::string &text) {
  std::uint64_t h = FNV_OFFSET;
  for (unsigned char c : text)
    h = fnv_add(h, std::uint64_t(c));
  return h;
}
std::uint64_t name_draw(std::uint64_t &state) {
  return splitmix_finish(state += SPLITMIX_GAMMA);
}
std::string species_name(std::uint64_t id, const std::string &lineage, unsigned attempt = 0) {
  std::uint64_t state =
      name_hash(lineage) ^ id * SPLITMIX_GAMMA ^ std::uint64_t(attempt) * ATTEMPT_SALT;
  static const char *roots[] = {
      "aph",    "ar",    "bel",    "cren",   "dap",    "drac",  "edr",   "glan",  "istr",
      "kelm",   "leuc",  "mel",    "nect",   "niph",   "odr",   "phox",  "rhex",  "scaph",
      "sil",    "thal",  "vesp",   "xiph",   "bryn",   "delph", "ephyr", "gob",   "hyph",
      "lyr",    "myr",   "narc",   "petr",   "rhabd",  "scler", "trich", "umbr",  "zanc",
      "phyll",  "chort", "carcin", "pel",    "nephel", "osm",   "rheo",  "psamm", "phyc",
      "coscin", "oryct", "plect",  "ostrac", "harp",   "thigm", "lophr"};
  static const char *soft[] = {"alor",   "arven", "calad",  "ceren", "elath", "erem",
                               "halin",  "laren", "maral",  "nerin", "orim",  "pelor",
                               "salin",  "selar", "talar",  "velin", "amath", "limnor",
                               "nephor", "orean", "thalor", "zephyr"};
  static const char *short_end[] = {"a", "is", "us", "on", "ax", "ops", "yx", "o"};
  static const char *long_end[] = {"don",    "pterus", "lepis",  "rhynchus", "gnathus",
                                   "soma",   "stoma",  "phorus", "ichthys",  "nectes",
                                   "dromus", "phagus", "chilus", "cercus"};
  static const char *endings[] = {"ella",  "ium",  "opsis", "ina",  "ides",
                                  "iscus", "etta", "inus",  "onia", "aris"};
  static const char *prefixes[] = {"para", "neo", "hemi", "eu",   "amphi",
                                   "xeno", "ana", "epi",  "allo", "peri"};
  auto pick = [&](const auto &words) {
    return std::string(words[name_draw(state) % std::size(words)]);
  };
  auto join = [](std::string a, const std::string &b) {
    if (!a.empty() && !b.empty() && a.back() == b.front())
      a.pop_back();
    return a + b;
  };
  const std::function<std::string()> patterns[] = {
      [&] { return join(pick(roots), pick(short_end)); },
      [&] { return join(pick(roots) + "o", pick(long_end)); },
      [&] { return join(pick(prefixes), join(pick(roots), pick(short_end))); },
      [&] { return join(pick(soft), pick(endings)); },
      [&] { return join(pick(roots), pick(endings)); },
      [&] { return join(pick(prefixes), join(pick(soft), pick(short_end))); },
      [&] { return join(pick(roots) + "i", pick(long_end)); }};
  std::string word = patterns[name_draw(state) % std::size(patterns)]();
  word[0] = char(word[0] - 'a' + 'A');
  return word;
}
std::string available_epithet(const std::string &alternatives, std::uint64_t seed,
                              const std::set<std::string> &used,
                              const std::map<std::string, int> &frequency,
                              const std::string &candidate) {
  std::vector<std::string> words;
  std::size_t start = 0;
  do {
    auto end = alternatives.find('|', start);
    words.push_back(alternatives.substr(start, end - start));
    if (end == std::string::npos)
      break;
    start = end + 1;
  } while (true);
  if (!used.count(candidate) && std::find(words.begin(), words.end(), candidate) != words.end())
    return candidate;
  const auto offset = name_draw(seed) % words.size();
  int least = std::numeric_limits<int>::max();
  std::string result;
  for (std::size_t i = 0; i < words.size(); ++i) {
    const auto &word = words[(offset + i) % words.size()];
    const auto found = frequency.find(word);
    const int count = found == frequency.end() ? 0 : found->second;
    if (!used.count(word) && count < least) {
      least = count;
      result = word;
    }
  }
  return result;
}

struct NamingBody {
  std::array<double, field::SENSE_COUNT> senses{}, thresholds{};
  double radius = 0, mouth = 0, bite = 0, head = 0, cord = 0, armor = 0, vision = 0;
  double internal = 0, jaw = 0, gut = 0, blunt = 0, wave = 0;
  int adults = 0;
  void add(const Individual &p) {
    ++adults;
    radius += collision_radius(p.body);
    mouth += p.body.suction_strength;
    bite += p.body.bite_strength;
    jaw += p.body.jaw_length;
    gut += p.body.gut_length;
    blunt += p.body.blunt_teeth;
    wave += p.body.undulation;
    if (!p.genome.interface)
      return;
    const auto &b = *p.genome.interface;
    head += b.anatomy[anatomy_column::head];
    cord += b.anatomy[anatomy_column::cord];
    armor += b.anatomy[anatomy_column::defense_strength];
    vision += *std::max_element(b.visual_coverage.begin(), b.visual_coverage.end());
    for (int k = 0; k < field::SENSE_COUNT; ++k) {
      senses[k] += b.sense_counts[k];
      thresholds[k] += b.sense_counts[k] * b.sense_thresholds[k];
    }
    if (p.genome.blueprint)
      for (const auto &n : p.genome.blueprint->neurons)
        if (n.functional && n.functions.internal > 0)
          internal += n.functions.internal;
  }
  // Threshold position 0..1, averaged over the sense cells.
  double threshold(int k) const {
    return senses[k] ? std::clamp(thresholds[k] / senses[k], 0., 1.) : 1;
  }
};
struct NameChoice {
  std::string word, meaning;
  double score;
};
constexpr double MIN_HEADROOM = .01, NO_VISION = .001, SMALL_RADIUS = 8;
constexpr double PREFERENCE_MIN = .94, PREFERENCE_SPREAD = .06, GENUS_CONTRAST = .8;
constexpr std::uint64_t NAME_DELAY = 400;
constexpr double PULSE_SCALE = 12, AGGRESSION_SCALE = 8, GAMETE_SCALE = 100;
constexpr double ARMOR_HALF = 4, MOUTH_HALF = 10, BITE_HALF = 10;
constexpr std::uint64_t CONFIRM_STEPS = 800;
constexpr int CONFIRM_COUNT = 3;
constexpr std::uint64_t ENVIRONMENT_STEPS = 1200;
constexpr int ENVIRONMENT_BIRTHS = 3, ENVIRONMENT_ADULTS = 3, ENVIRONMENT_SHARE = 4;
constexpr std::size_t RETAINED_EXTINCT = 16;
constexpr double ARCHIVE_GAIN = .02;
bool printable(char c) {
  return static_cast<unsigned char>(c) >= ' ';
}
std::vector<NameChoice> naming_choices(const GeneticSpecies &s, const NamingBody &body) {
  namespace F = behavior_feature_column;
  const auto &p = s.profile;
  std::vector<NameChoice> out;
  auto add = [&](const char *word, double score) {
    const std::string words = word;
    out.push_back({words, words.substr(0, words.find('|')), std::clamp(score, 0., 1.)});
  };
  auto high = [](double x, double threshold) {
    return std::clamp((x - threshold) / std::max(MIN_HEADROOM, 1 - threshold), 0., 1.);
  };
  const double adults = std::max(1, body.adults), vision = body.vision / adults,
               nose = body.senses[field::Odor] > 0 ? 1 - body.threshold(field::Odor) : 0;
  const double radius = body.radius / adults, mouth = body.mouth / adults,
               armor = body.armor / adults, bite = body.bite / adults;
  const double pulses = std::min(1., PULSE_SCALE * p[F::pulses]),
               aggression = std::min(1., AGGRESSION_SCALE * p[F::aggression]),
               spawn = std::min(1., GAMETE_SCALE * p[F::spawn]),
               sperm = std::min(1., GAMETE_SCALE * p[F::sperm]);
  add("velox|alacer|agilis|pernix|properans|rapida|volucris|festinans", high(p[F::travel], .55));
  add("celer|cursoria|currens|citata|percurrens|cursatrix|cursitans|pernicis",
      high(p[F::travel], .7) * (1 - p[F::pauses]));
  add("lenta|tarda|segnis|lentula|pigra|cunctans|morosa|tardigrada",
      .45 * high(1 - p[F::travel], .75));
  add("quieta|quiescens|sedentaria|requieta|tranquilla|immota|residens|pausans",
      .7 * high(p[F::pauses], .55));
  add("errans|peregrina|exploratrix|vagabunda|erratica|vagatrix|peragrans|circumerrans",
      high(p[F::range], .35));
  add("vagans|itinerans|viatrix|longivaga|migrans|pervagans|ambulans|peregrinans",
      high(p[F::range], .5) * (1 - p[F::pauses]));
  add("sinuosa|tortuosa|flexilis|versatilis|curvata|anfractuosa|volubilis|circumagens",
      high(p[F::turn], .3));
  add("recta|directa|linearis|orthodroma|rectilinea|rectigrada|pergens|porrecta",
      high(p[F::travel], .4) * high(1 - p[F::turn], .8));
  add("pulsans|remigans|intermittens|propellens|impellens|pulsatilis|remigatrix|remigera|pulsatrix|"
      "crebriremis|subsultans|agitans",
      high(pulses, .5));
  add("labens|fluens|delabens|elabens|prolabens|lapsans|fluitans|allabens",
      high(p[F::glides], .6) * high(p[F::travel], .1));
  add("vorax|edax|praedatrix|venatrix|voratoria|captans|praedans|venatoria",
      high(p[F::diet_fish], .4));
  add("piscivora|ichthyophaga|piscatrix|pisciphaga|piscicida|ichthyovora",
      high(p[F::diet_fish], .65));
  add("algivora|algiphaga|pascualis|algivaga|algicola|algosa", high(p[F::diet_algae], .4));
  add("herbivora|phytophaga|folivora|graminivora|frondivora|foliphaga", high(p[F::diet_plant], .4));
  add("graminicola|herbicola|frondicola|frondosa|herbivaga|graminiphila", high(p[F::grass], .6));
  add("ovivora|oophaga|oviphaga|ovivaga|ovipreda|ovorapax", high(p[F::diet_egg], .4));
  add("necrophaga|saprophaga|carnivaga|necrovora|mortivora|cadaverivora",
      high(p[F::diet_carrion], .4));
  add("pabulivora|pascens|pabularia|granivora|graniphaga|micrivora|particulivora|pabulatrix",
      high(p[F::diet_feed], .7));
  add("planktivora|filtrans|cribrata|copepodivora|planctophaga|colans",
      high(p[F::diet_plankton], .4));
  add("vermivora|vermiphaga|lumbricivora|annelivora|vermicaptans|vermivaga",
      high(p[F::diet_worm], .4));
  add("carcinivora|cancrivora|carcinophaga|crustivora|cancrifraga|brachyurivora",
      high(p[F::diet_crab], .4));
  add("conchivora|conchifraga|testivora|malacophaga|bivalvivora|conchicida",
      high(p[F::diet_mussel], .4));
  add("detritivora|limivora|limophaga|pelophila|sabulivora|lutivora", high(p[F::diet_benthic], .4));
  add("rapax|raptoria|captatrix", std::min(high(aggression, .3), high(p[F::diet_fish], .3)));
  add("ferox|pugnax|bellicosa|furiosa|infesta|rixosa|dimicans|lacessens", high(aggression, .5));
  add("mitis|lenis|placida|mansueta|innocua|pacifica|placabilis|clemens",
      .3 * high(1 - aggression, .95));
  add("munita|armata|tutatrix|defensa|defendens|custodiens", high(p[F::defense], .35));
  add("loricata|scutata|cataphracta|armigera|spinifera|spinosa|echinata",
      high(armor / (ARMOR_HALF + armor), .35));
  add("fossoria|benthica|fundicola|demersa|humilis|benthophila|benthicola|subjacens|ima|inferna|"
      "depressa|demersalis",
      high(p[F::bottom], .6));
  add("profunda|abyssalis|submersa|profundicola|profundalis|inferior|bathyalis",
      high(p[F::bottom], .8));
  add("supera|superficialis|summicola|supernatans|epipelagica|sublimis|superficicola|summivaga",
      high(p[F::top], .6));
  add("pelagica|natans|aquatilis|pelagivaga|medionatans|aquivaga|pelagophila|natatilis",
      high(1 - std::max(p[F::bottom], p[F::top]), .8) * high(p[F::range], .2));
  add("rubra|rufa|coccinea|rubescens|rubella|punicea|rutila|sanguinea",
      high(p[F::red] - std::max(p[F::green], p[F::blue]), .35));
  add("viridis|virens|smaragdina|prasina|viridula|herbacea|chlorina|olivacea",
      high(p[F::green] - std::max(p[F::red], p[F::blue]), .35));
  add("caerulea|azurea|cyanea|caesia|cyanescens|caerulescens|caerulina|indigotica",
      high(p[F::blue] - std::max(p[F::red], p[F::green]), .35));
  add("aurea|flava|crocea|fulva|lutea|flavescens|aureola|ochracea",
      high(std::min(p[F::red], p[F::green]) - p[F::blue], .35));
  add("glauca|thalassina|aeruginea|glaucescens|viridicyanea|aeruginosa",
      high(std::min(p[F::green], p[F::blue]) - p[F::red], .35));
  add("purpurea|violacea|amethystina|purpurascens|violascens|lilacina|ianthina",
      high(std::min(p[F::red], p[F::blue]) - p[F::green], .35));
  add("albida|nivea|candida|alba|pallida|eburnea|albescens|lactea",
      high(std::min({p[F::red], p[F::green], p[F::blue]}), .75));
  add("fusca|obscura|umbrina|atra|nigra|nigricans|picea|tenebrosa",
      .6 * high(1 - std::max({p[F::red], p[F::green], p[F::blue]}), .8));
  add("acuta|perspicua|cernens", vision * high(1 - body.threshold(field::Light), .75));
  add("myopa|hebes|amblyopa", vision * high(body.threshold(field::Light), .65));
  add("caeca|anops|anophthalma", vision < NO_VISION ? .35 : 0);
  add("oculata|ocellata|ophthalmica", high(vision, .6));
  add("nasuta|olfactoria|odoratrix", high(nose, .7));
  add("obturata|obtusa|amblyosma",
      body.senses[field::Odor] > 0 ? high(body.threshold(field::Odor), .7) : 0);
  add("perspicax|sagax|indagatrix", std::min(vision, high(nose, .5)));
  add("odorata|olfaciens|odorans", vision < NO_VISION ? high(nose, .5) : 0);
  add("tactilis|palpans|tangens",
      body.senses[field::Touch] > 0 ? high(1 - body.threshold(field::Touch), .65) : 0);
  add("vigilans|attenta|excubans",
      body.senses[field::Flow] > 0 ? high(1 - body.threshold(field::Flow), .7) : 0);
  add("sensitiva|sensibilis|delicata", body.senses[field::InnerPressure] > 0
                                           ? high(1 - body.threshold(field::InnerPressure), .75)
                                           : 0);
  add("robusta|tolerans|insensilis",
      body.senses[field::InnerPressure] > 0 ? high(body.threshold(field::InnerPressure), .7) : 0);
  add("magna|grandis|ingens|ampla|major|maxima|gigantea|corpulenta",
      high(radius / MAX_BODY_RADIUS, .35));
  add("parva|minuta|pusilla|exigua|minima|nana|pumila|parvula",
      .5 * high(1 - radius / SMALL_RADIUS, .35));
  add("labiata|labrosa|buccata", high(mouth / (MOUTH_HALF + mouth), .5));
  add("longirostris|prognatha|rostrata", high(body.jaw / adults, .7));
  add("brevirostris|brachygnatha|curtirostra", high(1 - body.jaw / adults, .7));
  add("longivisceris|herbivora|intestinata", high(body.gut / adults, .75));
  add("acutidens|lacerans|raptoria", body.bite > 0 ? high(1 - body.blunt / adults, .7) : 0);
  add("molaris|conchifera|contundens", body.bite > 0 ? high(body.blunt / adults, .7) : 0);
  add("undulans|anguillata|serpentina", high(body.wave / adults, .7));
  add("mordax|dentata|maxillata", high(bite / (BITE_HALF + bite), .5));
  add("macrocephala|cerebrata|capitata",
      high(body.head / std::max(1., body.head + body.cord), .65));
  add("ovipara|fecunda|prolifica|ovigera|fertilis|generosa|multipara|pullifera", high(spawn, .25));
  add("nubifera|nebulosa|nubilans|nebulifera|nubigena|nebulatrix|effundens", high(sperm, .25));
  add("androgyna|bifera|geminifera", std::min(high(spawn, .15), high(sperm, .15)));
  add("benthivora|pabulator|fundivora",
      std::min(high(p[F::bottom], .5), high(p[F::diet_benthic] + p[F::diet_worm], .5)));
  add("insidiosa|latitans|occulta", std::min(high(p[F::pauses], .4), high(p[F::diet_fish], .3)));
  add("flexuosa|versipreda|circumvagans",
      std::min(high(p[F::turn], .25), high(p[F::diet_fish], .3)));
  add("lucifuga|caecicola|caecula", vision < NO_VISION ? high(p[F::bottom], .5) : 0);
  add("curiosa|speculatrix|rimatrix", std::min(high(p[F::range], .3), high(vision, .3)));
  add("vestigatrix|scrutatrix|investigans", std::min(high(p[F::range], .3), high(nose, .5)));
  add("velifera|velivaga|perlabens", std::min(high(p[F::range], .4), high(p[F::glides], .6)));
  return out;
}

void assign_observed_names(std::vector<GeneticSpecies> &species,
                           const std::vector<NamingBody> &bodies, const std::vector<int> &sampled,
                           std::uint64_t ticks) {
  std::vector<std::vector<NameChoice>> choices(species.size());
  std::map<std::uint64_t, std::set<std::string>> used;
  std::map<std::string, int> frequency;
  std::map<std::uint64_t, std::vector<double>> totals;
  std::map<std::uint64_t, int> counts;
  for (std::size_t i = 0; i < species.size(); ++i) {
    const auto &s = species[i];
    auto genus = s.genus ? s.genus : s.id;
    if (!s.epithet.empty()) {
      used[genus].insert(s.epithet);
      ++frequency[s.epithet];
    }
    if (!sampled[i] || !bodies[i].adults)
      continue;
    choices[i] = naming_choices(s, bodies[i]);
    auto &sum = totals[genus];
    sum.resize(choices[i].size());
    for (std::size_t k = 0; k < sum.size(); ++k)
      sum[k] += choices[i][k].score;
    ++counts[genus];
  }
  for (std::size_t i = 0; i < species.size(); ++i) {
    auto &s = species[i];
    if (!s.epithet.empty())
      continue;
    if (!s.confirmed || !sampled[i] || !bodies[i].adults) {
      s.name_candidate.clear();
      s.name_since = 0;
      continue;
    }
    const auto genus = s.genus ? s.genus : s.id;
    double best = 0;
    NameChoice chosen;
    for (std::size_t k = 0; k < choices[i].size(); ++k) {
      const auto &c = choices[i][k];
      if (c.score <= 0)
        continue;
      const auto seed = name_hash(s.name.substr(0, s.name.find(' '))) ^ s.id * SPLITMIX_GAMMA ^ k;
      auto word = available_epithet(c.word, seed, used[genus], frequency, s.name_candidate);
      if (word.empty())
        continue;
      const int count = counts[genus] - 1;
      const double relative = count ? (totals[genus][k] - c.score) / count : 0;
      std::uint64_t tie = seed;
      const double preference = PREFERENCE_MIN + PREFERENCE_SPREAD * unit_interval(name_draw(tie));
      double score = (c.score + (count ? GENUS_CONTRAST * (c.score - relative) : 0)) * preference;
      if (score > best) {
        best = score;
        chosen = {std::move(word), c.meaning, c.score};
      }
    }
    if (chosen.word.empty()) {
      s.name_candidate.clear();
      s.name_since = 0;
      continue;
    }
    ++frequency[chosen.word];
    if (s.name_candidate != chosen.word) {
      s.name_candidate = chosen.word;
      s.candidate_reason = chosen.meaning;
      s.name_since = ticks;
    } else if (ticks >= s.name_since + NAME_DELAY) {
      s.epithet = s.name_candidate;
      s.name_reason = s.candidate_reason;
      s.name = s.name.substr(0, s.name.find(' ')) + " " + s.epithet;
      used[genus].insert(s.epithet);
    }
  }
}
}
std::uint64_t SpeciesRegistry::classify(const Genome &g, std::uint64_t maternal_species,
                                        std::uint64_t ticks) {
  if (!g.cppn)
    return 0;
  const auto lineage = g.cppn->history()->lineage();
  const GeneticSpecies *mother = maternal_species ? find(maternal_species) : nullptr;
  if (maternal_species && (!mother || mother->representative.cppn->history()->lineage() != lineage))
    return 0;
  if (!mother)
    for (const auto &old : species)
      if (old.representative.cppn->history()->lineage() == lineage) {
        mother = &old;
        break;
      }
  if (mother) {
    const double distance =
        evolution::Genome::compatibility_distance(*mother->representative.cppn, *g.cppn);
    if (distance < mating_distance) {
      auto &same = *find(mother->id);
      same.last_seen = ticks;
      same.max_founder_distance = std::max(same.max_founder_distance, distance);
      return same.id;
    }
    // Identical copies of the same split share its taxon; other branches never merge.
    for (auto &old : species)
      if (old.mother_species == mother->id && old.representative.same_genes(g)) {
        old.last_seen = ticks;
        return old.id;
      }
  }
  if (species.size() >= MAX_SPECIES)
    return 0;
  GeneticSpecies s;
  s.id = next_species++;
  s.genus = s.id;
  s.mother_species = mother ? mother->id : 0;
  std::string genus_label = species_name(s.id, lineage);
  std::string given;
  if (!mother) {
    for (char c : g.name) {
      if (c != ' ' && c != '"' && c != '\\' && printable(c))
        given += c;
      else if (c == ' ' && !given.empty() && given.back() != '-')
        given += '-';
    }
  }
  while (!given.empty() && given.back() == '-')
    given.pop_back();
  if (!given.empty()) {
    if (given[0] >= 'a' && given[0] <= 'z')
      given[0] = char(given[0] - 'a' + 'A');
    genus_label = given.substr(0, text_limit::word);
  }
  if (mother) {
    const auto *maternal_genus = find(mother->genus ? mother->genus : mother->id);
    if (maternal_genus && evolution::Genome::compatibility_distance(
                              *maternal_genus->representative.cppn, *g.cppn) < genus_distance()) {
      s.genus = maternal_genus->id;
      genus_label = maternal_genus->name.substr(0, maternal_genus->name.find(' '));
    }
  }
  if (s.genus == s.id) {
    unsigned attempt = 0;
    const std::string base = genus_label;
    while (std::any_of(species.begin(), species.end(), [&](const auto &old) {
      return old.name.substr(0, old.name.find(' ')) == genus_label;
    }))
      genus_label = given.empty() ? species_name(s.id, lineage, ++attempt)
                                  : base + "-" + std::to_string(++attempt + 1);
  }
  s.born = s.last_seen = ticks;
  s.name = genus_label + " sp. " + std::to_string(s.id);
  s.representative = g;
  s.representative.blueprint.reset();
  s.representative.interface.reset();
  s.representative.growing.reset();
  s.representative.growth_query.reset();
  species.push_back(std::move(s));
  return species.back().id;
}
void SpeciesRegistry::name_hormones(GeneticSpecies &s) {
  for (std::size_t k = 0; k < s.hormones.names.size(); ++k) {
    auto &name = s.hormones.names[k];
    if (name.suffix.empty() || !name.stem.empty())
      continue;
    const std::string space = "hormone:" + s.name + ":" + std::to_string(k);
    const char *endings[] = {"in", "elin", "olin", "erin"};
    unsigned attempt = 0;
    do {
      name.stem = species_name(s.id, space, attempt++) +
                  endings[name_hash(space + std::to_string(s.id)) % std::size(endings)];
    } while (std::any_of(species.begin(), species.end(), [&](const auto &old) {
      return old.id != s.id && std::any_of(old.hormones.names.begin(), old.hormones.names.end(),
                                           [&](const auto &n) { return n.stem == name.stem; });
    }));
    name.origin = s.id;
  }
}
std::uint64_t Ecosystem::classify(const Genome &g, std::uint64_t maternal_species) {
  return taxonomy_.classify(g, maternal_species, ticks);
}
int Ecosystem::adult_population() const {
  return int(std::count_if(fish.begin(), fish.end(),
                           [](const Individual &p) { return p.body.alive && p.body.hatched; }));
}
void Ecosystem::record_hatch(Individual &p) {
  ++taxonomy_.hatches;
  if (p.clonal)
    ++metrics_.clonal_hatches;
  if (auto *group = taxonomy_.find(p.species))
    ++group->hatches;
  if (p.origin != fish_origin::natural)
    return;
  p.body.angle = rng.uniform(-PI, PI);
  ++metrics_.births;
  ++metrics_.window_births;
  if (p.g > NATURAL_GENERATION)
    ++metrics_.performance_total.hatches;
  if (p.g > SUPPORT_GENERATION) {
    ++metrics_.performance_total.support_hatches;
    if (auto *s = taxonomy_.find(p.species))
      ++s->replacement_hatches;
  }
  if (metrics_.births == 1)
    taxonomy_.milestones.push_back({ticks + 1, p.species, "offspring-hatch"});
  for (auto &parent : fish)
    if (parent.id == p.parent || parent.id == p.father)
      ++parent.offspring;
  for (auto &b : support_.breeders)
    if ((b.id == p.parent || b.id == p.father) &&
        std::none_of(fish.begin(), fish.end(),
                     [&](const Individual &living) { return living.id == b.id; }))
      ++b.offspring;
  for (const auto id : {p.parent, p.father != p.parent ? p.father : 0})
    if (id) {
      for (auto &a : support_.archive)
        if (a.source_id == id) {
          ++a.offspring;
          a.quality += ARCHIVE_GAIN;
        }
    }
  if (auto *group = taxonomy_.find(p.maternal_species))
    ++group->successful_offspring;
  if (p.paternal_species != p.maternal_species)
    if (auto *group = taxonomy_.find(p.paternal_species))
      ++group->successful_offspring;
  if (p.maternal_natural || p.paternal_natural) {
    ++taxonomy_.reproductive_descendants;
    if (taxonomy_.reproductive_descendants == 1)
      taxonomy_.milestones.push_back({ticks + 1,
                                      p.maternal_natural ? p.maternal_species : p.paternal_species,
                                      "offspring-reproduction"});
  }
}
void Ecosystem::environment_changed() {
  field.reset_growth_history();
  ++environment;
  metrics_.environment_tick = ticks;
  metrics_.environment_births = metrics_.births;
  metrics_.environment_rescues = metrics_.rescues;
  metrics_.environment_imports = metrics_.imports;
  metrics_.environment_adults = adult_population();
  reset_window();
  for (auto &p : fish)
    p.novelty = 0;
}
void Ecosystem::record_parent_profile_delta(GeneticSpecies &s) {
  std::array<double, BEHAVIOR_FEATURES> baseline{};
  for (const auto id :
       {s.mother_species, s.father_species != s.mother_species ? s.father_species : 0}) {
    if (!id || id == s.id)
      continue;
    const auto *source = taxonomy_.find(id);
    if (!source)
      continue;
    const auto &parent = *source;
    if (parent.profile_samples && parent.profile_environment == environment) {
      ++s.comparison_parents;
      for (std::size_t k = 0; k < BEHAVIOR_FEATURES; ++k)
        baseline[k] += parent.profile[k];
    }
  }
  if (s.comparison_parents)
    for (std::size_t k = 0; k < BEHAVIOR_FEATURES; ++k)
      s.first_delta[k] = s.profile[k] - baseline[k] / s.comparison_parents;
}
void Ecosystem::observe_ecology() {
  auto mark = [&](std::string key, std::uint64_t id = 0) {
    if (std::none_of(taxonomy_.milestones.begin(), taxonomy_.milestones.end(),
                     [&](const EcologicalMilestone &m) { return m.key == key; }))
      taxonomy_.milestones.push_back({ticks, id, std::move(key)});
  };
  if (metrics_.births)
    mark("offspring-hatch");
  if (taxonomy_.reproductive_descendants)
    mark("offspring-reproduction");

  std::vector<NamingBody> naming_bodies(taxonomy_.species.size());
  std::vector<int> adults(taxonomy_.species.size()), alive(taxonomy_.species.size()),
      samples(taxonomy_.species.size());
  std::vector<std::array<double, BEHAVIOR_FEATURES>> profiles(taxonomy_.species.size());
  std::map<std::uint64_t, std::size_t> indices;
  for (std::size_t i = 0; i < taxonomy_.species.size(); ++i)
    indices[taxonomy_.species[i].id] = i;
  for (const auto &p : fish)
    if (p.body.alive && !p.nutrient_egg && indices.count(p.species)) {
      auto id = indices.at(p.species);
      taxonomy_.species[id].last_seen = ticks;
      ++alive[id];
      adults[id] += p.body.hatched;
      if (p.body.hatched && ticks % SAMPLE_PERIOD == 0) {
        naming_bodies[id].add(p);
        accumulate_body_profile(p, taxonomy_.species[id].lifetime_body);
      }
      if (p.body.hatched && p.body.nutrition_steps >= behavior::min_samples)
        taxonomy_.species[id].best_nutrition_rate = std::max(
            taxonomy_.species[id].best_nutrition_rate, p.body.nutrition / p.body.nutrition_steps);
      if (p.body.hatched && p.observations_.window_steps >= behavior::min_samples &&
          ticks % SAMPLE_PERIOD == 0) {
        auto d = p.behavior();
        ++samples[id];
        for (std::size_t k = 0; k < BEHAVIOR_FEATURES; ++k)
          profiles[id][k] += d[k];
      }
    }
  for (const auto &cloud : sperm)
    if (cloud.energy >= evo.sperm_portion && indices.count(cloud.species))
      ++alive[indices.at(cloud.species)];
  for (std::size_t i = 0; i < taxonomy_.species.size(); ++i) {
    auto &s = taxonomy_.species[i];
    if (alive[i])
      s.extinct_at = 0;
    else if (!s.extinct_at)
      s.extinct_at = ticks;
    if (samples[i]) {
      s.profile_samples = samples[i];
      s.profile_environment = environment;
      for (std::size_t k = 0; k < BEHAVIOR_FEATURES; ++k)
        s.profile[k] = profiles[i][k] / samples[i];
      const auto total = s.lifetime_profile_samples + samples[i];
      for (std::size_t k = 0; k < BEHAVIOR_FEATURES; ++k)
        s.lifetime_profile[k] += (profiles[i][k] - samples[i] * s.lifetime_profile[k]) / total;
      s.lifetime_profile_samples = total;
      if (!s.first_profile_samples) {
        s.first_profile_tick = ticks;
        s.first_profile_samples = samples[i];
        record_parent_profile_delta(s);
      }
    }
  }
  if (ticks % SAMPLE_PERIOD)
    return;
  for (std::size_t i = 0; i < taxonomy_.species.size(); ++i) {
    auto &s = taxonomy_.species[i];
    if (!s.confirmed && ticks >= s.born + CONFIRM_STEPS && s.hatches >= CONFIRM_COUNT &&
        s.successful_offspring >= CONFIRM_COUNT && adults[i] >= CONFIRM_COUNT) {
      s.confirmed = true;
      mark("species-" + std::to_string(s.id), s.id);
    }
  }
  assign_observed_names(taxonomy_.species, naming_bodies, samples, ticks);
  if (environment && ticks >= metrics_.environment_tick + ENVIRONMENT_STEPS &&
      metrics_.rescues == metrics_.environment_rescues &&
      metrics_.imports == metrics_.environment_imports &&
      metrics_.births >= metrics_.environment_births + ENVIRONMENT_BIRTHS &&
      adult_population() >=
          std::max(ENVIRONMENT_ADULTS, metrics_.environment_adults / ENVIRONMENT_SHARE))
    mark("environment-" + std::to_string(environment));
}

const GeneticSpecies *SpeciesRegistry::find(std::uint64_t id) const {
  auto it = std::lower_bound(species.begin(), species.end(), id,
                             [](const GeneticSpecies &s, std::uint64_t key) { return s.id < key; });
  return it != species.end() && it->id == id ? &*it : nullptr;
}
GeneticSpecies *SpeciesRegistry::find(std::uint64_t id) {
  return const_cast<GeneticSpecies *>(static_cast<const SpeciesRegistry *>(this)->find(id));
}
const GeneticSpecies *Ecosystem::find_species(std::uint64_t id) const {
  return taxonomy_.find(id);
}

void Ecosystem::prune_species() {
  std::set<std::uint64_t> retained;
  auto keep = [&](std::uint64_t id) {
    if (id)
      retained.insert(id);
  };
  for (const auto &p : fish)
    if (p.body.alive) {
      keep(p.species);
      keep(p.maternal_species);
      keep(p.paternal_species);
    }
  for (const auto &p : remembered_dead) {
    keep(p.species);
    keep(p.maternal_species);
    keep(p.paternal_species);
  }
  for (const auto &cloud : sperm)
    keep(cloud.species);
  for (const auto &round : hormone_analysis_.rounds)
    keep(round.species);
  for (const auto &s : taxonomy_.species)
    if (s.hormones.investigations)
      keep(s.id);
  for (const auto &b : support_.breeders)
    keep(b.species);
  for (const auto &a : support_.archive)
    keep(a.species);
  std::vector<const GeneticSpecies *> best;
  for (const auto &s : taxonomy_.species)
    if (s.extinct_at && !retained.count(s.id) &&
        (s.successful_offspring || s.best_nutrition_rate > 0))
      best.push_back(&s);
  std::stable_sort(best.begin(), best.end(), [](const auto *a, const auto *b) {
    return a->successful_offspring != b->successful_offspring
               ? a->successful_offspring > b->successful_offspring
           : a->best_nutrition_rate != b->best_nutrition_rate
               ? a->best_nutrition_rate > b->best_nutrition_rate
               : a->hatches > b->hatches;
  });
  for (std::size_t i = 0; i < std::min(RETAINED_EXTINCT, best.size()); ++i)
    keep(best[i]->id);
  std::vector<std::uint64_t> ancestors(retained.begin(), retained.end());
  for (std::size_t i = 0; i < ancestors.size(); ++i)
    if (const auto *s = taxonomy_.find(ancestors[i]))
      for (auto id : {s->mother_species, s->father_species, s->genus})
        if (id && retained.insert(id).second)
          ancestors.push_back(id);
  taxonomy_.species.erase(std::remove_if(taxonomy_.species.begin(), taxonomy_.species.end(),
                                         [&](const GeneticSpecies &s) {
                                           return s.extinct_at && !retained.count(s.id);
                                         }),
                          taxonomy_.species.end());
}
void Ecosystem::rename_species(std::uint64_t id, const std::string &name) {
  auto *s = taxonomy_.find(id);
  if (!s)
    throw std::runtime_error("Unbekannte Art.");
  std::string clean;
  for (char c : name)
    if (printable(c))
      clean += c;
  while (!clean.empty() && clean.front() == ' ')
    clean.erase(clean.begin());
  while (!clean.empty() && clean.back() == ' ')
    clean.pop_back();
  if (clean.empty() || clean.size() > text_limit::name)
    throw std::runtime_error("Name mit 1 bis " + std::to_string(text_limit::name) +
                             " Zeichen erforderlich.");
  const auto space = clean.find(' ');
  s->name = clean;
  s->epithet =
      (space == std::string::npos ? clean : clean.substr(space + 1)).substr(0, text_limit::word);
  s->name_candidate.clear();
  s->candidate_reason.clear();
  s->name_reason = "userNamed";
  s->name_since = 0;
}
}

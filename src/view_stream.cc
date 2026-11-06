#include "view_stream.hh"
#include "protocol_schema.hh"
#include <algorithm>
#include <cctype>
#include <charconv>
#include <cmath>
#include <map>
#include <stdexcept>
#include <vector>
#include <set>

namespace fishsim {
namespace {
using Text = std::string_view;
void space(Text text, std::size_t &at) {
  while (at < text.size() && std::isspace(static_cast<unsigned char>(text[at])))
    ++at;
}
std::size_t end_value(Text text, std::size_t at) {
  bool quoted = false, escaped = false;
  unsigned depth = 0;
  for (; at < text.size(); ++at) {
    char c = text[at];
    if (quoted) {
      if (escaped)
        escaped = false;
      else if (c == '\\')
        escaped = true;
      else if (c == '"') {
        quoted = false;
        if (!depth)
          return at + 1;
      }
    } else if (c == '"')
      quoted = true;
    else if (c == '[' || c == '{')
      ++depth;
    else if (c == ']' || c == '}') {
      if (!depth)
        return at;
      if (!--depth)
        return at + 1;
    } else if (!depth && (c == ',' || std::isspace(static_cast<unsigned char>(c))))
      return at;
  }
  if (quoted || depth)
    throw std::runtime_error("Unvollständige Darstellungsdaten");
  return at;
}
Text take(Text text, std::size_t &at) {
  space(text, at);
  const auto start = at;
  at = end_value(text, at);
  if (at == start)
    throw std::runtime_error("Ungültige Darstellungsdaten");
  return text.substr(start, at - start);
}
std::vector<Text> elements(Text text) {
  std::vector<Text> result;
  std::size_t at = 1;
  space(text, at);
  while (at < text.size() && text[at] != ']') {
    result.push_back(take(text, at));
    space(text, at);
    if (at < text.size() && text[at] == ',')
      ++at;
  }
  return result;
}
std::map<Text, Text> members(Text text) {
  std::map<Text, Text> result;
  std::size_t at = 1;
  space(text, at);
  while (at < text.size() && text[at] != '}') {
    auto key = take(text, at);
    space(text, at);
    if (at == text.size() || text[at++] != ':')
      throw std::runtime_error("Ungültiges Darstellungsfeld");
    result.emplace(key, take(text, at));
    space(text, at);
    if (at < text.size() && text[at] == ',')
      ++at;
  }
  return result;
}
constexpr int WHOLE_PLACES = 2, FRACTION_PLACES = 3, ROUNDED_DIGITS = 7;
constexpr std::size_t NUMBER_CHARS = 64;
std::string display_numbers(Text text) {
  std::string result;
  result.reserve(text.size());
  for (std::size_t at = 0; at < text.size();) {
    char c = text[at];
    if (c == '"') {
      auto end = end_value(text, at);
      result.append(text.substr(at, end - at));
      at = end;
    } else if (c == '-' || (c >= '0' && c <= '9')) {
      auto end = at + 1;
      while (end < text.size() &&
             (std::isdigit(static_cast<unsigned char>(text[end])) || text[end] == '.' ||
              text[end] == 'e' || text[end] == 'E' || text[end] == '+' || text[end] == '-'))
        ++end;
      auto value = text.substr(at, end - at);
      if (value.find_first_of(".eE") == Text::npos)
        result.append(value);
      else {
        double number = 0;
        auto parsed = std::from_chars(value.data(), value.data() + value.size(), number);
        char buffer[NUMBER_CHARS];
        if (parsed.ec != std::errc{})
          throw std::runtime_error("Ungültige Darstellungszahl");
        const int places = std::abs(number) >= 1 ? WHOLE_PLACES : FRACTION_PLACES;
        const double scale = std::pow(10., places);
        number = std::round(number * scale) / scale;
        auto encoded =
            std::to_chars(buffer, buffer + sizeof buffer, number, std::chars_format::fixed, places);
        auto end_number = encoded.ptr;
        while (end_number > buffer && end_number[-1] == '0')
          --end_number;
        if (end_number > buffer && end_number[-1] == '.')
          --end_number;
        result.append(buffer, end_number);
      }
      at = end;
    } else {
      result += c;
      ++at;
    }
  }
  return result;
}
std::string rounded(Text text, double step) {
  double value = 0;
  std::from_chars(text.data(), text.data() + text.size(), value);
  value = std::round(value / step) * step;
  char buffer[NUMBER_CHARS];
  auto result = std::to_chars(buffer, buffer + sizeof buffer, value, std::chars_format::general,
                              ROUNDED_DIGITS);
  return std::string(buffer, result.ptr);
}
namespace {
constexpr double ANGLE_STEP = .001, COLOR_STEP = .01, POSE_STEP = .02, RADIUS_STEP = .05,
                 STORE_LEVELS = 64;
constexpr double FINE_COORDINATE = .01, COARSE_COORDINATE = .5;
constexpr double FINE_FLOW = .001, COARSE_FLOW = .05, SEDIMENT_STEP = .01;
constexpr int COMBAT_ID = 0;
constexpr unsigned MAX_PATCH_DEPTH = 16, MASK_DIGIT_BITS = frame_patch::mask_digit_bits;
std::string patch_head(int kind) {
  return '[' + std::to_string(kind) + ',';
}
constexpr std::array<std::array<std::size_t, 2>, 3> STORES{
    {{fish_column::energy, fish_column::reserve_capacity},
     {fish_column::egg_yolk, fish_column::egg_capacity},
     {fish_column::sperm_store, fish_column::sperm_capacity}}};
}
std::string display_fish(Text text, Text previous, Text selected, double coordinate_step,
                         bool statistics, bool fine) {
  namespace C = fish_column;
  std::map<Text, std::vector<Text>> known;
  if (!previous.empty())
    for (auto row : elements(previous)) {
      auto cells = elements(row);
      known.emplace(cells[C::id], std::move(cells));
    }
  static const std::set<std::size_t> animated = {C::x,
                                                 C::y,
                                                 C::angle,
                                                 C::id,
                                                 C::energy,
                                                 C::age,
                                                 C::hatched,
                                                 C::development,
                                                 C::fertilised,
                                                 C::red,
                                                 C::green,
                                                 C::blue,
                                                 C::mouth_pose,
                                                 C::health,
                                                 C::defense,
                                                 C::aggression,
                                                 C::speed,
                                                 C::tail,
                                                 C::egg_yolk,
                                                 C::egg_laying,
                                                 C::sperm_store,
                                                 C::nutrient_egg,
                                                 C::mass,
                                                 C::radius,
                                                 C::fin_pose,
                                                 C::mouth_aperture,
                                                 C::bite_pose,
                                                 C::suction_pose,
                                                 C::tissue,
                                                 C::body_geometry,
                                                 C::morphology_asset,
                                                 C::gut_fill,
                                                 C::gut_energy,
                                                 C::gut_digestible,
                                                 C::digestion,
                                                 C::digested,
                                                 C::feeding_action,
                                                 C::feeding_action_age,
                                                 C::mouth_phase,
                                                 C::mouth_budget,
                                                 C::swallowed,
                                                 C::mouth_offset,
                                                 C::mouth_biting,
                                                 C::filtered,
                                                 C::mouth_cycle};
  static const std::set<std::size_t> poses = {C::mouth_pose, C::defense,   C::aggression,
                                              C::tail,       C::bite_pose, C::suction_pose};
  std::string result = "[";
  bool first = true;
  for (auto row : elements(text)) {
    if (!first)
      result += ',';
    first = false;
    auto cells = elements(row);
    if (cells[C::id] == selected) {
      result.append(row);
      continue;
    }
    auto prior = known.find(cells[C::id]);
    result += '[';
    for (std::size_t i = 0; i < cells.size(); ++i) {
      if (i)
        result += ',';
      const auto store = std::find_if(STORES.begin(), STORES.end(),
                                      [&](const auto &pair) { return pair[0] == i; });
      if (!statistics && !animated.count(i) && prior != known.end())
        result.append(prior->second[i]);
      else if (i == C::x || i == C::y)
        result += rounded(cells[i], coordinate_step);
      else if (i == C::angle)
        result += rounded(cells[i], ANGLE_STEP);
      else if (!fine && store != STORES.end()) {
        const auto &capacity = cells[(*store)[1]];
        double maximum = 0;
        std::from_chars(capacity.data(), capacity.data() + capacity.size(), maximum);
        result += rounded(cells[i], std::max(1., maximum) / STORE_LEVELS);
      } else if (!fine && poses.count(i))
        result += rounded(cells[i], POSE_STEP);
      else if (!fine && (i == C::red || i == C::green || i == C::blue))
        result += rounded(cells[i], COLOR_STEP);
      else if (!fine && i == C::radius)
        result += rounded(cells[i], RADIUS_STEP);
      else if (!fine && i == C::fin_pose) {
        auto pose = elements(cells[i]);
        result += '[' + rounded(pose[0], POSE_STEP) + ',' + rounded(pose[1], POSE_STEP) + ',' +
                  rounded(pose[2], POSE_STEP) + ',' + display_numbers(pose[3]) + ']';
      } else
        result += display_numbers(cells[i]);
    }
    result += ']';
  }
  return result + ']';
}
std::string display_plant_organs(Text text, double step) {
  std::string result;
  result += '[';
  bool first_organ = true;
  for (auto organ : elements(text)) {
    if (!first_organ)
      result += ',';
    first_organ = false;
    result += '[';
    auto parts = elements(organ);
    for (std::size_t j = 0; j < parts.size(); ++j) {
      if (j)
        result += ',';
      if (j == 3) {
        result += '[';
        bool first_point = true;
        for (auto point : elements(parts[j])) {
          if (!first_point)
            result += ',';
          first_point = false;
          result += rounded(point, step);
        }
        result += ']';
      } else if (j == plant_organ_column::width || j == plant_organ_column::energy)
        result.append(parts[j]);
      else
        result += display_numbers(parts[j]);
    }
    result += ']';
  }
  result += ']';
  return result;
}
namespace {
constexpr double FOOD_ENERGY_STEP = 1, REMAINS_STEP = .25, AGE_STEP = 8;
static_assert(corpse_column::x == food_column::x && corpse_column::y == food_column::y &&
              gamete_column::x == food_column::x && gamete_column::y == food_column::y);
}
std::string display_rows(Text text, Text previous, Text key, double step, bool fine,
                         bool statistics) {
  const bool plants = key == "\"plants\"", food = key == "\"food\"", corpses = key == "\"corpses\"",
             gametes = key == "\"gametes\"";
  const std::size_t id_column = plants ? plant_column::id : food_column::id;
  std::map<Text, std::vector<Text>> known;
  std::map<Text, Text> known_rows;
  if ((food || plants) && !previous.empty())
    for (auto row : elements(previous)) {
      auto cells = elements(row);
      auto id = cells[id_column];
      known_rows.emplace(id, row);
      known.emplace(id, std::move(cells));
    }
  std::string result = "[";
  bool first = true;
  for (auto row : elements(text)) {
    if (!first)
      result += ',';
    first = false;
    result += '[';
    auto cells = elements(row);
    auto prior = known.find(cells[id_column]);
    if (plants && !statistics && !fine && prior != known.end() &&
        elements(cells[plant_column::root])[plant_root_column::drift_age] == "0") {
      result.pop_back();
      result.append(known_rows.at(cells[plant_column::id]));
      continue;
    }
    for (std::size_t i = 0; i < cells.size(); ++i) {
      if (i)
        result += ',';
      if (!statistics && !fine && food &&
          (i == food_column::age || i == food_column::bottom_steps) && prior != known.end())
        result.append(prior->second[i]);
      else if (!fine && food && i == food_column::radius)
        result += rounded(cells[i], RADIUS_STEP);
      else if ((plants && i >= plant_column::ax && i <= plant_column::by) ||
               (!plants && (i == food_column::x || i == food_column::y)))
        result += rounded(cells[i], step);
      else if (!fine &&
               ((food && i == food_column::energy) || (corpses && i == corpse_column::energy) ||
                (gametes && i == gamete_column::density)))
        result += rounded(cells[i], food ? FOOD_ENERGY_STEP : REMAINS_STEP);
      else if (!fine && ((food && i == food_column::age) || (corpses && i == corpse_column::age)))
        result += rounded(cells[i], AGE_STEP);
      else if (plants && i == plant_column::organs) {
        result += display_plant_organs(cells[i], step);
      } else
        result += display_numbers(cells[i]);
    }
    result += ']';
  }
  return result + ']';
}
std::string project(Text current, Text previous, bool environment, bool particles, bool light,
                    bool statistics, bool plants) {
  auto fields = members(current),
       old = previous.empty() ? std::map<Text, Text>{} : members(previous);
  static const std::set<Text> environments = {"\"sediment\"", "\"water\""};
  static const std::set<Text> stats = {
      "\"behavior\"",    "\"traits\"",     "\"archive\"",
      "\"species\"",     "\"parameters\"", "\"parameter_info\"",
      "\"performance\"", "\"assistance\"", "\"recent_deaths\"",
  };
  static const std::set<Text> visual = {"\"fish\"",   "\"food\"",     "\"corpses\"", "\"gametes\"",
                                        "\"plants\"", "\"sediment\"", "\"water\""};
  std::string result = "{";
  bool fine = fields["\"paused\""] == "true";
  auto brain = fields.find("\"brain\"");
  if (brain != fields.end() && !brain->second.empty() && brain->second.front() == '{')
    fine = fine || members(brain->second)["\"inspection\""] == "true";
  const double coordinate_step = fine ? FINE_COORDINATE : COARSE_COORDINATE;
  bool first = true;
  for (const auto &[key, value] : fields) {
    if (!first)
      result += ',';
    first = false;
    result.append(key);
    result += ':';
    auto prior = old.find(key);
    if (prior != old.end() &&
        ((!environment && environments.count(key)) || (!statistics && stats.count(key)) ||
         (!light && key == "\"light\"") || (!plants && key == "\"plants\"") ||
         (!particles && (key == "\"food\"" || key == "\"corpses\""))))
      result.append(prior->second);
    else if (fine && visual.count(key))
      result.append(value);
    else if (key == "\"fish\"")
      result += display_fish(value, prior == old.end() ? Text{} : prior->second,
                             fields["\"selected\""], coordinate_step, statistics, fine);
    else if (key == "\"food\"" || key == "\"corpses\"" || key == "\"gametes\"" ||
             key == "\"plants\"")
      result += display_rows(value, prior == old.end() ? Text{} : prior->second, key,
                             coordinate_step, fine, statistics);

    else if (key == "\"water\"") {
      result += '[';
      bool first_cell = true;
      for (auto row : elements(value)) {
        if (!first_cell)
          result += ',';
        first_cell = false;
        auto cells = elements(row);
        const double step = fine ? FINE_FLOW : COARSE_FLOW;
        result += '[' + std::string(cells[0]) + ',' + std::string(cells[1]) + ',' +
                  rounded(cells[2], step) + ',' + rounded(cells[3], step) + ']';
      }
      result += ']';
    } else if (key == "\"sediment\"") {
      auto grid = members(value);
      result += "{\"columns\":" + std::string(grid["\"columns\""]) +
                ",\"rows\":" + std::string(grid["\"rows\""]) + ",\"amounts\":[";
      bool first_cell = true;
      for (auto cell : elements(grid["\"amounts\""])) {
        if (!first_cell)
          result += ',';
        first_cell = false;
        result += rounded(cell, SEDIMENT_STEP);
      }
      result += "]}";
    } else if (visual.count(key))
      result += display_numbers(value);
    else
      result.append(value);
  }
  return result + '}';
}
std::string difference(Text old, Text now, unsigned depth, int identity = -1);
std::string difference_by_identity(Text old, Text now, unsigned depth, int identity,
                                   const std::string &replace) {

  auto before = elements(old), after = elements(now);
  auto id = [&](Text row) {
    std::size_t at = 1;
    Text result;
    for (int i = 0; i <= identity; ++i) {
      result = take(row, at);
      space(row, at);
      if (at < row.size() && row[at] == ',')
        ++at;
    }
    return result;
  };
  std::map<Text, Text> known;
  for (auto row : before)
    known.emplace(id(row), row);
  bool same_order = before.size() == after.size();
  if (same_order)
    for (std::size_t i = 0; i < after.size(); ++i)
      if (id(before[i]) != id(after[i])) {
        same_order = false;
        break;
      }
  std::string patch = patch_head(patch_kind::rows) + std::to_string(identity) + ',';
  if (same_order)
    patch += "null";
  else {
    patch += '[';
    bool first = true;
    for (auto row : after) {
      if (!first)
        patch += ',';
      first = false;
      patch.append(id(row));
    }
    patch += ']';
  }
  patch += ",[";
  bool first = true;
  for (auto row : after) {
    auto key = id(row);
    auto found = known.find(key);
    if (found != known.end() && row == found->second)
      continue;
    if (!first)
      patch += ',';
    first = false;
    patch += '[';
    patch.append(key);
    patch += ',';
    patch += difference(found == known.end() ? Text{} : found->second, row, depth + 1);
    patch += ']';
    if (patch.size() >= replace.size())
      return replace;
  }
  patch += "]]";
  return patch.size() < replace.size() ? patch : replace;
}
std::string difference(Text old, Text now, unsigned depth, int identity) {
  std::string replace = patch_head(patch_kind::replace) + std::string(now) + "]";
  if (old.empty() || now.empty() || depth > MAX_PATCH_DEPTH)
    return replace;
  if (old.front() != now.front())
    return replace;
  std::string patch;
  if (now.front() == '[' && identity >= 0)
    return difference_by_identity(old, now, depth, identity, replace);
  if (now.front() == '[') {
    auto before = elements(old), after = elements(now);
    std::string masked;
    if (before.size() == after.size()) {
      constexpr char hex[] = "0123456789abcdef";
      std::vector<unsigned> bits((after.size() + MASK_DIGIT_BITS - 1) / MASK_DIGIT_BITS);
      std::string values;
      bool first = true;
      for (std::size_t i = 0; i < after.size(); ++i) {
        if (before[i] == after[i])
          continue;
        bits[i / MASK_DIGIT_BITS] |= 1u << (i % MASK_DIGIT_BITS);
        if (!first)
          values += ',';
        first = false;
        values.append(after[i]);
      }
      std::string mask;
      for (auto value : bits)
        mask += hex[value];
      while (!mask.empty() && mask.back() == '0')
        mask.pop_back();
      masked = patch_head(patch_kind::mask) + '"' + mask + "\",[" + values + "]]";
    }
    patch = patch_head(patch_kind::array) + std::to_string(after.size()) + ",[";
    bool first = true;
    for (std::size_t i = 0; i < after.size(); ++i) {
      if (i < before.size() && before[i] == after[i])
        continue;
      if (!first)
        patch += ',';
      first = false;
      patch += '[' + std::to_string(i) + ',' +
               difference(i < before.size() ? before[i] : Text{}, after[i], depth + 1) + ']';
      if (patch.size() >= replace.size())
        return !masked.empty() && masked.size() < replace.size() ? masked : replace;
    }
    patch += "]]";
    if (!masked.empty() && masked.size() < patch.size())
      patch = std::move(masked);
  } else if (now.front() == '{') {
    auto before = members(old), after = members(now);
    patch = patch_head(patch_kind::object) + '{';
    bool first = true;
    for (const auto &[key, value] : after) {
      auto found = before.find(key);
      if (found != before.end() && found->second == value)
        continue;
      if (!first)
        patch += ',';
      first = false;
      int id = -1;
      if (depth == 0) {
        if (key == "\"fish\"")
          id = int(fish_column::id);
        else if (key == "\"food\"")
          id = int(food_column::id);
        else if (key == "\"corpses\"")
          id = int(corpse_column::id);
        else if (key == "\"plants\"")
          id = int(plant_column::id);
        else if (key == "\"combat\"")
          id = COMBAT_ID;
        else if (key == "\"gametes\"")
          id = int(gamete_column::id);
      }
      patch += std::string(key) + ':' +
               difference(found == before.end() ? Text{} : found->second, value, depth + 1, id);
      if (patch.size() >= replace.size())
        return replace;
    }
    patch += "},[";
    first = true;
    for (const auto &[key, value] : before)
      if (!after.count(key)) {
        if (!first)
          patch += ',';
        first = false;
        patch += key;
      }
    patch += "]]";
  } else
    return replace;
  return patch.size() < replace.size() ? patch : replace;
}
}
std::string view_patch(std::string_view previous, std::string_view current) {
  return difference(previous, current, 0);
}
ViewSchedule ViewStream::schedule(bool forced) {
  const auto now = std::chrono::steady_clock::now();
  constexpr auto SCENE_PERIOD = std::chrono::milliseconds(200),
                 LIGHT_PERIOD = std::chrono::milliseconds(500);
  bool environment = forced || now - environment_time >= SCENE_PERIOD;
  bool particles = forced || now - particles_time >= SCENE_PERIOD;
  bool light_update = forced || now - light_time >= LIGHT_PERIOD;
  bool statistics = forced || now - statistics_time >= std::chrono::seconds(1);
  if (environment)
    environment_time = now;
  if (statistics)
    statistics_time = now;
  if (particles)
    particles_time = now;
  if (light_update)
    light_time = now;
  return {environment, particles, light_update, statistics, statistics};
}
std::string ViewStream::encode(std::string frame, ViewSchedule cadence) {
  const auto source_bytes = frame.size();
  frame = project(frame, previous, cadence.environment, cadence.particles, cadence.light,
                  cadence.statistics, cadence.plants);
  std::string message = "{\"event\":\"view\",\"source_bytes\":" + std::to_string(source_bytes) +
                        ",\"sequence\":" + std::to_string(++sequence);
  if (previous.empty())
    message += ",\"frame\":" + frame;
  else
    message +=
        ",\"base\":" + std::to_string(sequence - 1) + ",\"patch\":" + view_patch(previous, frame);
  previous = std::move(frame);
  return message + '}';
}
}

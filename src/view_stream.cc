#include "view_stream.hh"
#include "protocol_schema.hh"
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
// Text numbers are rounded for display only; simulation and checkpoints are untouched.
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
        char buffer[64];
        if (parsed.ec != std::errc{})
          throw std::runtime_error("Ungültige Darstellungszahl");
        const int places = std::abs(number) >= 1 ? 2 : 3;
        const double scale = places == 2 ? 100 : 1000;
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
  char buffer[64];
  auto result = std::to_chars(buffer, buffer + sizeof buffer, value, std::chars_format::general, 7);
  return std::string(buffer, result.ptr);
}
std::string display_fish(Text text, Text previous, Text selected, double coordinate_step,
                         bool statistics, bool fine) {
  std::map<Text, std::vector<Text>> known;
  if (!previous.empty())
    for (auto row : elements(previous)) {
      auto cells = elements(row);
      known.emplace(cells[4], std::move(cells));
    }
  // Only these columns drive motion, shape, colour or transitions in the tank.
  // Other per-animal diagnostics are refreshed with the statistics.
  static const std::set<std::size_t> animated = {0,
                                                 1,
                                                 2,
                                                 4,
                                                 5,
                                                 6,
                                                 8,
                                                 9,
                                                 13,
                                                 16,
                                                 17,
                                                 18,
                                                 19,
                                                 23,
                                                 26,
                                                 27,
                                                 33,
                                                 44,
                                                 46,
                                                 47,
                                                 48,
                                                 49,
                                                 50,
                                                 51,
                                                 57,
                                                 63,
                                                 64,
                                                 65,
                                                 69,
                                                 fish_column::body_geometry,
                                                 fish_column::morphology_asset,
                                                 fish_column::gut_fill,
                                                 fish_column::gut_energy,
                                                 fish_column::gut_digestible,
                                                 fish_column::digestion,
                                                 fish_column::digested,
                                                 fish_column::feeding_action,
                                                 fish_column::feeding_action_age,
                                                 fish_column::mouth_phase,
                                                 fish_column::mouth_budget,
                                                 fish_column::swallowed,
                                                 fish_column::mouth_offset,
                                                 fish_column::mouth_biting,
                                                 fish_column::filtered,
                                                 fish_column::mouth_cycle};
  std::string result = "[";
  bool first = true;
  for (auto row : elements(text)) {
    if (!first)
      result += ',';
    first = false;
    auto cells = elements(row);
    if (cells[4] == selected) {
      result.append(row);
      continue;
    }
    auto prior = known.find(cells[4]);
    result += '[';
    for (std::size_t i = 0; i < cells.size(); ++i) {
      if (i)
        result += ',';
      if (!statistics && !animated.count(i) && prior != known.end())
        result.append(prior->second[i]);
      else if (i < 2)
        result += rounded(cells[i], coordinate_step);
      else if (i == 2)
        result += rounded(cells[i], .001);
      else if (!fine && (i == 5 || i == 46 || i == 48)) {
        const auto capacity = i == 5 ? 53 : i == 46 ? 67 : 68;
        double maximum = 0;
        std::from_chars(cells[capacity].data(), cells[capacity].data() + cells[capacity].size(),
                        maximum);
        result += rounded(cells[i], std::max(1., maximum) / 64);
      } else if (!fine && (i == 19 || i == 26 || i == 27 || i == 44 || i == 64 || i == 65))
        result += rounded(cells[i], .02);
      else if (!fine && i >= 16 && i <= 18)
        result += rounded(cells[i], .01);
      else if (!fine && i == 51)
        result += rounded(cells[i], .05);
      else if (!fine && i == 57) {
        auto pose = elements(cells[i]);
        result += '[' + rounded(pose[0], .02) + ',' + rounded(pose[1], .02) + ',' +
                  rounded(pose[2], .02) + ',' + display_numbers(pose[3]) + ']';
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
      } else if (j == 4 || j == 6)
        result.append(parts[j]);
      else
        result += display_numbers(parts[j]);
    }
    result += ']';
  }
  result += ']';
  return result;
}
std::string display_rows(Text text, Text previous, Text key, double step, bool fine,
                         bool statistics) {
  std::map<Text, std::vector<Text>> known;
  std::map<Text, Text> known_rows;
  if ((key == "\"food\"" || key == "\"plants\"") && !previous.empty())
    for (auto row : elements(previous)) {
      auto cells = elements(row);
      auto id = cells[key == "\"plants\"" ? 0 : 3];
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
    auto prior = known.find(cells[key == "\"plants\"" ? 0 : 3]);
    if (key == "\"plants\"" && !statistics && !fine && prior != known.end() &&
        elements(cells[plant_column::root])[2] == "0") {
      // Static plants grow slowly; drifting plants still follow the moving water.
      result.pop_back();
      result.append(known_rows.at(cells[0]));
      continue;
    }
    for (std::size_t i = 0; i < cells.size(); ++i) {
      if (i)
        result += ',';
      if (!statistics && !fine && key == "\"food\"" && (i == 4 || i == 5) && prior != known.end())
        result.append(prior->second[i]);
      else if (!fine && key == "\"food\"" && i == 6)
        result += rounded(cells[i], .05);
      else if ((key == "\"plants\"" && i >= 1 && i <= 4) || (key != "\"plants\"" && i < 2))
        result += rounded(cells[i], step);
      else if (!fine && (key == "\"food\"" || key == "\"corpses\"" || key == "\"gametes\"") &&
               i == 2)
        result += rounded(cells[i], key == "\"food\"" ? 1 : .25);
      else if (!fine && ((key == "\"food\"" && i == 4) || (key == "\"corpses\"" && i == 3)))
        result += rounded(cells[i], 8);
      else if (key == "\"plants\"" && i == plant_column::organs) {
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
  const double coordinate_step = fine ? .01 : .5;
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
        result += '[' + std::string(cells[0]) + ',' + std::string(cells[1]) + ',' +
                  rounded(cells[2], fine ? .001 : .05) + ',' +
                  rounded(cells[3], fine ? .001 : .05) + ']';
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
        result += rounded(cell, .01);
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
  std::string patch = "[3," + std::to_string(identity) + ',';
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
  std::string replace = "[0," + std::string(now) + "]";
  if (old.empty() || now.empty() || depth > 16)
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
      std::vector<unsigned> bits((after.size() + 3) / 4);
      std::string values;
      bool first = true;
      for (std::size_t i = 0; i < after.size(); ++i) {
        if (before[i] == after[i])
          continue;
        bits[i / 4] |= 1u << (i % 4);
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
      masked = "[6,\"" + mask + "\",[" + values + "]]";
    }
    patch = "[1," + std::to_string(after.size()) + ",[";
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
    patch = "[2,{";
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
          id = 4;
        else if (key == "\"food\"")
          id = 3;
        else if (key == "\"corpses\"")
          id = 7;
        else if (key == "\"plants\"" || key == "\"combat\"")
          id = 0;
        else if (key == "\"gametes\"")
          id = 6;
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
  bool environment = forced || now - environment_time >= std::chrono::milliseconds(200);
  bool particles = forced || now - particles_time >= std::chrono::milliseconds(200);
  bool light_update = forced || now - light_time >= std::chrono::milliseconds(500);
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

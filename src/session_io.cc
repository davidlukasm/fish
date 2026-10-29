#include "durable_file.hh"
#include "session_io.hh"
#include "ecology_internal.hh"
#include <filesystem>
#include <fstream>
#include <stdexcept>
namespace fishsim {
void atomic_text(const std::string &path, const std::string &content) {
  std::filesystem::create_directories(std::filesystem::path(path).parent_path());
  std::ofstream out(path + ".tmp", std::ios::binary);
  out << content;
  out.close();
  if (!out)
    throw std::runtime_error("Speichern fehlgeschlagen");
  commit_file(path + ".tmp", path);
}
std::vector<Genome> population(const std::string &path) {
  std::ifstream in(path);
  return read_population(in);
}
void json_string(std::ostream &out, std::string_view value) {
  out << '"';
  for (unsigned char c : value) {
    switch (c) {
    case '\n':
      out << "\\n";
      break;
    case '\r':
      out << "\\r";
      break;
    case '\t':
      out << "\\t";
      break;
    case '\\':
      out << "\\\\";
      break;
    case '"':
      out << "\\\"";
      break;
    default:
      if (c < 32) {
        constexpr char hex[] = "0123456789abcdef";
        out << "\\u00" << hex[c >> 4] << hex[c & 15];
      } else
        out << char(c);
    }
  }
  out << '"';
}
std::ostream &operator<<(std::ostream &out, JsonString text) {
  json_string(out, text.value);
  return out;
}

}

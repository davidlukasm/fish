#pragma once
#include <cerrno>
#include <cstring>
#include <filesystem>
#include <stdexcept>
#include <fcntl.h>
#include <unistd.h>
namespace fishsim {
inline void sync_file(const std::filesystem::path &path, bool directory = false) {
  const int descriptor = ::open(path.c_str(), O_RDONLY | (directory ? O_DIRECTORY : 0));
  if (descriptor < 0)
    throw std::runtime_error("Dateisynchronisation: " + std::string(std::strerror(errno)));
  const int result = ::fsync(descriptor), error = errno;
  ::close(descriptor);
  if (result < 0)
    throw std::runtime_error("Dateisynchronisation: " + std::string(std::strerror(error)));
}
inline void commit_file(const std::filesystem::path &temporary,
                        const std::filesystem::path &target) {
  sync_file(temporary);
  std::filesystem::rename(temporary, target);
  sync_file(target.has_parent_path() ? target.parent_path() : std::filesystem::path("."), true);
}
}

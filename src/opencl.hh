#pragma once
#include <array>
#include <cstdint>
#include <iosfwd>
#include <string>
#include <vector>
namespace fishsim {
struct Field;
struct Ecosystem;
struct VisualObject {
  double distance, radius, angle, beta;
  std::array<double, 3> color;
  bool transparent = false;
  double x = 0, y = 0;
  int kind = 0;
  std::uint64_t id = 0;
  double attenuation = -1;
  bool pending_filter = false;
  int eye = -1;
  // Plant strokes: centre (sx, sy) and half vector (hx, hy) in the observer's body frame relative
  // to the eye; `radius` is then the half-width, `distance` the distance to the centre line and
  // `far` the largest depth the stroke can have.
  bool stroke = false;
  double sx = 0, sy = 0, hx = 0, hy = 0, far = -1;
};
struct ComputeStatus {
  std::string mode = "cpu", device, reason;
  bool available = false, active = false;
  std::size_t queries = 0, fallback_queries = 0, uploaded_bytes = 0, reused_bytes = 0;
  double milliseconds = 0, preparation_ms = 0, execution_ms = 0, fallback_ms = 0, upload_ms = 0,
         filter_ms = 0, download_ms = 0;
  bool device_profiling = false;
};
void configure_compute(const std::string &);
bool opencl_loader_available();
const ComputeStatus &compute_status();
bool opencl_attenuation(const Field &, const std::vector<std::array<double, 4>> &,
                        std::vector<float> &);
bool prepare_opencl_objects(Ecosystem &, std::vector<std::vector<VisualObject>> &);
void write_compute_status(std::ostream &);
int benchmark_opencl(std::ostream &, int workers, int fish_count = 200, int steps = 100);
}

#pragma once
#include <thread>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <vector>
#include <atomic>
#include <memory>
#include <exception>
#include <fstream>
#include <algorithm>
#ifdef __linux__
#include <sched.h>
#endif
namespace fishsim {
inline thread_local bool inside_worker = false;
inline int available_workers() {
  unsigned n = std::max(1u, std::thread::hardware_concurrency());
#ifdef __linux__
  cpu_set_t allowed;
  if (sched_getaffinity(0, sizeof(allowed), &allowed) == 0)
    n = std::min(n, unsigned(CPU_COUNT(&allowed)));
  std::ifstream limit("/sys/fs/cgroup/cpu.max");
  std::string quota;
  unsigned long long period = 0;
  if (limit >> quota >> period && quota != "max" && period) {
    try {
      auto budget = std::stoull(quota);
      n = std::min(n, unsigned(std::max(1ULL, (budget + period - 1) / period)));
    } catch (const std::exception &) {
    }
  }
#endif
  return int(std::clamp(n, 1u, 64u));
}
class Workers {
  std::mutex mutex;
  std::condition_variable start, done;
  std::vector<std::thread> threads;
  std::function<void(std::size_t)> task;
  std::atomic<std::size_t> cursor{0};
  std::size_t count = 0, chunk = 1;
  unsigned epoch = 0, finished = 0;
  bool stopped = false;
  std::exception_ptr error;

public:
  explicit Workers(int n) {
    for (int i = 0; i < n; ++i)
      threads.emplace_back([this] {
        inside_worker = true;
        unsigned seen = 0;
        for (;;) {
          std::unique_lock<std::mutex> guard(mutex);
          start.wait(guard, [&] { return stopped || epoch != seen; });
          if (stopped)
            return;
          seen = epoch;
          guard.unlock();
          try {
            for (;;) {
              auto first = cursor.fetch_add(chunk, std::memory_order_relaxed);
              if (first >= count)
                break;
              for (auto j = first; j < std::min(count, first + chunk); ++j)
                task(j);
            }
          } catch (...) {
            std::lock_guard<std::mutex> lock(mutex);
            error = std::current_exception();
          }
          guard.lock();
          if (++finished == threads.size())
            done.notify_one();
        }
      });
  }
  ~Workers() {
    {
      std::lock_guard<std::mutex> guard(mutex);
      stopped = true;
    }
    start.notify_all();
    for (auto &t : threads)
      t.join();
  }
  void run(std::size_t n, const std::function<void(std::size_t)> &f, std::size_t batch = 1) {
    std::unique_lock<std::mutex> guard(mutex);
    task = f;
    count = n;
    chunk = std::clamp(batch, std::size_t(1), std::max(std::size_t(1), n / (4 * threads.size())));
    cursor = 0;
    finished = 0;
    error = nullptr;
    ++epoch;
    start.notify_all();
    done.wait(guard, [&] { return finished == threads.size(); });
    if (error)
      std::rethrow_exception(error);
  }
};
inline void parallel_workers(std::size_t count, int workers,
                             const std::function<void(std::size_t)> &f, std::size_t chunk) {
  static thread_local std::unique_ptr<Workers> pool;
  static thread_local int current = 0;
  if (current != workers) {
    pool = std::make_unique<Workers>(workers);
    current = workers;
  }
  pool->run(count, f, chunk);
}
template <class Task>
inline void parallel(std::size_t count, int workers, const Task &f, std::size_t neural_work = 0,
                     std::size_t chunk = 1) {
  if (inside_worker || workers <= 1 || count < 2 || (count < 16 && neural_work < 65536)) {
    for (std::size_t i = 0; i < count; ++i)
      f(i);
    return;
  }
  parallel_workers(count, workers, f, chunk);
}
}

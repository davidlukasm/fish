#ifndef ANN_NODE_HH
#define ANN_NODE_HH

#include <memory>
#include <vector>

namespace ann {
class Connection;

class Node {
public:
  virtual size_t count_connections() const = 0;
  virtual Connection const *get_input(size_t index) const = 0;

  virtual int get_type() const = 0;
  virtual float get_bias() const = 0;

  virtual ~Node() = 0;
};

}

#endif

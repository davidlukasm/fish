#ifndef ANN_CONNECTION_HH
#define ANN_CONNECTION_HH

namespace ann {

class Node;

class Connection {
public:
  virtual Node const *get_source() const = 0;
  virtual float get_weight() const = 0;
  virtual int get_port() const { return 0; }

  virtual ~Connection() = 0;
};

}

#endif

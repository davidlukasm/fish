#!/bin/bash
# Baut die v019-Werkzeuge gegen bin/test-core.o (vorher im Projektordner ./build.sh bzw. make).
set -e
cd "$(dirname "$0")/../.."
for t in bau inspect probe tank evolve; do
  nice g++ -std=c++17 -pthread -O2 -Isrc -Icolony-core werkzeug/v019-bau/$t.cc bin/test-core.o -ldl -o werkzeug/v019-bau/$t
done
echo "Werkzeuge gebaut."

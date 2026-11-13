BUILD_DIR ?= bin
SANITIZE ?= 0
NATIVE ?= 1
LTO ?= 1
GCC_LTO := $(shell $(CXX) --version 2>/dev/null | head -1 | grep -vi clang)
CXX ?= c++
CPPFLAGS = -Isrc -Icolony-core -DFISH_RELEASE=\"$(shell cat VERSION)\"
CXXFLAGS = -std=c++17 -pthread -fopenmp-simd -Wall -Wextra -Wpedantic -Werror=return-type -MMD -MP
ifeq ($(SANITIZE),1)
CXXFLAGS += -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer
LDFLAGS += -fsanitize=address,undefined
else
CXXFLAGS += -O3 -fno-math-errno -fno-trapping-math -ffp-contract=fast -fno-signed-zeros -fassociative-math -freciprocal-math
ifeq ($(NATIVE),1)
CXXFLAGS += -march=native
# Nix shells set NIX_ENFORCE_NO_NATIVE=1, and their compiler wrapper then drops -march=native.
export NIX_ENFORCE_NO_NATIVE := 0
endif
ifeq ($(LTO),1)
CXXFLAGS += -flto=auto
ifneq ($(strip $(GCC_LTO)),)
CXXFLAGS += -ffat-lto-objects
endif
LDFLAGS += -O3 -flto=auto
endif
endif
SOURCES := $(wildcard src/*.cc colony-core/ann/*.cc colony-core/cppn/*.cc colony-core/evolution/*.cc) colony-core/field/substrate.cc colony-core/field/development.cc
OBJECTS := $(addprefix $(BUILD_DIR)/obj/,$(SOURCES:.cc=.o))
LDLIBS += -ldl
CORE_OBJECTS := $(filter-out $(BUILD_DIR)/obj/src/main.o,$(OBJECTS))
.DELETE_ON_ERROR:
.PHONY: all checks diagnostics objects FORCE
all: $(BUILD_DIR)/fish $(BUILD_DIR)/atelier
checks: $(BUILD_DIR)/atelier $(BUILD_DIR)/zuchtbecken $(BUILD_DIR)/invariants-tests $(BUILD_DIR)/compiler-tests
diagnostics: $(BUILD_DIR)/zuchtbecken $(BUILD_DIR)/verhaltenslabor
objects: $(OBJECTS)

# GCC fat objects contain optimized machine code as well as production LTO.
# Tests use the former: each executable links without optimizing the whole engine.
TEST_CORE := $(CORE_OBJECTS)
TEST_FLAGS := $(CXXFLAGS) $(LDFLAGS)
ifneq ($(strip $(GCC_LTO)),)
ifeq ($(LTO)$(SANITIZE),10)
TEST_FLAGS := $(filter-out -flto% -ffat-lto-objects -O3,$(TEST_FLAGS)) -fno-lto -O1
TEST_CORE := $(BUILD_DIR)/test-core.o
$(BUILD_DIR)/test-core.o: $(CORE_OBJECTS)
	$(CXX) -r -fno-lto $^ -o $@.new
	$(shell $(CXX) -print-prog-name=objcopy) --remove-section='.gnu.lto_*' $@.new
	mv $@.new $@

endif
endif

# Development and CPPN evaluation also influence the address search. Every object linked
# into the compiler must use the same generic arithmetic, independently of the aquarium.
# Without AVX, GCC notes that 32-byte vectors are passed differently since GCC 4.6. The compiler
# links only objects built here with these flags, so no other vector ABI is ever met.
ATELIER_FLAGS := $(filter-out -O% -march=% -mtune=% -mcpu=% -flto% -ffat-lto-objects,$(CXXFLAGS) $(LDFLAGS)) -O3 -fno-fast-math -ffp-contract=off -Wno-psabi
ATELIER_OBJECTS := $(patsubst $(BUILD_DIR)/obj/%,$(BUILD_DIR)/atelier-obj/%,$(CORE_OBJECTS))
ifeq ($(SANITIZE),1)
ATELIER_FLAGS := $(filter-out -O%,$(ATELIER_FLAGS)) -O1
endif

FORCE:
$(BUILD_DIR)/build-flags: FORCE build_config.py
	@mkdir -p $(dir $@)
	@{ printf '%s\n' '$(CXX) $(CPPFLAGS) $(CXXFLAGS) $(LDFLAGS)'; python3 -B build_config.py signature -- $(CXX) $(CPPFLAGS) $(filter-out -MMD -MP,$(CXXFLAGS)); } > $@.new
	@cmp -s $@.new $@ || mv $@.new $@
	@rm -f $@.new
$(OBJECTS): $(BUILD_DIR)/build-flags
$(BUILD_DIR)/atelier-build-flags: FORCE build_config.py
	@mkdir -p $(dir $@)
	@{ printf '%s\n' '$(CXX) $(CPPFLAGS) $(ATELIER_FLAGS)'; python3 -B build_config.py signature -- $(CXX) $(CPPFLAGS) $(filter-out -MMD -MP,$(ATELIER_FLAGS)); } > $@.new
	@cmp -s $@.new $@ || mv $@.new $@
	@rm -f $@.new
$(ATELIER_OBJECTS): $(BUILD_DIR)/atelier-build-flags
$(BUILD_DIR)/atelier-obj/%.o: %.cc
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(ATELIER_FLAGS) -MT '$(abspath $@)' -MT '$(patsubst $(CURDIR)/%,%,$(abspath $@))' -c $< -o $@
$(BUILD_DIR)/fish: $(OBJECTS)
	$(CXX) -pthread $(LDFLAGS) $^ $(LDLIBS) -o $@.new
	mv $@.new $@
$(BUILD_DIR)/obj/%.o: %.cc
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -MT '$(abspath $@)' -MT '$(patsubst $(CURDIR)/%,%,$(abspath $@))' -c $< -o $@
$(BUILD_DIR)/%-tests: tests/%.cc $(wildcard tests/*.hh) $(TEST_CORE) Makefile
	$(CXX) $(CPPFLAGS) $(TEST_FLAGS) $< $(TEST_CORE) $(LDLIBS) -o $@.new
	mv $@.new $@
$(BUILD_DIR)/compiler-tests: tests/compiler.cc $(wildcard tests/*.hh) $(ATELIER_OBJECTS) Makefile $(wildcard werkzeug/atelier*.hh) colony-core/field/contacts.hh
	$(CXX) $(CPPFLAGS) $(ATELIER_FLAGS) $< $(ATELIER_OBJECTS) $(LDLIBS) -o $@.new
	mv $@.new $@
.PHONY: starter
starter: $(BUILD_DIR)/atelier
	BUILD_DIR="$(abspath $(BUILD_DIR))" node werkzeug/fischbau.mjs
$(BUILD_DIR)/atelier: werkzeug/atelier.cc $(ATELIER_OBJECTS) Makefile $(wildcard werkzeug/atelier*.hh)
	$(CXX) $(CPPFLAGS) $(ATELIER_FLAGS) $< $(ATELIER_OBJECTS) $(LDLIBS) -o $@.new
	mv $@.new $@
$(BUILD_DIR)/zuchtbecken: werkzeug/zuchtbecken.cc src/life_recorder.hh $(TEST_CORE) Makefile
	$(CXX) $(CPPFLAGS) $(filter-out -O1,$(TEST_FLAGS)) -O3 $< $(TEST_CORE) $(LDLIBS) -o $@.new
	mv $@.new $@
$(BUILD_DIR)/beobachter: werkzeug/beobachter.cc $(TEST_CORE) Makefile
	$(CXX) $(CPPFLAGS) $(TEST_FLAGS) $< $(TEST_CORE) $(LDLIBS) -o $@.new
	mv $@.new $@
$(BUILD_DIR)/verhaltenslabor: werkzeug/verhaltenslabor.cc $(TEST_CORE) Makefile
	$(CXX) $(CPPFLAGS) $(filter-out -O1,$(TEST_FLAGS)) -O3 $< $(TEST_CORE) $(LDLIBS) -o $@.new
	mv $@.new $@
-include $(OBJECTS:.o=.d)
-include $(ATELIER_OBJECTS:.o=.d)
-include $(wildcard $(BUILD_DIR)/*-tests.d)


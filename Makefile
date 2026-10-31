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
.PHONY: all FORCE founder-tools
all: $(BUILD_DIR)/fish $(BUILD_DIR)/build-check
CORE_TESTS := $(shell python3 -B tests/suite.py core)
$(BUILD_DIR)/build-check: $(BUILD_DIR)/native-check $(BUILD_DIR)/interface-check
	@touch $@
$(BUILD_DIR)/native-check: $(addprefix $(BUILD_DIR)/,$(addsuffix -tests,$(CORE_TESTS))) tests/run_suite.py tests/suite.py
	BUILD_DIR="$(abspath $(BUILD_DIR))" python3 -B tests/run_suite.py --only $(CORE_TESTS) --no-build
	@touch $@
$(BUILD_DIR)/interface-check: $(BUILD_DIR)/fish $(wildcard ui/*.js *.py tests/*.js tests/*.py) viewer.html protocol_schema.json
	BUILD_DIR="$(abspath $(BUILD_DIR))" python3 -B tests/run_suite.py --only interface population_check profile_delta report --no-build
	@touch $@

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

# Optional v019 construction helpers use the same compiler, core and sanitizer settings.
FOUNDER_TOOLS := $(addprefix $(BUILD_DIR)/v019-bau/,bau inspect probe tank evolve)
founder-tools: $(FOUNDER_TOOLS)
$(BUILD_DIR)/v019-bau/%: werkzeug/v019-bau/%.cc $(wildcard werkzeug/v019-bau/*.hh) $(TEST_CORE) Makefile
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(TEST_FLAGS) -MT '$@' -MF '$@.d' $< $(TEST_CORE) $(LDLIBS) -o $@.new
	mv $@.new $@
-include $(wildcard $(BUILD_DIR)/v019-bau/*.d)

FORCE:
$(BUILD_DIR)/build-flags: FORCE build_config.py
	@mkdir -p $(dir $@)
	@{ printf '%s\n' '$(CXX) $(CPPFLAGS) $(CXXFLAGS) $(LDFLAGS)'; python3 -B build_config.py signature -- $(CXX) $(CPPFLAGS) $(filter-out -MMD -MP,$(CXXFLAGS)); } > $@.new
	@cmp -s $@.new $@ || mv $@.new $@
	@rm -f $@.new
$(OBJECTS): $(BUILD_DIR)/build-flags
$(BUILD_DIR)/fish: $(OBJECTS)
	$(CXX) -pthread $(LDFLAGS) $^ $(LDLIBS) -o $@.new
	mv $@.new $@
$(BUILD_DIR)/obj/%.o: %.cc
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -MT '$(abspath $@)' -MT '$(patsubst $(CURDIR)/%,%,$(abspath $@))' -c $< -o $@
$(BUILD_DIR)/%-tests: tests/%.cc $(wildcard tests/*.hh) $(TEST_CORE) Makefile
	$(CXX) $(CPPFLAGS) $(TEST_FLAGS) $< $(TEST_CORE) $(LDLIBS) -o $@.new
	mv $@.new $@
-include $(OBJECTS:.o=.d)
-include $(wildcard $(BUILD_DIR)/*-tests.d)


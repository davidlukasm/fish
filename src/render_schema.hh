#pragma once
#include <array>
#include <cstddef>
namespace fishsim {
namespace render_wire {
enum class Type { u8, i8, u16, i16, u32, i32, i64, f32 };
struct Field {
  Type type;
  std::size_t offset, size;
  double scale;
};
inline constexpr unsigned version = 23;
inline constexpr std::size_t header_bytes = 120;
enum class Kind {
  Fish = 0,
  Food = 1,
  Corpse = 2,
  Gamete = 3,
  Wound = 4,
  Invertebrate = 5,
  Count = 6
};
namespace fish_flag {
inline constexpr unsigned hatched = 1;
inline constexpr unsigned fertilised = 2;
inline constexpr unsigned nutrient_egg = 4;
inline constexpr unsigned egg_laying = 8;
inline constexpr unsigned clonal = 16;
inline constexpr unsigned egg_organs = 32;
inline constexpr unsigned sperm_organs = 64;
}
namespace fish {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t angle = 2;
inline constexpr std::size_t birth_step = 3;
inline constexpr std::size_t flags = 4;
inline constexpr std::size_t development = 5;
inline constexpr std::size_t red = 6;
inline constexpr std::size_t green = 7;
inline constexpr std::size_t blue = 8;
inline constexpr std::size_t health = 9;
inline constexpr std::size_t radius = 10;
inline constexpr std::size_t mass = 11;
inline constexpr std::size_t energy = 12;
inline constexpr std::size_t reserve_capacity = 13;
inline constexpr std::size_t egg_yolk = 14;
inline constexpr std::size_t egg_capacity = 15;
inline constexpr std::size_t sperm_store = 16;
inline constexpr std::size_t sperm_capacity = 17;
inline constexpr std::size_t tissue = 18;
inline constexpr std::size_t mouth_aperture = 19;
inline constexpr std::size_t mouth_pose = 20;
inline constexpr std::size_t bite_pose = 21;
inline constexpr std::size_t suction_pose = 22;
inline constexpr std::size_t defense = 23;
inline constexpr std::size_t aggression = 24;
inline constexpr std::size_t relative_speed = 25;
inline constexpr std::size_t tail = 26;
inline constexpr std::size_t impulse_left = 27;
inline constexpr std::size_t impulse_right = 28;
inline constexpr std::size_t impulse_forward = 29;
inline constexpr std::size_t motor_factor = 30;
inline constexpr std::size_t bladder_fill = 31;
inline constexpr std::size_t satiety = 32;
inline constexpr std::size_t pain = 33;
inline constexpr std::size_t fin_age_left = 34;
inline constexpr std::size_t fin_age_right = 35;
inline constexpr std::size_t fin_peak_tail = 36;
inline constexpr std::size_t fin_peak_left = 37;
inline constexpr std::size_t fin_peak_right = 38;
inline constexpr std::size_t morphology_asset = 39;
inline constexpr std::size_t hatch_radius = 40;
inline constexpr std::size_t birth_tissue = 41;
inline constexpr std::size_t hatch_step = 42;
inline constexpr std::size_t species = 43;
inline constexpr std::size_t gut_fill = 44;
inline constexpr std::size_t gut_energy = 45;
inline constexpr std::size_t gut_digestible = 46;
inline constexpr std::size_t digestion = 47;
inline constexpr std::size_t digested = 48;
inline constexpr std::size_t feeding_action = 49;
inline constexpr std::size_t feeding_action_age = 50;
inline constexpr std::size_t mouth_phase = 51;
inline constexpr std::size_t mouth_budget = 52;
inline constexpr std::size_t swallowed = 53;
inline constexpr std::size_t mouth_offset = 54;
inline constexpr std::size_t mouth_biting = 55;
inline constexpr std::size_t filtered = 56;
inline constexpr std::size_t mouth_cycle = 57;
inline constexpr std::array<Field, 58> fields = {{
    {Type::i32, 0, 4, 65536.0}, {Type::i32, 4, 4, 65536.0}, {Type::i16, 8, 2, 8192.0},
    {Type::i64, 10, 8, 1},      {Type::u8, 18, 1, 1},       {Type::u8, 19, 1, 255.0},
    {Type::u8, 20, 1, 255.0},   {Type::u8, 21, 1, 255.0},   {Type::u8, 22, 1, 255.0},
    {Type::u8, 23, 1, 255.0},   {Type::f32, 24, 4, 1},      {Type::f32, 28, 4, 1},
    {Type::u16, 32, 2, 65535},  {Type::f32, 34, 4, 1},      {Type::u16, 38, 2, 65535},
    {Type::f32, 40, 4, 1},      {Type::u16, 44, 2, 65535},  {Type::f32, 46, 4, 1},
    {Type::u16, 50, 2, 16.0},   {Type::f32, 52, 4, 1},      {Type::u16, 56, 2, 4096},
    {Type::u16, 58, 2, 4096},   {Type::u16, 60, 2, 4096},   {Type::u16, 62, 2, 4096},
    {Type::u16, 64, 2, 4096},   {Type::u8, 66, 1, 8.0},     {Type::i16, 67, 2, 8192},
    {Type::i16, 69, 2, 1024.0}, {Type::i16, 71, 2, 1024.0}, {Type::i16, 73, 2, 1024.0},
    {Type::u16, 75, 2, 4096},   {Type::u16, 77, 2, 4096},   {Type::u16, 79, 2, 4096},
    {Type::u16, 81, 2, 4096},   {Type::i32, 83, 4, 1},      {Type::i32, 87, 4, 1},
    {Type::f32, 91, 4, 1},      {Type::f32, 95, 4, 1},      {Type::f32, 99, 4, 1},
    {Type::u32, 103, 4, 1},     {Type::f32, 107, 4, 1},     {Type::u16, 111, 2, 16.0},
    {Type::i64, 113, 8, 1},     {Type::u32, 121, 4, 1},     {Type::f32, 125, 4, 1},
    {Type::f32, 129, 4, 1},     {Type::f32, 133, 4, 1},     {Type::f32, 137, 4, 1},
    {Type::f32, 141, 4, 1},     {Type::u8, 145, 1, 1},      {Type::u8, 146, 1, 1},
    {Type::f32, 147, 4, 1},     {Type::f32, 151, 4, 1},     {Type::f32, 155, 4, 1},
    {Type::f32, 159, 4, 1},     {Type::u8, 163, 1, 1},      {Type::f32, 164, 4, 1},
    {Type::u32, 168, 4, 1},
}};
inline constexpr std::size_t bytes = 172;
}
namespace food {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t energy = 2;
inline constexpr std::size_t birth_step = 3;
inline constexpr std::size_t bottom_step = 4;
inline constexpr std::size_t radius = 5;
inline constexpr std::size_t origin = 6;
inline constexpr std::size_t red = 7;
inline constexpr std::size_t green = 8;
inline constexpr std::size_t blue = 9;
inline constexpr std::array<Field, 10> fields = {{
    {Type::i32, 0, 4, 65536.0},
    {Type::i32, 4, 4, 65536.0},
    {Type::f32, 8, 4, 1},
    {Type::i64, 12, 8, 1},
    {Type::i64, 20, 8, 1},
    {Type::f32, 28, 4, 1},
    {Type::u8, 32, 1, 1},
    {Type::u8, 33, 1, 255.0},
    {Type::u8, 34, 1, 255.0},
    {Type::u8, 35, 1, 255.0},
}};
inline constexpr std::size_t bytes = 36;
}
namespace corpse {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t energy = 2;
inline constexpr std::size_t birth_step = 3;
inline constexpr std::size_t red = 4;
inline constexpr std::size_t green = 5;
inline constexpr std::size_t blue = 6;
inline constexpr std::size_t angle = 7;
inline constexpr std::size_t radius = 8;
inline constexpr std::size_t initial_energy = 9;
inline constexpr std::size_t hatched = 10;
inline constexpr std::size_t bone_age = 11;
inline constexpr std::size_t morphology_asset = 12;
inline constexpr std::size_t source_id = 13;
inline constexpr std::size_t species = 14;
inline constexpr std::size_t death_cause = 15;
inline constexpr std::size_t bone_time = 16;
inline constexpr std::size_t resting = 17;
inline constexpr std::size_t sink_phase = 18;
inline constexpr std::array<Field, 19> fields = {{
    {Type::i32, 0, 4, 65536.0}, {Type::i32, 4, 4, 65536.0}, {Type::f32, 8, 4, 1},
    {Type::i64, 12, 8, 1},      {Type::u8, 20, 1, 255.0},   {Type::u8, 21, 1, 255.0},
    {Type::u8, 22, 1, 255.0},   {Type::i16, 23, 2, 8192.0}, {Type::f32, 25, 4, 1},
    {Type::f32, 29, 4, 1},      {Type::u8, 33, 1, 1},       {Type::u32, 34, 4, 1},
    {Type::u32, 38, 4, 1},      {Type::i64, 42, 8, 1},      {Type::i64, 50, 8, 1},
    {Type::u8, 58, 1, 1},       {Type::f32, 59, 4, 1},      {Type::f32, 63, 4, 1},
    {Type::f32, 67, 4, 1},
}};
inline constexpr std::size_t bytes = 71;
}
namespace gamete {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t density = 2;
inline constexpr std::size_t red = 3;
inline constexpr std::size_t green = 4;
inline constexpr std::size_t blue = 5;
inline constexpr std::array<Field, 6> fields = {{
    {Type::i32, 0, 4, 65536.0},
    {Type::i32, 4, 4, 65536.0},
    {Type::f32, 8, 4, 1},
    {Type::u8, 12, 1, 255.0},
    {Type::u8, 13, 1, 255.0},
    {Type::u8, 14, 1, 255.0},
}};
inline constexpr std::size_t bytes = 15;
}
namespace wound {
inline constexpr std::size_t loss = 0;
inline constexpr std::size_t x = 1;
inline constexpr std::size_t y = 2;
inline constexpr std::size_t nx = 3;
inline constexpr std::size_t ny = 4;
inline constexpr std::size_t radius = 5;
inline constexpr std::size_t vx = 6;
inline constexpr std::size_t vy = 7;
inline constexpr std::array<Field, 8> fields = {{
    {Type::f32, 0, 4, 1},
    {Type::i32, 4, 4, 65536.0},
    {Type::i32, 8, 4, 65536.0},
    {Type::f32, 12, 4, 1},
    {Type::f32, 16, 4, 1},
    {Type::f32, 20, 4, 1},
    {Type::f32, 24, 4, 1},
    {Type::f32, 28, 4, 1},
}};
inline constexpr std::size_t bytes = 32;
}
namespace invertebrate {
inline constexpr std::size_t x = 0;
inline constexpr std::size_t y = 1;
inline constexpr std::size_t energy = 2;
inline constexpr std::size_t radius = 3;
inline constexpr std::size_t kind = 4;
inline constexpr std::size_t angle = 5;
inline constexpr std::size_t algae = 6;
inline constexpr std::size_t length = 7;
inline constexpr std::size_t morph = 8;
inline constexpr std::size_t state = 9;
inline constexpr std::size_t direction = 10;
inline constexpr std::size_t closed = 11;
inline constexpr std::size_t ground = 12;
inline constexpr std::size_t bed_depth = 13;
inline constexpr std::size_t body_length = 14;
inline constexpr std::size_t feeding_rate = 15;
inline constexpr std::size_t food_x = 16;
inline constexpr std::size_t food_y = 17;
inline constexpr std::size_t food_kind = 18;
inline constexpr std::size_t filtered = 19;
inline constexpr std::array<Field, 20> fields = {{
    {Type::i32, 0, 4, 65536}, {Type::i32, 4, 4, 65536},  {Type::f32, 8, 4, 1},
    {Type::f32, 12, 4, 1},    {Type::u8, 16, 1, 1},      {Type::f32, 17, 4, 1},
    {Type::f32, 21, 4, 1},    {Type::f32, 25, 4, 1},     {Type::f32, 29, 4, 1},
    {Type::f32, 33, 4, 1},    {Type::f32, 37, 4, 1},     {Type::f32, 41, 4, 1},
    {Type::f32, 45, 4, 1},    {Type::u16, 49, 2, 65535}, {Type::f32, 51, 4, 1},
    {Type::f32, 55, 4, 1},    {Type::f32, 59, 4, 1},     {Type::f32, 63, 4, 1},
    {Type::u8, 67, 1, 1},     {Type::f32, 68, 4, 1},
}};
inline constexpr std::size_t bytes = 72;
}
}
}

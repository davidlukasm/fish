#include "session_io.hh"
#include "perception.hh"
#include "retina.hh"
#include "opencl.hh"
#include "ecology.hh"
#include "founder_pool.hh"
#include "parallel.hh"
#include <dlfcn.h>
#include <chrono>
#include <cstring>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <memory>
#include <stdexcept>
namespace fishsim {
namespace {
std::array<double, 3> probe_color(const Field &f, const Body &b, const VisualEye &eye,
                                  const VisualObject &q) {
  auto color = b.perception().probe.color;
  const double strength = f.sediment_transmission(eye.x, eye.y, q.x, q.y);
  const auto foliage = f.grass_transmission(eye.x, eye.y, q.x, q.y);
  for (int c = 0; c < 3; ++c)
    color[c] *= strength * foliage[c];
  return f.filter_sperm(eye.x, eye.y, q.x, q.y, color);
}
}

namespace {
// OpenCL 1.2 ABI: the loader remains optional, including on machines without SDK headers.
using Int = std::int32_t;
using UInt = std::uint32_t;
using Bits = std::uint64_t;
using Handle = void *;
struct Api {
  void *library = nullptr;
  Int (*platforms)(UInt, Handle *, UInt *) = nullptr;
  Int (*devices)(Handle, Bits, UInt, Handle *, UInt *) = nullptr;
  Int (*info)(Handle, UInt, std::size_t, void *, std::size_t *) = nullptr;
  Handle (*context)(const std::intptr_t *, UInt, const Handle *,
                    void (*)(const char *, const void *, std::size_t, void *), void *,
                    Int *) = nullptr;
  Handle (*queue)(Handle, Handle, Bits, Int *) = nullptr;
  Handle (*program)(Handle, UInt, const char **, const std::size_t *, Int *) = nullptr;
  Int (*build)(Handle, UInt, const Handle *, const char *, void (*)(Handle, void *),
               void *) = nullptr;
  Int (*build_info)(Handle, Handle, UInt, std::size_t, void *, std::size_t *) = nullptr;
  Handle (*kernel)(Handle, const char *, Int *) = nullptr;
  Handle (*buffer)(Handle, Bits, std::size_t, void *, Int *) = nullptr;
  Int (*arg)(Handle, UInt, std::size_t, const void *) = nullptr;
  Int (*write)(Handle, Handle, UInt, std::size_t, std::size_t, const void *, UInt, const Handle *,
               Handle *) = nullptr;
  Int (*read)(Handle, Handle, UInt, std::size_t, std::size_t, void *, UInt, const Handle *,
              Handle *) = nullptr;
  Int (*run)(Handle, Handle, UInt, const std::size_t *, const std::size_t *, const std::size_t *,
             UInt, const Handle *, Handle *) = nullptr;
  Int (*finish)(Handle) = nullptr;
  Int (*event_info)(Handle, UInt, std::size_t, void *, std::size_t *) = nullptr;
  Int (*release_event)(Handle) = nullptr;
  Int (*release_buffer)(Handle) = nullptr;
  Int (*release_kernel)(Handle) = nullptr;
  Int (*release_program)(Handle) = nullptr;
  Int (*release_queue)(Handle) = nullptr;
  Int (*release_context)(Handle) = nullptr;
  template <class T> void symbol(T &fn, const char *name) {
    void *p = dlsym(library, name);
    if (!p)
      throw std::runtime_error(std::string("OpenCL-Funktion fehlt: ") + name);
    static_assert(sizeof(fn) == sizeof(p));
    std::memcpy(&fn, &p, sizeof(p));
  }
  void load() {
    const char *chosen = std::getenv("FISH_OPENCL_LIBRARY");
    if (chosen && *chosen) {
      library = dlopen(chosen, RTLD_NOW | RTLD_LOCAL);
      if (!library)
        throw std::runtime_error(std::string("OpenCL-Lader ") + chosen + ": " + dlerror());
    } else {
      for (const char *path :
           {"libOpenCL.so.1", "libOpenCL.so", "/run/opengl-driver/lib/libOpenCL.so.1",
            "/run/current-system/sw/lib/libOpenCL.so.1"})
        if ((library = dlopen(path, RTLD_NOW | RTLD_LOCAL)))
          break;
    }
    if (!library)
      throw std::runtime_error("OpenCL-Lader fehlt (libOpenCL.so.1)");
#define LOAD(member, name) symbol(member, "cl" name)
    LOAD(platforms, "GetPlatformIDs");
    LOAD(devices, "GetDeviceIDs");
    LOAD(info, "GetDeviceInfo");
    LOAD(context, "CreateContext");
    LOAD(queue, "CreateCommandQueue");
    LOAD(program, "CreateProgramWithSource");
    LOAD(build, "BuildProgram");
    LOAD(build_info, "GetProgramBuildInfo");
    LOAD(kernel, "CreateKernel");
    LOAD(buffer, "CreateBuffer");
    LOAD(arg, "SetKernelArg");
    LOAD(write, "EnqueueWriteBuffer");
    LOAD(read, "EnqueueReadBuffer");
    LOAD(run, "EnqueueNDRangeKernel");
    LOAD(finish, "Finish");
    LOAD(event_info, "GetEventProfilingInfo");
    LOAD(release_event, "ReleaseEvent");
    LOAD(release_buffer, "ReleaseMemObject");
    LOAD(release_kernel, "ReleaseKernel");
    LOAD(release_program, "ReleaseProgram");
    LOAD(release_queue, "ReleaseCommandQueue");
    LOAD(release_context, "ReleaseContext");
#undef LOAD
  }
  ~Api() {
    if (library)
      dlclose(library);
  }
};
const char *source = R"CLC(
float wrap(float x,float width){return x-width*floor(x/width);}
float delta(float x,float width){return x-width*floor(x/width+.5f);}
int ranges(float x,float radius,float width,int columns,float cell,int2* spans){
 x=wrap(x,width);int n=0;
 for(int shift=-1;shift<=1;shift++){float lo=x-radius+shift*width,hi=x+radius+shift*width;if(hi<0||lo>=width)continue;spans[n++]=(int2)(max(0,(int)floor(lo/cell)),min(columns-1,(int)floor(hi/cell)));}
 for(int i=1;i<n;i++)for(int j=i;j>0&&spans[j].x<spans[j-1].x;j--){int2 t=spans[j];spans[j]=spans[j-1];spans[j-1]=t;}return n;
}
float grid_density(float x,float y,int nx,int ny,int offset,__global const float* cfg,__global const float* dust){
 if(nx<1||ny<1)return 0.f;
 float gx=wrap(x,cfg[0])/cfg[0]*nx-.5f,gy=clamp(y/cfg[1]*ny-.5f,0.f,(float)(ny-1));int i=(int)floor(gx),j=(int)floor(gy),a=(i+nx)%nx,b=(a+1)%nx,k=min(ny-1,j+1);float fx=gx-i,fy=gy-j;
 return mix(mix(dust[offset+j*nx+a],dust[offset+j*nx+b],fx),mix(dust[offset+k*nx+a],dust[offset+k*nx+b],fx),fy)/(cfg[0]/nx*cfg[1]/ny);
}
float turbidity(float x,float y,__global const float* cfg,__global const float* dust){
 return cfg[17]*(grid_density(x,y,(int)cfg[4],(int)cfg[5],0,cfg,dust)+grid_density(x,y,(int)cfg[14],(int)cfg[15],(int)cfg[16],cfg,dust));
}
float stroke_distance(float hx,float hy,float w,float px,float py){float l2=hx*hx+hy*hy,s=l2>1.e-24f?clamp((px*hx+py*hy)/l2,-1.f,1.f):0.f;return hypot(px-s*hx,py-s*hy)-w;}
float stroke_crossings(float cx,float cy,float hx,float hy,float w,float dx,float dy){
 float d2=dx*dx+dy*dy;if(d2<1.e-24f||w<=0.f)return 0.f;float enter=INFINITY,leave=-INFINITY;
 for(int e=-1;e<=1;e+=2){float px=cx+e*hx,py=cy+e*hy,b=(px*dx+py*dy)/d2,c=(px*px+py*py-w*w)/d2,q=b*b-c;if(q>=0.f){float r=sqrt(q);enter=fmin(enter,b-r);leave=fmax(leave,b+r);}}
 float half=hypot(hx,hy);
 if(half>1.e-12f){float ux=hx/half,uy=hy/half,lo=-INFINITY,hi=INFINITY,at[2]={-(ux*cx+uy*cy),uy*cx-ux*cy},rate[2]={ux*dx+uy*dy,-uy*dx+ux*dy},limit[2]={half,w};
  for(int k=0;k<2;k++){if(fabs(rate[k])<1.e-15f){if(fabs(at[k])>limit[k])hi=-INFINITY;}else{float a=(-limit[k]-at[k])/rate[k],b=(limit[k]-at[k])/rate[k];lo=fmax(lo,fmin(a,b));hi=fmin(hi,fmax(a,b));}}
  if(hi>=lo){enter=fmin(enter,lo);leave=fmax(leave,hi);}}
 if(leave<enter)return 0.f;
 return fmin(2.f,fmax(0.f,fmin(1.f,leave)-fmax(0.f,enter))*sqrt(d2)/(2.f*w));
}
int clip(float a,float b,float* lo,float* hi){if(fabs(b)<1.e-12f)return a>=0;float crossing=-a/b;if(b>0)*lo=fmax(*lo,crossing);else *hi=fmin(*hi,crossing);return *hi>*lo;}
float4 attenuation_value(float4 q,__global const float* cfg,__global const float* dust,__global const float* illumination,__global const float4* plants,__global const int* plant_grid,__global const float4* surfaces,__global const int* surface_grid){
 float width=cfg[0],height=cfg[1],dx=delta(q.z-q.x,width),dy=q.w-q.y,d=hypot(dx,dy),integral=0.f;float4 foliage=(float4)(0.f);
 int n=max(1,(int)ceil(d/cfg[18]));for(int k=0;k<n;k++){float t=(k+.5f)/n;integral+=turbidity(q.x+t*dx,q.y+t*dy,cfg,dust)*d/n;}
 int columns=(int)cfg[9],rows=(int)cfg[10];float cell=cfg[8];
 for(int kind=0;kind<2;kind++){
  if(kind==0&&d<1.e-12f)continue;if(kind==1&&cfg[11]<=0)continue;float radius=d*.5f+(kind?cfg[11]+16.f:cfg[19]),mx=q.x+dx*.5f,my=(q.y+q.w)*.5f;int2 spans[3];int ns=ranges(mx,radius,width,columns,cell,spans),last=-1,top=max(0,(int)floor((my-radius)/cell)),bottom=min(rows-1,(int)floor((my+radius)/cell));
  __global const int* grid=kind?surface_grid:plant_grid;
  for(int r=0;r<ns;r++){int first=max(last+1,spans[r].x),end=spans[r].y;for(int j=top;j<=bottom;j++)for(int i=first;i<=end;i++){int bin=j*columns+i;for(int k=grid[bin];k<grid[bin+1];k++){int index=grid[k];
   if(kind==0){float4 p=plants[2*index],o=plants[2*index+1];if(o.x<0)continue;float px=delta(p.x-q.x,width),py=p.y-q.y;if(stroke_distance(p.z,p.w,o.x,dx-px,dy-py)<=0.f)continue;foliage+=stroke_crossings(px,py,p.z,p.w,o.x,dx,dy)*(float4)(o.y,o.z,o.w,0.f);}
   else {float4 a=surfaces[index*3],b=surfaces[index*3+1],e=surfaces[index*3+2];if(b.y>-.5f||(b.w<=0&&e.x<=0))continue;float px=delta(q.x-a.x,width),py=q.y-a.y,t=(px*a.z+py*a.w)/b.z,dt=(dx*a.z+dy*a.w)/b.z,gap=px*b.x+py*b.y,dg=dx*b.x+dy*b.y,lo=0.f,hi=1.f;
    if(clip(t,dt,&lo,&hi)&&clip(1.f-t,-dt,&lo,&hi)&&clip(gap,dg,&lo,&hi)&&clip(b.w+(e.x-b.w)*t-gap,(e.x-b.w)*dt-dg,&lo,&hi))integral+=cfg[17]*d*fmax(0.f,hi-lo);}
  }}last=max(last,end);}
 }
 int lx=(int)cfg[6],ly=(int)cfg[7];float light=1.f;
 if(lx>=2&&ly>=2){float gx=wrap(q.z,width)/width*(lx-1),gy=clamp(q.w/height,0.f,1.f)*(ly-1);int i=min(lx-2,(int)gx),j=min(ly-2,(int)gy);float fx=gx-i,fy=gy-j;light=mix(mix(illumination[j*lx+i],illumination[j*lx+i+1],fx),mix(illumination[(j+1)*lx+i],illumination[(j+1)*lx+i+1],fx),fy);}
 light*=1.f-(1.f-cfg[2])*clamp(q.w/height,0.f,1.f);return cfg[13]*light*exp2(-integral/cfg[3])*exp2(-foliage);
}

#define ENV_ARGS __global const float* cfg,__global const float* dust,__global const float* illumination,__global const float4* plants,__global const int* plant_grid,__global const float4* surfaces,__global const int* surface_grid
#define ENV cfg,dust,illumination,plants,plant_grid,surfaces,surface_grid
__kernel void attenuation(__global const float4* queries,ENV_ARGS,__global float* result){
 int id=get_global_id(0);if(id<(int)cfg[12]){float4 v=attenuation_value(queries[id],ENV);result[3*id]=v.x;result[3*id+1]=v.y;result[3*id+2]=v.z;}
}
)CLC";
ComputeStatus status;
bool checked = false, validated = false;
void require(Int code, const char *where) {
  if (code)
    throw std::runtime_error(std::string(where) + " (" + std::to_string(code) + ")");
}
std::string platform_failure(Int code) {
  std::string reason = "Keine OpenCL-Plattform (" + std::to_string(code) + ")";
  const char *specified = std::getenv("OCL_ICD_VENDORS");
  if (!specified || !*specified)
    specified = std::getenv("OPENCL_VENDOR_PATH");
  std::string path = specified && *specified ? specified : "/etc/OpenCL/vendors";
  reason += "; Treibersuche: " + path;
  std::vector<std::string> vendors;
  std::error_code error;
  auto read_icd = [&](const std::filesystem::path &file) {
    std::ifstream input(file);
    std::string name;
    if (std::getline(input, name)) {
      if (!name.empty() && name.back() == '\r')
        name.pop_back();
      if (!name.empty())
        vendors.push_back(name);
    }
  };
  if (std::filesystem::is_directory(path, error)) {
    for (auto i = std::filesystem::directory_iterator(path, error);
         !error && i != std::filesystem::directory_iterator() && vendors.size() < 4;
         i.increment(error))
      if (i->path().extension() == ".icd")
        read_icd(i->path());
    if (vendors.empty())
      reason += " enthält keine ICD-Einträge";
  } else if (std::filesystem::path(path).extension() == ".icd")
    read_icd(path);
  else if (specified && *specified)
    vendors.push_back(path);
  for (const auto &vendor : vendors) {
    void *handle = dlopen(vendor.c_str(), RTLD_NOW | RTLD_LOCAL);
    if (handle) {
      reason += "; " + vendor + " lädt, meldet aber keine Plattform";
      dlclose(handle);
    } else {
      const char *detail = dlerror();
      reason += "; " + vendor + ": " + (detail ? detail : "nicht ladbar");
    }
  }
  return reason;
}
struct Engine {
  Api api;
  Handle ctx = nullptr, queue = nullptr, normal_queue = nullptr, profile_queue = nullptr,
         program = nullptr, kernel = nullptr;
  std::array<Handle, 9> buffers{};
  std::array<std::size_t, 9> capacities{};
  std::array<std::vector<unsigned char>, 9> resident;
  std::vector<double> light_source;
  Handle device_ = nullptr;
  struct Event {
    Handle handle = nullptr;
    int kind;
  };
  std::vector<Event> events;
  bool profiling = false, profile_valid = true;
  ~Engine() {
    if (normal_queue)
      api.finish(normal_queue);
    if (profile_queue)
      api.finish(profile_queue);
    for (const auto &e : events)
      if (e.handle)
        api.release_event(e.handle);
    for (auto p : buffers)
      if (p)
        api.release_buffer(p);
    if (kernel)
      api.release_kernel(kernel);
    if (program)
      api.release_program(program);
    if (profile_queue)
      api.release_queue(profile_queue);
    if (normal_queue)
      api.release_queue(normal_queue);
    if (ctx)
      api.release_context(ctx);
  }
  void initialize(bool cpu) {
    api.load();
    UInt n = 0;
    Int found = api.platforms(0, nullptr, &n);
    if (found || !n)
      throw std::runtime_error(platform_failure(found));
    std::vector<Handle> platforms(n);
    require(api.platforms(n, platforms.data(), nullptr), "OpenCL-Plattformliste");
    Handle device = nullptr;
    for (auto p : platforms) {
      UInt count = 0;
      if (!api.devices(p, cpu ? Bits(2) : Bits(4), 0, nullptr, &count) && count) {
        std::vector<Handle> devices(count);
        require(api.devices(p, cpu ? Bits(2) : Bits(4), count, devices.data(), nullptr),
                "OpenCL-Geräteliste");
        device = devices[0];
        break;
      }
    }
    if (!device)
      throw std::runtime_error(cpu ? "Kein OpenCL-CPU-Gerät" : "Keine OpenCL-GPU");
    char name[512]{};
    require(api.info(device, 0x102b, sizeof(name), name, nullptr), "OpenCL-Gerätename");
    status.device = name;
    Int error = 0;
    ctx = api.context(nullptr, 1, &device, nullptr, nullptr, &error);
    require(error, "OpenCL-Kontext");
    normal_queue = queue = api.queue(ctx, device, 0, &error);
    device_ = device;
    require(error, "OpenCL-Warteschlange");
    program = api.program(ctx, 1, &source, nullptr, &error);
    require(error, "OpenCL-Programm");
    error = api.build(program, 1, &device, "-cl-std=CL1.2", nullptr, nullptr);
    if (error) {
      std::size_t size = 0;
      api.build_info(program, device, 0x1183, 0, nullptr, &size);
      std::string log(size, '\0');
      if (size)
        api.build_info(program, device, 0x1183, size, log.data(), nullptr);
      throw std::runtime_error("OpenCL-Compiler: " + log.substr(0, 1200));
    }
    kernel = api.kernel(program, "attenuation", &error);
    require(error, "OpenCL-Kernel");
  }
  void set_profiling(bool enabled) {
    require(api.finish(queue), "OpenCL-Warteschlangenwechsel");
    if (enabled && !profile_queue) {
      Int error = 0;
      profile_queue = api.queue(ctx, device_, 2, &error);
      require(error, "OpenCL-Messwarteschlange");
    }
    profiling = enabled;
    queue = enabled ? profile_queue : normal_queue;
  }
  // Device timestamps exclude host packing, queue submission and waiting gaps.
  Handle *event(int kind) {
    if (!profiling)
      return nullptr;
    events.push_back({nullptr, kind});
    return &events.back().handle;
  }
  void collect() {
    if (!profiling)
      return;
    for (const auto &e : events)
      if (e.handle) {
        Bits begin = 0, end = 0;
        if (api.event_info(e.handle, 0x1282, sizeof(begin), &begin, nullptr) ||
            api.event_info(e.handle, 0x1283, sizeof(end), &end, nullptr) || end < begin)
          profile_valid = false;
        else {
          double ms = (end - begin) * 1.e-6;
          switch (e.kind) {
          case 0:
            status.upload_ms += ms;
            break;
          case 1:
            status.filter_ms += ms;
            break;
          case 3:
            status.download_ms += ms;
            break;
          }
        }
        api.release_event(e.handle);
      }
    events.clear();
    status.device_profiling = profile_valid;
  }
  void reserve(int slot, std::size_t bytes) {
    bytes = std::max<std::size_t>(16, bytes);
    if (bytes > capacities[slot]) {
      if (buffers[slot]) {
        api.release_buffer(buffers[slot]);
        buffers[slot] = nullptr;
      }
      Int error = 0;
      std::size_t capacity = 16;
      while (capacity < bytes)
        capacity *= 2;
      buffers[slot] = api.buffer(ctx, 1, capacity, nullptr, &error);
      require(error, "OpenCL-Puffer");
      capacities[slot] = capacity;
    }
  }
  template <class T> void upload(int slot, const std::vector<T> &values) {
    const auto bytes = values.size() * sizeof(T);
    auto &saved = resident[slot];
    reserve(slot, bytes);
    if (saved.size() == bytes &&
        (bytes == 0 || std::memcmp(saved.data(), values.data(), bytes) == 0)) {
      status.reused_bytes += bytes;
      return;
    }
    saved.resize(bytes);
    if (bytes) {
      std::memcpy(saved.data(), values.data(), bytes);
      require(api.write(queue, buffers[slot], 0, 0, bytes, saved.data(), 0, nullptr, event(0)),
              "OpenCL-Upload");
      status.uploaded_bytes += bytes;
    }
  }
  void arguments(Handle target, std::initializer_list<int> slots) {
    UInt at = 0;
    for (auto slot : slots)
      require(api.arg(target, at++, sizeof(Handle), &buffers[slot]), "OpenCL-Argument");
  }
  void launch(Handle target, std::size_t size) {
    if (!size)
      return;
    std::size_t local = 64, count = (size + local - 1) / local * local;
    require(api.run(queue, target, 1, nullptr, &count, &local, 0, nullptr, event(1)),
            "OpenCL-Ausführung");
  }
  void read(int slot, std::vector<float> &output) {
    if (!output.empty())
      require(api.read(queue, buffers[slot], 1, 0, output.size() * sizeof(float), output.data(), 0,
                       nullptr, event(3)),
              "OpenCL-Ergebnis");
    else
      require(api.finish(queue), "OpenCL-Abschluss");
    collect();
  }
};
std::unique_ptr<Engine> engine;
bool ready() {
  if (status.mode == "cpu")
    return false;
  if (!checked) {
    checked = true;
    try {
      auto candidate = std::make_unique<Engine>();
      candidate->initialize(status.mode.rfind("opencl-cpu", 0) == 0);
      engine = std::move(candidate);
      status.available = true;
      status.reason.clear();
    } catch (const std::exception &e) {
      status.reason = e.what();
      for (char &c : status.reason)
        if (static_cast<unsigned char>(c) < 32)
          c = ' ';
    }
  }
  return engine != nullptr;
}
std::vector<Int> grid_data(const SpatialGrid &grid) {
  std::vector<Int> data(grid.bins.size() + 1);
  for (std::size_t i = 0; i < grid.bins.size(); ++i) {
    data[i] = Int(data.size());
    for (auto id : grid.bins[i])
      data.push_back(Int(id));
  }
  data[grid.bins.size()] = Int(data.size());
  return data;
}
// Only optical queries, environment and attenuation factors remain resident.
void upload_environment(const Field &f, std::size_t query_count) {
  std::vector<float> cfg{float(f.geometry().width),
                         float(f.geometry().height),
                         float(f.env().light_bottom),
                         float(f.env().sediment_path),
                         float(f.sediment().columns),
                         float(f.sediment().rows),
                         float(f.lighting().columns),
                         float(f.lighting().rows),
                         float(f.vegetation().plant_grid.cell),
                         float(f.vegetation().plant_grid.columns),
                         float(f.vegetation().plant_grid.rows),
                         float(f.sediment().max_sediment_depth),
                         float(query_count),
                         float(f.daylight()),
                         float(f.food_web().plankton.nonempty ? f.food_web().plankton.columns : 0),
                         float(f.food_web().plankton.nonempty ? f.food_web().plankton.rows : 0),
                         float(f.sediment().suspended.size()),
                         float(optical_density_scale),
                         float(optical_sample_spacing),
                         float(f.vegetation().indexed_plant_radius)};
  std::vector<float> dust(f.sediment().suspended.begin(), f.sediment().suspended.end()), plants,
      surfaces;
  if (f.food_web().plankton.nonempty)
    dust.insert(dust.end(), f.food_web().plankton.energy.begin(),
                f.food_web().plankton.energy.end());
  plants.reserve(f.vegetation().plants.size() * 8);
  surfaces.reserve(f.vegetation().surfaces.size() * 12);
  // Two float4 per part: centre and half vector; half-width (negative: no foliage) and the
  // optical depth of one crossing per colour channel.
  for (const auto &p : f.vegetation().plants) {
    const auto depth = f.foliage_depth(p.organ_kind);
    for (float x : {float(p.x), float(p.y), float(p.hx), float(p.hy),
                    p.kind == 5 ? float(stroke_width(p)) : -1.f, float(depth[0]), float(depth[1]),
                    float(depth[2])})
      plants.push_back(x);
  }
  for (std::size_t i = 0; i < f.vegetation().surfaces.size(); ++i) {
    const auto &s = f.vegetation().surfaces[i];
    auto e = f.sediment_edges(i);
    for (float x :
         {float(s.a.x), float(s.a.y), float(s.b.x - s.a.x), float(s.b.y - s.a.y), float(s.normal.x),
          float(s.normal.y), float(s.length * s.length), float(e[0]), float(e[1]),
          float(std::clamp(s.algae / std::max(1e-12, f.env().algae_capacity * s.length / 16), 0.,
                           1.)),
          0.f, 0.f})
      surfaces.push_back(x);
  }
  auto pg = grid_data(f.vegetation().plant_grid), sg = grid_data(f.vegetation().surface_grid);
  engine->upload(1, cfg);
  engine->upload(2, dust);
  if (engine->light_source != f.lighting().illumination) {
    engine->light_source = f.lighting().illumination;
    engine->upload(
        3, std::vector<float>(f.lighting().illumination.begin(), f.lighting().illumination.end()));
  } else {
    engine->reserve(3, f.lighting().illumination.size() * sizeof(float));
    status.reused_bytes += f.lighting().illumination.size() * sizeof(float);
  }
  engine->upload(4, plants);
  engine->upload(5, pg);
  engine->upload(6, surfaces);
  engine->upload(7, sg);
}
std::array<double, 3> reference(const Field &f, const std::array<double, 4> &q) {
  const double base = f.light(q[2], q[3]) * f.sediment_transmission(q[0], q[1], q[2], q[3]);
  auto foliage = f.grass_transmission(q[0], q[1], q[2], q[3]);
  for (auto &c : foliage)
    c *= base;
  return foliage;
}
}
void configure_compute(const std::string &mode) {
  if (mode != "cpu" && mode != "opencl-optics" && mode != "opencl-cpu-optics" &&
      mode != "opencl-graphics")
    throw std::runtime_error("Berechnung: cpu oder opencl-optics erwartet");
  engine.reset();
  status = ComputeStatus{};
  status.mode = mode == "opencl-graphics" ? "opencl-optics" : mode;
  checked = validated = false;
}
bool opencl_loader_available() {
  try {
    Api api;
    api.load();
    return true;
  } catch (...) {
    return false;
  }
}
const ComputeStatus &compute_status() {
  return status;
}
bool opencl_attenuation(const Field &f, const std::vector<std::array<double, 4>> &queries,
                        std::vector<float> &output) {
  output.clear();
  status.active = false;
  status.milliseconds = status.preparation_ms = status.execution_ms = status.fallback_ms =
      status.upload_ms = status.filter_ms = status.download_ms = 0;
  status.queries = status.fallback_queries = status.uploaded_bytes = status.reused_bytes = 0;
  if (!ready() || queries.empty())
    return false;
  auto begin = std::chrono::steady_clock::now();
  try {
    if (f.vegetation().plant_grid.columns != f.vegetation().surface_grid.columns ||
        f.vegetation().plant_grid.rows != f.vegetation().surface_grid.rows ||
        f.vegetation().plant_grid.cell != f.vegetation().surface_grid.cell ||
        f.sediment().suspended.empty())
      throw std::runtime_error("Umweltraster noch nicht bereit");
    std::vector<float> q;
    q.reserve(queries.size() * 4);
    for (auto a : queries)
      for (double x : a)
        q.push_back(float(x));
    upload_environment(f, queries.size());
    engine->upload(0, q);
    output.resize(3 * queries.size());
    engine->reserve(8, output.size() * sizeof(float));
    engine->arguments(engine->kernel, {0, 1, 2, 3, 4, 5, 6, 7, 8});
    engine->launch(engine->kernel, queries.size());
    engine->read(8, output);
    // Three colour channels per query.
    for (std::size_t i = 0; i < queries.size(); ++i) {
      if (output[3 * i] == -1) {
        const auto cpu = reference(f, queries[i]);
        for (int c = 0; c < 3; ++c)
          output[3 * i + c] = float(cpu[c]);
        ++status.fallback_queries;
      }
      for (int c = 0; c < 3; ++c)
        if (!std::isfinite(output[3 * i + c]) || output[3 * i + c] < 0 ||
            output[3 * i + c] > 1.00001f)
          throw std::runtime_error("Ungültiges OpenCL-Ergebnis");
    }
    if (!validated) {
      std::size_t samples = std::min<std::size_t>(64, queries.size());
      for (std::size_t k = 0; k < samples; ++k) {
        auto i = k * queries.size() / samples;
        const auto cpu = reference(f, queries[i]);
        for (int c = 0; c < 3; ++c)
          if (std::abs(output[3 * i + c] - cpu[c]) > 3.e-4)
            throw std::runtime_error("OpenCL-Kontrollvergleich weicht ab; CPU übernimmt");
      }
      validated = true;
    }
    status.active = true;
    status.queries = queries.size();
    status.milliseconds =
        std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
    return true;
  } catch (const std::exception &e) {
    status.reason = e.what();
    for (char &c : status.reason)
      if (static_cast<unsigned char>(c) < 32)
        c = ' ';
    status.available = false;
    engine.reset();
    output.clear();
    return false;
  }
}
bool prepare_opencl_objects(Ecosystem &world, std::vector<std::vector<VisualObject>> &objects) {
  if (status.mode != "opencl-optics" && status.mode != "opencl-cpu-optics")
    return false;
  status.active = false;
  status.milliseconds = status.preparation_ms = status.execution_ms = status.fallback_ms =
      status.upload_ms = status.filter_ms = status.download_ms = 0;
  status.queries = status.fallback_queries = status.uploaded_bytes = status.reused_bytes = 0;
  if (!ready())
    return false;
  const auto begin = std::chrono::steady_clock::now();
  objects.assign(world.fish.size(), {});
  parallel(objects.size(), world.workers, [&](std::size_t i) {
    const auto &p = world.fish[i];
    if (p.body.alive && p.body.hatched)
      objects[i] = visual_objects(p.body, p.genome, world.field, false);
  });
  std::vector<std::array<VisualEye, 2>> origins(objects.size());
  for (std::size_t i = 0; i < objects.size(); ++i)
    if (!objects[i].empty())
      origins[i] = visual_origins(world.fish[i].body, *world.fish[i].genome.interface, world.field);
  std::vector<std::size_t> offsets(objects.size() + 1);
  for (std::size_t i = 0; i < objects.size(); ++i)
    offsets[i + 1] = offsets[i] + objects[i].size();
  if (!offsets.back()) {
    status.active = true;
    return true;
  }
  std::vector<std::array<double, 4>> queries(offsets.back());
  parallel(objects.size(), world.workers, [&](std::size_t i) {
    for (std::size_t k = 0; k < objects[i].size(); ++k) {
      const auto &q = objects[i][k];
      const auto &eye = origins[i][q.eye >= 0 ? q.eye : 0];
      queries[offsets[i] + k] = {eye.x, eye.y, q.x, q.y};
    }
  });
  const auto prepared_at = std::chrono::steady_clock::now();
  std::vector<float> factors;
  if (!opencl_attenuation(world.field, queries, factors))
    return false;
  const auto executed_at = std::chrono::steady_clock::now();
  parallel(objects.size(), world.workers, [&](std::size_t i) {
    const auto &b = world.fish[i].body;
    for (std::size_t k = 0; k < objects[i].size(); ++k) {
      auto &q = objects[i][k];
      const auto &eye = origins[i][q.eye >= 0 ? q.eye : 0];
      if (q.kind == 6) {
        q.color = probe_color(world.field, b, eye, q);
        continue;
      }
      for (int c = 0; c < 3; ++c)
        q.color[c] *= factors[3 * (offsets[i] + k) + c];
      q.color = world.field.filter_sperm(eye.x, eye.y, q.x, q.y, q.color);
    }
  });
  const auto end = std::chrono::steady_clock::now();
  status.preparation_ms = std::chrono::duration<double, std::milli>(prepared_at - begin).count();
  status.execution_ms =
      std::chrono::duration<double, std::milli>(executed_at - prepared_at).count();
  status.fallback_ms = std::chrono::duration<double, std::milli>(end - executed_at).count();
  status.milliseconds = std::chrono::duration<double, std::milli>(end - begin).count();
  return true;
}
void write_compute_status(std::ostream &out) {
  out << "{\"mode\":" << json_quoted(status.mode)
      << ",\"active\":" << (status.active ? "true" : "false")
      << ",\"available\":" << (status.available ? "true" : "false")
      << ",\"device\":" << json_quoted(status.device)
      << ",\"reason\":" << json_quoted(status.reason) << ",\"queries\":" << status.queries
      << ",\"fallback_queries\":" << status.fallback_queries
      << ",\"uploaded_bytes\":" << status.uploaded_bytes
      << ",\"reused_bytes\":" << status.reused_bytes << ",\"milliseconds\":" << status.milliseconds
      << ",\"preparation_ms\":" << status.preparation_ms
      << ",\"execution_ms\":" << status.execution_ms << ",\"fallback_ms\":" << status.fallback_ms
      << '}';
}
int benchmark_opencl(std::ostream &out, int workers, int fish_count, int steps) {
  const auto requested = status.mode;
  configure_compute(requested);
  auto prepare_view = [&](Ecosystem &scene, std::vector<std::vector<float>> &view) {
    std::vector<std::vector<VisualObject>> objects;
    if (!prepare_opencl_objects(scene, objects))
      return false;
    auto begin = std::chrono::steady_clock::now();
    view.assign(scene.fish.size(), {});
    parallel(view.size(), scene.workers, [&](std::size_t i) {
      const auto &p = scene.fish[i];
      if (p.body.alive && p.body.hatched)
        view[i] = visual_stimuli(p.body, p.genome, scene.field, &objects[i]);
    });
    status.milliseconds +=
        std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
    return true;
  };
  if (!ready()) {
    out << "CPU: " << status.reason << '\n';
    return 2;
  }
  Ecosystem w(42);
  w.starter_world();
  auto &f = w.field;
  for (std::size_t i = 0; i < f.sediment().suspended.size(); ++i)
    if (i % 11 == 0)
      f.set_suspended_sediment(i, .5);
  f.index({});
  Rng random(42);
  std::vector<std::array<double, 4>> queries;
  for (int i = 0; i < 32768; ++i) {
    double x = random.uniform() * f.geometry().width, y = random.uniform() * f.geometry().height,
           a = random.uniform() * 2 * PI, r = random.uniform() * RANGE;
    queries.push_back({x, y, f.wrap_x(x + r * std::cos(a)),
                       std::clamp(y + r * std::sin(a), .01, f.geometry().height - .01)});
  }
  std::vector<float> gpu;
  std::vector<std::array<double, 3>> cpu(queries.size());
  if (!opencl_attenuation(f, queries, gpu)) {
    out << "CPU: " << status.reason << '\n';
    return 2;
  }
  parallel(queries.size(), workers, [&](std::size_t i) { cpu[i] = reference(f, queries[i]); });
  double cpu_ms = 0, gpu_ms = 0;
  for (int k = 0; k < 5; ++k) {
    auto begin = std::chrono::steady_clock::now();
    parallel(queries.size(), workers, [&](std::size_t i) { cpu[i] = reference(f, queries[i]); });
    cpu_ms += std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin)
                  .count() /
              5;
  }
  for (int k = 0; k < 5; ++k) {
    if (!opencl_attenuation(f, queries, gpu))
      return 2;
    gpu_ms += status.milliseconds / 5;
  }
  double error = 0;
  for (std::size_t i = 0; i < gpu.size(); ++i)
    error = std::max(error, std::abs(cpu[i / 3][i % 3] - gpu[i]));
  out << std::fixed << std::setprecision(3) << status.device
      << "\nModus: " << "GPU-Sichtdämpfung, CPU-Augenbilder"
      << "\nSichtdämpfung: " << queries.size() << " Abfragen, CPU (" << workers << " Threads) "
      << cpu_ms << " ms, OpenCL einschließlich Packen und Übertragung " << gpu_ms
      << " ms, maximaler absoluter Fehler " << std::setprecision(7) << error << "\n";
  if (error >= 3.e-4)
    return 1;

  Genome::begin_run(42);
  default_development_options.workers = workers;
  FounderPool pool;
  pool.load(true);
  for (const auto &entry : pool.entries)
    w.add_pool_founder(entry.genome);
  w.workers = workers;
  w.seed(pool.select(w.rng, starting_founder_count(fish_count)), fish_count, 60);
  const auto mode = status.mode;
  status.mode = "cpu";
  for (int k = 0; k < 10; ++k)
    w.tick();
  status.mode = mode;
  std::vector<std::vector<float>> prepared;
  if (!prepare_view(w, prepared)) {
    out << "CPU-Rückfall: " << status.reason << '\n';
    return 2;
  }
  double vision_cpu = 0, vision_gpu = 0, vision_error = 0;
  std::size_t eyes = 0;
  std::vector<std::vector<float>> cpu_vision(w.fish.size());
  auto cpu_view = [&]() {
    auto begin = std::chrono::steady_clock::now();
    parallel(w.fish.size(), workers, [&](std::size_t i) {
      const auto &p = w.fish[i];
      if (p.body.alive && p.body.hatched)
        cpu_vision[i] = visual_stimuli(p.body, p.genome, w.field);
    });
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin)
        .count();
  };
  cpu_view();
  for (int k = 0; k < 5; ++k) {
    auto cl_view = [&]() {
      if (!prepare_view(w, prepared)) {
        out << "CPU-Rückfall: " << status.reason << '\n';
        return false;
      }
      vision_gpu += status.milliseconds / 5;
      return true;
    };
    if (k % 2) {
      if (!cl_view())
        return 2;
      vision_cpu += cpu_view() / 5;
    } else {
      vision_cpu += cpu_view() / 5;
      if (!cl_view())
        return 2;
    }
  }
  for (std::size_t i = 0; i < w.fish.size(); ++i)
    if (!cpu_vision[i].empty())
      for (const auto &ray : w.fish[i].genome.interface->visual[0]) {
        ++eyes;
        vision_error = std::max(
            vision_error, std::abs(double(cpu_vision[i][ray.second] - prepared[i][ray.second])));
      }
  out << std::setprecision(3) << "Wahrnehmung (unveränderte Szene): " << eyes << " Augenwerte, CPU "
      << vision_cpu << " ms, OpenCL einschließlich Vorbereitung und Übertragung " << vision_gpu
      << " ms, Faktor " << vision_cpu / vision_gpu << ", maximaler absoluter Fehler "
      << std::setprecision(7) << vision_error << '\n'
      << std::flush;
  if (vision_error >= 3.e-4) {
    out << "Augenbildvergleich fehlgeschlagen\n";
    return 1;
  }
  std::array<double, 10> cpu_phases{}, gpu_phases{};
  double perception_ms = 0, preparation_ms = 0, execution_ms = 0, fallback_ms = 0;
  std::array<double, 3> cpu_trials{}, gpu_trials{};
  std::size_t batches = 0, uploaded = 0, reused = 0, query_sum = 0, fallbacks = 0;
  for (int trial = 0; trial < 3; ++trial) {
    auto measure = [&](bool gpu) {
      auto sample = w.fork();
      sample.profile_steps = true;
      status.mode = gpu ? mode : "cpu";
      if (gpu && !prepare_view(sample, prepared))
        throw std::runtime_error(status.reason);
      if (steps >= 1000)
        out << "Durchlauf " << trial + 1 << "/3 · " << (gpu ? "OpenCL" : "CPU") << " · " << steps
            << " Schritte …\n"
            << std::flush;
      auto begin = std::chrono::steady_clock::now();
      for (int k = 0; k < steps; ++k) {
        sample.tick();
        for (std::size_t j = 0; j < sample.step_ms.size(); ++j)
          (gpu ? gpu_phases : cpu_phases)[j] += sample.step_ms[j];
        if (gpu) {
          if (!status.active)
            throw std::runtime_error(status.reason);
          ++batches;
          perception_ms += status.milliseconds;
          preparation_ms += status.preparation_ms;
          execution_ms += status.execution_ms;
          fallback_ms += status.fallback_ms;
          uploaded += status.uploaded_bytes;
          reused += status.reused_bytes;
          query_sum += status.queries;
          fallbacks += status.fallback_queries;
        }
      }
      return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin)
                 .count() /
             steps;
    };
    try {
      if (trial % 2) {
        gpu_trials[trial] = measure(true);
        cpu_trials[trial] = measure(false);
      } else {
        cpu_trials[trial] = measure(false);
        gpu_trials[trial] = measure(true);
      }
    } catch (const std::exception &e) {
      out << "CPU-Rückfall: " << e.what() << '\n';
      return 2;
    }
    out << std::setprecision(2) << "Durchlauf " << trial + 1 << ": CPU " << cpu_trials[trial]
        << " ms/Schritt, OpenCL " << gpu_trials[trial] << " ms/Schritt, Faktor "
        << cpu_trials[trial] / gpu_trials[trial] << '\n'
        << std::flush;
  }
  status.mode = mode;
  std::sort(cpu_trials.begin(), cpu_trials.end());
  std::sort(gpu_trials.begin(), gpu_trials.end());
  cpu_ms = cpu_trials[1];
  gpu_ms = gpu_trials[1];
  out << "Gesamtsimulation: Median aus 3 × " << steps << " Schritten ab demselben Spielstand ("
      << w.fish.size() << " Startfische), CPU " << cpu_ms << " ms/Schritt [" << cpu_trials[0] << "–"
      << cpu_trials[2] << "], OpenCL " << gpu_ms << " ms/Schritt [" << gpu_trials[0] << "–"
      << gpu_trials[2] << "], Faktor " << cpu_ms / gpu_ms << ", " << batches << " OpenCL-Batches\n";
  out << "Simulationsphasen (ms/Schritt · CPU / OpenCL):\n";
  for (std::size_t j = 0; j < cpu_phases.size(); ++j)
    out << "  " << Ecosystem::step_phase_names[j] << ": " << cpu_phases[j] / batches << " / "
        << gpu_phases[j] / batches << '\n';
  out << "OpenCL-Phase pro Schritt: " << perception_ms / batches << " ms · Vorbereitung "
      << preparation_ms / batches << ", OpenCL/Übertragung " << execution_ms / batches
      << ", CPU-Nachlauf " << fallback_ms / batches << "\n";
  // Profile a separate replay so device events do not distort the throughput comparison.
  std::array<double, 3> device_ms{};
  bool device_profiling = true;
  const int diagnostics = std::min(steps, 100);
  try {
    auto diagnostic = w.fork();
    engine->set_profiling(true);
    if (!prepare_view(diagnostic, prepared))
      throw std::runtime_error(status.reason);
    for (int k = 0; k < diagnostics; ++k) {
      diagnostic.tick();
      if (!status.active)
        throw std::runtime_error(status.reason);
      device_profiling = device_profiling && status.device_profiling;
      device_ms[0] += status.upload_ms;
      device_ms[1] += status.filter_ms;
      device_ms[2] += status.download_ms;
    }
    engine->set_profiling(false);
  } catch (const std::exception &e) {
    out << "Gerätezeitmessung: " << e.what() << '\n';
    device_profiling = false;
  }
  if (device_profiling)
    out << std::setprecision(3) << "Gerätezeiten (separater Diagnoselauf, " << diagnostics
        << " Schritte): Upload " << device_ms[0] / diagnostics << " ms · Objektfilter "
        << device_ms[1] / diagnostics << " ms · Download " << device_ms[2] / diagnostics << " ms\n";
  else
    out << "Gerätezeitstempel nicht verfügbar\n";
  out << "Empfehlung für diese Szene: "
      << (gpu_ms < cpu_ms * .98 ? "--compute opencl-optics" : "--compute cpu") << "\n";
  out << std::setprecision(2) << "GPU-Daten pro Schritt: " << query_sum / batches
      << " Dämpfungsabfragen, " << uploaded / (1024. * batches) << " KiB hochgeladen, "
      << reused / (1024. * batches) << " KiB wiederverwendet, " << double(fallbacks) / batches
      << " Dämpfungsabfragen mit CPU-Rückfall\n";
  return batches == std::size_t(3) * steps ? 0 : 2;
}
}

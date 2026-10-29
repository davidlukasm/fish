"""Shared immutable render and inspection assets."""

from protocol_schema import Fish, Corpse

BRAIN_LAYOUT_FIELDS = (
    "receptors",
    "effectors",
    "neurons",
    "edges",
    "focus",
    "motor_counts",
)
SPECIES_PROFILE_FIELDS = (
    "labels",
    "diet",
    "ecology",
    "nutrition_steps",
    "bottom",
    "top",
    "habitat_steps",
    "initial_profile",
    "initial_step",
    "summary_labels",
    "profile_labels",
    "trait_details",
)


def hydrate_brain(frame, layouts):
    brain = frame.get("brain")
    if not brain or "layout_id" not in brain:
        return frame
    brain = dict(brain)
    layout = brain.pop("layout", None)
    key = brain["layout_id"]
    if layout is not None:
        layouts[key] = layout
        while len(layouts) > 8:
            del layouts[next(iter(layouts))]
    if key not in layouts:
        raise ValueError("Gehirnbauplan fehlt")
    brain = {**layouts[key], **brain}
    states = brain.get("neuron_state", [])
    signals = brain.get("sensor_state", [])
    brain["neurons"] = [row[:] for row in brain.get("neurons", [])]
    for row in brain["neurons"]:
        if row[5] < len(states):
            state = states[row[5]]
            row[3], row[7], row[10] = state[:3]
            row[18], row[19] = state[3:5]
    brain["receptors"] = [row[:] for row in brain.get("receptors", [])]
    for i, row in enumerate(brain["receptors"]):
        row[3] = signals[i] if i < len(signals) else 0
    return {**frame, "brain": brain}


def hydrate_render(frame, assets, light_cache=None):
    """Expand shared transport data for observers; arrays remain shared and immutable."""
    if "fish" not in frame:
        return frame
    raw_light = frame.get("light", {})
    frame = {
        **frame,
        "fish": [p[:] for p in frame.get("fish", [])],
        "corpses": [p[:] for p in frame.get("corpses", [])],
        "light": dict(frame.get("light", {})),
    }
    if frame.get("asset_reset"):
        assets.clear()
    assets.update(frame.get("assets", {}))

    def get(key):
        key = str(key)
        return assets[key]

    for p in frame.get("fish", []):
        if p[Fish.MORPHOLOGY_ASSET] and p[Fish.ORGANS] is None:
            for i, value in zip((Fish.ORGANS, Fish.FINS, Fish.FORMS, Fish.CONTOUR, Fish.REGIONS, Fish.BODY_GEOMETRY), get(p[Fish.MORPHOLOGY_ASSET])):
                p[i] = value
    for p in frame.get("corpses", []):
        if len(p) > Corpse.MORPHOLOGY_ASSET and isinstance(p[Corpse.MORPHOLOGY_ASSET], int):
            p[Corpse.MORPHOLOGY_ASSET] = get(p[Corpse.MORPHOLOGY_ASSET])
    light = frame.get("light", {})
    if light_cache is not None and light_cache.get("source") is raw_light:
        frame["light"] = light_cache["display"]
        get(light_cache["clear_asset"])
    elif "bytes" in light:
        values = light.pop("bytes")
        light["values"] = [v / 255 for v in values]
        key = light["clear_asset"]
        base = get(key)
        light["clear_values"] = [v / 255 for v in base]
        if light_cache is not None:
            light_cache.update(source=raw_light, display=light, clear_asset=key)
    # A template can precede the slower scene section that first uses it.
    # Only the producer knows when no cached section can reference it again.
    for key in frame.get("retired_assets", []):
        assets.pop(str(key), None)
    for key in ("assets", "asset_reset", "retired_assets"):
        frame.pop(key, None)
    return frame

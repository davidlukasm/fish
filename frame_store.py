"""Latest scene, immutable shared assets and client synchronization state."""

from frame_assets import hydrate_brain, hydrate_render
from view_transport import FrameDecoder, SceneHistory
from copy import copy


class FrameStore:

    def __init__(self):
        self.latest = None
        self.latest_wire = None
        self.brain_layouts = {}
        self.render_assets = {}
        self.assets_epoch = None
        self.assets_version = 0
        self.render_asset_versions = {}
        self.startup = None
        self.frame_decoder = FrameDecoder()
        self.scene_history = SceneHistory()
        self.light_cache = {}
        self.profile_sources = None
        self.profile_value = None
        self.profile_version = 0

    def prepare_message(self, message):
        result = copy(self)
        result.frame_decoder = self.frame_decoder.fork()
        result.scene_history = self.scene_history.fork()
        result.render_asset_versions = dict(self.render_asset_versions)
        result.accept_message(message)
        return result

    def inherit_profile_cache(self, previous):
        self.profile_sources = previous.profile_sources
        self.profile_value = previous.profile_value
        self.profile_version = previous.profile_version

    def accept_message(self, message):
        decoder = self.frame_decoder
        previous = decoder.sequence, decoder.frame
        try:
            frame = decoder.accept(message)
            self.accept(frame, None, message.get("patch"))
        except (ValueError, KeyError, TypeError, IndexError):
            decoder.sequence, decoder.frame = previous
            raise
        return frame

    def accept(self, frame, wire, patch=None):
        # Decode against copies, then commit. A malformed frame must not evict
        # the assets needed by the last valid scene or move its reconnect key.
        frame["render_epoch"], frame["revision"]
        reset = self.assets_epoch != frame.get("render_epoch")
        assets = {} if reset else dict(self.render_assets)
        layouts = dict(self.brain_layouts)
        light_cache = {} if reset else dict(self.light_cache)
        latest = hydrate_brain(hydrate_render(frame, assets, light_cache), layouts)
        if self.assets_epoch != frame.get("render_epoch"):
            self.render_assets = {}
            self.assets_epoch = frame.get("render_epoch")
            self.assets_version = 0
            self.render_asset_versions = {}
        old_assets = set(self.render_assets)
        if frame.get("assets"):
            self.assets_version += 1
            self.render_asset_versions.update(
                {key: self.assets_version for key in frame["assets"]}
            )
        self.latest = latest
        self.render_assets = assets
        self.brain_layouts = layouts
        self.light_cache = light_cache
        if old_assets - set(self.render_assets):
            self.assets_version += 1
        self.render_asset_versions = {
            key: self.render_asset_versions.get(key, 0) for key in self.render_assets
        }
        self.scene_history.record(
            {
                k: v
                for k, v in frame.items()
                if k not in ("assets", "asset_reset", "retired_assets")
            },
            (
                [
                    2,
                    {
                        k: v
                        for k, v in patch[1].items()
                        if k not in ("assets", "asset_reset", "retired_assets")
                    },
                    patch[2],
                ]
                if patch and patch[0] == 2
                else (
                    [
                        0,
                        {
                            k: v
                            for k, v in patch[1].items()
                            if k not in ("assets", "asset_reset", "retired_assets")
                        },
                    ]
                    if patch
                    else None
                )
            ),
        )
        self.latest_wire = wire
        self.starting = False
        self.startup = None

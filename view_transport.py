"""Lossless scene patches; immutable snapshots and bounded reconnect history."""

from collections import deque
from scene_patches import compose
from wording import Refusal


def apply_patch(value, patch):
    kind = patch[0]
    if kind == 0:
        return patch[1]
    if kind == 1:
        length, changes = patch[1:]
        result = value[:length] + [None] * max(0, length - len(value))
        for index, change in changes:
            result[index] = apply_patch(result[index], change)
        return result
    if kind == 2:
        result = dict(value)
        for key in patch[2]:
            result.pop(key, None)
        for key, change in patch[1].items():
            result[key] = apply_patch(result.get(key), change)
        return result
    if kind == 3:
        column, order, changes = patch[1:]
        known = {row[column]: row for row in value}
        if order is None:
            order = [row[column] for row in value]
        for identifier, change in changes:
            known[identifier] = apply_patch(known.get(identifier), change)
        return [known[identifier] for identifier in order]
    if kind == 6:
        result = value[:]
        changes = iter(patch[2])
        for index in range(len(result)):
            if index // 4 < len(patch[1]) and int(patch[1][index // 4], 16) & (
                1 << (index % 4)
            ):
                result[index] = next(changes)
        return result
    raise Refusal("unknownSceneChange")


class FrameDecoder:
    def __init__(self):
        self.sequence = 0
        self.frame = None

    def fork(self):
        result = FrameDecoder()
        result.sequence, result.frame = self.sequence, self.frame
        return result

    def accept(self, message):
        if "frame" in message:
            frame = message["frame"]
        else:
            if message["base"] != self.sequence or self.frame is None:
                raise Refusal("sceneSequenceBroken")
            frame = apply_patch(self.frame, message["patch"])
        if message["sequence"] < 1 or (
            "frame" not in message and message["sequence"] != self.sequence + 1
        ):
            raise Refusal("invalidSceneSequence")
        self.sequence = message["sequence"]
        self.frame = frame
        return frame


class SceneHistory:
    def __init__(self):
        self.key = ""
        self.frame = None
        self.patches = deque(maxlen=32)

    def fork(self):
        result = SceneHistory()
        result.key, result.frame = self.key, self.frame
        result.patches = deque(self.patches, maxlen=32)
        return result

    def record(self, frame, patch):
        key = f"{frame['render_epoch']}:{frame['revision']}"
        if patch is None:
            self.patches.clear()
        else:
            self.patches.append((self.key, key, patch))
        self.key, self.frame = key, frame

    def since(self, key):
        if key == self.key:
            return []
        updates = []
        for before, after, patch in self.patches:
            if before == key:
                updates = (
                    [compose(updates[0], patch, self.frame)] if updates else [patch]
                )
                key = after
        return updates if key == self.key else None

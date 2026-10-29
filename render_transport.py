"""Framing and opaque forwarding of the engine's display buffers."""

import struct
import threading
from protocol_schema import SCENE_HEADER

MAX_SCENE_BYTES = 64 * 1024 * 1024


def read_exact(stream, size):
    if not 0 <= size <= MAX_SCENE_BYTES:
        raise ValueError("Ungültige Bildgröße")
    chunks = bytearray()
    while len(chunks) < size:
        part = stream.read(size - len(chunks))
        if not part:
            raise EOFError("Darstellungsstrom abgebrochen")
        chunks.extend(part)
    return bytes(chunks)


class RenderRelay:
    def __init__(self):
        self.request_lock = threading.Lock()
        self.latest = None
        self.revision = 0

    def accept(self, payload):
        if len(payload) < 16 or payload[:4] != b"FSV1":
            raise ValueError("Unbekanntes Bildformat")
        sizes = struct.unpack_from("<III", payload, 4)
        if sum(sizes) + 16 != len(payload) or sizes[0] < SCENE_HEADER['bytes']:
            raise ValueError("Unvollständiges Bild")
        self.latest = payload
        self.revision += 1

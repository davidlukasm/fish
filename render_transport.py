"""Image channel of the front process: the engine connects per run; buffers stay opaque."""

import json
import math
import socket
import struct
import threading
from protocol_schema import SCENE_HEADER
from wording import Refusal

MAX_SCENE_BYTES = 64 * 1024 * 1024


def check_scene(payload):
    if len(payload) < 16 or payload[:4] != b"FSV1":
        raise Refusal("unknownImageFormat")
    sizes = struct.unpack_from("<III", payload, 4)
    if sum(sizes) + 16 != len(payload) or sizes[0] < SCENE_HEADER["bytes"]:
        raise Refusal("incompleteImage")
    return payload


class SceneLink:
    """One engine connection; buffer and header survive a timeout mid-reply."""

    def __init__(self, connection, timeout):
        self.connection = connection
        self.connection.settimeout(timeout)
        self.buffer = bytearray()
        self.header = None

    def fill(self):
        part = self.connection.recv(1 << 20)
        if not part:
            raise EOFError("imageStreamBroken")
        self.buffer += part

    def line(self):
        while (end := self.buffer.find(b"\n")) < 0:
            if len(self.buffer) > 4096:
                raise Refusal("invalidImageReply")
            self.fill()
        value = bytes(self.buffer[:end])
        del self.buffer[: end + 1]
        return value

    def read(self, size):
        if not 0 <= size <= MAX_SCENE_BYTES:
            raise Refusal("invalidImageSize")
        while len(self.buffer) < size:
            self.fill()
        value = bytes(self.buffer[:size])
        del self.buffer[:size]
        return value

    def reply(self):
        """Replies: "FSCENE <request> <bytes>\\n<bundle>" or "FERROR <request> <JSON>\\n"."""
        if self.header is None:
            self.header = self.line().split(b" ", 2)
        kind, number, rest = self.header
        if kind == b"FSCENE":
            payload, message = self.read(int(rest)), None
        elif kind == b"FERROR":
            payload, message = None, json.loads(rest)
        else:
            raise Refusal("invalidImageReply")
        self.header = None
        return int(number), payload, message

    def close(self):
        try:
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.connection.close()


class SceneChannel:
    """Serial image requests; each new engine run replaces the previous connection."""

    def __init__(self, path, timeout=15):
        self.path = path
        self.timeout = timeout
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.bind(path)
        self.listener.listen(4)
        # Serial requests isolate tabs with different viewports.
        self.request_lock = threading.Lock()
        self.lock = threading.Lock()
        self.link = None
        self.request = 0
        threading.Thread(target=self.accept, daemon=True, name="fish-scenes").start()

    def accept(self):
        while True:
            try:
                connection, _ = self.listener.accept()
            except OSError:
                return
            with self.lock:
                previous, self.link = self.link, SceneLink(connection, self.timeout)
            if previous:
                # Wakes a waiting request; it fails and releases the request lock.
                try:
                    previous.connection.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                with self.request_lock:
                    previous.close()

    def drop(self, link):
        with self.lock:
            if self.link is link:
                self.link = None
        link.close()

    def render(self, base, viewport, brain_key="", inspection_key="", focus=-1):
        if (
            not 0 <= base <= 0xFFFFFFFF
            or len(brain_key) > 100
            or len(inspection_key) > 512
            or not -1 <= focus < 100000
        ):
            raise Refusal("invalidImageRequest")
        if len(viewport) != 5 or not all(math.isfinite(v) for v in viewport):
            raise Refusal("invalidImageSection")
        values = " ".join(format(v, ".17g") for v in viewport)
        with self.request_lock:
            with self.lock:
                link = self.link
            if link is None:
                raise Refusal("noCurrentImage")
            self.request += 1
            request = self.request
            try:
                link.connection.sendall(
                    f"request {request} render {base} {values} {json.dumps(brain_key)} "
                    f"{json.dumps(inspection_key)} {focus}\n".encode()
                )
                # Answers to abandoned requests precede the current one.
                number = None
                while number != request:
                    number, payload, message = link.reply()
            except TimeoutError:
                raise Refusal("imageNotDelivered") from None
            except (OSError, EOFError, ValueError):
                self.drop(link)
                raise Refusal("noCurrentImage") from None
        if payload is None:
            raise ValueError(message)
        return check_scene(payload)

    def close(self):
        self.listener.close()
        with self.lock:
            link, self.link = self.link, None
        if link:
            link.close()

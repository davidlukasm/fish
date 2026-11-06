"""Image channel of the front process: the engine connects per run; buffers stay opaque."""

import json
import math
import socket
import struct
import threading
from protocol_schema import SCENE_BUNDLE, SCENE_HEADER
from wording import Refusal

MAX_SCENE_BYTES = 64 * 1024 * 1024
# Replies are read in READ_CHUNK bytes, a header line takes at most HEADER_BYTES; a request
# waits TIMEOUT_S. While one run gives way to the next, a request waits up to SWITCH_S for the
# new engine to connect. Brain and inspection keys stay within their lengths, the focus below
# MAX_FOCUS; the base frame is a 32-bit counter.
READ_CHUNK, HEADER_BYTES, TIMEOUT_S, SWITCH_S = 1 << 20, 4096, 15, 3
BRAIN_KEY, INSPECTION_KEY, MAX_FOCUS, MAX_BASE = 100, 512, 100000, 0xFFFFFFFF


def check_scene(payload):
    header, magic = SCENE_BUNDLE["header_bytes"], SCENE_BUNDLE["magic"].encode()
    if len(payload) < header or payload[: len(magic)] != magic:
        raise Refusal("unknownImageFormat")
    sizes = struct.unpack_from("<" + "I" * len(SCENE_BUNDLE["parts"]), payload, len(magic))
    if sum(sizes) + header != len(payload) or sizes[0] < SCENE_HEADER["bytes"]:
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
        part = self.connection.recv(READ_CHUNK)
        if not part:
            raise EOFError("imageStreamBroken")
        self.buffer += part

    def line(self):
        while (end := self.buffer.find(b"\n")) < 0:
            if len(self.buffer) > HEADER_BYTES:
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
    """Serial image requests; each new engine run replaces the previous connection. A request
    that meets no engine, or one whose run has just ended, waits for the next run's engine; the
    old run's base frame and inspection do no harm there, the new engine answers with a whole
    frame."""

    def __init__(self, path, timeout=TIMEOUT_S, switch=SWITCH_S):
        self.path = path
        self.timeout = timeout
        self.switch = switch
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.bind(path)
        self.listener.listen(4)
        # Serial requests isolate tabs with different viewports.
        self.request_lock = threading.Lock()
        self.lock = threading.Lock()
        self.connected = threading.Condition(self.lock)
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
                self.connected.notify_all()
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

    def current(self, stale=None):
        """The engine's link, waiting up to the switch time for one other than `stale`."""
        with self.connected:
            self.connected.wait_for(lambda: self.link is not None and self.link is not stale,
                                    self.switch)
            return self.link if self.link is not stale else None

    def render(self, base, viewport, brain_key="", inspection_key="", focus=-1):
        if (
            not 0 <= base <= MAX_BASE
            or len(brain_key) > BRAIN_KEY
            or len(inspection_key) > INSPECTION_KEY
            or not -1 <= focus < MAX_FOCUS
        ):
            raise Refusal("invalidImageRequest")
        if len(viewport) != 5 or not all(math.isfinite(v) for v in viewport):
            raise Refusal("invalidImageSection")
        values = " ".join(format(v, ".17g") for v in viewport)
        with self.request_lock:
            payload, message, stale = self.ask(base, values, brain_key, inspection_key, focus)
            if stale:
                # The run ended under the request; the next run's engine answers it.
                payload, message, stale = self.ask(
                    base, values, brain_key, inspection_key, focus, stale
                )
            if stale:
                raise Refusal("noCurrentImage")
        if payload is None:
            raise ValueError(message)
        return check_scene(payload)

    def ask(self, base, values, brain_key, inspection_key, focus, stale=None):
        """One render request on the current link: its payload and message, or the link that
        broke under it."""
        link = self.current(stale)
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
            return None, None, link
        return payload, message, None

    def close(self):
        self.listener.close()
        with self.lock:
            link, self.link = self.link, None
        if link:
            link.close()

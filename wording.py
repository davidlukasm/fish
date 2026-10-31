"""Refusals as a wording key with values; the interface phrases them in its language."""


def refusal(key, **values):
    """Reply field for a turned-down request."""
    return {"key": key, "values": values}


class Refusal(ValueError):
    """A request the server turns down, phrased by the interface from key and values."""

    def __init__(self, key, **values):
        super().__init__(key)
        self.reply = refusal(key, **values)


def worded(error):
    """Reply field for any error: a refusal's key, the engine's wording passed on as the
    error's argument, or another component's text as it is."""
    if isinstance(error, Refusal):
        return error.reply
    reason = error.args[0] if len(error.args) == 1 else None
    return reason if isinstance(reason, dict) and "key" in reason else str(error)

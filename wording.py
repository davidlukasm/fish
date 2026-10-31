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
    """Reply field for any error: a refusal's key, or another component's text as it is."""
    return error.reply if isinstance(error, Refusal) else str(error)

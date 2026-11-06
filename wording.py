def wording(key, **values):
    return {"key": key, "values": values}


class Refusal(ValueError):

    def __init__(self, key, **values):
        super().__init__(key)
        self.reply = wording(key, **values)


def worded(error):
    if isinstance(error, Refusal):
        return error.reply
    reason = error.args[0] if len(error.args) == 1 else None
    return reason if isinstance(reason, dict) and "key" in reason else str(error)

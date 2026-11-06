from protocol_schema import FramePatch, PatchKind as K

BITS = FramePatch.MASK_DIGIT_BITS
HEX = 16


def _indexed(patch):
    if patch[0] == K.ARRAY:
        return dict(patch[2])
    values = iter(patch[2])
    return {
        BITS * group + bit: [K.REPLACE, next(values)]
        for group, digit in enumerate(patch[1])
        for bit in range(BITS)
        if int(digit, HEX) & (1 << bit)
    }


def _object(first, second, current):
    changes = dict(first[1])
    removed = set(first[2]) | set(second[2])
    for key in second[2]:
        changes.pop(key, None)
    for key, change in second[1].items():
        if key not in current:
            changes.pop(key, None)
            removed.add(key)
            continue
        changes[key] = (
            compose(changes[key], change, current[key]) if key in changes else change
        )
        removed.discard(key)
    return [K.OBJECT, changes, sorted(removed)]


def _array(first, second, current):
    changes = {
        index: change
        for index, change in _indexed(first).items()
        if index < len(current)
    }
    for index, change in _indexed(second).items():
        if index >= len(current):
            continue
        changes[index] = (
            compose(changes[index], change, current[index])
            if index in changes
            else change
        )
    return [K.ARRAY, len(current), sorted(changes.items())]


def _entities(first, second, current):
    column = second[1]
    rows = {row[column]: row for row in current}
    changes = {key: change for key, change in first[3] if key in rows}
    for key, change in second[3]:
        if key in rows:
            changes[key] = (
                compose(changes[key], change, rows[key]) if key in changes else change
            )
    order = second[2] if second[2] is not None else first[2]
    return [K.ROWS, column, order, list(changes.items())]


def compose(first, second, current):
    if first[0] == K.OBJECT and second[0] == K.OBJECT and isinstance(current, dict):
        return _object(first, second, current)
    if first[0] in (K.ARRAY, K.MASK) and second[0] in (K.ARRAY, K.MASK) and isinstance(current, list):
        return _array(first, second, current)
    if (
        first[0] == second[0] == K.ROWS
        and first[1] == second[1]
        and isinstance(current, list)
    ):
        return _entities(first, second, current)
    return [K.REPLACE, current]

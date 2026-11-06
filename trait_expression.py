import ast
import colorsys
import operator


class Named:

    def __init__(self, names, values, default=None):
        self._index = {name: i for i, name in enumerate(names)}
        self._values = list(values)
        self._default = default

    def __getitem__(self, name):
        i = self._index.get(name)
        return self._values[i] if i is not None and i < len(self._values) else self._default

    def __iter__(self):
        return iter(self._values)

    def __contains__(self, name):
        return name in self._index


class Fields(Named):

    def __init__(self, record, default=0):
        super().__init__(list(record), list(record.values()), default)


def _has(group, name):
    return name in group


def _get(group, name, default):
    value = group[name]
    return default if value is None or name not in group else value


def _at_least(values, limit):
    return sum(value >= limit for value in values)


def _ratio(x, y):
    return x / y if x is not None and y is not None and y > 0 else None


def _part(x, rest):
    return x / (x + rest) if x is not None and x + rest > 0 else None


def _hsv(index):
    return lambda r, g, b: colorsys.rgb_to_hsv(r, g, b)[index]


FUNCTIONS = {"max": max, "min": min, "sum": sum, "abs": abs, "has": _has, "get": _get,
             "at_least": _at_least, "ratio": _ratio, "part": _part, "hue": _hsv(0),
             "saturation": _hsv(1), "brightness": _hsv(2)}
COMPARE = {ast.Lt: operator.lt, ast.LtE: operator.le, ast.Gt: operator.gt,
           ast.GtE: operator.ge, ast.Eq: operator.eq, ast.NotEq: operator.ne}
ARITHMETIC = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
              ast.Div: operator.truediv, ast.Mod: operator.mod}


class Expression:
    def __init__(self, text):
        self.text = text
        self.tree = ast.parse(text, mode="eval").body
        self._check(self.tree)

    def _check(self, node):
        allowed = (ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not, ast.USub, ast.BinOp,
                   ast.Compare, ast.Name, ast.Load, ast.Constant, ast.Attribute, ast.Call,
                   ast.IfExp, *COMPARE, *ARITHMETIC)
        for child in ast.walk(node):
            if not isinstance(child, allowed):
                raise ValueError(f"{self.text}: {type(child).__name__} not allowed")
            if isinstance(child, ast.Attribute) and (
                    child.attr.startswith("_") or not isinstance(child.value, ast.Name)):
                raise ValueError(f"{self.text}: only group.name is allowed")
            if isinstance(child, ast.Call) and (
                    not isinstance(child.func, ast.Name) or child.func.id not in FUNCTIONS
                    or child.keywords):
                raise ValueError(f"{self.text}: unknown function")

    def names(self):
        calls = {id(n.func) for n in ast.walk(self.tree) if isinstance(n, ast.Call)}
        return {n.id for n in ast.walk(self.tree)
                if isinstance(n, ast.Name) and id(n) not in calls}

    def __call__(self, scope):
        return self._value(self.tree, scope)

    def _value(self, node, scope):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return scope[node.id]
        if isinstance(node, ast.Attribute):
            return scope[node.value.id][node.attr]
        if isinstance(node, ast.BoolOp):
            result = None
            for value in node.values:
                result = self._value(value, scope)
                if isinstance(node.op, ast.And) != bool(result):
                    return result
            return result
        if isinstance(node, ast.UnaryOp):
            value = self._value(node.operand, scope)
            return not value if isinstance(node.op, ast.Not) else -value
        if isinstance(node, ast.BinOp):
            return ARITHMETIC[type(node.op)](self._value(node.left, scope),
                                             self._value(node.right, scope))
        if isinstance(node, ast.Compare):
            left = self._value(node.left, scope)
            for op, right_node in zip(node.ops, node.comparators):
                right = self._value(right_node, scope)
                if not COMPARE[type(op)](left, right):
                    return False
                left = right
            return True
        if isinstance(node, ast.IfExp):
            return self._value(node.body if self._value(node.test, scope) else node.orelse,
                               scope)
        if isinstance(node, ast.Call):
            return FUNCTIONS[node.func.id](*(self._value(arg, scope) for arg in node.args))
        raise ValueError(self.text)

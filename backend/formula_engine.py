import ast
import operator
import re
from typing import Any


class FormulaError(ValueError):
    pass


_BINARY_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
}
_COMPARISON_OPERATORS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
}


def _column_reference(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if (
        isinstance(node, ast.Subscript)
        and isinstance(node.value, ast.Name)
        and node.value.id == "row"
        and isinstance(node.slice, ast.Constant)
        and isinstance(node.slice.value, str)
    ):
        return node.slice.value
    return None


def _number(value: Any) -> float | int:
    if value in (None, ""):
        return 0
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise FormulaError(f"Expected a number, got {value!r}") from error


def _evaluate(node: ast.AST, row: dict[str, Any], rows: list[dict[str, Any]]) -> Any:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float, str, bool, type(None))):
        return node.value
    if isinstance(node, ast.Name):
        if node.id in {"True", "False"}:
            return node.id == "True"
        if node.id in row:
            return row[node.id]
        raise FormulaError(f"Unknown field or function: {node.id}")
    if isinstance(node, ast.Subscript) and _column_reference(node):
        return row.get(_column_reference(node) or "")
    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY_OPERATORS:
        left = _number(_evaluate(node.left, row, rows))
        right = _number(_evaluate(node.right, row, rows))
        try:
            return _BINARY_OPERATORS[type(node.op)](left, right)
        except ZeroDivisionError as error:
            raise FormulaError("Division by zero") from error
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _number(_evaluate(node.operand, row, rows))
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.Compare) and len(node.ops) == 1 and len(node.comparators) == 1:
        operation = _COMPARISON_OPERATORS.get(type(node.ops[0]))
        if operation is None:
            raise FormulaError("Unsupported comparison")
        return operation(_evaluate(node.left, row, rows), _evaluate(node.comparators[0], row, rows))
    if isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
        values = [_evaluate(value, row, rows) for value in node.values]
        return all(values) if isinstance(node.op, ast.And) else any(values)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        function = node.func.id.upper()
        if function == "IF" and len(node.args) == 3:
            condition = _evaluate(node.args[0], row, rows)
            return _evaluate(node.args[1] if condition else node.args[2], row, rows)
        if function in {"SUM", "AVERAGE", "MIN", "MAX", "COUNT"} and len(node.args) == 1:
            field = _column_reference(node.args[0])
            if field is not None:
                values = [record.get(field) for record in rows]
                numbers = [_number(value) for value in values if value not in (None, "")]
                if function == "COUNT":
                    return len(numbers)
                if not numbers:
                    return 0
                if function == "SUM":
                    return sum(numbers)
                if function == "AVERAGE":
                    return sum(numbers) / len(numbers)
                return min(numbers) if function == "MIN" else max(numbers)
        raise FormulaError(f"Unsupported function or arguments: {node.func.id}")
    raise FormulaError("Unsupported formula expression")


def calculate_formula(
    expression: str, row: dict[str, Any], rows: list[dict[str, Any]], fields: list[str] | None = None
) -> Any:
    """Evaluate a deliberately small, safe Excel-like expression language."""
    source = expression.strip()
    if source.startswith("="):
        source = source[1:].strip()
    for field in sorted(fields or [], key=len, reverse=True):
        if not field.isidentifier():
            source = re.sub(rf"\[{re.escape(field)}\]", f'row[{field!r}]', source)
            source = re.sub(
                rf"(?<![\w\['\"])\b{re.escape(field)}\b(?![\w'\"])",
                f'row[{field!r}]',
                source,
            )
    try:
        tree = ast.parse(source, mode="eval")
        return _evaluate(tree.body, row, rows)
    except FormulaError:
        raise
    except (SyntaxError, TypeError, ValueError) as error:
        raise FormulaError(f"Invalid formula: {expression}") from error
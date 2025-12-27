"""
Canonical JSON serialization per canonical-json.md spec
Deterministic, sorted keys, no floats, no whitespace
"""

from typing import Any, Union
import json

JsonValue = Union[str, int, bool, None, list, dict]


def escape_string(s: str) -> str:
    """Escape a string for canonical JSON."""
    result = ['"']
    for c in s:
        code = ord(c)
        if c == '"':
            result.append('\\"')
        elif c == '\\':
            result.append('\\\\')
        elif c == '\b':
            result.append('\\b')
        elif c == '\f':
            result.append('\\f')
        elif c == '\n':
            result.append('\\n')
        elif c == '\r':
            result.append('\\r')
        elif c == '\t':
            result.append('\\t')
        elif code < 0x20:
            result.append(f'\\u{code:04x}')
        else:
            result.append(c)
    result.append('"')
    return ''.join(result)


def canonicalize(value: JsonValue) -> str:
    """
    Canonicalize a JSON-serializable value to deterministic string.

    Rules:
    - Keys sorted lexicographically
    - No whitespace
    - Integers only (no floats)
    - Proper string escaping
    """
    if value is None:
        return 'null'

    if isinstance(value, bool):
        return 'true' if value else 'false'

    if isinstance(value, int):
        if not (-2**53 + 1 <= value <= 2**53 - 1):
            raise ValueError("Number outside safe integer range")
        return str(value)

    if isinstance(value, float):
        raise ValueError("Floats forbidden in canonical JSON")

    if isinstance(value, str):
        return escape_string(value)

    if isinstance(value, list):
        elements = [canonicalize(v) for v in value]
        return '[' + ','.join(elements) + ']'

    if isinstance(value, dict):
        keys = sorted(value.keys())
        pairs = [escape_string(k) + ':' + canonicalize(value[k]) for k in keys]
        return '{' + ','.join(pairs) + '}'

    raise ValueError(f"Unsupported type in canonical JSON: {type(value)}")


def canonicalize_bytes(value: JsonValue) -> bytes:
    """Canonicalize to UTF-8 bytes."""
    return canonicalize(value).encode('utf-8')

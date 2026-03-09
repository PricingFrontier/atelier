"""JSON helpers — sanitise non-finite floats before serialisation."""

import math
from typing import Any


def sanitize_floats(obj: Any) -> Any:
    """Recursively replace NaN / Inf / -Inf with None so json.dumps won't choke."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_floats(v) for v in obj]
    return obj


def safe_extract(obj: Any, attr_name: str, converter: Any = None, default: Any = None) -> Any:
    """Safely extract an attribute or method result from an object.

    If the attribute is callable, it is invoked with no arguments.
    An optional *converter* (e.g. ``float``) is applied to the value before
    returning.  Any exception during extraction returns *default*.
    """
    try:
        val = getattr(obj, attr_name)
        if callable(val):
            val = val()
        return converter(val) if converter else val
    except Exception:
        return default

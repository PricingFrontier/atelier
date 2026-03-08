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

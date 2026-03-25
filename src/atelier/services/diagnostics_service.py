"""Post-processing of rustystats diagnostics before returning to the frontend."""

import math
import re
from typing import Any

_TE_RE = re.compile(r"^TE\((.+)\)$")


def enrich_te_relativities(diag: dict[str, Any]) -> None:
    """Replace per-unit TE relativities with range-based ones from partial dependence.

    Per-unit relativity (exp(β)) is misleading for target-encoded features because
    a 1-unit change in TE space never occurs in practice.  Instead, use the partial
    dependence relativities (which show the actual effect across observed levels) to
    compute a meaningful max/min range relativity.
    """
    coef_summary = diag.get("coefficient_summary")
    pd_list = diag.get("partial_dependence")
    if not coef_summary or not pd_list:
        return

    # Build lookup: variable name → partial dependence relativities
    pd_map: dict[str, list[float]] = {}
    for pd_entry in pd_list:
        var = pd_entry.get("variable")
        rels = pd_entry.get("relativities")
        if var and rels:
            pd_map[var] = rels

    for entry in coef_summary:
        feature = entry.get("feature", "")
        m = _TE_RE.match(feature)
        if not m:
            entry["relativity_type"] = "per_unit"
            continue

        var_name = m.group(1)
        # Handle interaction TE names like TE(Brand:Region)
        lookup_names = [var_name] + var_name.split(":")
        pd_rels = None
        for name in lookup_names:
            if name in pd_map:
                pd_rels = pd_map[name]
                break

        if not pd_rels or len(pd_rels) < 2:
            entry["relativity_type"] = "per_unit"
            continue

        min_rel = min(pd_rels)
        max_rel = max(pd_rels)
        range_rel = max_rel / min_rel if min_rel > 0 else math.exp(entry.get("estimate", 0))

        entry["relativity_type"] = "range"
        entry["range_relativity"] = round(range_rel, 4)
        entry["range_min"] = round(min_rel, 4)
        entry["range_max"] = round(max_rel, 4)

"""SQL text for the executor — builders only, nothing here opens a cursor.

Every statement is parameterized and carries profile_id in the outer query *and* in both terms
of any recursive CTE (docs/SCHEMA.md "Hierarchy queries"): the composite FKs already make a
cross-profile subtree impossible, so this is belt-and-braces on a security boundary, and it
keeps each query correct in isolation — hand-written SQL bypasses JPA's usual guardrails.

Gap buckets are not filled here. The SQL returns the truncated bucket as a plain date and
`ranges.period_key` formats it, so the keys rows carry and the keys the executor zero-fills with
come from one formatter instead of two (a `to_char` and its Python twin) that can drift.
"""

from __future__ import annotations

from datetime import date

from analytics.plan import INTERVALS, Plan

# filters.categoryId is a *filter* over a subtree (docs/SCHEMA.md query 1).
_SUBTREE_CTE = """subtree AS (
    SELECT id FROM category WHERE id = %(category_id)s AND profile_id = %(profile_id)s
    UNION ALL
    SELECT c.id FROM category c JOIN subtree s ON c.parent_id = s.id
     WHERE c.profile_id = %(profile_id)s
)"""

# groupBy: "category" is a different CTE: it carries a group key down the tree so every
# category maps to the top-level group it rolls up into.
_GROUP_MAP_CTE = """group_map AS (
    -- Anchor: the filtered category itself, or every root when there is no filter. Each anchor
    -- is its own group, so transactions filed directly on the filtered category are not lost.
    SELECT id, id AS group_id
      FROM category
     WHERE profile_id = %(profile_id)s
       AND (%(category_id)s::bigint IS NULL AND parent_id IS NULL
            OR id = %(category_id)s)
    UNION ALL
    -- A direct child of the filtered category opens its own group; anything deeper inherits.
    SELECT c.id,
           CASE WHEN %(category_id)s::bigint IS NOT NULL AND g.id = %(category_id)s
                THEN c.id ELSE g.group_id END
      FROM category c JOIN group_map g ON c.parent_id = g.id
     WHERE c.profile_id = %(profile_id)s
)"""

# SUM over NUMERIC(19,4) keeps scale 4, so a bucket serialises as "243.5000" for free. The
# explicit cast is what keeps net's subtraction — and COALESCE's integer 0 fallback — at that
# same scale instead of serialising "0" and breaking the wire contract.
_METRIC_EXPRESSIONS = {
    "spend": "SUM(t.amount)::numeric(19,4)",
    "income": "SUM(t.amount)::numeric(19,4)",
    "net": (
        "(COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type = 'INCOME'), 0)"
        " - COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type = 'EXPENSE'), 0))"
        "::numeric(19,4)"
    ),
}

# A lookup, not an f-string over plan.interval directly: plan.interval is only ever one of these
# five values because validate_plan gates it before parse_plan runs, but that guarantee lives
# upstream. Keying a dict makes this module fail closed on its own — like _METRIC_EXPRESSIONS
# above — instead of trusting a caller that skipped validation.
_BUCKET_EXPRESSIONS = {
    interval: f"date_trunc('{interval}', t.occurred_on)::date" for interval in INTERVALS
}

# docs/INSIGHTS.md "Plan DSL v1": a NULL merchant is a real group, not a missing row. The key
# and the label are deliberately different expressions (D6): a merchant literally named
# "Unspecified" is a real, distinct value that must not be grouped in with merchant-less
# transactions just because COALESCE would give both the same display string. The key groups on
# null-ness with a sentinel no real merchant value can produce (same "__x__" convention as
# postprocess.OTHER_KEY); the label stays the human-readable "Unspecified" either way.
NO_MERCHANT_KEY = "__no_merchant__"
MERCHANT_GROUP_KEY_EXPR = f"COALESCE(t.merchant, '{NO_MERCHANT_KEY}')"
MERCHANT_GROUP_LABEL_EXPR = "COALESCE(t.merchant, 'Unspecified')"

# Predicate for filters.merchants: literal equality against the column. A transaction with
# no merchant never matches, which is why "Unspecified" is a display label, never a filter
# value. build_query collects predicates in a `where: list[str]` and joins them
# with "\n   AND ", so this appends a BARE predicate — a leading " AND " would produce
# "... AND  AND t.merchant = ..." and fail to parse.
MERCHANT_PREDICATE = "t.merchant = ANY(%(merchants)s)"

# A lookup for the same reason, on the one axis where falling through would not even error:
# groupBy: "merchant" is in the v1 enum and parses, so an `else: NULL::text` would answer it
# with a single group whose key and label are JSON null instead of raising. Keyed, this module
# fails closed here too, and Phase 4b adds "merchant" alongside "category".
_GROUP_EXPRESSIONS = {
    None: ("NULL::text", "NULL::text"),
    "category": ("gc.id::text", "gc.name"),
    "merchant": (MERCHANT_GROUP_KEY_EXPR, MERCHANT_GROUP_LABEL_EXPR),
}


def build_query(plan: Plan, profile_id: int, start: date, end: date) -> tuple[str, dict]:
    """The one statement every shape is computed from: five columns, always grouped by currency
    because currencies never mix (ARCHITECTURE.md §3)."""
    params: dict = {
        "profile_id": profile_id,
        "from_date": start,
        "to_date": end,
        "category_id": plan.filters.category_id,
    }
    # Looked up before any SQL is assembled, so an unrecognised groupBy is a KeyError rather
    # than a query that quietly drops the grouping.
    group_key, group_label = _GROUP_EXPRESSIONS[plan.group_by]
    ctes: list[str] = []
    where = ["t.profile_id = %(profile_id)s", "t.occurred_on BETWEEN %(from_date)s AND %(to_date)s"]

    if plan.metric == "spend":
        where.append("t.txn_type = 'EXPENSE'")
    elif plan.metric == "income":
        where.append("t.txn_type = 'INCOME'")

    if plan.filters.currency is not None:
        params["currency"] = plan.filters.currency
        where.append("t.currency = %(currency)s")

    if plan.filters.merchants is not None:
        params["merchants"] = list(plan.filters.merchants)
        where.append(MERCHANT_PREDICATE)

    if plan.filters.category_id is not None:
        if not plan.filters.include_descendants:
            where.append("t.category_id = %(category_id)s")
        elif plan.group_by != "category":
            # With groupBy: "category" the group join already restricts to the subtree, so the
            # filter CTE would only repeat the work.
            ctes.append(_SUBTREE_CTE)
            where.append("t.category_id IN (SELECT id FROM subtree)")

    if plan.group_by == "category":
        ctes.append(_GROUP_MAP_CTE)
        join = (
            "\n       JOIN group_map g ON g.id = t.category_id"
            "\n       JOIN category gc ON gc.id = g.group_id"
            " AND gc.profile_id = %(profile_id)s"
        )
    else:
        join = ""

    bucket = _BUCKET_EXPRESSIONS[plan.interval] if plan.interval is not None else "NULL::date"

    prefix = "WITH RECURSIVE " + ",\n".join(ctes) + "\n" if ctes else ""
    return prefix + (
        f"SELECT t.currency AS currency,\n"
        f"       {bucket} AS bucket,\n"
        f"       {group_key} AS group_key,\n"
        f"       {group_label} AS group_label,\n"
        f"       {_METRIC_EXPRESSIONS[plan.metric]} AS total\n"
        f"  FROM txn t{join}\n"
        f" WHERE " + "\n   AND ".join(where) + "\n"
        # By position, because two of the four axis columns are NULL constants when the plan
        # does not use that axis.
        " GROUP BY 1, 2, 3, 4"
    ), params

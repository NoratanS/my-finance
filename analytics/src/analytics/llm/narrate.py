"""Grounded narration: Python owns every number, the model only writes the sentence.

`INSIGHTS.md` principle 2 — "the LLM never queries data and never does
arithmetic" — is impossible to enforce by prompting alone: a 4 GB model asked
for "24% below Lidl" will happily compute 24% wrongly. So the narration
endpoint hands the model an executed envelope plus a block of figures computed
here, and afterwards re-reads the sentence it gets back: every number token in
it must be a number that was in the payload. A caption that invents one is not
narration, and it does not ship.

The unifying rule for every shape below is **fail closed**: if a numeric-
looking span cannot be parsed unambiguously as one plain number, the whole
span is refused, never silently fragmented into pieces that might each
ground on some unrelated figure. A wrongly-refused caption costs a retry; a
wrongly-accepted one is a fabricated number shown to someone as a fact about
their own money.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from decimal import ROUND_HALF_UP, Decimal

from analytics.llm.grounding import number_tokens, numbers_in, ungrounded_numbers  # noqa: F401

logger = logging.getLogger(__name__)

_MONEY = Decimal("0.01")
_PCT = Decimal("0.1")


def _money(value: Decimal) -> str:
    return str(value.quantize(_MONEY, rounding=ROUND_HALF_UP))


def _pct(part: Decimal, whole: Decimal) -> str | None:
    """A percentage as a 1 dp string, or None when there is nothing to divide by."""
    if whole == 0:
        return None
    return str((part / whole * 100).quantize(_PCT, rounding=ROUND_HALF_UP))


def _group_facts(totals: list[tuple[str, Decimal]]) -> dict:
    """Totals, shares and the gap to the runner-up — for breakdown and split alike.

    Ranked by absolute value, matching how the executor sorts a breakdown, so
    "leads"/"top" mean the same thing in the caption as on the chart.
    """
    ranked = sorted(totals, key=lambda item: abs(item[1]), reverse=True)
    grand = sum((total for _, total in ranked), Decimal(0))
    items = []
    for label, total in ranked:
        item = {"label": label, "total": _money(total)}
        share = _pct(total, grand)
        if share is not None:
            item["sharePct"] = share
        items.append(item)
    facts: dict = {"groups": len(ranked), "total": _money(grand), "items": items}
    if len(ranked) >= 2 and ranked[1][1] != 0:
        facts["topGapPct"] = _pct(ranked[0][1] - ranked[1][1], abs(ranked[1][1]))
    return facts


def narration_facts(envelope: dict) -> list[dict]:
    """Per-currency figures a caption may cite, all computed here.

    This is where the arithmetic the model is forbidden to do actually happens:
    totals, per-bucket averages, shares of the total, the change across the
    range, the gap between the top two. The model gets them as data and can
    only quote them.
    """
    interval = (envelope.get("plan") or {}).get("interval")
    facts: list[dict] = []
    for result in envelope.get("results", []):
        shape = result["shape"]
        fact: dict = {"currency": result["currency"], "shape": shape}
        if shape == "value":
            fact["total"] = _money(Decimal(result["value"]))
        elif shape == "timeseries":
            points = result["points"]
            values = [Decimal(point["value"]) for point in points]
            total = sum(values, Decimal(0))
            if interval is not None:
                fact["interval"] = interval
            fact["buckets"] = len(points)
            fact["total"] = _money(total)
            if points:
                fact["perBucketAverage"] = _money(total / len(points))
                fact["firstPeriod"] = points[0]["period"]
                fact["lastPeriod"] = points[-1]["period"]
                change = _pct(values[-1] - values[0], abs(values[0]))
                if change is not None:
                    fact["changePct"] = change
        elif shape == "breakdown":
            fact.update(_group_facts([(g["label"], Decimal(g["value"])) for g in result["groups"]]))
        elif shape == "timeseriesSplit":
            series = result["series"]
            buckets = len(series[0]["points"]) if series else 0
            if interval is not None:
                fact["interval"] = interval
            fact["buckets"] = buckets
            fact.update(
                _group_facts(
                    [
                        (
                            one["label"],
                            sum((Decimal(p["value"]) for p in one["points"]), Decimal(0)),
                        )
                        for one in series
                    ]
                )
            )
            if buckets:
                # Read each average off the item's own total: _group_facts reorders
                # by rank, so zipping against series order mislabels the averages.
                for item in fact["items"]:
                    item["perBucketAverage"] = _money(Decimal(item["total"]) / buckets)
        facts.append(fact)
    return facts


def fallback_caption(facts: list[dict]) -> str:
    """A caption built with no model — every figure comes straight from `facts`.

    The degrade path. A model that is absent, unreachable, or that keeps
    inventing numbers costs the user phrasing, never the caption: "no feature
    exists only behind the AI" (docs/INSIGHTS.md, "The AI layer").
    """
    parts = []
    for fact in facts:
        piece = f"{fact['currency']} total {fact['total']}"
        if "perBucketAverage" in fact:
            piece += f", averaging {fact['perBucketAverage']} per {fact.get('interval', 'bucket')}"
        items = fact.get("items", [])
        if items:
            piece += f", led by {items[0]['label']} at {items[0]['total']}"
        parts.append(piece)
    if not parts:
        return "No data for this plan."
    return "; ".join(parts) + "."


CAPTION_RULES = (
    "Write one sentence of at most 20 words describing the chart this data draws.\n"
    "Rules:\n"
    '- Use only the numbers listed under "facts" above, copied digit for digit exactly\n'
    "  as written: no thousands separators, no rounding, and no words or abbreviations\n"
    '  for magnitude (never "k", "mil", "thousand", "million", "mln", "tys.").\n'
    "- Never add, subtract, average, round or otherwise compute a number yourself.\n"
    "- Describe only what the facts state: no forecast, no trend, no outlier, and no\n"
    "  comparison beyond the numbers given.\n"
    "- Keep each number's unit as given: a number next to a percentage field stays a\n"
    "  percentage, a money total stays money — never state one as the other.\n"
    "- Answer with the sentence only: no preamble, no quotes, no markdown.\n"
)


def build_narration_prompt(payload: dict) -> str:
    """The whole prompt: the data, then the rules. Nothing about the profile."""
    return "Data (JSON):\n" + json.dumps(payload, ensure_ascii=False) + "\n\n" + CAPTION_RULES


def build_retry_prompt(payload: dict, caption: str, ungrounded: list[str]) -> str:
    """The one retry, told exactly which tokens were rejected."""
    problem = (
        "it used numbers that are not in the data: " + ", ".join(ungrounded)
        if ungrounded
        else "it was empty"
    )
    return (
        build_narration_prompt(payload)
        + f'\nYour previous answer ("{caption}") was rejected because {problem}.\n'
        + "Rewrite it using only numbers that appear in the JSON above.\n"
    )


def first_sentence(raw: str) -> str:
    """The model's answer trimmed to one line, without wrapping quotes."""
    stripped = raw.strip()
    if not stripped:
        return ""
    return stripped.splitlines()[0].strip().strip('"').strip()


def narrate(envelope: dict, *, generate: Callable[[str], str] | None) -> str:
    """A caption for an executed envelope. Always grounded, always returns.

    Tries the model at most twice — once, then once more with the offending
    tokens quoted back — and degrades to `fallback_caption` when it is absent,
    unreachable, or still inventing numbers.

    "Always returns" includes an envelope this cannot read. Reading one is the
    only step outside the loop's own guard, and a caption is a convenience on a
    chart the reader already has, so a malformed envelope earns the empty
    caption rather than a 500 — saying nothing about data we could not parse.
    """
    try:
        facts = narration_facts(envelope)
    except Exception as exc:  # noqa: BLE001 - see above: never a 500
        logger.warning("could not read the envelope for narration: %s", exc)
        return fallback_caption([])
    if generate is None:
        return fallback_caption(facts)

    payload = {"envelope": envelope, "facts": facts}
    prompt = build_narration_prompt(payload)
    for _ in range(2):
        try:
            caption = first_sentence(generate(prompt))
        except Exception as exc:  # noqa: BLE001 - narration is convenience, never a 500
            logger.warning("narration model call failed, using the computed caption: %s", exc)
            break
        ungrounded = ungrounded_numbers(caption, payload)
        if caption and not ungrounded:
            return caption
        logger.info("rejected caption %r (ungrounded: %s)", caption, ungrounded)
        prompt = build_retry_prompt(payload, caption, ungrounded)
    return fallback_caption(facts)

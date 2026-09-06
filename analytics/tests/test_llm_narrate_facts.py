"""Every figure a caption could want, computed in Python before the model sees it.

Note `SPLIT_ENVELOPE`: the series arrive Biedronka-first but rank Lidl-first,
so `perBucketAverage` landing on the wrong label is a live bug this file
catches.
"""

import pytest
from envelopes import (
    ALL_ENVELOPES,
    BREAKDOWN_ENVELOPE,
    SPLIT_ENVELOPE,
    TIMESERIES_ENVELOPE,
    VALUE_ENVELOPE,
)

from analytics.llm.narrate import fallback_caption, narration_facts, ungrounded_numbers


def test_a_single_value_yields_only_a_total():
    assert narration_facts(VALUE_ENVELOPE) == [
        {"currency": "PLN", "shape": "value", "total": "1243.50"}
    ]


def test_a_timeseries_yields_buckets_average_and_change():
    assert narration_facts(TIMESERIES_ENVELOPE) == [
        {
            "currency": "PLN",
            "shape": "timeseries",
            "interval": "month",
            "buckets": 3,
            "total": "450.00",
            "perBucketAverage": "150.00",
            "firstPeriod": "2026-07",
            "lastPeriod": "2026-09",
            "changePct": "50.0",
        }
    ]


def test_a_breakdown_yields_shares_and_the_gap_to_the_runner_up():
    assert narration_facts(BREAKDOWN_ENVELOPE) == [
        {
            "currency": "PLN",
            "shape": "breakdown",
            "groups": 2,
            "total": "4916.64",
            "items": [
                {"label": "Lidl", "total": "2793.48", "sharePct": "56.8"},
                {"label": "Biedronka", "total": "2123.16", "sharePct": "43.2"},
            ],
            "topGapPct": "31.6",
        }
    ]


def test_a_split_ranks_series_and_averages_each_over_the_same_buckets():
    assert narration_facts(SPLIT_ENVELOPE) == [
        {
            "currency": "PLN",
            "shape": "timeseriesSplit",
            "interval": "month",
            "buckets": 2,
            "groups": 2,
            "total": "720.00",
            "items": [
                {
                    "label": "Lidl",
                    "total": "500.00",
                    "sharePct": "69.4",
                    "perBucketAverage": "250.00",
                },
                {
                    "label": "Biedronka",
                    "total": "220.00",
                    "sharePct": "30.6",
                    "perBucketAverage": "110.00",
                },
            ],
            "topGapPct": "127.3",
        }
    ]


def test_an_empty_result_list_has_no_facts_and_a_plain_sentence():
    assert narration_facts({"plan": {}, "results": [], "meta": {}}) == []
    assert fallback_caption([]) == "No data for this plan."


@pytest.mark.parametrize(
    ("envelope", "expected"),
    [
        (VALUE_ENVELOPE, "PLN total 1243.50."),
        (TIMESERIES_ENVELOPE, "PLN total 450.00, averaging 150.00 per month."),
        (BREAKDOWN_ENVELOPE, "PLN total 4916.64, led by Lidl at 2793.48."),
        (SPLIT_ENVELOPE, "PLN total 720.00, led by Lidl at 500.00."),
    ],
)
def test_the_model_free_caption_reads_as_a_sentence(envelope, expected):
    assert fallback_caption(narration_facts(envelope)) == expected


@pytest.mark.parametrize("envelope", ALL_ENVELOPES)
def test_the_model_free_caption_is_itself_grounded(envelope):
    facts = narration_facts(envelope)
    payload = {"envelope": envelope, "facts": facts}
    assert ungrounded_numbers(fallback_caption(facts), payload) == []


def test_currencies_never_mix_in_one_clause():
    envelope = {
        "plan": {"version": 1, "interval": None},
        "results": [
            {"currency": "PLN", "shape": "value", "value": "100.0000"},
            {"currency": "EUR", "shape": "value", "value": "25.0000"},
        ],
        "meta": {"truncatedGroups": False},
    }
    assert fallback_caption(narration_facts(envelope)) == "PLN total 100.00; EUR total 25.00."

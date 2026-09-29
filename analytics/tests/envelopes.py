"""Executed envelopes, one per result shape (docs/INSIGHTS.md "Result shapes").

Plain module rather than fixtures because tests parametrize over them. It sits
next to the test files, so pytest's default `prepend` import mode puts
`analytics/tests` on `sys.path` and `from envelopes import ...` resolves.
"""

VALUE_ENVELOPE = {
    "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {"currency": "PLN"},
        "groupBy": None,
        "interval": None,
        "range": {"type": "yearToDate"},
    },
    "results": [{"currency": "PLN", "shape": "value", "value": "1243.5000"}],
    "meta": {"truncatedGroups": False},
}

TIMESERIES_ENVELOPE = {
    "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {"currency": "PLN"},
        "groupBy": None,
        "interval": "month",
        "range": {"type": "lastMonths", "n": 3},
    },
    "results": [
        {
            "currency": "PLN",
            "shape": "timeseries",
            "points": [
                {"period": "2026-07", "value": "100.0000"},
                {"period": "2026-08", "value": "200.0000"},
                {"period": "2026-09", "value": "150.0000"},
            ],
        }
    ],
    "meta": {"truncatedGroups": False},
}

BREAKDOWN_ENVELOPE = {
    "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 47, "currency": "PLN"},
        "groupBy": "merchant",
        "interval": None,
        "range": {"type": "lastMonths", "n": 12},
    },
    "results": [
        {
            "currency": "PLN",
            "shape": "breakdown",
            "groups": [
                {"key": "Lidl", "label": "Lidl", "value": "2793.4800"},
                {"key": "Biedronka", "label": "Biedronka", "value": "2123.1600"},
            ],
        }
    ],
    "meta": {"truncatedGroups": False},
}

SPLIT_ENVELOPE = {
    "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {"currency": "PLN"},
        "groupBy": "merchant",
        "interval": "month",
        "range": {"type": "lastMonths", "n": 2},
    },
    "results": [
        {
            "currency": "PLN",
            "shape": "timeseriesSplit",
            "series": [
                {
                    "key": "Biedronka",
                    "label": "Biedronka",
                    "points": [
                        {"period": "2026-08", "value": "100.0000"},
                        {"period": "2026-09", "value": "120.0000"},
                    ],
                },
                {
                    "key": "Lidl",
                    "label": "Lidl",
                    "points": [
                        {"period": "2026-08", "value": "300.0000"},
                        {"period": "2026-09", "value": "200.0000"},
                    ],
                },
            ],
        }
    ],
    "meta": {"truncatedGroups": False},
}

ALL_ENVELOPES = [VALUE_ENVELOPE, TIMESERIES_ENVELOPE, BREAKDOWN_ENVELOPE, SPLIT_ENVELOPE]

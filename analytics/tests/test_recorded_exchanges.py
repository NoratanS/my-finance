"""The proof behind the backend's stand-in for this service (docs/INSIGHTS.md → "Testing strategy").

Each recorded exchange is one JSON file in the backend's test resources: the executor's database
state, a plan as the backend forwards it, and the status and body this route answers. The
backend's PlanExecutorDouble replays these files; this module posts every recorded plan to the
real route, with the real validation and the seeded database, and fails, naming the file, when
the answer is not the recorded one.

An exchange must not depend on the date the suite runs, or it would flake on the first of a
month: `clock_problem` rejects a plan that reads the route's clock before it is posted.
"""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from analytics.config import get_settings
from analytics.db import get_conn
from analytics.main import app

# The backend's test classpath, read across the tree like conftest.py reads its migrations.
REPO_ROOT = Path(__file__).resolve().parents[2]
EXCHANGES = REPO_ROOT / "backend" / "src" / "test" / "resources" / "plan-executor-exchanges"
EXCHANGE_FILES = sorted(EXCHANGES.glob("*.json"))
HEADERS = {"Authorization": "Bearer test-token"}


class FailingConn:
    """The `failing` database state: every query fails, whatever arguments the cursor gets."""

    def cursor(self, *args, **kwargs):
        raise RuntimeError("the recorded exchange's database is failing")


def clock_problem(plan: dict) -> str | None:
    """Why `plan`'s answer would depend on the route's clock, or None.

    The route reads today for a relative range (`lastMonths`, `yearToDate`), for a forecast, and
    for a timeseriesSplit's drift; `absolute` and `all` never read it.
    """
    range_type = plan.get("range", {}).get("type")
    if range_type not in ("absolute", "all"):
        return f"range {range_type!r} is relative to today; use an absolute range or 'all'"
    if "forecast" in plan:
        return "a forecast projects from today's bucket"
    if plan.get("groupBy") is not None and plan.get("interval") is not None:
        return "a timeseriesSplit's drift ignores today's bucket"
    return None


@pytest.fixture
def client():
    app.dependency_overrides[get_settings] = lambda: SimpleNamespace(
        tz="UTC", analytics_token="test-token"
    )
    # raise_server_exceptions=False: the `failing` exchange's 500 must come back as a response
    # (see test_error_handling.py).
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_the_exchange_directory_holds_recorded_exchanges():
    """An empty parametrization is a skip, not a failure; this is what turns a mistyped or
    emptied directory into a red suite."""
    assert EXCHANGE_FILES, f"no recorded exchanges in {EXCHANGES}"


@pytest.mark.parametrize("path", EXCHANGE_FILES, ids=[path.stem for path in EXCHANGE_FILES])
def test_the_route_answers_the_recorded_exchange(path: Path, client, request):
    exchange = json.loads(path.read_text(encoding="utf-8"))
    problem = clock_problem(exchange["plan"])
    assert problem is None, f"{path.name} depends on the date: {problem}"

    if exchange["database"] == "seeded":
        conn = request.getfixturevalue("conn")
        app.dependency_overrides[get_conn] = lambda: conn
    else:
        assert exchange["database"] == "failing", f"{path.name}: unknown database state"
        app.dependency_overrides[get_conn] = lambda: FailingConn()

    response = client.post(
        "/internal/v1/execute", headers=HEADERS, json={"profileId": 1, "plan": exchange["plan"]}
    )

    assert response.status_code == exchange["status"], f"{path.name}: {response.text}"
    assert response.json() == exchange["body"], path.name


@pytest.mark.parametrize(
    "plan",
    [
        {"version": 1, "metric": "spend", "range": {"type": "lastMonths", "n": 3}},
        {"version": 1, "metric": "spend", "range": {"type": "yearToDate"}},
        {
            "version": 2,
            "metric": "spend",
            "interval": "month",
            "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30"},
            "forecast": {"months": 3},
        },
        {
            "version": 1,
            "metric": "spend",
            "groupBy": "category",
            "interval": "month",
            "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30"},
        },
    ],
    ids=["last-months", "year-to-date", "forecast", "timeseries-split"],
)
def test_the_clock_rule_rejects_a_plan_that_reads_today(plan):
    assert clock_problem(plan) is not None


@pytest.mark.parametrize(
    "plan",
    [
        {
            "version": 1,
            "metric": "spend",
            "interval": "month",
            "range": {"type": "absolute", "from": "2026-06-01", "to": "2026-08-31"},
        },
        {"version": 1, "metric": "spend", "groupBy": "category", "range": {"type": "all"}},
    ],
    ids=["absolute-timeseries", "all-breakdown"],
)
def test_the_clock_rule_accepts_a_plan_that_never_reads_today(plan):
    assert clock_problem(plan) is None

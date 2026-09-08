import type { Plan } from '../../api/types';

const HORIZON_MONTHS = 3;

/**
 * Keeps `version` and `forecast` consistent after any chip edit. The executor
 * rejects `forecast` on a v1 plan and on any interval but `month`, so the chip
 * bar normalizes instead of letting the user assemble a plan that cannot run
 * (docs/INSIGHTS.md → Forecast).
 */
export function normalizePlanVersion(plan: Plan): Plan {
  if (plan.forecast && plan.interval === 'month') {
    return { ...plan, version: 2 };
  }
  const next: Plan = { ...plan, version: 1 };
  delete next.forecast;
  return next;
}

/** Forecast horizon. Only a monthly time axis can carry a seasonal-naive projection. */
export function ForecastChip({ plan, onChange }: { plan: Plan; onChange: (next: Plan) => void }) {
  const monthly = plan.interval === 'month';
  const known = !plan.forecast || plan.forecast.months === HORIZON_MONTHS;

  return (
    <div className="ins-chip">
      <span className="ins-chip-label">forecast</span>
      <select
        className="ins-chip-input"
        value={monthly && plan.forecast ? String(plan.forecast.months) : 'off'}
        disabled={!monthly}
        onChange={(e) =>
          onChange(
            e.target.value === 'off'
              ? { ...plan, forecast: undefined }
              : { ...plan, forecast: { months: Number(e.target.value) } },
          )
        }
        aria-label="Forecast"
      >
        <option value="off">no forecast</option>
        {/* A saved plan or hand-edited URL may carry a horizon this chip
            doesn't offer; keep it visible rather than snapping to "off" —
            same pattern as CategoryChip/RangeChip/GroupByChip/IntervalChip. */}
        {!known && monthly && (
          <option value={String(plan.forecast!.months)}>+{plan.forecast!.months} months</option>
        )}
        <option value={String(HORIZON_MONTHS)}>+{HORIZON_MONTHS} months</option>
      </select>
    </div>
  );
}

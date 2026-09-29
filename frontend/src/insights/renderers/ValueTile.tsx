import { KpiTile } from '../../components/Card';
import { formatAmount } from '../../lib/money';

/** The `value` shape: a single number, rendered as the app's existing KPI tile. */
export function ValueTile({
  currency,
  value,
  label,
}: {
  currency: string;
  value: string;
  label: string;
}) {
  return <KpiTile label={label} value={formatAmount(value, currency)} sub={currency} />;
}

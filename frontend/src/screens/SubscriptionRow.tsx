import type { BillingPeriod, SubscriptionResponse } from '../api/types';
import { PauseIcon, PencilIcon, PlayIcon, TrashIcon, XIcon } from '../components/icons';
import { formatAmount, formatDateWithYear } from '../lib/money';

const PER_LABEL: Record<BillingPeriod, string> = {
  WEEKLY: '/ wk',
  MONTHLY: '/ mo',
  QUARTERLY: '/ qtr',
  YEARLY: '/ yr',
};

interface SubscriptionRowProps {
  sub: SubscriptionResponse;
  /** True while a mutation for THIS row is in flight — its buttons disable. */
  busy: boolean;
  overdue: boolean;
  onEdit: (sub: SubscriptionResponse) => void;
  onSetStatus: (sub: SubscriptionResponse, status: SubscriptionResponse['status']) => void;
  onRequestCancel: (sub: SubscriptionResponse) => void;
  onRequestDelete: (sub: SubscriptionResponse) => void;
}

/** One row of the subscriptions table, with its status-dependent action buttons. */
export function SubscriptionRow({
  sub,
  busy,
  overdue,
  onEdit,
  onSetStatus,
  onRequestCancel,
  onRequestDelete,
}: SubscriptionRowProps) {
  return (
    <tr>
      <td>{sub.name}</td>
      <td className="text-muted">{sub.category.name}</td>
      <td>
        <span className="tag tag-neutral">{sub.billingPeriod.toLowerCase()}</span>
      </td>
      <td>
        {sub.status === 'ACTIVE' && <span className="tag tag-accent-2">active</span>}
        {sub.status === 'PAUSED' && <span className="tag tag-neutral">paused</span>}
        {sub.status === 'CANCELLED' && <span className="tag tag-outline">cancelled</span>}
      </td>
      <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
        {formatDateWithYear(sub.nextBillingOn)}
        {overdue && (
          <span className="tag tag-outline" style={{ marginLeft: 8, fontSize: 10 }}>
            overdue
          </span>
        )}
      </td>
      <td className="tnum" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {formatAmount(sub.amount, sub.currency)} {PER_LABEL[sub.billingPeriod]}
      </td>
      <td className="tnum" style={{ textAlign: 'right' }}>
        {formatAmount(sub.monthlyAmount, sub.currency)}
      </td>
      <td
        className="text-muted"
        style={{
          maxWidth: 160,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={sub.notes ?? undefined}
      >
        {sub.notes || '—'}
      </td>
      <td style={{ textAlign: 'right', width: 106 }}>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {sub.status !== 'CANCELLED' && (
            <>
              <button
                className="btn btn-icon btn-secondary"
                style={{ width: 28, height: 28 }}
                disabled={busy}
                onClick={() => onEdit(sub)}
                title="Edit"
                aria-label={`Edit ${sub.name}`}
              >
                <PencilIcon />
              </button>
              {sub.status === 'ACTIVE' ? (
                <button
                  className="btn btn-icon btn-secondary"
                  style={{ width: 28, height: 28 }}
                  disabled={busy}
                  onClick={() => onSetStatus(sub, 'PAUSED')}
                  title="Pause"
                  aria-label={`Pause ${sub.name}`}
                >
                  <PauseIcon />
                </button>
              ) : (
                <button
                  className="btn btn-icon btn-secondary"
                  style={{ width: 28, height: 28 }}
                  disabled={busy}
                  onClick={() => onSetStatus(sub, 'ACTIVE')}
                  title="Resume"
                  aria-label={`Resume ${sub.name}`}
                >
                  <PlayIcon />
                </button>
              )}
              <button
                className="btn btn-icon btn-secondary"
                style={{ width: 28, height: 28 }}
                disabled={busy}
                onClick={() => onRequestCancel(sub)}
                title="Cancel subscription"
                aria-label={`Cancel ${sub.name}`}
              >
                <XIcon />
              </button>
            </>
          )}
          {sub.status === 'CANCELLED' && (
            <>
              <button
                className="btn btn-icon btn-secondary"
                style={{ width: 28, height: 28 }}
                disabled={busy}
                onClick={() => onSetStatus(sub, 'ACTIVE')}
                title="Restore"
                aria-label={`Restore ${sub.name}`}
              >
                <PlayIcon />
              </button>
              <button
                className="btn btn-icon btn-secondary"
                style={{ width: 28, height: 28 }}
                disabled={busy}
                onClick={() => onRequestDelete(sub)}
                title="Delete permanently"
                aria-label={`Delete ${sub.name}`}
              >
                <TrashIcon size={13} />
              </button>
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

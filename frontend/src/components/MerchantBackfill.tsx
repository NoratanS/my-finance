import { useState } from 'react';
import { useBackfillMerchant, useMerchantSuggestions } from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import { Card } from './Card';

/**
 * Turns repeated descriptions into merchants, one group at a time. The server suggests the
 * description itself (docs/API.md "GET /api/transactions/merchant-suggestions"); the value stays
 * editable here because the suggester deliberately does not guess.
 */
export function MerchantBackfill() {
  const suggestions = useMerchantSuggestions();
  const backfill = useBackfillMerchant();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const list = suggestions.data ?? [];
  if (list.length === 0) return null;

  const apply = (description: string) => {
    const merchant = (edits[description] ?? description).trim();
    if (!merchant) {
      setError('A merchant name is required.');
      return;
    }
    setError('');
    backfill.mutate(
      { description, merchant },
      {
        onError: (err) => setError(problemMessages(err).banner),
      },
    );
  };

  return (
    <Card style={{ padding: '16px 20px', marginBottom: 24 }}>
      <div className="kicker">Set merchants from descriptions</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>
        These descriptions repeat and have no merchant yet. Applying one labels every matching
        transaction, so insights can compare merchant against merchant.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((suggestion) => (
          <div
            key={suggestion.description}
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ minWidth: 180 }}>{suggestion.description}</span>
            <span className="tag tag-neutral">{suggestion.transactionCount} transactions</span>
            <input
              className="input"
              style={{ width: 200, minHeight: 32, padding: '4px 10px', fontSize: 13 }}
              value={edits[suggestion.description] ?? suggestion.description}
              onChange={(e) => setEdits({ ...edits, [suggestion.description]: e.target.value })}
              aria-label={`Merchant for ${suggestion.description}`}
            />
            <button
              className="btn btn-secondary"
              onClick={() => apply(suggestion.description)}
              disabled={backfill.isPending}
            >
              Apply
            </button>
          </div>
        ))}
      </div>
      {error && (
        <div className="error-box" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </Card>
  );
}

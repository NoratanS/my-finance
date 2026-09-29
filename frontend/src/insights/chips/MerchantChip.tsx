import { useState } from 'react';
import type { Plan } from '../../api/types';

/**
 * filters.merchants as a comma-separated list. Free text on purpose: merchants are free text on
 * the transaction (docs/SCHEMA.md "txn"), matched by literal equality, so a picker would have to
 * fetch a list the profile may not have curated yet.
 */
export function MerchantChip({ plan, onChange }: { plan: Plan; onChange: (plan: Plan) => void }) {
  const merchants = plan.filters.merchants ?? [];
  const joined = merchants.join(', ');
  const [text, setText] = useState(joined);

  // A template or a saved insight can replace the plan under us; follow it.
  const [prevJoined, setPrevJoined] = useState(joined);
  if (joined !== prevJoined) {
    setPrevJoined(joined);
    setText(joined);
  }

  const commit = () => {
    const parsed = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const filters = { ...plan.filters };
    if (parsed.length === 0) delete filters.merchants;
    else filters.merchants = parsed;
    onChange({ ...plan, filters });
  };

  return (
    <div className="ins-chip">
      <span className="ins-chip-label">merchants</span>
      <input
        className="ins-chip-input"
        style={{ width: 160, cursor: 'text' }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder="Lidl, Biedronka"
        aria-label="Merchant filter"
      />
    </div>
  );
}

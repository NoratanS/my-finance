import { useNarrate } from '../api/hooks';
import type { Plan } from '../api/types';

/**
 * The one-sentence caption beside a chart. Every number in it was computed by
 * the analytics service and checked against the executed envelope before the
 * sentence was accepted (docs/INSIGHTS.md "The AI layer") — the model chose the
 * words, never the values.
 *
 * Not gated on `capabilities.interpret`: the fallback caption is built by
 * construction from the same facts when no model is present, so the button
 * always works and the frontend has no way — nor any reason — to tell the two
 * paths apart. A failed narrate (503, or the request never lands) is not an
 * error: the chart already rendered from Run's own envelope, so nothing is
 * lost. We say nothing about it — no error box, no muted "isn't running"
 * message — the button simply re-enables for another try.
 */
export function Caption({ plan }: { plan: Plan }) {
  const narrate = useNarrate();
  // Only show a caption that was asked for THIS plan: editing a chip must not
  // leave the previous question's sentence sitting beside the new chart.
  const fresh =
    narrate.data !== undefined && JSON.stringify(narrate.variables) === JSON.stringify(plan);

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
      <button
        className="btn btn-ghost"
        style={{ minHeight: 28, padding: '2px 10px', fontSize: 13 }}
        disabled={narrate.isPending}
        onClick={() => narrate.mutate(plan)}
        aria-label="Explain this chart"
      >
        {narrate.isPending ? 'explaining…' : 'explain'}
      </button>
      {fresh && narrate.data && (
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          {narrate.data.caption}
        </p>
      )}
    </div>
  );
}

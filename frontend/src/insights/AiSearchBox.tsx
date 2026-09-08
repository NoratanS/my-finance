import { useState } from 'react';
import { ApiError, isAbortError } from '../api/client';
import { useAiCapabilities, useInterpret } from '../api/hooks';
import type { Plan } from '../api/types';
import { Card } from '../components/Card';
import { useSlowPending } from './useSlowPending';

/** Mirrors the backend's `@Size(max = 500)` on `InterpretRequest.text` (docs/API.md). */
const TEXT_LIMIT = 500;
/** The remaining-characters counter only earns its space once the limit is actually in view. */
const COUNTER_THRESHOLD = TEXT_LIMIT - 80;

/**
 * Free-text authoring for an insight. The model only translates: the draft it
 * returns lands in the chip bar as ordinary editable state and runs through the
 * normal executor (docs/INSIGHTS.md -> "The AI layer"). It never runs on its
 * own — `onDraft` hands the plan to the chips, unrun, exactly like a template.
 *
 * When interpretation is unavailable — no Ollama container on this instance —
 * the box renders nothing at all, and the templates and chips below carry on
 * unchanged. No feature exists only behind the AI.
 */
export function AiSearchBox({ onDraft }: { onDraft: (plan: Plan) => void }) {
  const capabilities = useAiCapabilities();
  const interpret = useInterpret();
  // After a few seconds, admit a local model can take a while — the backend's own
  // read timeout is 130s (Task 16), so a silent spinner would otherwise look hung.
  const slow = useSlowPending(interpret.isPending);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  /** 422: the feature declining — a normal outcome, never a crash. */
  const [declined, setDeclined] = useState('');
  /** 503 or anything else: something is actually broken. */
  const [error, setError] = useState('');

  if (capabilities.data?.interpret !== true) return null;

  const ask = () => {
    if (interpret.isPending) return;
    const question = text.trim();
    if (question === '') return;
    setNotes([]);
    setDeclined('');
    setError('');
    interpret.mutate(
      { text: question, currentPlan: null },
      {
        onSuccess: (draft) => {
          setNotes(draft.notes);
          onDraft(draft.plan);
        },
        onError: (err) => {
          // A user-triggered Cancel, not a failure — the button just re-enables.
          if (isAbortError(err)) return;
          if (err instanceof ApiError && err.type === '/errors/interpret-failed') {
            // Same quiet, box-less treatment as the explorer's own "no transactions match
            // this plan" empty state — the chips and templates are still right there.
            setDeclined("Couldn't turn that into a plan — try rephrasing, or use the chips below.");
          } else if (err instanceof ApiError && err.type === '/errors/analytics-unavailable') {
            // Exact wording ExecutionError already uses for the same underlying condition
            // on Run (Insights.tsx) — one voice for "analytics is down" across the screen.
            setError("Analytics is offline right now — the analytics service isn't running.");
          } else {
            setError('Could not interpret that — is the backend running?');
          }
        },
      },
    );
  };

  const remaining = TEXT_LIMIT - text.length;

  return (
    <Card style={{ padding: '18px 20px' }}>
      <div className="kicker">Ask a question</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <input
          id="ai-question"
          className="input"
          style={{ flex: 1 }}
          value={text}
          maxLength={TEXT_LIMIT}
          onChange={(e) => {
            setText(e.target.value);
            setDeclined('');
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask();
          }}
          placeholder="e.g. how much did I spend on groceries last month"
          aria-label="Ask about your money"
        />
        <button
          className="btn btn-primary"
          onClick={ask}
          disabled={interpret.isPending || text.trim() === ''}
        >
          {interpret.isPending ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {text.length >= COUNTER_THRESHOLD && (
        <div className="text-muted" style={{ fontSize: 11, textAlign: 'right', marginTop: 4 }}>
          {remaining} left
        </div>
      )}
      {slow && (
        <div
          className="text-muted"
          style={{ fontSize: 12, marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}
        >
          Still working — local models can be slow.
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '1px 10px', fontSize: 12 }}
            onClick={() => interpret.cancel()}
          >
            Cancel
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="text-muted" style={{ fontSize: 12, margin: '10px 0 0', paddingLeft: 18 }}>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {declined !== '' && (
        <p className="text-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          {declined}
        </p>
      )}
      {error !== '' && (
        <div className="error-box" role="alert" style={{ marginTop: 10, fontSize: 12 }}>
          {error}
        </div>
      )}
      <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
        The model only fills in the chips below — every number comes from your own transactions.
      </div>
    </Card>
  );
}

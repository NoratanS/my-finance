import { useState } from 'react';
import { ApiError, isAbortError } from '../api/client';
import { useAiCapabilities, useInterpret } from '../api/hooks';
import type { Plan } from '../api/types';
import { useSlowPending } from './useSlowPending';

/**
 * Mirrors the backend's `@Size(max = 500)` on `InterpretRequest.text` — the
 * same bound AiSearchBox enforces on its own input — so a long follow-up
 * can't turn into a confusing 400 instead of the refinement it asked for.
 */
const TEXT_LIMIT = 500;

/**
 * "And only this year?" — a follow-up edits the plan rather than re-deriving
 * it: the current plan travels with the text, the model returns the modified
 * plan, and it lands back in the chips as an editable draft, unrun, exactly
 * like the search box's own draft (docs/INSIGHTS.md -> "The AI layer").
 *
 * Same capability gate and error treatment as AiSearchBox, so the two read as
 * one feature: no model, no input at all; 422 is the feature declining (plain
 * text, no box); 503 (or anything else) is something actually broken (boxed).
 */
export function FollowUp({
  currentPlan,
  onPlan,
}: {
  currentPlan: Plan;
  onPlan: (plan: Plan) => void;
}) {
  const [text, setText] = useState('');
  /** 422: the feature declining — a normal outcome, never a crash. */
  const [declined, setDeclined] = useState('');
  /** 503 or anything else: something is actually broken. */
  const [error, setError] = useState('');
  const capabilities = useAiCapabilities();
  const interpret = useInterpret();
  // Same "admit it's still working" feedback as AiSearchBox, once a call runs long.
  const slow = useSlowPending(interpret.isPending);

  if (capabilities.data?.interpret !== true) return null;

  const submit = () => {
    // Guards Enter the same way the button's `disabled` guards a click: without
    // it, a rapid double-Enter while the first request is still in flight would
    // fire a second one (Task 12's deferred regression, closed here).
    if (interpret.isPending) return;
    const followUp = text.trim();
    if (followUp === '') return;
    setDeclined('');
    setError('');
    interpret.mutate(
      { text: followUp, currentPlan },
      {
        onSuccess: (result) => {
          onPlan(result.plan);
          setText('');
        },
        onError: (err) => {
          // A user-triggered Cancel, not a failure — the button just re-enables.
          if (isAbortError(err)) return;
          if (err instanceof ApiError && err.type === '/errors/interpret-failed') {
            setDeclined("Couldn't refine this one — try rephrasing, or edit the chips directly.");
          } else if (err instanceof ApiError && err.type === '/errors/analytics-unavailable') {
            // Same wording ExecutionError and AiSearchBox use for the same condition.
            setError("Analytics is offline right now — the analytics service isn't running.");
          } else {
            setError('Could not refine this insight — is the backend running?');
          }
        },
      },
    );
  };

  return (
    <div className="field" style={{ marginTop: 12 }}>
      <label htmlFor="insight-followup">Follow-up</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="insight-followup"
          className="input"
          value={text}
          maxLength={TEXT_LIMIT}
          onChange={(e) => {
            setText(e.target.value);
            setDeclined('');
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="e.g. and only this year?"
          aria-label="Follow-up question"
        />
        <button
          className="btn btn-secondary"
          onClick={submit}
          disabled={interpret.isPending || text.trim() === ''}
        >
          {interpret.isPending ? 'refining…' : 'refine'}
        </button>
      </div>
      {slow && (
        <div
          className="text-muted"
          style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}
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
      {declined !== '' && (
        <p className="text-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
          {declined}
        </p>
      )}
      {error !== '' && (
        <div className="error-box" role="alert" style={{ marginTop: 6, fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

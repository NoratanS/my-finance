import { useState } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import {
  useCreateInsight,
  useDeleteInsight,
  useInsight,
  useInsights,
  useUpdateInsight,
} from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import type { Insight as SavedInsight, Plan } from '../api/types';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TrashIcon } from '../components/icons';
import { planToSearch } from './planDefaults';

/**
 * The "save this exploration" side of the explorer: the name field and
 * Save/New-insight buttons, the list of saved insights (open/pin/delete),
 * and the delete confirmation dialog. Owns its own save/pin/delete mutations
 * and the transient name-draft/save-error/pending-delete state; the plan
 * itself and the URL (which insight is open) still belong to the composition
 * root, since the template picker there also needs to reset the name draft.
 */
export function SaveControls({
  saved,
  plan,
  view,
  openId,
  setSearchParams,
  nameDraft,
  setNameDraft,
  saveError,
  setSaveError,
}: {
  saved: ReturnType<typeof useInsight>;
  plan: Plan;
  view: 'chart' | 'table';
  openId: number;
  setSearchParams: SetURLSearchParams;
  nameDraft: string | null;
  setNameDraft: (draft: string | null) => void;
  saveError: string;
  setSaveError: (error: string) => void;
}) {
  const insights = useInsights();
  const createInsight = useCreateInsight();
  const updateInsight = useUpdateInsight();
  const deleteInsight = useDeleteInsight();
  // The saved insight awaiting delete confirmation, or null when no dialog is open.
  const [confirmInsight, setConfirmInsight] = useState<SavedInsight | null>(null);

  const name = nameDraft ?? saved.data?.name ?? '';
  const list = insights.data ?? [];

  const onSaveError = (err: unknown) => {
    setSaveError(problemMessages(err, { withCode: true }).banner);
  };

  const openSaved = (insight: SavedInsight) => {
    setNameDraft(null);
    setSaveError('');
    // Both params: until useInsight resolves, ?plan= keeps the chips on this
    // insight's plan instead of flashing back to the default one.
    setSearchParams({ insight: String(insight.id), plan: planToSearch(insight.plan) });
  };

  const startNew = () => {
    setNameDraft(null);
    setSaveError('');
    setSearchParams({});
  };

  /** Save creates, or replaces the open insight (which is also the rename). */
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setSaveError('Give the insight a name first.');
      return;
    }
    setSaveError('');
    // The toggle is part of the saved question: `null` means "the default
    // chart for this shape", which is what SCHEMA.md's `viz` column documents.
    const viz = view === 'table' ? { chart: 'table' as const } : null;
    if (saved.data) {
      updateInsight.mutate(
        { id: saved.data.id, body: { name: trimmed, plan, viz, pinned: saved.data.pinned } },
        { onSuccess: () => setNameDraft(null), onError: onSaveError },
      );
    } else {
      createInsight.mutate(
        { name: trimmed, plan, viz },
        {
          onSuccess: (created) => {
            setNameDraft(null);
            setSearchParams(
              { insight: String(created.id), plan: planToSearch(plan) },
              { replace: true },
            );
          },
          onError: onSaveError,
        },
      );
    }
  };

  const togglePin = (insight: SavedInsight) => {
    setSaveError('');
    updateInsight.mutate(
      {
        id: insight.id,
        body: {
          name: insight.name,
          plan: insight.plan,
          viz: insight.viz,
          pinned: !insight.pinned,
        },
      },
      { onError: onSaveError },
    );
  };

  const remove = (insight: SavedInsight) => {
    setSaveError('');
    deleteInsight.mutate(insight.id, {
      onSuccess: () => {
        if (openId === insight.id) setSearchParams({});
      },
      onError: onSaveError,
    });
  };

  const busy = createInsight.isPending || updateInsight.isPending;
  const nameHasError = saveError !== '';

  return (
    <>
      <Card style={{ padding: '18px 20px' }}>
        <h4 style={{ margin: '0 0 12px' }}>{saved.data ? 'Saved insight' : 'Save this insight'}</h4>
        <div className="field">
          <label htmlFor="insight-name">Name</label>
          <input
            id="insight-name"
            className="input"
            value={name}
            onChange={(e) => {
              setNameDraft(e.target.value);
              setSaveError('');
            }}
            placeholder="e.g. Groceries, monthly"
            aria-label="Insight name"
            aria-describedby={nameHasError ? 'insight-name-error' : undefined}
            aria-invalid={nameHasError || undefined}
          />
        </div>
        {saveError && (
          <div id="insight-name-error" className="error-box" role="alert" style={{ marginTop: 10 }}>
            {saveError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {saved.data ? 'Save changes' : 'Save'}
          </button>
          {saved.data && (
            <button className="btn btn-secondary" onClick={startNew}>
              New insight
            </button>
          )}
        </div>
      </Card>

      <Card style={{ padding: '18px 20px' }}>
        <h4 style={{ margin: '0 0 12px' }}>Saved</h4>
        {list.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((insight) => (
              <div
                key={insight.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
              >
                <button
                  className="btn btn-ghost"
                  style={{ padding: 0, flex: 1, justifyContent: 'flex-start' }}
                  onClick={() => openSaved(insight)}
                >
                  {insight.name}
                </button>
                {insight.pinned && <span className="tag tag-accent-2">pinned</span>}
                <button
                  className="btn btn-ghost"
                  style={{ padding: '2px 8px' }}
                  onClick={() => togglePin(insight)}
                  disabled={updateInsight.isPending}
                  aria-label={`${insight.pinned ? 'Unpin' : 'Pin'} ${insight.name}`}
                >
                  {insight.pinned ? 'unpin' : 'pin'}
                </button>
                <button
                  className="btn btn-icon btn-ghost"
                  onClick={() => setConfirmInsight(insight)}
                  disabled={deleteInsight.isPending}
                  title="Delete permanently"
                  aria-label={`Delete ${insight.name}`}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            Nothing saved yet. Build a plan with the chips, run it, then give it a name.
          </p>
        )}
      </Card>

      {confirmInsight && (
        <ConfirmDialog
          title={`Delete the saved insight "${confirmInsight.name}"?`}
          body="This can't be undone."
          confirmLabel="Delete"
          onClose={() => setConfirmInsight(null)}
          onConfirm={() => {
            remove(confirmInsight);
            setConfirmInsight(null);
          }}
        />
      )}
    </>
  );
}

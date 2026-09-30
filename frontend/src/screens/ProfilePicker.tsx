import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useCreateProfile,
  useDeleteProfile,
  useExportBackup,
  useRenameProfile,
  useRestoreBackup,
  useSession,
  useSetActiveProfile,
} from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import type { ProfileSummary, RestoredProfileSummary } from '../api/types';
import { Corners } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowRightIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/icons';
import { CURRENCY_OPTIONS } from '../lib/money';

/**
 * Only an absolute in-app path is accepted as a deep-link destination — never a
 * protocol-relative ("//host/…") or absolute URL, so this can't become an
 * off-site redirect (G7). Also rejects a backslash (browsers normalise `\` to
 * `/` in location.pathname, the only place this value comes from today, so
 * "/\evil.com" is unreachable in practice) and control characters — the guard
 * is one refactor away from mattering if this ever becomes attacker-supplied.
 */
function safeDeepLink(value: unknown): string | null {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    // eslint-disable-next-line no-control-regex -- deliberately matching control chars
    !/[\x00-\x1f\x7f]/.test(value)
    ? value
    : null;
}

export function ProfilePicker() {
  const { data: session } = useSession();
  const setActiveProfile = useSetActiveProfile();
  const createProfile = useCreateProfile();
  const renameProfile = useRenameProfile();
  const deleteProfile = useDeleteProfile();
  const exportBackup = useExportBackup();
  const restoreBackup = useRestoreBackup();
  const navigate = useNavigate();
  const location = useLocation();

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExport, setShowExport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [backupError, setBackupError] = useState('');
  const [backupProblems, setBackupProblems] = useState<string[]>([]);
  const [restoreSummary, setRestoreSummary] = useState<RestoredProfileSummary[] | null>(null);

  // Rename: one profile card at a time, or none.
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');

  // Delete: the profile awaiting confirmation, or null when no dialog is open.
  const [deleteTarget, setDeleteTarget] = useState<ProfileSummary | null>(null);
  // A failed pick or delete — shown below the cards, where both were clicked.
  const [cardError, setCardError] = useState('');

  if (!session) return null;
  const profiles = session.profiles;

  const pick = (profileId: number) => {
    setCardError('');
    setActiveProfile.mutate(profileId, {
      onSuccess: () =>
        navigate(safeDeepLink((location.state as { from?: unknown } | null)?.from) ?? '/'),
      onError: (err) => setCardError(problemMessages(err).banner),
    });
  };

  const startRename = (profile: ProfileSummary) => {
    setRenameError('');
    setRenamingId(profile.id);
    setRenameValue(profile.name);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameError('');
  };

  const saveRename = (e: React.FormEvent, id: number) => {
    e.preventDefault();
    if (renameProfile.isPending) return; // Enter bypasses the button's disabled state.
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameError('');
    renameProfile.mutate(
      { id, body: { name: trimmed } },
      {
        onSuccess: () => setRenamingId(null),
        onError: (err) => setRenameError(problemMessages(err).banner),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setCardError('');
    setDeleteTarget(null);
    deleteProfile.mutate(id, {
      onError: (err) => setCardError(problemMessages(err).banner),
    });
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (createProfile.isPending) return; // Enter bypasses the button's disabled state.
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    createProfile.mutate(
      { name: trimmed, defaultCurrency: currency },
      {
        onSuccess: () => {
          setName('');
          setShowNew(false);
        },
        onError: (err) => setError(problemMessages(err).banner),
      },
    );
  };

  const clearBackupFeedback = () => {
    setBackupError('');
    setBackupProblems([]);
    setRestoreSummary(null);
  };

  const openExport = () => {
    clearBackupFeedback();
    // All profiles checked by default.
    setSelectedIds(profiles.map((p) => p.id));
    setShowExport(true);
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const doExport = () => {
    clearBackupFeedback();
    exportBackup.mutate(selectedIds, {
      onSuccess: ({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        // Safari may resolve the blob URL after the current task; revoking
        // synchronously can abort the download, so defer it.
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setShowExport(false);
      },
      onError: (err) => setBackupError(problemMessages(err).banner),
    });
  };

  const restoreFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    clearBackupFeedback();
    restoreBackup.mutate(file, {
      onSuccess: (result) => setRestoreSummary(result.profiles),
      onError: (err) => {
        // 422 /errors/backup-invalid pinpoints the bad entries in its Problem list.
        const messages = problemMessages(err);
        setBackupError(messages.banner);
        setBackupProblems(messages.problemList);
      },
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ width: 'min(720px, 100%)' }}>
        {session.activeProfileId !== null && (
          <div style={{ marginBottom: 14 }}>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              ← Back
            </button>
          </div>
        )}
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-700)',
            }}
          >
            my-finance
          </div>
          <h1 style={{ margin: '8px 0 6px' }}>Choose a profile</h1>
          <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
            Each profile is a fully separate space — its own transactions, categories and budgets.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {profiles.map((p) =>
            renamingId === p.id ? (
              <form
                key={p.id}
                className="blueprint profile-card"
                onSubmit={(e) => saveRename(e, p.id)}
              >
                <Corners />
                <div className="field">
                  <label htmlFor={`rename-${p.id}`}>Rename {p.name}</label>
                  <input
                    id={`rename-${p.id}`}
                    className="input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                  />
                </div>
                {renameError && <div className="error-box">{renameError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={renameProfile.isPending}
                  >
                    Save
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={cancelRename}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div key={p.id} className="blueprint profile-card">
                <Corners />
                <button className="profile-card-pick" onClick={() => pick(p.id)}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 24 }}
                    >
                      {p.name}
                    </span>
                    <span className="tag tag-accent">{p.defaultCurrency}</span>
                  </div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    Default currency {p.defaultCurrency}
                    {p.id === session.activeProfileId ? ' · currently active' : ''}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--color-accent-700)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    Open profile <ArrowRightIcon />
                  </div>
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => startRename(p)}
                    aria-label="Rename profile"
                  >
                    <PencilIcon /> Rename
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setCardError('');
                      setDeleteTarget(p);
                    }}
                    aria-label="Delete profile"
                  >
                    <TrashIcon /> Delete
                  </button>
                </div>
              </div>
            ),
          )}
          {profiles.length === 0 && (
            <p
              className="text-muted"
              style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 14 }}
            >
              No profiles yet — create the first one below.
            </p>
          )}
        </div>
        {cardError && (
          <div className="error-box" style={{ marginTop: 14 }}>
            {cardError}
          </div>
        )}
        <div style={{ marginTop: 28 }}>
          {showNew ? (
            <div
              className="blueprint"
              style={{ padding: 22, border: '1px solid var(--color-divider)' }}
            >
              <Corners />
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  fontSize: 18,
                  marginBottom: 14,
                }}
              >
                New profile
              </div>
              <form
                onSubmit={create}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr auto auto',
                  gap: 12,
                  alignItems: 'end',
                }}
              >
                <div className="field">
                  <label htmlFor="profile-name">Name</label>
                  <input
                    id="profile-name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Household"
                    aria-label="Profile name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="profile-currency">Default currency</label>
                  <select
                    id="profile-currency"
                    className="input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    aria-label="Default currency"
                  >
                    {CURRENCY_OPTIONS.map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createProfile.isPending}
                >
                  Create
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
                  Cancel
                </button>
              </form>
              {error && (
                <div className="error-box" style={{ marginTop: 10 }}>
                  {error}
                </div>
              )}
              <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
                Creating a profile does not switch to it — you pick it explicitly, per the API
                contract.
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setShowNew(true)}>
                <PlusIcon />
                New profile
              </button>
            </div>
          )}
        </div>
        <div style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid var(--color-divider)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>
                Backup
              </div>
              <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                Download selected profiles as a JSON file, or restore one — restoring always creates
                new profiles.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {profiles.length > 0 && (
                <button className="btn btn-secondary" onClick={openExport}>
                  Download backup
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={restoreBackup.isPending}
              >
                {restoreBackup.isPending ? 'Restoring…' : 'Restore from backup'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                aria-label="Backup file"
                onChange={restoreFromFile}
              />
            </div>
          </div>
          {showExport && (
            <div
              className="blueprint"
              style={{ padding: 18, marginTop: 14, border: '1px solid var(--color-divider)' }}
            >
              <Corners />
              <div style={{ fontSize: 13, marginBottom: 10 }}>Profiles to include</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                {profiles.map((p) => (
                  <label
                    key={p.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggleSelected(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  className="btn btn-primary"
                  onClick={doExport}
                  disabled={selectedIds.length === 0 || exportBackup.isPending}
                >
                  Download
                </button>
                <button className="btn btn-ghost" onClick={() => setShowExport(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {restoreSummary && (
            <div
              className="blueprint"
              style={{ padding: 18, marginTop: 14, border: '1px solid var(--color-divider)' }}
            >
              <Corners />
              <div style={{ fontSize: 13, marginBottom: 8 }}>Backup restored</div>
              <ul className="text-muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {restoreSummary.map((p) => (
                  <li key={p.id}>
                    <strong style={{ color: 'var(--color-text)' }}>{p.name}</strong> —{' '}
                    {p.categories} categories, {p.transactions} transactions, {p.budgets} budgets,{' '}
                    {p.subscriptions} subscriptions
                  </li>
                ))}
              </ul>
            </div>
          )}
          {backupError && (
            <div className="error-box" style={{ marginTop: 14 }}>
              {backupError}
              {backupProblems.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {backupProblems.map((problem, i) => (
                    <li key={i}>{problem}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete the profile "${deleteTarget.name}"?`}
          body="This deletes everything in it — categories, transactions, budgets, subscriptions and insights. This can't be undone."
          confirmLabel="Delete"
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

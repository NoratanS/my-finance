import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  useCreateProfile,
  useExportBackup,
  useRestoreBackup,
  useSession,
  useSetActiveProfile,
} from '../api/hooks';
import type { RestoredProfileSummary } from '../api/types';
import { Corners } from '../components/Card';
import { ArrowRightIcon, PlusIcon } from '../components/icons';

export function ProfilePicker() {
  const { data: session } = useSession();
  const setActiveProfile = useSetActiveProfile();
  const createProfile = useCreateProfile();
  const exportBackup = useExportBackup();
  const restoreBackup = useRestoreBackup();
  const navigate = useNavigate();

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

  if (!session) return null;
  const profiles = session.profiles;

  const pick = (profileId: number) => {
    setActiveProfile.mutate(profileId, { onSuccess: () => navigate('/') });
  };

  const create = () => {
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
        onError: (err) => {
          setError(err instanceof ApiError ? err.detail : 'Could not create the profile.');
        },
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
      onError: (err) => {
        setBackupError(err instanceof ApiError ? err.detail : 'Could not export the backup.');
      },
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
        if (err instanceof ApiError) {
          setBackupError(err.detail);
          // 422 /errors/backup-invalid pinpoints the bad entries.
          if (err.type === '/errors/backup-invalid' && Array.isArray(err.extra.problems)) {
            setBackupProblems(err.extra.problems as string[]);
          }
        } else {
          setBackupError('Could not restore the backup.');
        }
      },
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ width: 'min(720px, 100%)' }}>
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
          {profiles.map((p) => (
            <button key={p.id} className="blueprint profile-card" onClick={() => pick(p.id)}>
              <Corners />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 24 }}>
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
          ))}
          {profiles.length === 0 && (
            <p
              className="text-muted"
              style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 14 }}
            >
              No profiles yet — create the first one below.
            </p>
          )}
        </div>
        <div style={{ marginTop: 28 }}>
          {showNew ? (
            <div className="blueprint" style={{ padding: 22, border: '1px solid var(--color-divider)' }}>
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
              <div
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
                    <option>PLN</option>
                    <option>EUR</option>
                    <option>USD</option>
                    <option>GBP</option>
                  </select>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={create}
                  disabled={createProfile.isPending}
                >
                  Create
                </button>
                <button className="btn btn-ghost" onClick={() => setShowNew(false)}>
                  Cancel
                </button>
              </div>
              {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
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
        <div
          style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid var(--color-divider)' }}
        >
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
                Download selected profiles as a JSON file, or restore one — restoring always
                creates new profiles.
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
    </div>
  );
}

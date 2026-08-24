import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useCreateProfile, useSession, useSetActiveProfile } from '../api/hooks';
import { Corners } from '../components/Card';
import { ArrowRightIcon, PlusIcon } from '../components/icons';

export function ProfilePicker() {
  const { data: session } = useSession();
  const setActiveProfile = useSetActiveProfile();
  const createProfile = useCreateProfile();
  const navigate = useNavigate();

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [error, setError] = useState('');

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
                  <label>Name</label>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Household"
                    aria-label="Profile name"
                  />
                </div>
                <div className="field">
                  <label>Default currency</label>
                  <select
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
      </div>
    </div>
  );
}

import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useLogout, useSession, useSetActiveProfile } from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import { PlusIcon } from './icons';
import { useTxnModal } from './TxnModal';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/categories', label: 'Categories' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/insights', label: 'Insights' },
];

export function Nav() {
  const { data: session } = useSession();
  const setActiveProfile = useSetActiveProfile();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const { openTxnModal } = useTxnModal();
  // A failed profile switch or log-out; cleared when the next one starts.
  const [error, setError] = useState('');

  if (!session) return null;

  const onError = (err: unknown) => setError(problemMessages(err).banner);

  const onProfileSelect = (value: string) => {
    if (value === '__picker') {
      // Just navigate — the server-side active profile is left as-is;
      // picking again re-scopes.
      navigate('/picker');
      return;
    }
    const profileId = Number(value);
    if (profileId === session.activeProfileId) return;
    setError('');
    setActiveProfile.mutate(profileId, {
      onSuccess: () => {
        // Stay on the same screen, but drop filters tied to the old profile.
        navigate(location.pathname, { replace: true });
      },
      // The select snaps back to the active profile on its own; this says why.
      onError,
    });
  };

  return (
    <nav
      className="nav"
      style={{ padding: '18px 0', borderBottom: '1px solid var(--color-divider)' }}
    >
      <span className="nav-brand" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        my-finance
      </span>
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          style={({ isActive }) => ({
            fontSize: 14,
            textDecoration: 'none',
            ...(isActive
              ? { color: 'var(--color-accent)', fontWeight: 500 }
              : { color: 'inherit' }),
          })}
        >
          {link.label}
        </NavLink>
      ))}
      <select
        className="input"
        style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: 13 }}
        value={session.activeProfileId ?? ''}
        onChange={(e) => onProfileSelect(e.target.value)}
        aria-label="Active profile"
      >
        {session.profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.defaultCurrency}
          </option>
        ))}
        <option value="__picker">Switch profile…</option>
      </select>
      <button className="btn btn-primary" onClick={openTxnModal}>
        <PlusIcon />
        Add transaction
      </button>
      {/* Passwordless: logging out is pointless, the server re-authenticates the next request. */}
      {session.authMode === 'NONE' ? (
        <NavLink
          to="/settings/password"
          className="btn btn-ghost"
          style={{ fontSize: 13, textDecoration: 'none' }}
        >
          Set password
        </NavLink>
      ) : (
        <button
          className="btn btn-ghost"
          style={{ fontSize: 13 }}
          onClick={() => {
            setError('');
            logout.mutate(undefined, { onSuccess: () => navigate('/auth'), onError });
          }}
        >
          Log out
        </button>
      )}
      {/* Its own row under the controls: .nav wraps. */}
      {error && (
        <div className="error-box" role="alert" style={{ flex: '1 0 100%' }}>
          {error}
        </div>
      )}
    </nav>
  );
}

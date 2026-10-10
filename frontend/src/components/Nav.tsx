import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { chooseProfile, useActiveProfileId, useProfiles } from '../api/hooks';
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
  const { data: profiles } = useProfiles();
  const activeProfileId = useActiveProfileId();
  const navigate = useNavigate();
  const location = useLocation();
  const { openTxnModal } = useTxnModal();

  if (!profiles) return null;

  const onProfileSelect = (value: string) => {
    if (value === '__picker') {
      // Just navigate — the active profile is left as it is; picking again changes it.
      navigate('/picker');
      return;
    }
    const profileId = Number(value);
    if (profileId === activeProfileId) return;
    chooseProfile(profileId);
    // Stay on the same screen, but drop filters tied to the old profile.
    navigate(location.pathname, { replace: true });
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
        value={activeProfileId ?? ''}
        onChange={(e) => onProfileSelect(e.target.value)}
        aria-label="Active profile"
      >
        {profiles.map((p) => (
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
    </nav>
  );
}

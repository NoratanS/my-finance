import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useActiveProfile, useForgetDanglingActiveProfile, useProfiles } from './api/hooks';
import { problemMessages } from './api/problemMessages';
import { Nav } from './components/Nav';
import { TxnModalProvider } from './components/TxnModal';
import { Budgets } from './screens/Budgets';
import { Categories } from './screens/Categories';
import { Dashboard } from './screens/Dashboard';
import { Insights } from './screens/Insights';
import { ProfilePicker } from './screens/ProfilePicker';
import { Subscriptions } from './screens/Subscriptions';
import { Transactions } from './screens/Transactions';

function LoadingSplash() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <span className="text-muted" style={{ fontSize: 14 }}>
        Loading…
      </span>
    </div>
  );
}

/**
 * Every route waits for the profile list, because the list decides what opens: with no
 * Profiles the picker is the first-profile screen, and the Profile this tab remembers
 * opens the app only if the list has it. Without the list nothing can be decided, so a
 * failure to load it is said here and nowhere else.
 */
function ProfilesGate() {
  const profiles = useProfiles();
  useForgetDanglingActiveProfile();
  if (profiles.data) return <Outlet />;
  if (profiles.isPending) return <LoadingSplash />;
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="error-box" role="alert">
          {problemMessages(profiles.error).banner}
        </div>
        <button
          className="btn btn-secondary"
          style={{ marginTop: 14 }}
          onClick={() => profiles.refetch()}
          disabled={profiles.isFetching}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

/** App routes — need an Active profile. */
function AppLayout() {
  const activeProfile = useActiveProfile();
  const location = useLocation();
  // Deep link: carry where the owner was trying to go so the picker can
  // send them there instead of always landing on the dashboard.
  if (!activeProfile) {
    return <Navigate to="/picker" state={{ from: location.pathname + location.search }} replace />;
  }
  return (
    <TxnModalProvider>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px 48px' }}>
        <Nav />
        <Outlet />
      </div>
    </TxnModalProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<ProfilesGate />}>
        <Route path="/picker" element={<ProfilePicker />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/insights" element={<Insights />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

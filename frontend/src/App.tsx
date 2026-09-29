import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_EVENT, type AuthErrorDetail } from './api/client';
import { sessionKey, useSession } from './api/hooks';
import type { SessionResponse } from './api/types';
import { AuthScreen } from './auth/AuthScreen';
import { Nav } from './components/Nav';
import { TxnModalProvider } from './components/TxnModal';
import { Budgets } from './screens/Budgets';
import { Categories } from './screens/Categories';
import { Dashboard } from './screens/Dashboard';
import { Insights } from './screens/Insights';
import { ProfilePicker } from './screens/ProfilePicker';
import { SetPassword } from './screens/SetPassword';
import { Subscriptions } from './screens/Subscriptions';
import { Transactions } from './screens/Transactions';

/** Global handling for 401 (-> auth) and 409 no-active-profile (-> picker). */
function AuthErrorListener() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    const onAuthError = (event: Event) => {
      const { kind } = (event as CustomEvent<AuthErrorDetail>).detail;
      if (kind === 'unauthenticated') {
        queryClient.setQueryData(sessionKey, null);
        navigate('/auth');
      } else {
        queryClient.setQueryData<SessionResponse | null>(sessionKey, (old) =>
          old ? { ...old, activeProfileId: null } : old,
        );
        navigate('/picker');
      }
    };
    window.addEventListener(AUTH_EVENT, onAuthError);
    return () => window.removeEventListener(AUTH_EVENT, onAuthError);
  }, [navigate, queryClient]);
  return null;
}

function LoadingSplash() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <span className="text-muted" style={{ fontSize: 14 }}>
        Loading…
      </span>
    </div>
  );
}

/** /auth — already signed in? Skip ahead. */
function AuthGate() {
  const session = useSession();
  if (session.isPending) return <LoadingSplash />;
  if (session.data) {
    return <Navigate to={session.data.activeProfileId !== null ? '/' : '/picker'} replace />;
  }
  return <AuthScreen />;
}

/** /picker — needs a session. */
function PickerGate() {
  const session = useSession();
  if (session.isPending) return <LoadingSplash />;
  if (!session.data) return <Navigate to="/auth" replace />;
  return <ProfilePicker />;
}

/** App routes — need a session AND an active profile. */
function AppLayout() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <LoadingSplash />;
  if (!session.data) return <Navigate to="/auth" replace />;
  // Deep link (G7): carry where the user was trying to go so the picker can
  // send them there instead of always landing on the dashboard.
  if (session.data.activeProfileId === null) {
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
    <>
      <AuthErrorListener />
      <Routes>
        <Route path="/auth" element={<AuthGate />} />
        <Route path="/picker" element={<PickerGate />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings/password" element={<SetPassword />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

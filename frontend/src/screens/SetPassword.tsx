import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useSession, useSetPassword } from '../api/hooks';
import { Card } from '../components/Card';

/**
 * Passwordless instances only: the auto-authenticated local account sets a
 * password so the instance can later be switched to password mode. Same form
 * idiom as AuthScreen (plain state, server field errors under each field).
 */
export function SetPassword() {
  const { data: session } = useSession();
  const setPassword = useSetPassword();
  const [password, setPasswordValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  if (!session) return null;
  if (session.authMode !== 'NONE') return <Navigate to="/" replace />;

  const fail = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.errors && err.errors.length > 0) {
        const byField: Record<string, string> = {};
        for (const fe of err.errors) {
          const key = fe.field === 'passwordWithinBcryptLimit' ? 'password' : fe.field;
          byField[key] = fe.message;
        }
        setFieldErrors(byField);
      } else {
        setError(err.detail);
      }
    } else {
      setError('Something went wrong — is the backend running?');
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setDone(false);
    if (password !== confirm) {
      setFieldErrors({ confirm: 'Passwords do not match.' });
      return;
    }
    setPassword.mutate({ password }, { onSuccess: () => setDone(true), onError: fail });
  };

  const fieldError = (field: string) =>
    fieldErrors[field] && (
      <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
        {fieldErrors[field]}
      </div>
    );

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ margin: '26px 0 18px' }}>Set password</h2>
      <Card style={{ padding: 22 }}>
        <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
          <p style={{ marginTop: 0 }}>
            This instance has no login right now. Setting a password here lets you switch it to
            password mode later.
          </p>
          <p>
            To switch, set <code>MYFINANCE_AUTH_MODE=password</code> in the <code>.env</code> next
            to <code>start.sh</code> / <code>start.bat</code> and re-run the launcher. Add{' '}
            <code>MYFINANCE_BIND_ADDRESS=0.0.0.0</code> too if you want to reach it from other
            devices on your network.
          </p>
          <p style={{ marginBottom: 18 }}>
            Then sign in as <strong>{session.user.email}</strong> with this password.
          </p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label htmlFor="set-password">New password</label>
            <input
              id="set-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="At least 12 characters"
              autoComplete="new-password"
            />
            {fieldError('password')}
          </div>
          <div className="field">
            <label htmlFor="set-password-confirm">Confirm password</label>
            <input
              id="set-password-confirm"
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {fieldError('confirm')}
          </div>
          {error && <div className="error-box">{error}</div>}
          {done && (
            <div className="text-muted" style={{ fontSize: 13 }}>
              Password set. It takes effect once you switch the instance to password mode.
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={setPassword.isPending}>
            Set password
          </button>
        </form>
      </Card>
    </div>
  );
}

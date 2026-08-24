import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useLogin, useRegister } from '../api/hooks';
import { Card } from '../components/Card';

type Mode = 'signin' | 'register';

/**
 * The API needs register/login before anything else works; the mockup has no
 * login screen, so this one borrows the profile picker's centered-card
 * language: brand mark, heading, one blueprint card.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const login = useLogin();
  const register = useRegister();
  const navigate = useNavigate();
  const busy = login.isPending || register.isPending;

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
    const creds = { email: email.trim(), password };
    const done = () => navigate('/picker');
    if (mode === 'signin') {
      login.mutate(creds, { onSuccess: done, onError: fail });
    } else {
      // Registering does not log in (per the API) — follow with a login.
      register.mutate(
        { ...creds, displayName: displayName.trim() },
        {
          onSuccess: () => login.mutate(creds, { onSuccess: done, onError: fail }),
          onError: fail,
        },
      );
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setFieldErrors({});
  };

  const fieldError = (field: string) =>
    fieldErrors[field] && (
      <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
        {fieldErrors[field]}
      </div>
    );

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ width: 'min(420px, 100%)' }}>
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
          <h1 style={{ margin: '8px 0 6px' }}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
            {mode === 'signin'
              ? 'Welcome back — your profiles are waiting.'
              : 'One account, as many separate profiles as you need.'}
          </p>
        </div>
        <Card style={{ padding: 22 }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div className="field">
                <label htmlFor="auth-display-name">Display name</label>
                <input
                  id="auth-display-name"
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Chris"
                  autoComplete="name"
                  aria-label="Display name"
                />
                {fieldError('displayName')}
              </div>
            )}
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                aria-label="Email"
              />
              {fieldError('email')}
            </div>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 12 characters' : '••••••••••••'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                aria-label="Password"
              />
              {fieldError('password')}
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div className="text-muted" style={{ fontSize: 13, marginTop: 14, textAlign: 'center' }}>
            {mode === 'signin' ? (
              <>
                No account yet?{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    switchMode('register');
                  }}
                >
                  Create account
                </a>
              </>
            ) : (
              <>
                Already registered?{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    switchMode('signin');
                  }}
                >
                  Sign in
                </a>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

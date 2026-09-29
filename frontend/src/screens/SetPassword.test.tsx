import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { AuthMode } from '../api/types';
import { renderWithProviders } from '../test/renderWithProviders';
import { SetPassword } from './SetPassword';

// Passwordless mode: the auto-authenticated local user sets a password here so
// the instance can later be switched to password mode and signed into.

const session = vi.hoisted(() => ({
  current: {
    user: { id: 1, email: 'local@localhost', displayName: 'Local' },
    profiles: [{ id: 1, name: 'Personal', defaultCurrency: 'PLN' }],
    activeProfileId: 1,
    authMode: 'NONE' as AuthMode,
  },
}));

const setPasswordMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  session.current.authMode = 'NONE';
  setPasswordMutate.mockReset();
});

vi.mock('../api/hooks', () => ({
  useSession: () => ({ data: session.current }),
  useSetPassword: () => ({ mutate: setPasswordMutate, isPending: false }),
}));

function renderScreen() {
  return renderWithProviders(
    <Routes>
      <Route path="/settings/password" element={<SetPassword />} />
      <Route path="/" element={<p>dashboard stub</p>} />
    </Routes>,
    { route: '/settings/password' },
  );
}

async function fill(password: string, confirm: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Set password' }));
}

test('explains the switch and names the account email from the session', () => {
  renderScreen();
  expect(screen.getByText(/MYFINANCE_AUTH_MODE=password/)).toBeInTheDocument();
  expect(screen.getByText('local@localhost')).toBeInTheDocument();
});

test('submitting matching passwords sends them to the server and shows success', async () => {
  setPasswordMutate.mockImplementation((_body, opts: { onSuccess?: () => void }) =>
    opts.onSuccess?.(),
  );
  renderScreen();
  await fill('correct horse battery', 'correct horse battery');
  expect(setPasswordMutate).toHaveBeenCalledWith(
    { password: 'correct horse battery' },
    expect.anything(),
  );
  expect(await screen.findByText(/Password set\./)).toBeInTheDocument();
});

test('mismatched passwords are blocked before any request', async () => {
  renderScreen();
  await fill('correct horse battery', 'correct horse battery!');
  expect(setPasswordMutate).not.toHaveBeenCalled();
  expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
});

test('a server field error renders under the password field', async () => {
  setPasswordMutate.mockImplementation((_body, opts: { onError?: (err: unknown) => void }) =>
    opts.onError?.(
      new ApiError(400, {
        type: '/errors/validation-failed',
        errors: [{ field: 'passwordWithinBcryptLimit', message: 'must be at most 72 bytes' }],
      }),
    ),
  );
  renderScreen();
  await fill(
    'ąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąą',
    'ąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąąą',
  );
  expect(await screen.findByText('must be at most 72 bytes')).toBeInTheDocument();
});

test('a password instance redirects away from the screen', () => {
  session.current.authMode = 'PASSWORD';
  renderScreen();
  expect(screen.getByText('dashboard stub')).toBeInTheDocument();
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
});

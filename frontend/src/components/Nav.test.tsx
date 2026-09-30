import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { AuthMode } from '../api/types';
import { renderWithProviders } from '../test/renderWithProviders';
import { Nav } from './Nav';

// Passwordless mode: logging out is pointless (the server re-authenticates the
// next request), so the nav trades the logout control for a way to set a password.

const session = vi.hoisted(() => ({
  current: {
    user: { id: 1, email: 'local@localhost', displayName: 'Local' },
    profiles: [
      { id: 1, name: 'Personal', defaultCurrency: 'PLN' },
      { id: 2, name: 'Company', defaultCurrency: 'EUR' },
    ],
    activeProfileId: 1,
    authMode: 'PASSWORD' as AuthMode,
  },
}));

const logoutMutate = vi.hoisted(() => vi.fn());
const setActiveMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  session.current.authMode = 'PASSWORD';
  logoutMutate.mockClear();
  setActiveMutate.mockClear();
});

vi.mock('../api/hooks', () => ({
  useSession: () => ({ data: session.current }),
  useLogout: () => ({ mutate: logoutMutate }),
  useSetActiveProfile: () => ({ mutate: setActiveMutate }),
}));

vi.mock('./TxnModal', () => ({
  useTxnModal: () => ({ openTxnModal: vi.fn() }),
}));

test('a passwordless instance offers Set password instead of Log out', () => {
  session.current.authMode = 'NONE';
  renderWithProviders(<Nav />);
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Set password' })).toHaveAttribute(
    'href',
    '/settings/password',
  );
});

test('a password instance offers Log out and no Set password', () => {
  renderWithProviders(<Nav />);
  expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Set password' })).not.toBeInTheDocument();
});

// Switching profile and logging out used to fail silently: the selector
// snapped back to the active profile, or the app stayed signed in, and
// nothing said why.

test('a failed profile switch shows the server message', async () => {
  setActiveMutate.mockImplementationOnce(
    (_id: number, opts?: { onError?: (err: unknown) => void }) =>
      opts?.onError?.(
        new ApiError(404, { type: '/errors/not-found', detail: 'Profile 2 not found.' }),
      ),
  );
  const user = userEvent.setup();
  renderWithProviders(<Nav />);
  await user.selectOptions(screen.getByLabelText('Active profile'), '2');
  expect(await screen.findByRole('alert')).toHaveTextContent('Profile 2 not found.');
});

test('a failed log-out shows the fallback sentence', async () => {
  logoutMutate.mockImplementationOnce((_vars, opts?: { onError?: (err: unknown) => void }) =>
    opts?.onError?.(new TypeError('Failed to fetch')),
  );
  const user = userEvent.setup();
  renderWithProviders(<Nav />);
  await user.click(screen.getByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong — is the backend running?',
  );
});

import { screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { AuthMode } from '../api/types';
import { renderWithProviders } from '../test/renderWithProviders';
import { Nav } from './Nav';

// Passwordless mode: logging out is pointless (the server re-authenticates the
// next request), so the nav trades the logout control for a way to set a password.

const session = vi.hoisted(() => ({
  current: {
    user: { id: 1, email: 'local@localhost', displayName: 'Local' },
    profiles: [{ id: 1, name: 'Personal', defaultCurrency: 'PLN' }],
    activeProfileId: 1,
    authMode: 'PASSWORD' as AuthMode,
  },
}));

beforeEach(() => {
  session.current.authMode = 'PASSWORD';
});

vi.mock('../api/hooks', () => ({
  useSession: () => ({ data: session.current }),
  useLogout: () => ({ mutate: vi.fn() }),
  useSetActiveProfile: () => ({ mutate: vi.fn() }),
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

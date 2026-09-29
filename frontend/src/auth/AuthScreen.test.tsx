import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { AuthScreen } from './AuthScreen';

vi.mock('../api/hooks', () => ({
  useLogin: () => ({ mutate: vi.fn(), isPending: false }),
  useRegister: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Static on purpose: nothing from the server says whether the account has a
// password, so the hint can't reveal it either.
test('the sign-in form carries a static hint for instances switched from passwordless mode', () => {
  renderWithProviders(<AuthScreen />);
  expect(screen.getByText(/Switched from passwordless mode\?/)).toHaveTextContent(
    'local@localhost',
  );
});

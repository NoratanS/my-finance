import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import { renderWithProviders } from '../test/renderWithProviders';
import { AuthScreen } from './AuthScreen';

const registerMutate = vi.hoisted(() => vi.fn());

vi.mock('../api/hooks', () => ({
  useLogin: () => ({ mutate: vi.fn(), isPending: false }),
  useRegister: () => ({ mutate: registerMutate, isPending: false }),
}));

// Static on purpose: nothing from the server says whether the account has a
// password, so the hint can't reveal it either.
test('the sign-in form carries a static hint for instances switched from passwordless mode', () => {
  renderWithProviders(<AuthScreen />);
  expect(screen.getByText(/Switched from passwordless mode\?/)).toHaveTextContent(
    'local@localhost',
  );
});

// The bcrypt limit is a cross-field rule, reported under its pseudo-field
// passwordWithinBcryptLimit; the message belongs under Password.

test('a password over the bcrypt limit shows its server message under Password', async () => {
  registerMutate.mockImplementationOnce((_body, opts: { onError?: (err: unknown) => void }) =>
    opts.onError?.(
      new ApiError(400, {
        type: '/errors/validation-failed',
        detail: 'The request body has 1 invalid field(s).',
        errors: [
          { field: 'passwordWithinBcryptLimit', message: 'must be at most 72 bytes in UTF-8' },
        ],
      }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<AuthScreen />);
  await user.click(screen.getByRole('link', { name: 'Create account' }));
  await user.type(screen.getByLabelText('Display name'), 'Chris');
  await user.type(screen.getByLabelText('Email'), 'chris@example.com');
  await user.type(screen.getByLabelText('Password'), 'ą'.repeat(40));
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByLabelText('Password').closest('.field')).toHaveTextContent(
    'must be at most 72 bytes in UTF-8',
  );
});

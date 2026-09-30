import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import { renderWithProviders } from '../test/renderWithProviders';
import { ProfilePicker } from './ProfilePicker';

// J14: the picker used to be a one-way door — no back control, and profiles
// could never be renamed or deleted once created.

const session = vi.hoisted(() => ({
  current: {
    user: { id: 1, email: 'chris@example.com', displayName: 'Chris' },
    profiles: [
      { id: 1, name: 'Personal', defaultCurrency: 'PLN' },
      { id: 2, name: 'Company', defaultCurrency: 'EUR' },
    ],
    activeProfileId: null as number | null,
    authMode: 'PASSWORD' as const,
  },
}));

type MutateOptions = { onSuccess?: () => void; onError?: (err: unknown) => void };

const setActiveMutate = vi.hoisted(() =>
  vi.fn((_id: number, opts?: MutateOptions) => opts?.onSuccess?.()),
);
const renameMutate = vi.hoisted(() => vi.fn());
const createProfileMutate = vi.hoisted(() => vi.fn());
const restoreMutate = vi.hoisted(() => vi.fn());
const deleteMutate = vi.hoisted(() => vi.fn());
const navigateSpy = vi.hoisted(() => vi.fn());

beforeEach(() => {
  session.current = {
    user: { id: 1, email: 'chris@example.com', displayName: 'Chris' },
    profiles: [
      { id: 1, name: 'Personal', defaultCurrency: 'PLN' },
      { id: 2, name: 'Company', defaultCurrency: 'EUR' },
    ],
    activeProfileId: null,
    authMode: 'PASSWORD',
  };
  setActiveMutate.mockClear();
  renameMutate.mockClear();
  createProfileMutate.mockClear();
  restoreMutate.mockClear();
  deleteMutate.mockClear();
  navigateSpy.mockClear();
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('../api/hooks', () => ({
  useSession: () => ({ data: session.current }),
  useCreateProfile: () => ({ mutate: createProfileMutate, isPending: false }),
  useExportBackup: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreBackup: () => ({ mutate: restoreMutate, isPending: false }),
  useSetActiveProfile: () => ({ mutate: setActiveMutate }),
  useRenameProfile: () => ({ mutate: renameMutate, isPending: false }),
  useDeleteProfile: () => ({ mutate: deleteMutate, isPending: false }),
}));

test('a Rename and a Delete control exist for each profile card', () => {
  renderWithProviders(<ProfilePicker />);
  expect(screen.getAllByRole('button', { name: 'Rename profile' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Delete profile' })).toHaveLength(2);
});

test('renaming a profile prefills the current name and saves the new one', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getAllByRole('button', { name: 'Rename profile' })[0]);

  const input = screen.getByDisplayValue('Personal');
  await user.clear(input);
  await user.type(input, 'Household');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(renameMutate).toHaveBeenCalledWith(
    { id: 1, body: { name: 'Household' } },
    expect.anything(),
  );
});

test('cancelling a rename in progress calls the mutation zero times', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getAllByRole('button', { name: 'Rename profile' })[0]);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(renameMutate).not.toHaveBeenCalled();
  expect(screen.queryByDisplayValue('Personal')).not.toBeInTheDocument();
});

// The rename card and the new-profile form were not <form>s: Enter did nothing.

test('pressing Enter in the rename field saves the new name', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getAllByRole('button', { name: 'Rename profile' })[0]);
  const input = screen.getByDisplayValue('Personal');
  await user.clear(input);
  await user.type(input, 'Household{Enter}');
  expect(renameMutate).toHaveBeenCalledWith(
    { id: 1, body: { name: 'Household' } },
    expect.anything(),
  );
});

test('pressing Enter in the new profile name creates the profile', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getByRole('button', { name: 'New profile' }));
  await user.type(screen.getByLabelText('Profile name'), 'Household{Enter}');
  expect(createProfileMutate).toHaveBeenCalledWith(
    { name: 'Household', defaultCurrency: 'PLN' },
    expect.anything(),
  );
});

test('cancelling the new-profile form creates nothing', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getByRole('button', { name: 'New profile' }));
  await user.type(screen.getByLabelText('Profile name'), 'Household');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(createProfileMutate).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Profile name')).not.toBeInTheDocument();
});

// J3 precedent: deleting a profile is irreversible, so it goes through the
// same shared confirmation dialog as every other destructive action.

test('deleting a profile asks for confirmation naming the profile before calling the mutation', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getAllByRole('button', { name: 'Delete profile' })[0]);
  expect(deleteMutate).not.toHaveBeenCalled();

  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('Personal');
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(deleteMutate).toHaveBeenCalledWith(1, expect.anything());
});

test('dismissing the delete confirmation calls the mutation zero times', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getAllByRole('button', { name: 'Delete profile' })[0]);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(deleteMutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a 409 last-profile error from delete surfaces in the UI instead of failing silently', async () => {
  deleteMutate.mockImplementation((_id: number, opts: { onError?: (err: unknown) => void }) =>
    opts.onError?.(
      new ApiError(409, {
        type: '/errors/last-profile',
        title: 'Cannot delete the last profile',
        detail: 'This is your only profile. Create another one before deleting this one.',
      }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getAllByRole('button', { name: 'Delete profile' })[0]);
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(
    await screen.findByText(
      'This is your only profile. Create another one before deleting this one.',
    ),
  ).toBeInTheDocument();
});

// The picker used to be a dead end once you landed on it via "Switch profile…".

test('no back control renders when there is no active profile to fall back on', () => {
  session.current.activeProfileId = null;
  renderWithProviders(<ProfilePicker />);
  expect(screen.queryByRole('button', { name: '← Back' })).not.toBeInTheDocument();
});

test('a back control renders and returns to the app when a profile is already active', async () => {
  session.current.activeProfileId = 1;
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getByRole('button', { name: '← Back' }));
  expect(navigateSpy).toHaveBeenCalledWith('/');
});

// G7: picking a profile after being bounced here from a deep link should land
// back on that deep link, not always on the dashboard.

test('picking a profile navigates to the deep-link destination carried in router state', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />, { route: '/picker', state: { from: '/budgets?x=1' } });
  await user.click(screen.getByRole('button', { name: /Personal/ }));
  expect(navigateSpy).toHaveBeenCalledWith('/budgets?x=1');
});

// Picking a profile used to fail silently: the picker simply stayed put.

test('a failed pick shows its message below the cards and does not navigate', async () => {
  setActiveMutate.mockImplementationOnce((_id: number, opts?: MutateOptions) =>
    opts?.onError?.(
      new ApiError(404, { type: '/errors/not-found', detail: 'Profile 1 not found.' }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getByRole('button', { name: /Personal/ }));
  expect(await screen.findByText('Profile 1 not found.')).toBeInTheDocument();
  expect(navigateSpy).not.toHaveBeenCalled();
});

test('picking a profile with no deep-link state lands on the dashboard', async () => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.click(screen.getByRole('button', { name: /Personal/ }));
  expect(navigateSpy).toHaveBeenCalledWith('/');
});

test.each([
  ['//evil.com'],
  ['evil.com'],
  ['http://evil.com'],
  // Hardening (Task 21's review): `\` is unreachable today (browsers normalise it
  // to `/` in location.pathname before it ever reaches safeDeepLink), and control
  // characters similarly never appear in a real pathname — but the guard is one
  // refactor away from mattering if this value ever becomes attacker-supplied.
  ['/\\evil.com'],
  ['/\\/evil.com'],
  ['/budgets\x00'],
  ['/budgets\n'],
])('an unsafe deep-link destination %s falls back to the dashboard', async (from) => {
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />, { route: '/picker', state: { from } });
  await user.click(screen.getByRole('button', { name: /Personal/ }));
  expect(navigateSpy).toHaveBeenCalledWith('/');
});

test('a backup-invalid restore shows the detail and each problem it found', async () => {
  restoreMutate.mockImplementationOnce((_file: File, opts?: { onError?: (err: unknown) => void }) =>
    opts?.onError?.(
      new ApiError(422, {
        type: '/errors/backup-invalid',
        detail: 'The backup file is not valid.',
        problems: ['profiles[0].name: must not be blank', 'profiles[0].currency: unknown'],
      }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<ProfilePicker />);
  await user.upload(
    screen.getByLabelText('Backup file'),
    new File(['{}'], 'backup.json', { type: 'application/json' }),
  );
  expect(await screen.findByText('The backup file is not valid.')).toBeInTheDocument();
  expect(screen.getByText('profiles[0].name: must not be blank')).toBeInTheDocument();
  expect(screen.getByText('profiles[0].currency: unknown')).toBeInTheDocument();
});

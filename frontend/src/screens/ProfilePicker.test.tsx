import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, expect, test, vi } from 'vitest';
import { forgetProfile, rememberedProfileId } from '../api/activeProfile';
import type { BackupRestoreResponse, ProfileResponse } from '../api/types';
import { profile } from '../test/fixtures';
import { renderWithProviders } from '../test/renderWithProviders';
import { answerProfiles, problem, server } from '../test/server';
import { ProfilePicker } from './ProfilePicker';

// The picker at the network seam: the real hooks and client run against canned answers. The
// instance has two Profiles, "Personal" (the remembered Active profile, id 1) and "Company".
// A request no test declared an answer for fails that test, so "nothing was sent" needs no
// assertion of its own.

const personal = profile({ id: 1, name: 'Personal', defaultCurrency: 'PLN' });
const company = profile({ id: 2, name: 'Company', defaultCurrency: 'EUR' });

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

beforeEach(() => {
  navigateSpy.mockClear();
  answerProfiles(personal, company);
});

/** Renders the picker and waits for its cards (or, on an empty instance, its form). */
async function renderPicker(options?: { route?: string; state?: unknown }) {
  renderWithProviders(<ProfilePicker />, options);
  await screen.findByRole('heading', { level: 1 });
}

const cardOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) }).parentElement!;

test('a Rename and a Delete control exist for each profile card', async () => {
  await renderPicker();

  expect(screen.getAllByRole('button', { name: 'Rename profile' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Delete profile' })).toHaveLength(2);
});

// — Rename —

test('renaming a profile prefills the current name and saves the new one', async () => {
  const renames: unknown[] = [];
  server.use(
    http.put('/api/profiles/1', async ({ request }) => {
      renames.push(await request.json());
      return HttpResponse.json<ProfileResponse>({ ...personal, name: 'Household' });
    }),
  );
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Personal')).getByRole('button', { name: 'Rename profile' }));

  const input = screen.getByDisplayValue('Personal');
  await user.clear(input);
  await user.type(input, 'Household');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('button', { name: /^Household/ })).toBeInTheDocument();
  expect(renames).toEqual([{ name: 'Household' }]);
});

test('cancelling a rename in progress sends nothing', async () => {
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Personal')).getByRole('button', { name: 'Rename profile' }));

  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByDisplayValue('Personal')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Personal/ })).toBeInTheDocument();
});

test('pressing Enter in the rename field saves the new name', async () => {
  const renames: unknown[] = [];
  server.use(
    http.put('/api/profiles/1', async ({ request }) => {
      renames.push(await request.json());
      return HttpResponse.json<ProfileResponse>({ ...personal, name: 'Household' });
    }),
  );
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Personal')).getByRole('button', { name: 'Rename profile' }));

  const input = screen.getByDisplayValue('Personal');
  await user.clear(input);
  await user.type(input, 'Household{Enter}');

  expect(await screen.findByRole('button', { name: /^Household/ })).toBeInTheDocument();
  expect(renames).toEqual([{ name: 'Household' }]);
});

test('renaming to a name another profile has shows the name-taken message in the card', async () => {
  server.use(
    http.put('/api/profiles/1', () =>
      problem(409, 'profile-name-taken', "You already have a profile named 'Company'."),
    ),
  );
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Personal')).getByRole('button', { name: 'Rename profile' }));

  const input = screen.getByDisplayValue('Personal');
  await user.clear(input);
  await user.type(input, 'Company{Enter}');

  expect(
    await screen.findByText("You already have a profile named 'Company'."),
  ).toBeInTheDocument();
});

// — Create —

test('pressing Enter in the new profile name creates the profile, without switching to it', async () => {
  const household = profile({ id: 3, name: 'Household' });
  const created: unknown[] = [];
  server.use(
    http.post('/api/profiles', async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json<ProfileResponse>(household, { status: 201 });
    }),
  );
  const user = userEvent.setup();
  await renderPicker();
  await user.click(screen.getByRole('button', { name: 'New profile' }));

  await user.type(screen.getByLabelText('Profile name'), 'Household{Enter}');

  expect(await screen.findByRole('button', { name: /^Household/ })).toBeInTheDocument();
  expect(created).toEqual([{ name: 'Household', defaultCurrency: 'PLN' }]);
  expect(rememberedProfileId()).toBe(1);
  expect(navigateSpy).not.toHaveBeenCalled();
});

test('cancelling the new-profile form creates nothing', async () => {
  const user = userEvent.setup();
  await renderPicker();
  await user.click(screen.getByRole('button', { name: 'New profile' }));
  await user.type(screen.getByLabelText('Profile name'), 'Household');

  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByLabelText('Profile name')).not.toBeInTheDocument();
});

test('a name that is already taken is refused with the name-taken message', async () => {
  server.use(
    http.post('/api/profiles', () =>
      problem(409, 'profile-name-taken', "You already have a profile named 'Personal'."),
    ),
  );
  const user = userEvent.setup();
  await renderPicker();
  await user.click(screen.getByRole('button', { name: 'New profile' }));

  await user.type(screen.getByLabelText('Profile name'), 'Personal{Enter}');

  expect(
    await screen.findByText("You already have a profile named 'Personal'."),
  ).toBeInTheDocument();
});

// — The first profile —

test('with no profiles the picker is the first-profile screen: the form is open and there is nothing to pick', async () => {
  answerProfiles();
  await renderPicker();

  expect(screen.getByRole('heading', { name: 'Create your first profile' })).toBeInTheDocument();
  expect(screen.getByLabelText('Profile name')).toBeInTheDocument();
  expect(screen.getByLabelText('Default currency')).toHaveValue('PLN');
  expect(screen.queryByRole('button', { name: 'New profile' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete profile' })).not.toBeInTheDocument();
  // Restoring a backup is how an empty instance gets its old profiles back.
  expect(screen.getByRole('button', { name: 'Restore from backup' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Download backup' })).not.toBeInTheDocument();
});

test('creating the first profile chooses it and opens the app', async () => {
  forgetProfile();
  answerProfiles();
  server.use(
    http.post('/api/profiles', () => HttpResponse.json<ProfileResponse>(company, { status: 201 })),
  );
  const user = userEvent.setup();
  await renderPicker();

  await user.type(screen.getByLabelText('Profile name'), 'Company');
  await user.selectOptions(screen.getByLabelText('Default currency'), 'EUR');
  await user.click(screen.getByRole('button', { name: 'Create' }));

  await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/'));
  expect(rememberedProfileId()).toBe(2);
});

// — Delete —
// Deleting a profile is the one irreversible action: the confirmation asks for its name.

test('the delete confirmation names the profile and stays disabled until the typed name matches', async () => {
  const deleted: string[] = [];
  server.use(
    http.delete('/api/profiles/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Company')).getByRole('button', { name: 'Delete profile' }));

  const dialog = screen.getByRole('dialog', { name: 'Delete the profile "Company"?' });
  const confirm = within(dialog).getByRole('button', { name: 'Delete' });
  const typed = within(dialog).getByLabelText(/to confirm/);
  expect(confirm).toBeDisabled();

  await user.type(typed, 'Compan');
  expect(confirm).toBeDisabled();
  await user.type(typed, 'Y');
  expect(confirm).toBeDisabled();
  await user.clear(typed);
  await user.type(typed, 'Company');
  expect(confirm).toBeEnabled();

  await user.click(confirm);

  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /^Company/ })).not.toBeInTheDocument(),
  );
  expect(deleted).toEqual(['2']);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('pressing Enter in the confirmation field deletes the profile once the typed name matches', async () => {
  const deleted: string[] = [];
  server.use(
    http.delete('/api/profiles/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Company')).getByRole('button', { name: 'Delete profile' }));

  await user.type(screen.getByLabelText(/to confirm/), 'Company{Enter}');

  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /^Company/ })).not.toBeInTheDocument(),
  );
  expect(deleted).toEqual(['2']);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('pressing Enter in the confirmation field does nothing while the typed name does not match', async () => {
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Company')).getByRole('button', { name: 'Delete profile' }));

  await user.type(screen.getByLabelText(/to confirm/), 'Compan{Enter}');

  // Nothing was sent, and the dialog is still asking.
  expect(screen.getByRole('dialog', { name: 'Delete the profile "Company"?' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Company/ })).toBeInTheDocument();
});

test('dismissing the delete confirmation deletes nothing and forgets what was typed', async () => {
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Company')).getByRole('button', { name: 'Delete profile' }));
  await user.type(screen.getByLabelText(/to confirm/), 'Company');

  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  await user.click(within(cardOf('Company')).getByRole('button', { name: 'Delete profile' }));
  expect(screen.getByLabelText(/to confirm/)).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
});

test('deleting the only profile leads to the first-profile screen', async () => {
  answerProfiles(personal);
  server.use(http.delete('/api/profiles/1', () => new HttpResponse(null, { status: 204 })));
  const user = userEvent.setup();
  await renderPicker();
  await user.click(screen.getByRole('button', { name: 'Delete profile' }));

  await user.type(screen.getByLabelText(/to confirm/), 'Personal');
  await user.click(screen.getByRole('button', { name: 'Delete' }));

  expect(
    await screen.findByRole('heading', { name: 'Create your first profile' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Profile name')).toBeInTheDocument();
});

test('deleting the Active profile forgets it, and the way back goes with it', async () => {
  server.use(http.delete('/api/profiles/1', () => new HttpResponse(null, { status: 204 })));
  const user = userEvent.setup();
  await renderPicker();
  expect(screen.getByRole('button', { name: '← Back' })).toBeInTheDocument();
  await user.click(within(cardOf('Personal')).getByRole('button', { name: 'Delete profile' }));

  await user.type(screen.getByLabelText(/to confirm/), 'Personal');
  await user.click(screen.getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(rememberedProfileId()).toBeNull());
  expect(screen.queryByRole('button', { name: '← Back' })).not.toBeInTheDocument();
});

test('a failed delete surfaces below the cards instead of failing silently', async () => {
  server.use(
    http.delete('/api/profiles/2', () => problem(404, 'not-found', 'Profile 2 not found.')),
  );
  const user = userEvent.setup();
  await renderPicker();
  await user.click(within(cardOf('Company')).getByRole('button', { name: 'Delete profile' }));

  await user.type(screen.getByLabelText(/to confirm/), 'Company');
  await user.click(screen.getByRole('button', { name: 'Delete' }));

  expect(await screen.findByText('Profile 2 not found.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Company/ })).toBeInTheDocument();
});

// — Back —
// The picker used to be a dead end once you landed on it via "Switch profile…".

test('no back control renders when there is no active profile to fall back on', async () => {
  forgetProfile();
  await renderPicker();

  expect(screen.queryByRole('button', { name: '← Back' })).not.toBeInTheDocument();
});

test('a back control renders and returns to the app when a profile is already active', async () => {
  const user = userEvent.setup();
  await renderPicker();

  await user.click(screen.getByRole('button', { name: '← Back' }));

  expect(navigateSpy).toHaveBeenCalledWith('/');
});

// — Picking —
// G7: picking a profile after being bounced here from a deep link should land
// back on that deep link, not always on the dashboard.

test('picking a profile remembers it and navigates to the deep-link destination carried in router state', async () => {
  forgetProfile();
  const user = userEvent.setup();
  await renderPicker({ route: '/picker', state: { from: '/budgets?x=1' } });

  await user.click(screen.getByRole('button', { name: /^Company/ }));

  expect(navigateSpy).toHaveBeenCalledWith('/budgets?x=1');
  expect(rememberedProfileId()).toBe(2);
});

test('picking a profile with no deep-link state lands on the dashboard', async () => {
  const user = userEvent.setup();
  await renderPicker();

  await user.click(screen.getByRole('button', { name: /^Personal/ }));

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
  await renderPicker({ route: '/picker', state: { from } });

  await user.click(screen.getByRole('button', { name: /^Personal/ }));

  expect(navigateSpy).toHaveBeenCalledWith('/');
});

// — Backup —

test('a backup-invalid restore shows the detail and each problem it found', async () => {
  server.use(
    http.post('/api/backup/restore', () =>
      problem(422, 'backup-invalid', 'The backup file is not valid.', {
        extensions: {
          problems: ['profiles[0].name: must not be blank', 'profiles[0].currency: unknown'],
        },
      }),
    ),
  );
  const user = userEvent.setup();
  await renderPicker();

  await user.upload(
    screen.getByLabelText('Backup file'),
    new File(['{}'], 'backup.json', { type: 'application/json' }),
  );

  expect(await screen.findByText('The backup file is not valid.')).toBeInTheDocument();
  expect(screen.getByText('profiles[0].name: must not be blank')).toBeInTheDocument();
  expect(screen.getByText('profiles[0].currency: unknown')).toBeInTheDocument();
});

test('a restored backup is summarised and its profiles appear as cards', async () => {
  const restored = profile({ id: 9, name: 'Personal (restored)' });
  server.use(
    http.post('/api/backup/restore', () =>
      HttpResponse.json<BackupRestoreResponse>({
        profiles: [
          {
            id: 9,
            name: 'Personal (restored)',
            categories: 4,
            transactions: 12,
            budgets: 1,
            subscriptions: 2,
          },
        ],
      }),
    ),
  );
  const user = userEvent.setup();
  await renderPicker();

  // A restore asks for the list again: from here on it has the restored Profile.
  answerProfiles(personal, company, restored);
  await user.upload(
    screen.getByLabelText('Backup file'),
    new File(['{}'], 'backup.json', { type: 'application/json' }),
  );

  expect(await screen.findByText('Backup restored')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /^Personal \(restored\)/ })).toBeInTheDocument();
});

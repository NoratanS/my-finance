import { expect, test } from 'vitest';
import { ApiError } from './client';
import { problemMessages, type ProblemMessages } from './problemMessages';

// One row per rule: a failure in, what a screen would show out.

const FALLBACK = 'Something went wrong — is the backend running?';

function validation(errors: { field: string; message: string }[]) {
  return new ApiError(400, {
    type: '/errors/validation-failed',
    title: 'Validation failed',
    status: 400,
    detail: `The request body has ${errors.length} invalid field(s).`,
    errors,
  });
}

const nameTaken = new ApiError(409, {
  type: '/errors/category-name-taken',
  title: 'Category name taken',
  status: 409,
  detail: "A sibling named 'Food' already exists.",
});

// Every row lists only what differs from "nothing to show".
const none: ProblemMessages = { banner: '', fields: {}, problemList: [], slug: null };

test.each<[string, unknown, Parameters<typeof problemMessages>[1], Partial<ProblemMessages>]>([
  ['a network failure', new TypeError('Failed to fetch'), {}, { banner: FALLBACK }],
  [
    'a 502 that is not a Problem (the proxy could not reach the backend)',
    new ApiError(502, {}),
    {},
    { banner: FALLBACK },
  ],
  [
    'a 413 that is not a Problem (the proxy rejected an upload)',
    new ApiError(413, {}),
    {},
    { banner: 'Request failed with status 413.' },
  ],
  [
    'a Problem: its detail',
    nameTaken,
    {},
    { banner: "A sibling named 'Food' already exists.", slug: 'category-name-taken' },
  ],
  [
    'a Problem with code',
    nameTaken,
    { withCode: true },
    {
      banner: "409 category-name-taken — A sibling named 'Food' already exists.",
      slug: 'category-name-taken',
    },
  ],
  [
    'a field violation on a listed field goes to that field',
    validation([{ field: 'amount', message: 'must be greater than 0' }]),
    { fields: ['amount'] },
    { fields: { amount: 'must be greater than 0' }, slug: 'validation-failed' },
  ],
  [
    'a field violation on an unlisted field goes to the banner with its field name',
    validation([
      { field: 'amount', message: 'must be greater than 0' },
      { field: 'description', message: 'size must be between 0 and 500' },
    ]),
    { fields: ['amount'] },
    {
      banner: 'description: size must be between 0 and 500',
      fields: { amount: 'must be greater than 0' },
      slug: 'validation-failed',
    },
  ],
  [
    'with no fields listed every violation is a banner line',
    validation([
      { field: 'amount', message: 'must be greater than 0' },
      { field: 'currency', message: 'must match "[A-Z]{3}"' },
    ]),
    {},
    {
      banner: 'amount: must be greater than 0 · currency: must match "[A-Z]{3}"',
      slug: 'validation-failed',
    },
  ],
  [
    'two violations on one field are joined',
    validation([
      { field: 'password', message: 'must not be blank' },
      { field: 'password', message: 'size must be between 12 and 2147483647' },
    ]),
    { fields: ['password'] },
    {
      banner: '',
      fields: { password: 'must not be blank · size must be between 12 and 2147483647' },
      slug: 'validation-failed',
    },
  ],
  [
    'occurredOnNotInFuture lands on occurredOn',
    validation([{ field: 'occurredOnNotInFuture', message: 'must not be in the future' }]),
    { fields: ['occurredOn'] },
    { fields: { occurredOn: 'must not be in the future' }, slug: 'validation-failed' },
  ],
  [
    'passwordWithinBcryptLimit lands on password',
    validation([
      { field: 'passwordWithinBcryptLimit', message: 'must be at most 72 bytes in UTF-8' },
    ]),
    { fields: ['password'] },
    { fields: { password: 'must be at most 72 bytes in UTF-8' }, slug: 'validation-failed' },
  ],
  [
    'periodValid lands on periodEnd',
    validation([{ field: 'periodValid', message: 'periodEnd must be on or after periodStart' }]),
    { fields: ['periodEnd'] },
    {
      fields: { periodEnd: 'periodEnd must be on or after periodStart' },
      slug: 'validation-failed',
    },
  ],
  [
    'an unlisted pseudo-field reaches the banner under its real field',
    validation([{ field: 'periodValid', message: 'periodEnd must be on or after periodStart' }]),
    {},
    {
      banner: 'periodEnd: periodEnd must be on or after periodStart',
      slug: 'validation-failed',
    },
  ],
  [
    'with code, an unplaced validation line carries the status and type',
    validation([{ field: 'name', message: 'size must be between 1 and 100' }]),
    { withCode: true },
    {
      banner: '400 validation-failed — name: size must be between 1 and 100',
      slug: 'validation-failed',
    },
  ],
  [
    'backup-invalid carries its Problem list',
    new ApiError(422, {
      type: '/errors/backup-invalid',
      detail: 'The backup file is not valid.',
      problems: ['profiles[0].name: must not be blank', 'profiles[0].currency: unknown'],
    }),
    {},
    {
      banner: 'The backup file is not valid.',
      problemList: ['profiles[0].name: must not be blank', 'profiles[0].currency: unknown'],
      slug: 'backup-invalid',
    },
  ],
  [
    'invalid-plan carries its Problem list',
    new ApiError(422, {
      type: '/errors/invalid-plan',
      detail: 'The plan is invalid.',
      problems: ['filters.categoryId: 99 does not exist'],
    }),
    { withCode: true },
    {
      banner: '422 invalid-plan — The plan is invalid.',
      problemList: ['filters.categoryId: 99 does not exist'],
      slug: 'invalid-plan',
    },
  ],
  [
    'analytics-unavailable',
    new ApiError(503, {
      type: '/errors/analytics-unavailable',
      detail: "The analytics service isn't running.",
    }),
    {},
    { banner: "The analytics service isn't running.", slug: 'analytics-unavailable' },
  ],
  ['a thrown string', 'boom', {}, { banner: FALLBACK }],
])('%s', (_name, failure, options, expected) => {
  expect(problemMessages(failure, options)).toEqual({ ...none, ...expected });
});

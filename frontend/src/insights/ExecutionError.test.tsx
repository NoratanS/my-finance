import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ApiError } from '../api/client';
import { ExecutionError } from './ResultsPanel';

// What the explorer says when running a plan fails, one branch per test.

test('analytics-unavailable gets the calm offline copy', () => {
  render(
    <ExecutionError
      error={
        new ApiError(503, {
          type: '/errors/analytics-unavailable',
          detail: 'The analytics service is unavailable.',
        })
      }
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    "Analytics is offline right now — the analytics service isn't running.",
  );
});

test('invalid-plan lists each problem, with Edit next to the ones a chip can fix', () => {
  render(
    <ExecutionError
      error={
        new ApiError(422, {
          type: '/errors/invalid-plan',
          detail: 'The plan is invalid.',
          problems: ['filters.categoryId: 99 does not exist', 'interval: must be month or week'],
        })
      }
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('The analytics service rejected this plan');
  const items = screen.getAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual([
    'filters.categoryId: 99 does not existEdit',
    'interval: must be month or week',
  ]);
});

test('any other Problem shows its status, type and detail', () => {
  render(
    <ExecutionError
      error={new ApiError(500, { type: '/errors/internal', detail: 'Unexpected error.' })}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('500 internal — Unexpected error.');
});

test('a network failure says the backend may not be running', () => {
  render(<ExecutionError error={new TypeError('Failed to fetch')} />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not run the plan — is the backend running?',
  );
});

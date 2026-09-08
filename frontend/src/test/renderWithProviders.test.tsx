import { expect, test } from 'vitest';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from './renderWithProviders';

// Task 21's review: the route was split on `?` only, so a `#hash` on a route
// string was silently dropped into pathname instead of becoming location.hash.
// No call site uses one today, but a future one would lose it quietly.

function LocationProbe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="hash">{location.hash}</span>
    </div>
  );
}

test('a route with a hash keeps its pathname, search, and hash separate', () => {
  const { getByTestId } = renderWithProviders(<LocationProbe />, {
    route: '/budgets?x=1#section',
  });
  expect(getByTestId('pathname')).toHaveTextContent('/budgets');
  expect(getByTestId('search')).toHaveTextContent('?x=1');
  expect(getByTestId('hash')).toHaveTextContent('#section');
});

test('a route with a hash but no query string still keeps the hash', () => {
  const { getByTestId } = renderWithProviders(<LocationProbe />, {
    route: '/budgets#section',
  });
  expect(getByTestId('pathname')).toHaveTextContent('/budgets');
  expect(getByTestId('search')).toHaveTextContent('');
  expect(getByTestId('hash')).toHaveTextContent('#section');
});

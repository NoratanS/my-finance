import { expect, test } from 'vitest';
import { categoryTree } from './fixtures';

test('a Category tree derives parentId and depth from nesting, roots at depth 1', () => {
  const [food] = categoryTree([{ id: 3, name: 'Food', children: [{ id: 4, name: 'Groceries' }] }]);

  expect(food).toMatchObject({ id: 3, parentId: null, depth: 1, color: null });
  expect(food.children[0]).toMatchObject({ id: 4, parentId: 3, depth: 2, children: [] });
});

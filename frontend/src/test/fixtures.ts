// Wire fixtures: typed builders for the objects the backend sends, each returning a fresh
// object with wire-format defaults. A test overrides only the fields it is about. A builder
// enters this module when a second test file needs the same wire object (the rule of two);
// until then the one test that needs it declares the object locally, typed against api/types.
// See ARCHITECTURE.md §4, "Why unit tests fake the network, not the hooks".

import type { CategoryNode, Insight, ProfileResponse } from '../api/types';

/** The "Household" Profile, as GET /api/profiles lists it. Test setup remembers it as the Active profile. */
export function profile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: 1,
    name: 'Household',
    defaultCurrency: 'PLN',
    createdAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

/** A Category as a test writes it: nesting only. The builder derives the rest. */
export interface CategorySpec {
  id: number;
  name: string;
  color?: string | null;
  children?: CategorySpec[];
}

/** A Category tree as GET /api/categories sends it: `parentId` and `depth` (roots are 1) derived from nesting. */
export function categoryTree(roots: CategorySpec[]): CategoryNode[] {
  const node = (spec: CategorySpec, parentId: number | null, depth: number): CategoryNode => ({
    id: spec.id,
    name: spec.name,
    color: spec.color ?? null,
    parentId,
    depth,
    children: (spec.children ?? []).map((child) => node(child, spec.id, depth + 1)),
  });
  return roots.map((root) => node(root, null, 1));
}

/** A saved, unpinned Insight whose plan is the whole profile's spend over all time. */
export function insight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: 7,
    name: 'All spend',
    plan: {
      version: 1,
      metric: 'spend',
      filters: {},
      groupBy: null,
      interval: null,
      range: { type: 'all' },
    },
    viz: null,
    pinned: false,
    createdAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

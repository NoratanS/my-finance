// Effective-color resolution for the category tree, plus the design palette.
//
// The API stores each category's own `color` (lowercase #rrggbb) or null for
// "inherit from the nearest ancestor with one". The server only echoes the raw
// value; the client walks up the tree to resolve what to actually paint.

import type { CategoryNode } from '../api/types';

/** The Add-category palette from the design mockup. */
export const PALETTE: ReadonlyArray<readonly [name: string, hex: string]> = [
  ['Lavender', '#c3b3ee'],
  ['Mint', '#a4d9c6'],
  ['Sky', '#a8cdec'],
  ['Peach', '#f2c4a0'],
  ['Rose', '#eeaabc'],
  ['Butter', '#ecdca0'],
  ['Lilac', '#d6b0e4'],
  ['Seafoam', '#b7dccb'],
];

export const FALLBACK_COLOR = 'var(--color-accent)';

/** Flatten the nested tree into an id -> node map (children links kept). */
export function flattenTree(tree: CategoryNode[]): Map<number, CategoryNode> {
  const map = new Map<number, CategoryNode>();
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      map.set(node.id, node);
      walk(node.children);
    }
  };
  walk(tree);
  return map;
}

/** Own color, or the nearest ancestor's, or the accent fallback. */
export function effectiveColor(byId: Map<number, CategoryNode>, id: number): string {
  let node = byId.get(id);
  while (node) {
    if (node.color) return node.color;
    node = node.parentId !== null ? byId.get(node.parentId) : undefined;
  }
  return FALLBACK_COLOR;
}

/** ["Shopping", "Stimulants", "Vaping"] for a leaf id. */
export function categoryPath(byId: Map<number, CategoryNode>, id: number): string[] {
  const parts: string[] = [];
  let node = byId.get(id);
  while (node) {
    parts.unshift(node.name);
    node = node.parentId !== null ? byId.get(node.parentId) : undefined;
  }
  return parts;
}

/** The root ancestor of a category (or the node itself when it is a root). */
export function rootOf(byId: Map<number, CategoryNode>, id: number): CategoryNode | undefined {
  let node = byId.get(id);
  while (node && node.parentId !== null) {
    node = byId.get(node.parentId);
  }
  return node;
}

/** id plus all descendant ids. */
export function descendantIds(byId: Map<number, CategoryNode>, id: number): number[] {
  const out: number[] = [];
  const walk = (node: CategoryNode | undefined) => {
    if (!node) return;
    out.push(node.id);
    node.children.forEach(walk);
  };
  walk(byId.get(id));
  return out;
}

export interface CategoryOption {
  id: number;
  /** Name indented with figure spaces per depth, like the mockup's selects. */
  label: string;
  depth: number;
}

/** Depth-first options for <select>s, indented per level. */
export function categoryOptions(tree: CategoryNode[]): CategoryOption[] {
  const options: CategoryOption[] = [];
  const walk = (nodes: CategoryNode[], prefix: string) => {
    for (const node of nodes) {
      options.push({ id: node.id, label: prefix + node.name, depth: node.depth });
      walk(node.children, prefix + '  ');
    }
  };
  walk(tree, '');
  return options;
}

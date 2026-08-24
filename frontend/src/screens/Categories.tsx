import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useCategories, useCreateCategory, useTransactions } from '../api/hooks';
import type { CategoryNode } from '../api/types';
import { Card } from '../components/Card';
import { CategoryDot } from '../components/CategoryDot';
import { ChevronRightIcon } from '../components/icons';
import {
  categoryOptions,
  descendantIds,
  effectiveColor,
  flattenTree,
  PALETTE,
} from '../lib/categoryColor';

const MAX_DEPTH = 5;

export function Categories() {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();

  // Transaction counts per row ("N txn") — one page of recent history is
  // enough at this scale; counts include descendants like the mockup.
  const txns = useTransactions({ size: 200 });

  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [name, setName] = useState('');
  const [parent, setParent] = useState('root');
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState('');

  const tree = categories ?? [];
  const byId = flattenTree(tree);
  const options = categoryOptions(tree);
  const parentOptions = options.filter((o) => o.depth < MAX_DEPTH);

  const countByCat = new Map<number, number>();
  for (const t of txns.data?.content ?? []) {
    countByCat.set(t.category.id, (countByCat.get(t.category.id) ?? 0) + 1);
  }
  const subtreeCount = (id: number) =>
    descendantIds(byId, id).reduce((total, cid) => total + (countByCat.get(cid) ?? 0), 0);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    createCategory.mutate(
      {
        name: trimmed,
        parentId: parent === 'root' ? null : Number(parent),
        color,
      },
      {
        onSuccess: () => {
          setName('');
          setColor(null);
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            // e.g. "409 category-name-taken — a sibling named 'X' already exists."
            const slug = err.type.replace('/errors/', '');
            setError(`${err.status} ${slug} — ${err.detail}`);
          } else {
            setError('Could not create the category.');
          }
        },
      },
    );
  };

  interface Row {
    node: CategoryNode;
    hasKids: boolean;
    isCollapsed: boolean;
  }
  const rows: Row[] = [];
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      const isCollapsed = !!collapsed[node.id];
      rows.push({ node, hasKids: node.children.length > 0, isCollapsed });
      if (!isCollapsed) walk(node.children);
    }
  };
  walk(tree);

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
        }}
      >
        <h2 style={{ margin: 0 }}>Categories</h2>
        <span className="text-muted" style={{ fontSize: 13 }}>
          max depth 5 · names unique among siblings
        </span>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, alignItems: 'start' }}
      >
        <Card style={{ padding: '10px 6px' }}>
          {rows.map(({ node, hasKids, isCollapsed }) => {
            const count = subtreeCount(node.id);
            return (
              <div
                key={node.id}
                className="cat-row"
                style={{ paddingLeft: 12 + (node.depth - 1) * 22 }}
              >
                <button
                  className="cat-chevron"
                  style={{
                    cursor: hasKids ? 'pointer' : 'default',
                    color: hasKids ? 'currentcolor' : 'transparent',
                    transform: `rotate(${hasKids && !isCollapsed ? 90 : 0}deg)`,
                  }}
                  onClick={() =>
                    hasKids &&
                    setCollapsed((prev) => ({ ...prev, [node.id]: !prev[node.id] }))
                  }
                  aria-label="Toggle"
                >
                  <ChevronRightIcon />
                </button>
                <CategoryDot color={effectiveColor(byId, node.id)} />
                <Link
                  to={`/transactions?cat=${node.id}`}
                  className="row-link"
                  style={{ fontSize: 14, flex: 1 }}
                >
                  {node.name}
                </Link>
                <span className="text-muted tnum" style={{ fontSize: 12 }}>
                  {count > 0 ? `${count} txn` : ''}
                </span>
                <span className="tag tag-neutral" style={{ fontSize: 10 }}>
                  L{node.depth}
                </span>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, padding: '20px 14px', margin: 0 }}>
              No categories yet — create the first one on the right.
            </p>
          )}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 12px' }}>Add category</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError('');
                  }}
                  placeholder="e.g. Subscriptions"
                  aria-label="Category name"
                />
              </div>
              <div className="field">
                <label>Parent</label>
                <select
                  className="input"
                  value={parent}
                  onChange={(e) => {
                    setParent(e.target.value);
                    setError('');
                  }}
                  aria-label="Parent category"
                >
                  <option value="root">— root category —</option>
                  {parentOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Color</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '4px 2px' }}>
                  <button
                    className={`swatch auto${color === null ? ' selected' : ''}`}
                    onClick={() => setColor(null)}
                    title="Auto (inherit from parent)"
                    aria-label="Auto (inherit from parent)"
                  />
                  {PALETTE.map(([swatchName, hex]) => (
                    <button
                      key={hex}
                      className={`swatch${color === hex ? ' selected' : ''}`}
                      style={{ background: hex }}
                      onClick={() => setColor(hex)}
                      title={swatchName}
                      aria-label={swatchName}
                    />
                  ))}
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ alignSelf: 'start' }}
                onClick={create}
                disabled={createCategory.isPending}
              >
                Create
              </button>
              {error && <div className="error-box">{error}</div>}
            </div>
          </Card>
          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 8px' }}>Rules from the API</h4>
            <ul
              className="text-muted"
              style={{
                fontSize: 13,
                margin: 0,
                paddingLeft: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <li>
                Depth is capped at 5 — deeper creates return <code>422 category-depth-exceeded</code>.
              </li>
              <li>
                Sibling names must be unique — collisions return <code>409</code>.
              </li>
              <li>
                A category in use can't be deleted — the <code>409</code> carries usage counts.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}

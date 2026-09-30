import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCategories,
  useCategoryCounts,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import type { CategoryNode } from '../api/types';
import { Card } from '../components/Card';
import { CategoryDot } from '../components/CategoryDot';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowRightIcon, ChevronRightIcon, PencilIcon, TrashIcon } from '../components/icons';
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
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  // Transaction counts per row ("N txn"): the server counts every transaction of
  // the profile, grouped by the category it is filed on. Rolling the subtree up
  // is this screen's job — the mockup shows a parent's total including children.
  const counts = useCategoryCounts();

  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [name, setName] = useState('');
  const [parent, setParent] = useState('root');
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Which row's color popover is open (id), if any.
  const [colorEditId, setColorEditId] = useState<number | null>(null);
  // Which row is being renamed (id), and the in-progress input value.
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Which row's move popover is open (id), and the selected new parent.
  const [moveId, setMoveId] = useState<number | null>(null);
  const [moveValue, setMoveValue] = useState('root');
  const [pendingDelete, setPendingDelete] = useState<CategoryNode | null>(null);
  // Errors from row actions (colour/rename/move/delete) — shown below the tree,
  // not in the create form, so they land next to what the user clicked. Every
  // error on this screen carries its status and Problem type, like the
  // "Rules from the API" card: "409 category-name-taken — …".
  const [rowError, setRowError] = useState('');

  const onRowError = (err: unknown) => {
    setRowError(problemMessages(err, { withCode: true }).banner);
  };

  const startRename = (node: CategoryNode) => {
    setRowError('');
    setMoveId(null);
    setRenameId(node.id);
    setRenameValue(node.name);
  };

  const submitRename = (node: CategoryNode) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRowError('');
    updateCategory.mutate(
      { id: node.id, body: { name: trimmed } },
      { onSuccess: () => setRenameId(null), onError: onRowError },
    );
  };

  const startMove = (node: CategoryNode) => {
    setRowError('');
    setRenameId(null);
    setMoveId(node.id);
    setMoveValue(node.parentId === null ? 'root' : String(node.parentId));
  };

  const submitMove = (node: CategoryNode) => {
    setRowError('');
    updateCategory.mutate(
      { id: node.id, body: { parentId: moveValue === 'root' ? null : Number(moveValue) } },
      { onSuccess: () => setMoveId(null), onError: onRowError },
    );
  };

  const tree = categories ?? [];
  const byId = flattenTree(tree);
  const options = categoryOptions(tree);
  const parentOptions = options.filter((o) => o.depth < MAX_DEPTH);

  const countByCat = new Map<number, number>(
    (counts.data ?? []).map((row) => [row.categoryId, row.count]),
  );
  const subtreeCount = (id: number) =>
    descendantIds(byId, id).reduce((total, cid) => total + (countByCat.get(cid) ?? 0), 0);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (createCategory.isPending) return; // Enter bypasses the button's disabled state.
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
        onError: (err) => setError(problemMessages(err, { withCode: true }).banner),
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
        className="card-grid"
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
                    hasKids && setCollapsed((prev) => ({ ...prev, [node.id]: !prev[node.id] }))
                  }
                  aria-label="Toggle"
                >
                  <ChevronRightIcon />
                </button>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <button
                    className="dot-btn"
                    onClick={() => setColorEditId((open) => (open === node.id ? null : node.id))}
                    title="Change color"
                    aria-label={`Change color of ${node.name}`}
                  >
                    <CategoryDot color={effectiveColor(byId, node.id)} />
                  </button>
                  {colorEditId === node.id && (
                    <ColorPopover
                      current={node.color ?? null}
                      onPick={(hex) => {
                        setRowError('');
                        updateCategory.mutate(
                          { id: node.id, body: { color: hex } },
                          { onError: onRowError },
                        );
                        setColorEditId(null);
                      }}
                      onClose={() => setColorEditId(null)}
                    />
                  )}
                </span>
                {renameId === node.id ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <input
                      className="input"
                      style={{ fontSize: 14, padding: '4px 8px' }}
                      value={renameValue}
                      autoFocus
                      aria-label={`New name for ${node.name}`}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(node);
                        if (e.key === 'Escape') setRenameId(null);
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ padding: '3px 10px', fontSize: 12 }}
                      onClick={() => submitRename(node)}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 10px', fontSize: 12 }}
                      onClick={() => setRenameId(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <Link
                    to={`/transactions?cat=${node.id}`}
                    className="row-link"
                    style={{ fontSize: 14, flex: 1 }}
                  >
                    {node.name}
                  </Link>
                )}
                <span className="text-muted tnum" style={{ fontSize: 12 }}>
                  {count > 0 ? `${count} txn` : ''}
                </span>
                <span className="tag tag-neutral" style={{ fontSize: 10 }}>
                  L{node.depth}
                </span>
                <button
                  className="btn btn-icon btn-secondary"
                  style={{ width: 26, height: 26 }}
                  onClick={() => startRename(node)}
                  title="Rename"
                  aria-label={`Rename ${node.name}`}
                >
                  <PencilIcon size={12} />
                </button>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <button
                    className="btn btn-icon btn-secondary"
                    style={{ width: 26, height: 26 }}
                    onClick={() => (moveId === node.id ? setMoveId(null) : startMove(node))}
                    title="Move to a different parent"
                    aria-label={`Move ${node.name}`}
                  >
                    <ArrowRightIcon size={12} />
                  </button>
                  {moveId === node.id && (
                    <MovePopover
                      node={node}
                      // descendantIds includes the node itself, so this excludes both
                      // self and every descendant — a descendant as new parent is a
                      // guaranteed 422 category-cycle, invalid with no possibility of
                      // the server disagreeing.
                      options={parentOptions.filter(
                        (o) => !descendantIds(byId, node.id).includes(o.id),
                      )}
                      value={moveValue}
                      onChange={setMoveValue}
                      onSubmit={() => submitMove(node)}
                      onClose={() => setMoveId(null)}
                    />
                  )}
                </span>
                <button
                  className="btn btn-icon btn-secondary"
                  style={{ width: 26, height: 26 }}
                  onClick={() => setPendingDelete(node)}
                  title="Delete"
                  aria-label={`Delete ${node.name}`}
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, padding: '20px 14px', margin: 0 }}>
              No categories yet — create the first one on the right.
            </p>
          )}
          {rowError && (
            <div className="error-box" style={{ margin: '10px 12px' }}>
              {rowError}
            </div>
          )}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 12px' }}>Add category</h4>
            <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label htmlFor="cat-name">Name</label>
                <input
                  id="cat-name"
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
                <label htmlFor="cat-parent">Parent</label>
                <select
                  id="cat-parent"
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
                    type="button"
                    className={`swatch auto${color === null ? ' selected' : ''}`}
                    onClick={() => setColor(null)}
                    title="Auto (inherit from parent)"
                    aria-label="Auto (inherit from parent)"
                  />
                  {PALETTE.map(([swatchName, hex]) => (
                    <button
                      key={hex}
                      type="button"
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
                type="submit"
                className="btn btn-primary"
                style={{ alignSelf: 'start' }}
                disabled={createCategory.isPending}
              >
                Create
              </button>
              {error && <div className="error-box">{error}</div>}
            </form>
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
                Depth is capped at 5 — deeper creates return{' '}
                <code>422 category-depth-exceeded</code>.
              </li>
              <li>
                Sibling names must be unique — collisions return <code>409</code>.
              </li>
              <li>
                A category in use (subcategories, transactions, budgets or subscriptions) can't be
                deleted — the <code>409</code> carries usage counts.
              </li>
            </ul>
          </Card>
        </div>
      </div>
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          body="This can't be undone. A category with subcategories, transactions, budgets or subscriptions can't be deleted — the server will say why."
          confirmLabel="Delete category"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            setRowError('');
            deleteCategory.mutate(pendingDelete.id, { onError: onRowError });
            setPendingDelete(null);
          }}
        />
      )}
    </main>
  );
}

/**
 * Tiny inline popover for editing a row's color: the add-form palette plus
 * "Auto (inherit)". Closes on pick, Escape, or a click outside; a click on
 * another row's dot is left to that dot's own toggle.
 */
function ColorPopover({
  current,
  onPick,
  onClose,
}: {
  current: string | null;
  onPick: (hex: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (ref.current && !ref.current.contains(target) && !target.closest('.dot-btn')) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="color-popover blueprint" role="dialog" aria-label="Category color">
      <button
        className={`swatch auto${current === null ? ' selected' : ''}`}
        onClick={() => onPick(null)}
        title="Auto (inherit)"
        aria-label="Auto (inherit)"
      />
      {PALETTE.map(([swatchName, hex]) => (
        <button
          key={hex}
          className={`swatch${current === hex ? ' selected' : ''}`}
          style={{ background: hex }}
          onClick={() => onPick(hex)}
          title={swatchName}
          aria-label={swatchName}
        />
      ))}
    </div>
  );
}

/**
 * Row popover for re-parenting: a select of every category shallow enough to
 * hold this one (depth < MAX_DEPTH, same rule as the create form), minus the
 * row itself and its own descendants — both are cycles the server always
 * rejects (422 category-cycle), and the client already has the tree
 * structure needed to know that unconditionally, so filtering them isn't
 * duplicated business logic. The depth limit against this node's own subtree
 * height is left to the server's 422s, surfaced via onSubmit's error handler
 * in the parent.
 */
function MovePopover({
  node,
  options,
  value,
  onChange,
  onSubmit,
  onClose,
}: {
  node: CategoryNode;
  options: { id: number; label: string }[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="color-popover blueprint"
      role="dialog"
      aria-label={`Move ${node.name}`}
      style={{ flexWrap: 'nowrap', flexDirection: 'column', width: 220, gap: 10 }}
    >
      <select
        className="input"
        value={value}
        aria-label={`New parent for ${node.name}`}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="root">— root category —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <span style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary"
          style={{ padding: '3px 10px', fontSize: 12 }}
          onClick={onSubmit}
        >
          Move
        </button>
        <button
          className="btn btn-secondary"
          style={{ padding: '3px 10px', fontSize: 12 }}
          onClick={onClose}
        >
          Cancel
        </button>
      </span>
    </div>
  );
}

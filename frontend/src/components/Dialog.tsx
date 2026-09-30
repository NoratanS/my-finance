import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Corners } from './Card';

// What Tab can land on. Disabled controls and tabindex="-1" are left out, so
// the wrap never targets something that cannot take focus.
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  /** Shown as the dialog title and used as its accessible name. */
  title: string;
  /** Called when the user dismisses it (Escape, backdrop click); never on unmount. */
  onClose: () => void;
  children: ReactNode;
  /** Width in pixels. Omitted: the design system's dialog width (440). */
  width?: number;
}

/**
 * The one modal dialog shell. Mounting it opens the dialog, unmounting closes
 * it: render it only while open. It owns everything a dialog must get right —
 * the design-system markup and stacking order, focus moved to the first
 * focusable element on open, Escape and backdrop-click dismissal, the Tab
 * trap, focus returned to the opener on close, and the accessible name.
 *
 * What stays the caller's job:
 * - put the element that should receive focus first in the content;
 * - do not use `autoFocus` (or a focusing effect) inside a dialog — a child
 *   takes focus before this module's effect runs, so the child would be
 *   remembered as the opener;
 * - keep the action buttons inside the content (a form's submit button
 *   inside its `<form>`).
 *
 * Why not the native `<dialog>` element: the unit-test environment (jsdom 30)
 * implements no `showModal()`, no `close()` and no cancel event, and hides a
 * dialog without the `open` attribute, so every behaviour test would be
 * deleted or run against a stub. Revisit when jsdom implements `showModal()`.
 */
export function Dialog({ title, onClose, children, width }: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Remember the opener before moving focus in — in this order, in one effect —
  // and give focus back to it when the dialog unmounts.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Tab/Shift+Tab at the dialog's edges wraps instead of escaping onto the
  // page behind it. Queried on every key press, so fields added or disabled
  // after opening are handled.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        ref={dialogRef}
        className="dialog blueprint"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
      >
        <Corners />
        <div className="dialog-title" id={titleId}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

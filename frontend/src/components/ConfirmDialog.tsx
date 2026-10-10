import type { ReactNode } from 'react';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  /** Names the specific record — e.g. `Delete the transaction "Biedronka — 43.20 zł"?` */
  title: string;
  /** States what is lost / what happens — e.g. "This can't be undone." */
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  confirmDisabled?: boolean;
}

/**
 * The one shared confirmation dialog for every irreversible or consequential
 * action (delete a transaction, delete a saved insight, cancel or permanently
 * delete a subscription, delete a profile). Initial focus goes to Cancel, not
 * the destructive action, so a stray Enter never destroys anything (Cancel is
 * rendered first, and `Dialog` focuses the first focusable element). A `body`
 * that holds a field takes the initial focus instead — the profile picker asks
 * for the profile's name there and keeps the action disabled until it matches.
 * Such a body puts its field in a `<form>` of its own, whose submit runs the
 * caller's confirm handler: Enter in the field then confirms, while the action
 * button stays here, outside that form, and calls `onConfirm` on click.
 * Escape and the backdrop both dismiss without calling `onConfirm`.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  confirmDisabled,
}: ConfirmDialogProps) {
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="dialog-body">{body}</div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          {cancelLabel}
        </button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={confirmDisabled}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

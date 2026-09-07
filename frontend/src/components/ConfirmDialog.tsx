import { useEffect, useRef, type ReactNode } from 'react';
import { Corners } from './Card';

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
 * delete a subscription). Initial focus goes to Cancel, not the destructive
 * action, so a stray Enter never destroys anything; Escape and the backdrop
 * both dismiss without calling `onConfirm`.
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus lands on Cancel, and returns to whatever triggered the dialog (the
  // row's delete/cancel button) once it closes — the two focus-management
  // bugs J8 flags for TxnModal, fixed here rather than carried over.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Only two focusable elements, so the trap is a toggle: Tab (or Shift+Tab)
  // always bounces between Cancel and the confirm button.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        className="dialog blueprint"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <Corners />
        <div className="dialog-title" id="confirm-dialog-title">
          {title}
        </div>
        <div className="dialog-body">{body}</div>
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn btn-secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

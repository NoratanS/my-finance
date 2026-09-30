import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Dialog } from './Dialog';

// The dialog behaviour every dialog shares (TxnModal, BudgetForm,
// ConfirmDialog) is tested once, here. A button outside the dialog stands in
// for the page behind the backdrop, so a Tab that escapes is observable.

function setup({ lastDisabled = false } = {}) {
  const onClose = vi.fn();
  render(
    <>
      <Dialog title="Edit things" onClose={onClose}>
        <input aria-label="Name" />
        <button type="button">Cancel</button>
        <button type="button">Save</button>
        {lastDisabled && (
          <button type="button" disabled>
            Unavailable
          </button>
        )}
      </Dialog>
      <button type="button">Behind the backdrop</button>
    </>,
  );
  return { onClose };
}

test('is a modal dialog named by its title', () => {
  setup();
  const dialog = screen.getByRole('dialog', { name: 'Edit things' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
});

test('on open, focus moves to the first focusable element', () => {
  setup();
  expect(screen.getByLabelText('Name')).toHaveFocus();
});

test('Escape calls the close handler', async () => {
  const user = userEvent.setup();
  const { onClose } = setup();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a click on the backdrop calls the close handler; a click inside does not', async () => {
  const user = userEvent.setup();
  const { onClose } = setup();
  const dialog = screen.getByRole('dialog');

  await user.click(dialog);
  expect(onClose).not.toHaveBeenCalled();

  await user.click(dialog.parentElement!);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Tab from the last focusable element wraps to the first', async () => {
  const user = userEvent.setup();
  setup();
  screen.getByRole('button', { name: 'Save' }).focus();
  await user.tab();
  expect(screen.getByLabelText('Name')).toHaveFocus();
});

test('Shift+Tab from the first focusable element wraps to the last', async () => {
  const user = userEvent.setup();
  setup();
  expect(screen.getByLabelText('Name')).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
});

test('a disabled control is skipped by the wrap', async () => {
  const user = userEvent.setup();
  setup({ lastDisabled: true });
  screen.getByRole('button', { name: 'Save' }).focus();
  await user.tab();
  expect(screen.getByLabelText('Name')).toHaveFocus();
});

test('closing returns focus to the element focused before opening', async () => {
  const user = userEvent.setup();
  const trigger = document.createElement('button');
  trigger.textContent = 'Open';
  document.body.appendChild(trigger);
  trigger.focus();

  const { unmount } = render(
    <Dialog title="Edit things" onClose={() => unmount()}>
      <button type="button">Cancel</button>
    </Dialog>,
  );
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  trigger.remove();
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      title='Delete the transaction "Biedronka — 43.20 zł"?'
      body="This can't be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onConfirm, onClose };
}

test('names the specific record in the accessible dialog title', () => {
  setup();
  const dialog = screen.getByRole('dialog', {
    name: 'Delete the transaction "Biedronka — 43.20 zł"?',
  });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
});

test('initial focus is on Cancel, not the destructive action', () => {
  setup();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
});

test('clicking the confirm button calls onConfirm, not onClose', async () => {
  const user = userEvent.setup();
  const { onConfirm, onClose } = setup();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

test('clicking Cancel calls onClose, not onConfirm', async () => {
  const user = userEvent.setup();
  const { onConfirm, onClose } = setup();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('Escape dismisses without confirming', async () => {
  const user = userEvent.setup();
  const { onConfirm, onClose } = setup();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('closing returns focus to whatever opened the dialog (J8: not <body>)', async () => {
  const user = userEvent.setup();
  const trigger = document.createElement('button');
  trigger.textContent = 'Delete transaction';
  document.body.appendChild(trigger);
  trigger.focus();

  const { unmount } = render(
    <ConfirmDialog
      title="Delete?"
      body="This can't be undone."
      confirmLabel="Delete"
      onConfirm={vi.fn()}
      onClose={() => unmount()}
    />,
  );
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  trigger.remove();
});

test('Tab does not escape the dialog', async () => {
  const user = userEvent.setup();
  setup();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
});

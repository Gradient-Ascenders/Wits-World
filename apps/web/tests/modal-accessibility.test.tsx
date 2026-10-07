import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthorConfirmationDialog } from '../src/components/author/AuthorConfirmationDialog';
import { ResignMatchDialog } from '../src/components/matches/ResignMatchDialog';

describe('confirmation dialog focus', () => {
  it('isolates the background and retains focus while an author action is busy', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open confirmation';
    document.body.append(trigger);
    trigger.focus();
    const props = {
      busy: false,
      cancelLabel: 'Keep editing',
      confirmLabel: 'Discard changes',
      description: <p>The draft will be discarded.</p>,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      title: 'Discard unsaved changes?',
    };
    const view = render(<AuthorConfirmationDialog {...props} />);
    const dialog = screen.getByRole('dialog', {
      name: 'Discard unsaved changes?',
    });

    expect(trigger.inert).toBe(true);
    expect(view.container.inert).toBe(true);
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();

    view.rerender(<AuthorConfirmationDialog {...props} busy />);
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(dialog.querySelector('.author-dialog__actions')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(false);
    expect(dialog).toHaveFocus();

    view.unmount();
    expect(trigger.inert).toBe(false);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('keeps a busy forfeit dialog focused and restores its trigger on close', async () => {
    const triggerElement = document.createElement('button');
    triggerElement.textContent = 'Forfeit';
    document.body.append(triggerElement);
    const trigger = { current: triggerElement };
    triggerElement.focus();
    const props = {
      busy: false,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      opponentLabel: 'Opponent',
      returnFocusRef: trigger,
    };
    const view = render(<ResignMatchDialog {...props} />);
    const dialog = screen.getByRole('alertdialog', {
      name: 'Forfeit this battle?',
    });
    expect(triggerElement.inert).toBe(true);
    view.rerender(<ResignMatchDialog {...props} busy />);
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(false);

    view.unmount();
    expect(triggerElement.inert).toBe(false);
    expect(triggerElement).toHaveFocus();
    triggerElement.remove();
  });
});

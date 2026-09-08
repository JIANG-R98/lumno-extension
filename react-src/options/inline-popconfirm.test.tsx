import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlinePopconfirm } from './inline-popconfirm';

let roots: Root[] = [];

function createFixture(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <InlinePopconfirm
        copy={{
          cancelLabel: 'Cancel',
          confirmLabel: 'Confirm',
          message: 'Remove this item?',
          messageKey: 'confirm_remove_item'
        }}
        onConfirm={onConfirm}
        triggerAriaLabel="Remove"
        triggerClassName="remove-trigger"
        triggerIconClass="remove-icon"
      />
    );
  });
  return { host, onConfirm };
}

function getTrigger(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>('.remove-trigger');
}

function getActions(host: HTMLElement) {
  return host.querySelectorAll<HTMLButtonElement>(
    '._x_extension_popconfirm_actions_2024_unique_ button'
  );
}

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots = [];
  document.body.textContent = '';
});

describe('Options inline Popconfirm', () => {
  it('does not leave hidden actions in the tab order and restores focus on cancel', () => {
    const { host } = createFixture();
    const trigger = getTrigger(host);
    const popconfirm = host.querySelector<HTMLElement>(
      '._x_extension_popconfirm_2024_unique_'
    );

    expect(popconfirm?.dataset.open).toBe('false');
    expect(popconfirm?.getAttribute('aria-hidden')).toBe('true');
    expect(popconfirm?.getAttribute('aria-label')).toBe('Remove this item?');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(getActions(host)).toHaveLength(0);

    act(() => trigger?.click());
    expect(popconfirm?.dataset.open).toBe('true');
    expect(popconfirm?.getAttribute('aria-hidden')).toBe('false');
    expect(getActions(host)).toHaveLength(2);

    const cancelButton = getActions(host)[0];
    act(() => {
      cancelButton?.focus();
      cancelButton?.click();
    });

    expect(popconfirm?.dataset.open).toBe('false');
    expect(getActions(host)).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
  });

  it('restores trigger focus after Escape and a completed confirmation', async () => {
    const { host, onConfirm } = createFixture();
    const trigger = getTrigger(host);

    act(() => trigger?.click());
    act(() => {
      getActions(host)[0]?.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Escape'
      }));
    });
    expect(getActions(host)).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);

    act(() => trigger?.click());
    const confirmButton = getActions(host)[1];
    await act(async () => {
      confirmButton?.focus();
      confirmButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(getActions(host)).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
  });
});

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPopconfirmApi,
  createPopconfirmController,
  type PopconfirmController
} from './popconfirm';

let controllers: PopconfirmController[] = [];

function createFixture() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const options = {
    onCancel: vi.fn(),
    onConfirm: vi.fn()
  };
  const controller = createPopconfirmController(host, options);
  controllers.push(controller);
  return { controller, host, options };
}

afterEach(() => {
  act(() => {
    controllers.forEach((controller) => controller.destroy());
  });
  controllers = [];
  document.body.textContent = '';
});

describe('Options Popconfirm React island', () => {
  it('renders the existing classes, localization hooks, and open state', () => {
    const { controller, host } = createFixture();
    act(() => {
      controller.render({
        cancelLabel: '取消',
        confirmLabel: '确认',
        message: '确认清空排除规则？',
        messageKey: 'confirm_clear_favicon_blacklist',
        open: true
      });
    });

    expect(createPopconfirmApi().implementation).toBe('react');
    expect(host.dataset.reactIsland).toBe('options-popconfirm');
    expect(host.dataset.open).toBe('true');
    expect(
      host.querySelector('._x_extension_popconfirm_text_2024_unique_')
        ?.getAttribute('data-i18n')
    ).toBe('confirm_clear_favicon_blacklist');
    expect(host.querySelectorAll('button')).toHaveLength(2);
    expect(host.querySelectorAll('button')[0]?.textContent).toBe('取消');
    expect(host.querySelectorAll('button')[1]?.textContent).toBe('确认');
  });

  it('removes hidden actions while closed and reuses the host when reopened', () => {
    const { controller, host } = createFixture();
    act(() => {
      controller.render({
        cancelLabel: 'Cancel',
        confirmLabel: 'Confirm',
        message: 'Clear excluded favicon rules?',
        messageKey: 'confirm_clear_favicon_blacklist',
        open: false
      });
    });

    expect(host.dataset.open).toBe('false');
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.textContent).toBe('');
    expect(host.isConnected).toBe(true);

    act(() => {
      controller.render({
        cancelLabel: 'Cancel',
        confirmLabel: 'Confirm',
        message: 'Clear excluded favicon rules?',
        messageKey: 'confirm_clear_favicon_blacklist',
        open: true
      });
    });
    expect(host.getAttribute('aria-hidden')).toBe('false');
    expect(host.querySelector('div')?.textContent).toBe(
      'Clear excluded favicon rules?'
    );
    expect(host.querySelectorAll('button')).toHaveLength(2);
  });

  it('routes cancel and confirm exactly once without document delegation', () => {
    const { controller, host, options } = createFixture();
    const documentClick = vi.fn();
    document.addEventListener('click', documentClick);
    act(() => {
      controller.render({
        cancelLabel: 'Cancel',
        confirmLabel: 'Confirm',
        message: 'Continue?',
        messageKey: 'confirm_continue',
        open: true
      });
      host.querySelectorAll<HTMLButtonElement>('button')[0]?.click();
      host.querySelectorAll<HTMLButtonElement>('button')[1]?.click();
    });

    expect(options.onCancel).toHaveBeenCalledTimes(1);
    expect(options.onConfirm).toHaveBeenCalledTimes(1);
    expect(documentClick).not.toHaveBeenCalled();
    document.removeEventListener('click', documentClick);
  });

  it('unmounts cleanly', () => {
    const { controller, host } = createFixture();
    act(() => {
      controller.render({
        cancelLabel: 'Cancel',
        confirmLabel: 'Confirm',
        message: 'Continue?',
        messageKey: 'confirm_continue',
        open: true
      });
      controller.destroy();
    });

    expect(host.dataset.open).toBe('false');
    expect(host.childElementCount).toBe(0);
  });
});

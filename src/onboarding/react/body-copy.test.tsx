import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBodyCopyApi,
  createBodyCopyController,
  type BodyCopyController,
  type BodyCopyRenderModel
} from './body-copy';

let controllers: BodyCopyController[] = [];

function createFixture() {
  const host = document.createElement('p');
  host.id = 'onboarding-body';
  host.className = 'body-copy';
  host.dataset.empty = 'true';
  document.body.appendChild(host);
  const controller = createBodyCopyController(host);
  controllers.push(controller);
  return { controller, host };
}

function render(
  controller: BodyCopyController,
  overrides: Partial<BodyCopyRenderModel> = {}
): void {
  act(() => {
    controller.render({
      note: '',
      shortcutLabel: '⌘⇧K',
      shortcutPlaceholder: '{shortcut}',
      shortcutTokens: ['⌘', '⇧', 'K'],
      shortcutValue: 'Command+Shift+K',
      value: '',
      ...overrides
    });
  });
}

afterEach(() => {
  act(() => {
    controllers.forEach((controller) => controller.destroy());
  });
  controllers = [];
  document.body.textContent = '';
});

describe('Onboarding body copy React island', () => {
  it('renders plain body and note copy while preserving stable child targets', () => {
    const { controller, host } = createFixture();
    render(controller, {
      note: 'You can change this later.',
      value: 'Search from any page.'
    });

    expect(createBodyCopyApi().implementation).toBe('react');
    expect(host.dataset.reactIsland).toBe('onboarding-body-copy');
    expect(host.dataset.empty).toBe('false');
    expect(host.querySelector('#onboarding-body-prefix')?.textContent).toBe(
      'Search from any page.'
    );
    expect(
      host.querySelector<HTMLElement>('#onboarding-shortcut-label')?.hidden
    ).toBe(true);
    expect(host.querySelector('#onboarding-body-suffix')?.textContent).toBe('');
    expect(host.querySelector('#onboarding-body-note')?.textContent).toBe(
      'You can change this later.'
    );
  });

  it('splits shortcut copy into accessible keycaps with legacy sizing', () => {
    const { controller, host } = createFixture();
    render(controller, {
      shortcutLabel: 'CTRL+SHIFT+SPACE',
      shortcutTokens: ['CTRL', 'SHIFT', 'SPACE'],
      shortcutValue: 'Ctrl+Shift+Space',
      value: 'Press {shortcut} to open Lumno.'
    });

    const shortcut = host.querySelector<HTMLElement>(
      '#onboarding-shortcut-label'
    );
    const keycaps = Array.from(
      host.querySelectorAll<HTMLElement>('.shortcut-keycap')
    );

    expect(shortcut?.hidden).toBe(false);
    expect(shortcut?.getAttribute('aria-label')).toBe('Ctrl+Shift+Space');
    expect(keycaps.map((keycap) => keycap.textContent)).toEqual([
      'CTRL',
      'SHIFT',
      'SPACE'
    ]);
    expect(keycaps.map((keycap) => keycap.style.minWidth)).toEqual([
      '44px',
      '52px',
      '52px'
    ]);
    expect(host.querySelector('#onboarding-body-prefix')?.textContent).toBe(
      'Press '
    );
    expect(host.querySelector('#onboarding-body-suffix')?.textContent).toBe(
      ' to open Lumno.'
    );
  });

  it('updates shortcut tokens in place after the browser command resolves', () => {
    const { controller, host } = createFixture();
    render(controller, {
      shortcutLabel: '⌘⇧K',
      shortcutTokens: ['⌘', '⇧', 'K'],
      value: 'Press {shortcut}.'
    });
    render(controller, {
      shortcutLabel: '⌘K',
      shortcutTokens: ['⌘', 'K'],
      shortcutValue: 'Command+K',
      value: 'Press {shortcut}.'
    });

    expect(
      Array.from(host.querySelectorAll('.shortcut-keycap')).map(
        (keycap) => keycap.textContent
      )
    ).toEqual(['⌘', 'K']);
    expect(
      host.querySelector('#onboarding-shortcut-label')
        ?.getAttribute('aria-label')
    ).toBe('Command+K');
  });

  it('keeps the empty-state skeleton contract when body and note are absent', () => {
    const { controller, host } = createFixture();
    render(controller);

    expect(host.dataset.empty).toBe('true');
    expect(host.querySelector('#onboarding-body-note')?.textContent).toBe('');
    expect(host.querySelectorAll('.shortcut-keycap')).toHaveLength(0);
  });
});

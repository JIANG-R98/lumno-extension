import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCursorLayerApi,
  createCursorLayerController,
  type CursorLayerController
} from './cursor-layer';

let controllers: CursorLayerController[] = [];

function createFixture() {
  const host = document.createElement('div');
  host.id = 'onboarding-cursor-layer';
  host.className = 'cursor-layer';
  document.body.appendChild(host);
  const controller = createCursorLayerController(host);
  controllers.push(controller);
  return { controller, host };
}

afterEach(() => {
  act(() => {
    controllers.forEach((controller) => controller.destroy());
  });
  controllers = [];
  document.body.textContent = '';
});

describe('Onboarding cursor layer React island', () => {
  it('renders the existing cursor SVG and animation mode contract', () => {
    const { controller, host } = createFixture();
    act(() => {
      controller.render({ enabled: true, mode: 'setup' });
    });

    expect(createCursorLayerApi().implementation).toBe('react');
    expect(host.dataset.reactIsland).toBe('onboarding-cursor-layer');
    expect(host.dataset.cursorEnabled).toBe('true');
    expect(host.dataset.cursorMode).toBe('setup');
    expect(host.querySelectorAll('.demo-cursor')).toHaveLength(1);
    expect(
      host.querySelector('.figma-cursor')?.getAttribute('viewBox')
    ).toBe('0 0 48 58');
    const paths = host.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('d')).toBe(
      'M8.5 6.5 L43.5 28.7 L29.3 33 L20.8 50 Z'
    );
    expect(paths[1]?.getAttribute('stroke-width')).toBe('2');
    expect(paths[1]?.getAttribute('fill')).toBe('#303030');
  });

  it('keeps one cursor node while disabling and changing modes', () => {
    const { controller, host } = createFixture();
    act(() => {
      controller.render({ enabled: true, mode: 'intro' });
      controller.render({ enabled: false, mode: 'finish' });
    });

    expect(host.dataset.cursorEnabled).toBe('false');
    expect(host.dataset.cursorMode).toBe('');
    expect(host.querySelectorAll('.demo-cursor')).toHaveLength(1);

    act(() => {
      controller.render({ enabled: true, mode: 'finish' });
    });
    expect(host.dataset.cursorEnabled).toBe('true');
    expect(host.dataset.cursorMode).toBe('finish');
    expect(host.querySelectorAll('.demo-cursor')).toHaveLength(1);
  });
});

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createThemePickerApi,
  createThemePickerController,
  type ThemePickerController,
  type ThemePickerRenderModel
} from './theme-picker';

let controllers: ThemePickerController[] = [];

const model: ThemePickerRenderModel = {
  activeMode: 'system',
  options: [
    {
      label: '跟随系统',
      labelKey: 'settings_theme_system',
      mode: 'system',
      previewSrc: '../../assets/images/system.svg'
    },
    {
      label: '浅色',
      labelKey: 'settings_theme_light',
      mode: 'light',
      previewSrc: '../../assets/images/light.svg'
    },
    {
      label: '深色',
      labelKey: 'settings_theme_dark',
      mode: 'dark',
      previewSrc: '../../assets/images/dark.svg'
    }
  ]
};

function createFixture() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const onSelect = vi.fn();
  const controller = createThemePickerController(host, { onSelect });
  controllers.push(controller);
  return { controller, host, onSelect };
}

afterEach(() => {
  act(() => {
    controllers.forEach((controller) => controller.destroy());
  });
  controllers = [];
  document.body.textContent = '';
});

describe('Options theme picker React island', () => {
  it('renders the existing gallery classes, previews, and active state', () => {
    const { controller, host } = createFixture();
    act(() => controller.render(model));

    expect(createThemePickerApi().implementation).toBe('react');
    expect(host.dataset.reactIsland).toBe('options-theme-picker');
    expect(host.querySelectorAll('button')).toHaveLength(3);
    expect(host.querySelector('[data-mode="system"]')?.getAttribute('data-active'))
      .toBe('true');
    expect(host.querySelector('[data-mode="dark"] img')?.getAttribute('src'))
      .toBe('../../assets/images/dark.svg');
  });

  it('routes a selected mode and the live button element to the adapter', () => {
    const { controller, host, onSelect } = createFixture();
    act(() => {
      controller.render(model);
      host.querySelector<HTMLButtonElement>('[data-mode="dark"]')?.click();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toBe('dark');
    expect(onSelect.mock.calls[0]?.[1]).toBeInstanceOf(HTMLButtonElement);
  });

  it('updates the controlled active mode and localized labels in place', () => {
    const { controller, host } = createFixture();
    act(() => controller.render(model));
    act(() => controller.render({
      activeMode: 'dark',
      options: model.options.map((option) => ({
        ...option,
        label: option.mode === 'dark' ? 'Dark' : option.label
      }))
    }));

    expect(host.isConnected).toBe(true);
    expect(host.querySelector('[data-mode="system"]')?.getAttribute('aria-pressed'))
      .toBe('false');
    expect(host.querySelector('[data-mode="dark"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(host.querySelector('[data-mode="dark"]')?.textContent).toContain('Dark');
  });

  it('unmounts cleanly', () => {
    const { controller, host } = createFixture();
    act(() => {
      controller.render(model);
      controller.destroy();
    });

    expect(host.childElementCount).toBe(0);
  });
});

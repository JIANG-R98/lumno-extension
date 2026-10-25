import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createPopupController, type PopupHandlers, type PopupModel } from './popup-view';
import { getTags } from '../../../tests/react/dom';
import { queryHtmlElement, queryHtmlTag } from '../../shared/dom-lookup';

function createModel(overrides: Partial<PopupModel> = {}): PopupModel {
  return {
    page: { title: 'Kyoto walk', host: 'www.bilibili.com', iconUrl: 'icon.png', iconClass: 'ri-global-line' },
    actionsLabel: 'Page actions',
    actions: [
      { id: 'search', label: 'Open command bar', tooltip: '⇧⌘K', iconClass: 'ri-search-line', disabled: false },
      { id: 'copy', label: 'Copy link', tooltip: '⇧⌘C', iconClass: 'ri-link', disabled: false },
      { id: 'shortcut', label: 'Add shortcut', tooltip: 'Add this page to your Lumno New Tab shortcuts', iconClass: 'ri-apps-2-add-line', disabled: true },
      { id: 'clip', label: 'Web clip', tooltip: '', iconClass: 'ri-screenshot-2-line', disabled: false }
    ],
    actionPanel: null,
    notice: null,
    settings: {
      label: 'Quick settings',
      expanded: true,
      sections: [
        {
          id: 'command-bar',
          title: 'Command bar',
          rows: [
            {
              kind: 'segmented',
              id: 'overlaySize',
              label: 'Size',
              value: 'standard',
              options: [
                { value: 'compact', label: 'Compact' },
                { value: 'standard', label: 'Standard' },
                { value: 'large', label: 'Large' }
              ]
            },
            { kind: 'switch', id: 'overlayPageTheme', label: 'Match page colors', checked: true }
          ]
        },
        {
          id: 'general',
          title: 'General',
          rows: [
            { kind: 'switch', id: 'selectionQuickActions', label: 'Selection quick actions', checked: false },
            {
              kind: 'segmented',
              id: 'theme',
              label: 'Theme',
              value: 'dark',
              options: [
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' }
              ]
            }
          ]
        }
      ]
    },
    links: [
      { id: 'release', label: 'What’s new', iconClass: 'ri-sparkling-2-line' },
      { id: 'feedback', label: 'Feedback', iconClass: 'ri-chat-smile-2-line' },
      { id: 'shortcuts', label: 'Shortcuts', iconClass: 'ri-keyboard-box-line' },
      { id: 'settings', label: 'Settings', iconClass: 'ri-settings-3-line' }
    ],
    sync: { label: 'WebDAV synced · 2 minutes ago', tone: 'ok' },
    version: 'Lumno 1.1.3',
    ...overrides
  };
}

function mount(model: PopupModel) {
  const host = document.createElement('main');
  document.body.appendChild(host);
  const handlers: PopupHandlers = {
    onAction: vi.fn(),
    onSwitch: vi.fn(),
    onSelect: vi.fn(),
    onSettingsToggle: vi.fn(),
    onActionMenuToggle: vi.fn(),
    onLink: vi.fn()
  };
  const controller = createPopupController(host, handlers);
  act(() => controller.render(model));
  return { host, handlers, controller };
}

describe('Toolbar popup', () => {
  it('shows the page and its actions with their states', () => {
    const { host, handlers } = mount(createModel());
    expect(host.querySelector('.x-lumno-popup__page-title')?.textContent).toBe('Kyoto walk');
    expect(host.querySelector('.x-lumno-popup__page-host')?.textContent).toBe('www.bilibili.com');
    expect(host.querySelector('.x-lumno-popup__page-icon img')?.getAttribute('src')).toBe('icon.png');

    const group = queryHtmlElement(host, '.x-lumno-popup__actions');
    expect(group?.dataset.count).toBe('4');
    const buttons = Array.from(getTags(host, '.x-lumno-popup__action', 'button'));
    expect(buttons.map((button) => button.dataset.action)).toEqual(['search', 'copy', 'shortcut', 'clip']);
    expect(buttons[0].textContent).toBe('Open command bar');
    expect(buttons[0].dataset.tooltip).toBe('⇧⌘K');
    expect(buttons[1].textContent).toBe('Copy link');
    expect(buttons[1].querySelector('.ri-link')).not.toBeNull();
    expect(buttons[1].dataset.tooltip).toBe('⇧⌘C');
    expect(buttons[2].dataset.tooltip).toBe('Add this page to your Lumno New Tab shortcuts');
    expect(buttons[2].disabled).toBe(true);
    expect(buttons[3].hasAttribute('data-tooltip')).toBe(false);

    act(() => buttons[0].click());
    act(() => buttons[3].click());
    act(() => buttons[2].click());
    expect(handlers.onAction).toHaveBeenCalledTimes(2);
    expect(handlers.onAction).toHaveBeenNthCalledWith(1, 'search');
    expect(handlers.onAction).toHaveBeenNthCalledWith(2, 'clip');
  });

  it('opens an action’s options from its chevron', () => {
    const pip = {
      id: 'pip' as const,
      label: 'Picture-in-picture',
      tooltip: 'Float this page’s video in a small window',
      iconClass: 'ri-picture-in-picture-2-line',
      disabled: true,
      menu: { label: 'Auto picture-in-picture', expanded: false }
    };
    const base = createModel();
    const { host, handlers, controller } = mount({ ...base, actions: [...base.actions, pip] });
    expect(queryHtmlElement(host, '.x-lumno-popup__actions')?.dataset.count).toBe('5');
    const cell = queryHtmlElement(host, '[data-action="pip"]')?.parentElement;
    expect(cell?.dataset.hasMenu).toBe('true');
    expect(queryHtmlTag(host, '[data-action="pip"]', 'button')?.disabled).toBe(true);
    const chevron = cell?.querySelector<HTMLButtonElement>('.x-lumno-popup__action-menu');
    expect(chevron?.disabled).toBe(false);
    expect(chevron?.getAttribute('aria-expanded')).toBe('false');
    expect(chevron?.getAttribute('aria-label')).toBe('Auto picture-in-picture');
    act(() => chevron?.click());
    expect(handlers.onActionMenuToggle).toHaveBeenCalledWith('pip', true);
    expect(handlers.onAction).not.toHaveBeenCalled();

    act(() => controller.render({
      ...base,
      actions: [...base.actions, { ...pip, menu: { ...pip.menu, expanded: true } }],
      actionPanel: {
        actionId: 'pip',
        expanded: true,
        rows: [{ kind: 'switch', id: 'autoPip', label: 'Auto picture-in-picture', hint: 'A playing video floats when you switch tabs', checked: true }]
      }
    }));
    const panel = queryHtmlElement(host, '.x-lumno-popup__action-panel');
    expect(panel?.id).toBe(chevron?.getAttribute('aria-controls'));
    expect(panel?.querySelector('.x-lumno-popup__row-hint')?.textContent).toBe('A playing video floats when you switch tabs');
    const toggle = panel?.querySelector<HTMLInputElement>('input[role="switch"]');
    expect(toggle?.checked).toBe(true);
    act(() => toggle?.click());
    expect(handlers.onSwitch).toHaveBeenCalledWith('autoPip', false);
    expect(panel?.dataset.expanded).toBe('true');
    expect(panel?.hasAttribute('inert')).toBe(false);

    // Folding keeps the panel mounted so it can animate closed.
    act(() => controller.render({
      ...base,
      actions: [...base.actions, pip],
      actionPanel: {
        actionId: 'pip',
        expanded: false,
        rows: [{ kind: 'switch', id: 'autoPip', label: 'Auto picture-in-picture', checked: true }]
      }
    }));
    expect(host.querySelector('.x-lumno-popup__action-panel')).toBe(panel);
    expect(panel?.dataset.expanded).toBe('false');
    expect(panel?.hasAttribute('inert')).toBe(true);
  });

  it('falls back to an icon when the page has no image', () => {
    const { host } = mount(createModel({
      page: { title: 'Other extension', host: 'other', iconUrl: '', iconClass: 'ri-puzzle-line' }
    }));
    expect(host.querySelector('.x-lumno-popup__page-icon .ri-puzzle-line')).not.toBeNull();
    expect(host.querySelector('.x-lumno-popup__page-icon img')).toBeNull();
  });

  it('shows an error notice', () => {
    const { host } = mount(createModel({ notice: { text: 'Couldn’t copy the link.', tone: 'error' } }));
    const notice = queryHtmlElement(host, '.x-lumno-popup__notice');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.dataset.tone).toBe('error');
  });

  it('renders setting sections and reports changes by row id', () => {
    const { host, handlers } = mount(createModel());
    expect(Array.from(host.querySelectorAll('.x-lumno-popup__section-title')).map((title) => title.textContent))
      .toEqual(['Command bar', 'General']);

    const selection = queryHtmlTag(host, '[data-setting="selectionQuickActions"] input[role="switch"]', 'input');
    expect(selection?.checked).toBe(false);
    expect(host.querySelector(`label[for="${selection?.id}"]`)?.textContent).toBe('Selection quick actions');
    act(() => selection?.click());
    expect(handlers.onSwitch).toHaveBeenCalledWith('selectionQuickActions', true);

    const sizes = Array.from(getTags(host, '[data-setting="overlaySize"] [role="radio"]', 'button'));
    expect(sizes.map((option) => option.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    act(() => sizes[2].click());
    expect(handlers.onSelect).toHaveBeenCalledWith('overlaySize', 'large');

    const themes = Array.from(getTags(host, '[data-setting="theme"] [role="radio"]', 'button'));
    expect(themes.map((option) => option.tabIndex)).toEqual([-1, -1, 0]);
    act(() => {
      themes[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(handlers.onSelect).toHaveBeenLastCalledWith('theme', 'system');
  });

  it('folds the settings and reports the toggle', () => {
    const { host, handlers } = mount(createModel({
      settings: { ...createModel().settings, expanded: false }
    }));
    const toggle = queryHtmlTag(host, '.x-lumno-popup__settings-toggle', 'button');
    expect(toggle?.textContent).toBe('Quick settings');
    expect(toggle?.querySelectorAll('.ri-icon')).toHaveLength(1);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.x-lumno-popup__settings-panel')?.hasAttribute('inert')).toBe(true);
    act(() => toggle?.click());
    expect(handlers.onSettingsToggle).toHaveBeenCalledWith(true);
  });

  it('shows footer links as named icons', () => {
    const { host, handlers } = mount(createModel({
      sync: { label: 'WebDAV sync failed', tone: 'error' }
    }));
    expect(host.querySelector('.x-lumno-popup__version')?.textContent).toBe('Lumno 1.1.3');
    const links = Array.from(getTags(host, '[data-link]', 'button'));
    expect(links.map((link) => [link.getAttribute('aria-label'), link.dataset.tooltip, link.textContent]))
      .toEqual([
        ['What’s new', 'What’s new', ''],
        ['Feedback', 'Feedback', ''],
        ['Shortcuts', 'Shortcuts', ''],
        ['Settings', 'Settings', '']
      ]);
    const sync = queryHtmlTag(host, '.x-lumno-popup__sync', 'button');
    expect(sync?.getAttribute('aria-label')).toBe('WebDAV sync failed');
    expect(sync?.dataset.tone).toBe('error');
    expect(sync?.querySelector('.ri-error-warning-line')).not.toBeNull();
    act(() => links[2].click());
    act(() => sync?.click());
    act(() => links[0].click());
    expect((handlers.onLink as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]))
      .toEqual(['shortcuts', 'sync', 'release']);
  });

  it('shows a throttled sync as waiting', () => {
    const { host } = mount(createModel({ sync: { label: 'WebDAV waiting to retry', tone: 'waiting' } }));
    const sync = queryHtmlTag(host, '.x-lumno-popup__sync', 'button');
    expect(sync?.dataset.tone).toBe('waiting');
    expect(sync?.querySelector('.ri-time-line')).not.toBeNull();
  });

  it('leaves the sync link out without WebDAV', () => {
    const { host } = mount(createModel({ sync: null }));
    expect(host.querySelector('.x-lumno-popup__sync')).toBeNull();
  });
});

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebDavListApi, type WebDavListModel } from './webdav-list';
import messages from '../../_locales/en/messages.json';

const copy = Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, value.message]));
const item = { id: 'a', config: { endpoint: 'https://dav.test/', directory: 'lumno', username: 'user', hasPassword: true },
  enabled: false, state: 'paused', lastSyncAt: 1790899200000 };
const model: WebDavListModel = { copy, ready: true, outdated: false, connections: [item, { ...item, id: 'b' }] };
const controllers: ReturnType<ReturnType<typeof createWebDavListApi>['createWebDavListController']>[] = [];
function fixture(value = model) {
  const host = document.createElement('div');
  document.body.append(host);
  const onAction = vi.fn().mockResolvedValue({});
  const controller = createWebDavListApi().createWebDavListController(host, { onAction });
  controllers.push(controller);
  act(() => controller.render(value));
  const card = (id: string) => host.querySelector<HTMLElement>(`[data-webdav-id="${id}"]`)!;
  return { host, onAction, controller, card };
}
const click = async (element: Element | null) => {
  await act(async () => { (element as HTMLElement)?.click(); await Promise.resolve(); });
};
afterEach(() => {
  act(() => controllers.splice(0).forEach((controller) => controller.destroy()));
  document.body.textContent = '';
});

describe('WebDAV connection cards', () => {
  it('keeps saved details on collapsed cards and opens one editor at a time', async () => {
    const { card, host } = fixture();
    expect(card('a').dataset.expanded).toBe('false');
    expect(card('a').textContent).toContain('https://dav.test/lumno · user');
    await click(card('a').querySelector('button[aria-label="Edit connection"]'));
    expect(card('a').dataset.expanded).toBe('true');
    expect(card('a').querySelector<HTMLInputElement>('[name="password"]')?.required).toBe(false);
    await click(card('b').querySelector('button[aria-label="Edit connection"]'));
    expect(card('a').dataset.expanded).toBe('false');
    expect(card('b').dataset.expanded).toBe('true');
    expect(host.querySelectorAll('form')).toHaveLength(1);
  });
  it('saves only the edited connection, clears password inputs and collapses', async () => {
    const { card, onAction } = fixture();
    await click(card('a').querySelector('button[aria-label="Edit connection"]'));
    await act(async () => { card('a').querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onAction).toHaveBeenCalledWith('save', 'a', { config: { endpoint: 'https://dav.test/', directory: 'lumno', username: 'user', password: '' } });
    expect(card('a').querySelector('form')).toBeNull();
    expect(card('b').dataset.expanded).toBe('false');
  });
  it('uses the existing inline confirmation and removes only the selected card', async () => {
    const { card, onAction } = fixture();
    await click(card('b').querySelector('button[aria-label="Delete WebDAV connection"]'));
    expect(card('b').querySelector('[role="dialog"]')?.textContent).toContain('Files on the server will be kept');
    expect(onAction).not.toHaveBeenCalled();
    await click(card('b').querySelector('[data-i18n="confirm_ok"]'));
    expect(onAction).toHaveBeenCalledWith('remove', 'b', {});
  });
  it('allows independent operations and reports a failure on its own card', async () => {
    const { card, onAction } = fixture();
    let release: (value: object) => void = () => {};
    onAction.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockRejectedValueOnce(new Error('Connection unavailable'));
    await click(card('a').querySelector('input[type="checkbox"]'));
    await click(card('b').querySelector('input[type="checkbox"]'));
    expect(onAction).toHaveBeenCalledWith('enable', 'a', {});
    expect(onAction).toHaveBeenCalledWith('enable', 'b', {});
    expect(card('b').textContent).toContain('Connection unavailable');
    expect(card('a').textContent).not.toContain('Connection unavailable');
    await act(async () => { release({}); });
  });
  it('adds through an empty accordion and returns to empty after deletion', async () => {
    const { host, controller } = fixture({ ...model, connections: [] });
    expect(host.querySelector('[data-webdav-id]')).toBeNull();
    const add = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Add WebDAV'))!;
    await click(add);
    expect(host.querySelector<HTMLInputElement>('[name="password"]')?.required).toBe(true);
    const cancel = [...host.querySelectorAll('button')].find((button) => button.textContent === copy.confirm_cancel)!;
    await click(cancel);
    expect(add.getAttribute('aria-expanded')).toBe('false');
    act(() => controller.render(model));
    act(() => controller.render({ ...model, connections: [] }));
    expect(host.querySelector('[data-webdav-id]')).toBeNull();
    expect(host.textContent).toContain('Add WebDAV');
  });
  it('routes choices per connection and keeps remote-missing data protected', async () => {
    const { card, onAction } = fixture({ ...model, connections: [{ ...item, state: 'choice', remoteMissing: true }, { ...item, id: 'b', state: 'conflict', enabled: true }] });
    const buttons = [...card('a').querySelectorAll('button')];
    expect(buttons.find((button) => button.textContent === copy.webdav_use_remote)?.disabled).toBe(true);
    await click([...card('b').querySelectorAll('button')].find((button) => button.textContent === copy.webdav_use_remote)!);
    expect(onAction).toHaveBeenCalledWith('sync', 'b', { decision: 'remote' });
  });
});

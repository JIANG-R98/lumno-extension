import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPopupController, type PopupController, type PopupRenderModel } from './popup';

let controller: PopupController | null = null;

const labels: PopupRenderModel['labels'] = {
  appName: 'Lumno', originalContent: '原内容',
  update: '更新关联', updating: '正在更新…', undo: '撤销当前更新', undoLink: '撤销关联',
  link: '关联当前页面', linking: '正在关联…', undoing: '正在撤销…',
  settings: '设置', webClip: '开始剪裁',
  statuses: {
    loading: '读取中', 'update-available': '可更新关联', 'up-to-date': '已关联',
    'not-linked': '可关联', unsupported: '不支持', blocked: '无法更新', error: '读取失败'
  },
  statusDetails: {
    loading: '正在检查当前标签页', 'update-available': '将原内容更新为当前页面',
    'up-to-date': '当前页面与关联卡片一致', 'not-linked': '可将当前页面添加到主页并建立关联',
    unsupported: '仅支持普通网页', blocked: '当前页面与关联卡片不匹配', error: '请关闭后重试'
  }
};

afterEach(() => {
  act(() => controller?.destroy());
  controller = null;
  document.body.textContent = '';
});

describe('toolbar popup', () => {
  it('shows linked and current content and invokes update', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    const onUpdate = vi.fn();
    act(() => controller?.render({
      status: 'update-available', labels, canUpdate: true, canUndo: false, canClip: true,
      linkedCard: { cardId: 'card-1', title: '第一集', url: 'https://example.com/p=1' },
      page: { title: '第二集', url: 'https://example.com/p=2' },
      onUpdate, onLink: vi.fn(), onUndo: vi.fn(), onClip: vi.fn(), onOpenSettings: vi.fn()
    }));

    expect(host.textContent).toContain('第一集');
    expect(host.textContent).toContain('第二集');
    expect(host.querySelector('.popup-card-badge')?.textContent).toContain('可更新关联');
    expect(host.querySelector('.popup-card-badge .ri-refresh-line')).not.toBeNull();
    expect(host.querySelector('.popup-update-source')?.textContent).toContain('https://example.com/p=1');
    const button = Array.from(host.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('更新关联')) as HTMLButtonElement;
    act(() => button.click());
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('keeps undo and the header actions available after an update', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    const onUndo = vi.fn();
    const onOpenSettings = vi.fn();
    const onClip = vi.fn();
    act(() => controller?.render({
      status: 'up-to-date', labels, canUpdate: false, canUndo: true, canClip: true,
      linkedCard: { cardId: 'card-1', title: '第二集', url: 'https://example.com/p=2' },
      page: { title: '第二集', url: 'https://example.com/p=2' },
      onUpdate: vi.fn(), onLink: vi.fn(), onUndo, onClip, onOpenSettings
    }));

    const buttons = Array.from(host.querySelectorAll('button'));
    act(() => buttons.find((item) => item.textContent?.includes('撤销'))?.click());
    act(() => host.querySelector<HTMLButtonElement>('.popup-header-button')?.click());
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onClip).toHaveBeenCalledOnce();
    expect(host.querySelector('.popup-card-badge')?.textContent).toContain('已关联');
    expect(host.querySelector('.popup-card-badge .ri-radar-fill')).not.toBeNull();
    expect(host.querySelector('.popup-recent-card')?.previousElementSibling).toBeNull();
    expect(host.querySelector('.popup-status-copy p')).toBeNull();
  });

  it('renders clipping before the settings action in the header', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    act(() => controller?.render({
      status: 'loading', labels, canClip: true,
      onUpdate: vi.fn(), onLink: vi.fn(), onUndo: vi.fn(), onClip: vi.fn(), onOpenSettings: vi.fn()
    }));
    const headerButtons = host.querySelectorAll('.popup-header-actions button');
    expect(headerButtons).toHaveLength(2);
    expect(host.querySelector('.ri-scissors-cut-line')).not.toBeNull();
    expect(host.querySelector('.ri-settings-3-line')).not.toBeNull();
  });

  it('offers linking on an unlinked web page', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    const onLink = vi.fn();
    act(() => controller?.render({
      status: 'not-linked', labels, canLink: true, canClip: true,
      page: { title: '当前网页', url: 'https://example.com/article' },
      onUpdate: vi.fn(), onLink, onUndo: vi.fn(), onClip: vi.fn(), onOpenSettings: vi.fn()
    }));
    const linkButton = Array.from(host.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('关联当前页面'));
    act(() => linkButton?.click());
    expect(host.querySelector('.popup-recent-card')).not.toBeNull();
    expect(host.querySelector('.popup-card-badge')?.textContent).toContain('可关联');
    expect(host.querySelector('.popup-card-badge .ri-links-line')).not.toBeNull();
    expect(onLink).toHaveBeenCalledOnce();
  });

  it('does not show a card when linking is unsupported', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    act(() => controller?.render({
      status: 'unsupported', labels, canClip: false,
      page: { title: '浏览器设置', url: '' },
      onUpdate: vi.fn(), onLink: vi.fn(), onUndo: vi.fn(), onClip: vi.fn(), onOpenSettings: vi.fn()
    }));
    expect(host.querySelector('.popup-recent-card')).toBeNull();
    expect(host.querySelector('.popup-status-copy')).toBeNull();
    expect(host.querySelector('.popup-content')?.children).toHaveLength(0);
  });

  it('celebrates only successful add or update feedback', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    const baseModel = {
      status: 'up-to-date' as const,
      labels,
      page: { title: '当前网页', url: 'https://example.com/current' },
      linkedCard: { cardId: 'card-1', title: '当前网页', url: 'https://example.com/current' },
      onUpdate: vi.fn(), onLink: vi.fn(), onUndo: vi.fn(), onClip: vi.fn(), onOpenSettings: vi.fn()
    };
    act(() => controller?.render({
      ...baseModel,
      notice: { kind: 'success', text: '关联卡片已更新', celebrate: true }
    }));
    expect(host.querySelectorAll('.popup-confetti i')).toHaveLength(24);

    act(() => controller?.render({
      ...baseModel,
      notice: { kind: 'success', text: '已撤销当前更新' }
    }));
    expect(host.querySelector('.popup-confetti')).toBeNull();
  });
});

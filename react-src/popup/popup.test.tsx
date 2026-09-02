import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPopupController, type PopupController, type PopupRenderModel } from './popup';

let controller: PopupController | null = null;

const labels: PopupRenderModel['labels'] = {
  appName: 'Lumno', originalContent: '原内容', updateTo: '当前页面',
  update: '更新关联', updating: '正在更新…', undo: '撤销当前更新',
  undoing: '正在撤销…', webClipSettings: '网页剪裁',
  webClipSettingsDescription: '在设置中开启或调整',
  statuses: {
    loading: '读取中', 'update-available': '可更新关联', 'up-to-date': '已关联，内容为最新',
    'not-linked': '尚未关联', unsupported: '不支持', blocked: '无法更新', error: '读取失败'
  },
  statusDetails: {
    loading: '正在检查当前标签页', 'update-available': '将原内容更新为当前页面',
    'up-to-date': '当前页面与关联卡片一致', 'not-linked': '请先在主页关联卡片',
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
      status: 'update-available', labels, canUpdate: true, canUndo: false, canOpenSettings: true,
      linkedCard: { cardId: 'card-1', title: '第一集', url: 'https://example.com/p=1' },
      page: { title: '第二集', url: 'https://example.com/p=2' },
      onUpdate, onUndo: vi.fn(), onOpenSettings: vi.fn()
    }));

    expect(host.textContent).toContain('第一集');
    expect(host.textContent).toContain('第二集');
    const button = Array.from(host.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('更新关联')) as HTMLButtonElement;
    act(() => button.click());
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('keeps undo and the web clipping settings entry available after an update', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    const onUndo = vi.fn();
    const onOpenSettings = vi.fn();
    act(() => controller?.render({
      status: 'up-to-date', labels, canUpdate: false, canUndo: true, canOpenSettings: true,
      linkedCard: { cardId: 'card-1', title: '第二集', url: 'https://example.com/p=2' },
      page: { title: '第二集', url: 'https://example.com/p=2' },
      onUpdate: vi.fn(), onUndo, onOpenSettings
    }));

    const buttons = Array.from(host.querySelectorAll('button'));
    act(() => buttons.find((item) => item.textContent?.includes('撤销'))?.click());
    act(() => buttons.find((item) => item.textContent?.includes('网页剪裁'))?.click());
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('renders the web clipping entry as a settings action', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    act(() => controller?.render({
      status: 'loading', labels, canOpenSettings: true,
      onUpdate: vi.fn(), onUndo: vi.fn(), onOpenSettings: vi.fn()
    }));
    expect(host.querySelector<HTMLButtonElement>('.popup-settings-link')?.disabled).toBe(false);
    expect(host.querySelector('.ri-scissors-cut-line')).not.toBeNull();
  });
});

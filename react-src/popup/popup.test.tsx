import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPopupController, type PopupController, type PopupRenderModel } from './popup';

let controller: PopupController | null = null;

const labels: PopupRenderModel['labels'] = {
  appName: 'Lumno', currentPage: '当前页面', linkedCard: '关联卡片',
  update: '更新关联', updating: '正在更新…', undo: '撤销当前更新',
  undoing: '正在撤销…', pip: '选择画中画内容',
  statuses: {
    loading: '读取中', 'update-available': '发现可更新内容', 'up-to-date': '已关联，内容为最新',
    'not-linked': '尚未关联', unsupported: '不支持', blocked: '无法更新', error: '读取失败'
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
      status: 'update-available', labels, canUpdate: true, canUndo: false, canPip: true,
      linkedCard: { cardId: 'card-1', title: '第一集', url: 'https://example.com/p=1' },
      page: { title: '第二集', url: 'https://example.com/p=2' },
      onUpdate, onUndo: vi.fn(), onPip: vi.fn()
    }));

    expect(host.textContent).toContain('第一集');
    expect(host.textContent).toContain('第二集');
    const button = Array.from(host.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('更新关联')) as HTMLButtonElement;
    act(() => button.click());
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('keeps undo and Picture-in-Picture available after an update', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    const onUndo = vi.fn();
    const onPip = vi.fn();
    act(() => controller?.render({
      status: 'up-to-date', labels, canUpdate: false, canUndo: true, canPip: true,
      linkedCard: { cardId: 'card-1', title: '第二集', url: 'https://example.com/p=2' },
      page: { title: '第二集', url: 'https://example.com/p=2' },
      onUpdate: vi.fn(), onUndo, onPip
    }));

    const buttons = Array.from(host.querySelectorAll('button'));
    act(() => buttons.find((item) => item.textContent?.includes('撤销'))?.click());
    act(() => buttons.find((item) => item.textContent?.includes('画中画'))?.click());
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onPip).toHaveBeenCalledOnce();
  });

  it('disables Picture-in-Picture until an active tab is ready', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    controller = createPopupController(host);
    act(() => controller?.render({
      status: 'loading', labels, canPip: false,
      onUpdate: vi.fn(), onUndo: vi.fn(), onPip: vi.fn()
    }));
    expect(host.querySelector<HTMLButtonElement>('.popup-pip')?.disabled).toBe(true);
  });
});

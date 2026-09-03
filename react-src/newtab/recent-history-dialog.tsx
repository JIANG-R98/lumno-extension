import { createReactRootController } from '../shared/root-controller';

export interface RecentHistoryVersion {
  title: string;
  url: string;
  updatedAt?: number;
}

export interface RecentHistoryItem extends RecentHistoryVersion {
  cardId: string;
  updateHistory: RecentHistoryVersion[];
}

export interface RecentHistoryDialogOptions {
  documentObj?: Document;
  windowObj?: Window;
  t?: (key: string, fallback: string) => string;
  onRestore?: (
    item: RecentHistoryItem,
    version: RecentHistoryVersion,
    historyIndex: number
  ) => boolean | Promise<boolean>;
}

export interface RecentHistoryDialogController {
  element: HTMLDivElement;
  open(options: { item: RecentHistoryItem; sourceElement?: HTMLElement | null }): boolean;
  close(options?: { restoreFocus?: boolean }): boolean;
  update(item: RecentHistoryItem): void;
  mount(parentNode: Node, beforeNode?: Node | null): HTMLDivElement;
  destroy(): void;
}

interface ViewModel {
  item: RecentHistoryItem | null;
  busyIndex: number;
  t: (key: string, fallback: string) => string;
  onClose(): void;
  onRestore(index: number): void;
}

function formatVersionTime(value: number | undefined, current: boolean, t: ViewModel['t']): string {
  if (current) return t('recent_history_current', '当前版本');
  const timestamp = Math.max(0, Number(value) || 0);
  if (!timestamp) return t('recent_history_earlier', '较早版本');
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(timestamp));
}

function VersionContent({ version }: { version: RecentHistoryVersion }) {
  return (
    <span className="x-nt-recent-history-version-copy">
      <strong>{version.title || version.url}</strong>
      <span title={version.url}>{version.url}</span>
    </span>
  );
}

function RecentHistoryDialogView(model: ViewModel) {
  const { item, busyIndex, t } = model;
  if (!item) return null;
  return (
    <section className="x-nt-recent-history-dialog" role="dialog" aria-modal="true" aria-labelledby="x-nt-recent-history-title">
      <header className="x-nt-recent-history-header">
        <span>
          <h2 id="x-nt-recent-history-title">{t('recent_history_title', '变更记录')}</h2>
          <p>{t('recent_history_description', '选择任意一个版本设为当前内容，历史记录会继续保留。')}</p>
        </span>
        <button className="x-nt-recent-history-close" type="button" aria-label={t('close', '关闭')} onClick={model.onClose}>
          <i className="ri-icon ri-close-line" aria-hidden="true" />
        </button>
      </header>
      <div className="x-nt-recent-history-list">
        <article className="x-nt-recent-history-current">
          <span className="x-nt-recent-history-rail" aria-hidden="true"><i className="ri-icon ri-pushpin-2-fill" /></span>
          <VersionContent version={item} />
          <time>{formatVersionTime(undefined, true, t)}</time>
        </article>
        {item.updateHistory.map((version, index) => (
          <article className="x-nt-recent-history-version" key={`${version.url}-${version.updatedAt || 0}-${index}`}>
            <span className="x-nt-recent-history-rail" aria-hidden="true"><i /></span>
            <VersionContent version={version} />
            <time>{formatVersionTime(version.updatedAt, false, t)}</time>
            <button
              className="x-lumno-action-button x-lumno-action-button--secondary x-nt-recent-history-restore"
              type="button"
              data-history-index={index}
              disabled={busyIndex >= 0}
              onClick={() => model.onRestore(index)}
            >
              <i className="ri-icon ri-pushpin-2-line" aria-hidden="true" />
              {busyIndex === index
                ? t('recent_history_restoring', '正在恢复…')
                : t('recent_history_restore', '设为当前版本')}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function createRecentHistoryDialog(
  rawOptions: RecentHistoryDialogOptions = {}
): RecentHistoryDialogController | null {
  const documentObj = rawOptions.documentObj || globalThis.document;
  const windowObj = rawOptions.windowObj || globalThis.window;
  if (!documentObj || !windowObj) return null;
  const t = rawOptions.t || ((_key: string, fallback: string) => fallback);
  const onRestore = rawOptions.onRestore || (() => false);
  const host = documentObj.createElement('div');
  host.className = 'x-nt-recent-history-backdrop';
  host.hidden = true;
  host.dataset.open = 'false';
  host.dataset.reactIsland = 'recent-history-dialog';
  const root = createReactRootController<ViewModel>(host, (model) => <RecentHistoryDialogView {...model} />);
  let item: RecentHistoryItem | null = null;
  let busyIndex = -1;
  let previousFocus: HTMLElement | null = null;
  let destroyed = false;

  function render(): void {
    root.render({ item, busyIndex, t, onClose: () => close({ restoreFocus: true }), onRestore: restore });
  }

  function close(options: { restoreFocus?: boolean } = {}): boolean {
    if (destroyed || busyIndex >= 0) return false;
    host.dataset.open = 'false';
    host.hidden = true;
    if (options.restoreFocus) previousFocus?.focus();
    previousFocus = null;
    return true;
  }

  async function restore(index: number): Promise<void> {
    if (!item || busyIndex >= 0) return;
    const selectedItem = item;
    busyIndex = index;
    render();
    const version = selectedItem.updateHistory[index];
    if (!version) return;
    const succeeded = await Promise.resolve()
      .then(() => onRestore(selectedItem, version, index))
      .catch(() => false);
    busyIndex = -1;
    if (succeeded) close({ restoreFocus: true });
    else render();
  }

  function open(options: { item: RecentHistoryItem; sourceElement?: HTMLElement | null }): boolean {
    if (destroyed || busyIndex >= 0 || !options.item) return false;
    item = options.item;
    previousFocus = options.sourceElement || (
      documentObj.activeElement instanceof HTMLElement ? documentObj.activeElement : null
    );
    render();
    host.hidden = false;
    host.dataset.open = 'false';
    windowObj.requestAnimationFrame(() => { if (!host.hidden) host.dataset.open = 'true'; });
    windowObj.requestAnimationFrame(() => host.querySelector<HTMLButtonElement>('.x-nt-recent-history-close')?.focus());
    return true;
  }

  function update(nextItem: RecentHistoryItem): void {
    item = nextItem;
    if (!host.hidden) render();
  }

  function mount(parentNode: Node, beforeNode?: Node | null): HTMLDivElement {
    if (beforeNode) parentNode.insertBefore(host, beforeNode);
    else parentNode.appendChild(host);
    return host;
  }

  function handlePointerDown(event: PointerEvent): void {
    if (event.target === host) close({ restoreFocus: true });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ restoreFocus: true });
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(host.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && documentObj.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentObj.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    host.removeEventListener('pointerdown', handlePointerDown);
    host.removeEventListener('keydown', handleKeydown);
    root.destroy();
    host.remove();
  }

  host.addEventListener('pointerdown', handlePointerDown);
  host.addEventListener('keydown', handleKeydown);
  render();
  return Object.freeze({ element: host, open, close, update, mount, destroy });
}

export function createRecentHistoryDialogApi() {
  return Object.freeze({ implementation: 'react' as const, createRecentHistoryDialog });
}

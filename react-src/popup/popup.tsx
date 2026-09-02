import { createReactRootController, type ReactRootController } from '../shared/root-controller';

export type PopupStatus =
  | 'loading'
  | 'update-available'
  | 'up-to-date'
  | 'not-linked'
  | 'unsupported'
  | 'blocked'
  | 'error';

export interface PopupPageItem { title: string; url: string; faviconUrl?: string }
export interface PopupLinkedItem { cardId: string; title: string; url: string; siteName?: string }

export interface PopupRenderModel {
  status: PopupStatus;
  busy?: 'update' | 'undo' | 'pip' | '';
  page?: PopupPageItem | null;
  linkedCard?: PopupLinkedItem | null;
  canUpdate?: boolean;
  canUndo?: boolean;
  canPip?: boolean;
  notice?: { kind: 'success' | 'error'; text: string } | null;
  labels: {
    appName: string;
    currentPage: string;
    linkedCard: string;
    update: string;
    updating: string;
    undo: string;
    undoing: string;
    pip: string;
    statuses: Record<PopupStatus, string>;
  };
  onUpdate(): void;
  onUndo(): void;
  onPip(): void;
}

export type PopupController = ReactRootController<PopupRenderModel>;

function SiteRow({ item, eyebrow, current }: {
  item: PopupPageItem | PopupLinkedItem;
  eyebrow: string;
  current?: boolean;
}) {
  return (
    <div className={`popup-site-row${current ? ' popup-site-row--current' : ''}`}>
      <div className="popup-site-icon" aria-hidden="true">
        {'faviconUrl' in item && item.faviconUrl
          ? <img src={item.faviconUrl} alt="" />
          : <span>{String(item.title || item.url || '?').trim().charAt(0).toUpperCase()}</span>}
      </div>
      <div className="popup-site-copy">
        <span className="popup-eyebrow">{eyebrow}</span>
        <strong>{item.title || item.url}</strong>
        <span className="popup-url">{item.url}</span>
      </div>
    </div>
  );
}

export function PopupView(model: PopupRenderModel) {
  const { labels, status, busy = '', page, linkedCard, canUpdate, canUndo, notice } = model;
  return (
    <main className="popup-shell" data-status={status}>
      <header className="popup-header">
        <img src="../../assets/images/lumno.png" alt="" />
        <span>{labels.appName}</span>
        <strong>{labels.statuses[status]}</strong>
      </header>

      <section className="popup-card" aria-live="polite">
        {status === 'loading' ? (
          <div className="popup-loading"><span /><span /><span /></div>
        ) : (
          <>
            {linkedCard && <SiteRow item={linkedCard} eyebrow={labels.linkedCard} />}
            {page && (status !== 'up-to-date' || !linkedCard) && (
              <SiteRow item={page} eyebrow={labels.currentPage} current />
            )}
          </>
        )}
      </section>

      {notice && <div className={`popup-notice popup-notice--${notice.kind}`}>{notice.text}</div>}

      <div className="popup-actions">
        {canUpdate && (
          <button className="popup-button popup-button--primary" disabled={Boolean(busy)} onClick={model.onUpdate}>
            <i className="ri-icon ri-refresh-line" aria-hidden="true" />
            {busy === 'update' ? labels.updating : labels.update}
          </button>
        )}
        {canUndo && (
          <button className="popup-button popup-button--warning" disabled={Boolean(busy)} onClick={model.onUndo}>
            <i className="ri-icon ri-arrow-go-back-line" aria-hidden="true" />
            {busy === 'undo' ? labels.undoing : labels.undo}
          </button>
        )}
      </div>

      <button className="popup-pip" disabled={Boolean(busy) || !model.canPip} onClick={model.onPip}>
        <i className="ri-icon ri-picture-in-picture-2-line" aria-hidden="true" />
        <span>{labels.pip}</span>
        <i className="ri-icon ri-arrow-right-s-line" aria-hidden="true" />
      </button>
    </main>
  );
}

export function createPopupController(host: HTMLElement | null): PopupController {
  if (host) host.dataset.reactIsland = 'popup';
  return createReactRootController(host, (model) => <PopupView {...model} />);
}

export function createPopupApi() {
  return Object.freeze({ implementation: 'react' as const, createPopupController });
}

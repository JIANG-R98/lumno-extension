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
  busy?: 'update' | 'undo' | 'settings' | '';
  page?: PopupPageItem | null;
  linkedCard?: PopupLinkedItem | null;
  canUpdate?: boolean;
  canUndo?: boolean;
  canOpenSettings?: boolean;
  notice?: { kind: 'success' | 'error'; text: string } | null;
  labels: {
    appName: string;
    originalContent: string;
    updateTo: string;
    update: string;
    updating: string;
    undo: string;
    undoing: string;
    webClipSettings: string;
    webClipSettingsDescription: string;
    statuses: Record<PopupStatus, string>;
    statusDetails: Record<PopupStatus, string>;
  };
  onUpdate(): void;
  onUndo(): void;
  onOpenSettings(): void;
}

export type PopupController = ReactRootController<PopupRenderModel>;

function RecentCardPreview({ item, badge }: {
  item: PopupPageItem | PopupLinkedItem;
  badge?: string;
}) {
  const siteName = 'siteName' in item && item.siteName
    ? item.siteName
    : (() => {
        try { return new URL(item.url).hostname.replace(/^www\./, ''); }
        catch { return item.url; }
      })();
  return (
    <article className={`popup-recent-card${badge ? ' popup-recent-card--badged' : ''}`}>
      <div className="popup-recent-inner">
        {badge && <span className="popup-card-badge">{badge}</span>}
        <div className="popup-recent-header">
          <div className="popup-favicon" aria-hidden="true">
            {'faviconUrl' in item && item.faviconUrl
              ? <img src={item.faviconUrl} alt="" />
              : <i className="ri-icon ri-link" />}
          </div>
          <span>{siteName}</span>
        </div>
        <strong className="popup-recent-title">{item.title || item.url}</strong>
      </div>
      <span className="popup-recent-url">{item.url}</span>
    </article>
  );
}

export function PopupView(model: PopupRenderModel) {
  const { labels, status, busy = '', page, linkedCard, canUpdate, canUndo, notice } = model;
  const previewItem = page || linkedCard;
  return (
    <main className="popup-shell" data-status={status}>
      <header className="popup-header">
        <img src="../../assets/images/lumno.png" alt="" />
        <span>{labels.appName}</span>
      </header>

      <section className="popup-content" aria-live="polite">
        {status === 'loading' ? (
          <div className="popup-loading-card"><div /><span /><span /></div>
        ) : (
          <>
            <div className="popup-status-copy">
              <h1>{labels.statuses[status]}</h1>
              <p>{labels.statusDetails[status]}</p>
            </div>
            {previewItem && (
              <RecentCardPreview
                item={previewItem}
                badge={status === 'update-available' ? labels.updateTo : undefined}
              />
            )}
            {status === 'update-available' && linkedCard && (
              <div className="popup-update-source">
                <span>{labels.originalContent}</span>
                <strong>{linkedCard.title || linkedCard.url}</strong>
              </div>
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

      <button className="popup-settings-link" disabled={Boolean(busy) || !model.canOpenSettings} onClick={model.onOpenSettings}>
        <span className="popup-settings-icon"><i className="ri-icon ri-scissors-cut-line" aria-hidden="true" /></span>
        <span className="popup-settings-copy">
          <strong>{labels.webClipSettings}</strong>
          <small>{labels.webClipSettingsDescription}</small>
        </span>
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

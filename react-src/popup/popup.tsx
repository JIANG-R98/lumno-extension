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
  busy?: 'update' | 'link' | 'undo' | 'clip' | 'settings' | '';
  page?: PopupPageItem | null;
  linkedCard?: PopupLinkedItem | null;
  canUpdate?: boolean;
  canLink?: boolean;
  canUndo?: boolean;
  undoKind?: 'update' | 'link';
  comparisonPhase?: 'saving' | 'confirmed' | '';
  canClip?: boolean;
  notice?: { kind: 'success' | 'error'; text: string; celebrate?: boolean } | null;
  labels: {
    appName: string;
    originalContent: string;
    currentContent: string;
    update: string;
    updating: string;
    link: string;
    linking: string;
    undo: string;
    undoLink: string;
    undoing: string;
    settings: string;
    webClip: string;
    statuses: Record<PopupStatus, string>;
    statusDetails: Record<PopupStatus, string>;
  };
  onUpdate(): void;
  onLink(): void;
  onUndo(): void;
  onClip(): void;
  onOpenSettings(): void;
}

export type PopupController = ReactRootController<PopupRenderModel>;

const CARD_BADGE_ICONS: Partial<Record<PopupStatus, string>> = {
  'update-available': 'ri-refresh-line',
  'up-to-date': 'ri-radar-fill',
  'not-linked': 'ri-links-line',
  blocked: 'ri-alert-line'
};

function PopupConfetti() {
  return (
    <div className="popup-confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, index) => (
        <i
          key={index}
          style={{
            left: `${6 + ((index * 37) % 89)}%`,
            animationDelay: `${(index * 47) % 260}ms`
          }}
        />
      ))}
    </div>
  );
}

function RecentCardPreview({ item, badge, badgeIcon }: {
  item: PopupPageItem | PopupLinkedItem;
  badge?: string;
  badgeIcon?: string;
}) {
  const siteName = getPopupSiteName(item);
  return (
    <article className={`popup-recent-card${badge ? ' popup-recent-card--badged' : ''}`}>
      <div className="popup-recent-inner">
        {badge && (
          <span className="popup-card-badge">
            {badgeIcon && <i className={`ri-icon ${badgeIcon}`} aria-hidden="true" />}
            {badge}
          </span>
        )}
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

function getPopupSiteName(item: PopupPageItem | PopupLinkedItem): string {
  if ('siteName' in item && item.siteName) return item.siteName;
  try { return new URL(item.url).hostname.replace(/^www\./, ''); }
  catch { return item.url; }
}

function UpdateDiffCard({ previous, next, badge, phase, labels }: {
  previous: PopupLinkedItem;
  next: PopupPageItem;
  badge: string;
  phase?: PopupRenderModel['comparisonPhase'];
  labels: PopupRenderModel['labels'];
}) {
  return (
    <article className="popup-recent-card popup-update-diff-card" data-phase={phase || 'idle'}>
      <div className="popup-recent-inner popup-update-diff-inner">
        <span className="popup-card-badge">
          <i className="ri-icon ri-refresh-line" aria-hidden="true" />
          {badge}
        </span>
        <div className="popup-recent-header">
          <div className="popup-favicon" aria-hidden="true">
            {next.faviconUrl
              ? <img src={next.faviconUrl} alt="" />
              : <i className="ri-icon ri-link" />}
          </div>
          <span>{getPopupSiteName(next)}</span>
        </div>
        <div className="popup-diff-stack">
          <div className="popup-diff-row popup-diff-row--old">
            <span className="popup-diff-mark" aria-hidden="true">−</span>
            <span className="popup-diff-copy">
              <small>{labels.originalContent}</small>
              <strong>{previous.title || previous.url}</strong>
              <span title={previous.url}>{previous.url}</span>
            </span>
          </div>
          <div className="popup-diff-row popup-diff-row--new">
            <span className="popup-diff-mark" aria-hidden="true">+</span>
            <span className="popup-diff-copy">
              <small>{labels.currentContent}</small>
              <strong>{next.title || next.url}</strong>
              <span title={next.url}>{next.url}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PopupView(model: PopupRenderModel) {
  const { labels, status, busy = '', page, linkedCard, canUpdate, canLink, canUndo, notice } = model;
  const previewItem = page || linkedCard;
  const cardBadgeIcon = CARD_BADGE_ICONS[status];
  return (
    <main className="popup-shell" data-status={status}>
      {notice?.celebrate && <PopupConfetti />}
      <header className="popup-header">
        <img src="../../assets/images/lumno.png" alt="" />
        <span>{labels.appName}</span>
        <div className="popup-header-actions">
          <button className="popup-header-button" type="button" aria-label={labels.webClip} title={labels.webClip} disabled={Boolean(busy) || !model.canClip} onClick={model.onClip}>
            <i className="ri-icon ri-scissors-cut-line" aria-hidden="true" />
          </button>
          <button className="popup-settings-button" type="button" aria-label={labels.settings} title={labels.settings} disabled={Boolean(busy)} onClick={model.onOpenSettings}>
            <i className="ri-icon ri-settings-3-line" aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="popup-content" aria-live="polite">
        {status === 'loading' ? (
          <div className="popup-loading-card"><div /><span /><span /></div>
        ) : status === 'unsupported' ? null : (
          status === 'update-available' && page && linkedCard ? (
            <UpdateDiffCard
              previous={linkedCard}
              next={page}
              badge={labels.statuses[status]}
              phase={model.comparisonPhase}
              labels={labels}
            />
          ) : (
            previewItem && status !== 'error' ? (
              <RecentCardPreview
                item={previewItem}
                badge={cardBadgeIcon ? labels.statuses[status] : undefined}
                badgeIcon={cardBadgeIcon}
              />
            ) : (
              <div className="popup-status-copy">
                <h1>{labels.statuses[status]}</h1>
                <p>{labels.statusDetails[status]}</p>
              </div>
            )
          )
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
        {canLink && (
          <button className="popup-button popup-button--primary" disabled={Boolean(busy)} onClick={model.onLink}>
            <i className="ri-icon ri-links-line" aria-hidden="true" />
            {busy === 'link' ? labels.linking : labels.link}
          </button>
        )}
        {canUndo && (
          <button className="popup-button popup-button--warning" disabled={Boolean(busy)} onClick={model.onUndo}>
            <i className="ri-icon ri-arrow-go-back-line" aria-hidden="true" />
            {busy === 'undo' ? labels.undoing : (model.undoKind === 'link' ? labels.undoLink : labels.undo)}
          </button>
        )}
      </div>

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

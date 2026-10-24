import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export interface FeatureHintViewModel {
  actions?: Array<{
    iconHtml?: string;
    id: string;
    variant?: 'primary' | 'secondary';
  }>;
  alignMode: string;
  arrowAlign: string;
  arrowSide: string;
  badgeIconHtml?: string;
  badgeIconImageSrc?: string;
  badgeIconText?: string;
  badgeWordmarkDarkImageSrc?: string;
  badgeWordmarkImageSrc?: string;
  className?: string;
  dismissStorage: string;
  elementId: string;
  hasLink: boolean;
  hintId: string;
  inlineActions?: boolean;
  placement?: string;
  roundedArrowTip: boolean;
  surface?: string;
  textId: string;
  version?: string;
  widthMode: string;
}

export interface FeatureHintViewLabels {
  actions?: Record<string, string>;
  badge: string;
  close: string;
  connector?: string;
  link?: string;
  text: string;
  trailing?: string;
}

export interface FeatureHintViewOptions {
  documentObj?: Document;
  labels: FeatureHintViewLabels;
  model: FeatureHintViewModel;
  onActionClick?(actionId: string, event: MouseEvent): void;
  onDismiss?(): void;
  onLinkClick?(event: MouseEvent): void;
}

export interface FeatureHintViewController {
  actionButtons: HTMLButtonElement[];
  arrowTip: HTMLSpanElement | null;
  badge: HTMLSpanElement;
  closeButton: HTMLButtonElement;
  destroy(): void;
  element: HTMLSpanElement;
  linkButton: HTMLButtonElement | null;
  text: HTMLSpanElement;
  updateLabels(labels: FeatureHintViewLabels): void;
}

function FeatureHintContent({
  labels,
  model,
  onDismiss,
  onLinkClick,
  onActionClick
}: Omit<FeatureHintViewOptions, 'documentObj'>) {
  const activateLink = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    if (
      event.type === 'auxclick' &&
      event.button !== 1
    ) {
      return;
    }
    onLinkClick?.(event.nativeEvent);
  };
  const activateAction = (
    actionId: string,
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    if (
      event.type === 'auxclick' &&
      event.button !== 1
    ) {
      return;
    }
    onActionClick?.(actionId, event.nativeEvent);
  };
  const renderActionButton = (
    action: NonNullable<FeatureHintViewModel['actions']>[number]
  ) => (
    <button
      aria-label={labels.actions?.[action.id] || ''}
      className="x-lumno-feature-hint__link x-lumno-feature-hint__action"
      data-action-id={action.id}
      data-variant={action.variant || 'secondary'}
      key={action.id}
      onAuxClick={(event) => activateAction(action.id, event)}
      onClick={(event) => activateAction(action.id, event)}
      type="button"
    >
      {action.iconHtml ? (
        <span
          aria-hidden="true"
          className="x-lumno-feature-hint__action-icon"
          dangerouslySetInnerHTML={{ __html: action.iconHtml }}
        />
      ) : null}
      <span className="x-lumno-feature-hint__action-text">
        {labels.actions?.[action.id] || ''}
      </span>
    </button>
  );
  const actions = model.actions || [];

  return (
    <>
      {model.roundedArrowTip ? (
        <span
          aria-hidden="true"
          className="x-lumno-feature-hint__arrow-tip"
        />
      ) : null}
      <span
        aria-label={labels.badge}
        className="x-lumno-feature-hint__badge"
        data-brand={
          model.badgeIconImageSrc || model.badgeWordmarkImageSrc
            ? 'lumno'
            : undefined
        }
      >
        {model.badgeIconImageSrc ? (
          <span className="x-lumno-feature-hint__brand-icon">
            <img
              alt=""
              draggable={false}
              src={model.badgeIconImageSrc}
            />
          </span>
        ) : model.badgeIconHtml ? (
          <span
            className="x-lumno-feature-hint__badge-icon"
            dangerouslySetInnerHTML={{
              __html: model.badgeIconHtml
            }}
          />
        ) : model.badgeIconText ? (
          <span
            className="x-lumno-feature-hint__badge-icon"
            data-icon-type="text"
          >
            {model.badgeIconText}
          </span>
        ) : null}
        {model.badgeWordmarkImageSrc ? (
          <span
            aria-hidden="true"
            className="x-lumno-feature-hint__brand-wordmark"
          >
            <img
              alt=""
              className="x-lumno-feature-hint__brand-wordmark-image x-lumno-feature-hint__brand-wordmark-image--light"
              draggable={false}
              src={model.badgeWordmarkImageSrc}
            />
            {model.badgeWordmarkDarkImageSrc ? (
              <img
                alt=""
                className="x-lumno-feature-hint__brand-wordmark-image x-lumno-feature-hint__brand-wordmark-image--dark"
                draggable={false}
                src={model.badgeWordmarkDarkImageSrc}
              />
            ) : null}
          </span>
        ) : (
          <span className="x-lumno-feature-hint__badge-text">
            {labels.badge}
          </span>
        )}
      </span>
      {model.inlineActions && actions.length > 0 ? (
        <span className="x-lumno-feature-hint__sentence">
          <span
            className="x-lumno-feature-hint__text"
            id={model.textId}
          >
            {labels.text}
          </span>
          {renderActionButton(actions[0])}
          {labels.connector ? (
            <span className="x-lumno-feature-hint__connector">
              {labels.connector}
            </span>
          ) : null}
          {actions.slice(1).map(renderActionButton)}
          {labels.trailing ? (
            <span className="x-lumno-feature-hint__trailing">
              {labels.trailing}
            </span>
          ) : null}
        </span>
      ) : (
        <span
          className="x-lumno-feature-hint__text"
          id={model.textId}
        >
          {labels.text}
        </span>
      )}
      {model.hasLink ? (
        <button
          aria-label={labels.link || ''}
          className="x-lumno-feature-hint__link"
          onAuxClick={activateLink}
          onClick={activateLink}
          title={labels.link || ''}
          type="button"
        >
          <span className="x-lumno-feature-hint__link-text">
            {labels.link || ''}
          </span>
          <span
            className="x-lumno-feature-hint__link-icon"
            dangerouslySetInnerHTML={{
              __html:
                '<i class="ri-icon ri-size-12 ri-arrow-right-line" aria-hidden="true"></i>'
            }}
          />
        </button>
      ) : null}
      {!model.inlineActions && actions.length > 0 ? (
        <span
          aria-label={labels.text}
          className="x-lumno-feature-hint__actions"
          role="group"
        >
          {actions.map(renderActionButton)}
        </span>
      ) : null}
      <button
        aria-label={labels.close}
        className="x-lumno-feature-hint__close"
        dangerouslySetInnerHTML={{
          __html:
            '<i class="ri-icon ri-size-12 ri-close-line" aria-hidden="true"></i>'
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDismiss?.();
        }}
        type="button"
      />
    </>
  );
}

export function createFeatureHintView(
  options: FeatureHintViewOptions
): FeatureHintViewController | null {
  const documentObj = options.documentObj || document;
  if (!documentObj || !options.model) {
    return null;
  }
  const model = options.model;
  const element = documentObj.createElement('span');
  element.id = model.elementId;
  element.className = [
    'x-lumno-feature-hint',
    model.className || ''
  ]
    .filter(Boolean)
    .join(' ');
  element.setAttribute('role', 'note');
  element.setAttribute('data-react-island', 'feature-hint');
  element.setAttribute('data-feature-hint-id', model.hintId);
  element.setAttribute(
    'data-feature-hint-surface',
    model.surface || ''
  );
  element.setAttribute(
    'data-feature-hint-placement',
    model.placement || ''
  );
  element.setAttribute(
    'data-feature-hint-version',
    model.version || ''
  );
  element.setAttribute('data-arrow-side', model.arrowSide);
  element.setAttribute('data-arrow-align', model.arrowAlign);
  element.setAttribute(
    'data-dismiss-storage',
    model.dismissStorage
  );
  element.setAttribute('data-width-mode', model.widthMode);
  element.setAttribute('data-align-mode', model.alignMode);
  element.setAttribute('data-multiline', 'false');
  element.setAttribute(
    'data-has-link',
    model.hasLink ? 'true' : 'false'
  );
  element.setAttribute(
    'data-has-actions',
    model.actions && model.actions.length > 0 ? 'true' : 'false'
  );
  element.setAttribute(
    'data-rounded-arrow-tip',
    model.roundedArrowTip ? 'true' : 'false'
  );
  element.setAttribute('data-visible', 'false');
  element.setAttribute('data-dismissed', 'false');
  element.setAttribute('aria-hidden', 'true');

  const root: Root = createRoot(element);
  let labels = options.labels;
  let destroyed = false;
  const render = (): void => {
    if (destroyed) {
      return;
    }
    flushSync(() => {
      root.render(
        <FeatureHintContent
          labels={labels}
          model={model}
          onActionClick={options.onActionClick}
          onDismiss={options.onDismiss}
          onLinkClick={options.onLinkClick}
        />
      );
    });
  };
  render();

  const badge = element.querySelector<HTMLSpanElement>(
    '.x-lumno-feature-hint__badge'
  );
  const text = element.querySelector<HTMLSpanElement>(
    '.x-lumno-feature-hint__text'
  );
  const closeButton = element.querySelector<HTMLButtonElement>(
    '.x-lumno-feature-hint__close'
  );
  if (!badge || !text || !closeButton) {
    flushSync(() => root.unmount());
    return null;
  }

  return {
    actionButtons: Array.from(
      element.querySelectorAll<HTMLButtonElement>(
        '.x-lumno-feature-hint__action'
      )
    ),
    arrowTip: element.querySelector<HTMLSpanElement>(
      '.x-lumno-feature-hint__arrow-tip'
    ),
    badge,
    closeButton,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flushSync(() => root.unmount());
    },
    element,
    linkButton: element.querySelector<HTMLButtonElement>(
      '.x-lumno-feature-hint__link'
    ),
    text,
    updateLabels(nextLabels) {
      labels = nextLabels;
      render();
    }
  };
}

export function createFeatureHintViewApi() {
  return Object.freeze({
    implementation: 'react',
    createFeatureHintView
  });
}

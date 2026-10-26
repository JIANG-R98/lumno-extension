import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type {
  FeatureHintViewController,
  FeatureHintViewLabels,
  FeatureHintViewModel,
  FeatureHintViewOptions
} from '../../types/view-apis';
import { queryHtmlTag, queryHtmlTags } from '../dom-lookup';
import { RemixIcon } from './remix-icon';
import { lazyInstance } from '../lazy-instance';

export type {
  FeatureHintViewController,
  FeatureHintViewLabels,
  FeatureHintViewModel,
  FeatureHintViewOptions
};

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
      {action.icon ? (
        <span
          aria-hidden="true"
          className="x-lumno-feature-hint__action-icon"
        >
          <RemixIcon {...action.icon} />
        </span>
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
        ) : model.badgeIcon ? (
          <span className="x-lumno-feature-hint__badge-icon">
            <RemixIcon {...model.badgeIcon} />
          </span>
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
          <span className="x-lumno-feature-hint__link-icon">
            <RemixIcon name="ri-arrow-right-line" size={12} />
          </span>
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
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDismiss?.();
        }}
        type="button"
      >
        <RemixIcon name="ri-close-line" size={12} />
      </button>
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

  const badge = queryHtmlTag(element, '.x-lumno-feature-hint__badge', 'span');
  const text = queryHtmlTag(element, '.x-lumno-feature-hint__text', 'span');
  const closeButton = queryHtmlTag(element, '.x-lumno-feature-hint__close', 'button');
  if (!badge || !text || !closeButton) {
    flushSync(() => root.unmount());
    return null;
  }

  return {
    actionButtons: Array.from(
      queryHtmlTags(element, '.x-lumno-feature-hint__action', 'button')
    ),
    arrowTip: queryHtmlTag(element, '.x-lumno-feature-hint__arrow-tip', 'span'),
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
    linkButton: queryHtmlTag(element, '.x-lumno-feature-hint__link', 'button'),
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

// The one instance a page or injected script draws through, made on first use.
export const getFeatureHintViewApi = lazyInstance(createFeatureHintViewApi);

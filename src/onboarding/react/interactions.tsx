import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode
} from 'react';
import { RemixIcon as Icon } from '../../shared/react/remix-icon';
import type { BrowserAvatar } from '../../types/view-apis';
import type { RemixIconName } from '../../shared/ui/remix-icon';

interface InteractionLink {
  actionId?: string;
  href?: string;
  label?: string;
}

interface InteractionAccordion {
  expandedByDefault?: boolean;
  icon?: RemixIconName;
  links?: readonly InteractionLink[];
  text?: string;
}

export interface InteractionBrowserAvatars {
  prefix?: string;
  suffix?: string;
  browsers?: readonly BrowserAvatar[];
}

export interface InteractionInfoTooltip {
  icon?: RemixIconName;
  label?: string;
  text?: string;
  type?: string;
}

interface InteractionLinkButton {
  href?: string;
  icon?: RemixIconName;
  label?: string;
  tooltip?: string;
}

export interface InteractionSlot {
  accordion?: InteractionAccordion;
  accordionId?: string;
  actionId?: string;
  browserAvatars?: InteractionBrowserAvatars;
  browserOnly?: string;
  description?: string;
  icon?: RemixIconName;
  id: string;
  infoTooltip?: InteractionInfoTooltip;
  kind?: string;
  label?: string;
  linkButton?: InteractionLinkButton;
  trailingIcon?: RemixIconName;
}

export interface InteractionsRenderModel {
  expandedAccordionId: string;
  slots: readonly InteractionSlot[];
}

export interface InteractionsHandlers {
  onAction(actionId: string, event: MouseEvent): void;
  onHideInfoTooltip(): void;
  onShowInfoTooltip(
    target: HTMLElement,
    infoTooltip: InteractionInfoTooltip,
    browserAvatars: InteractionBrowserAvatars | undefined
  ): void;
  onToggleAccordion(accordionId: string): void;
}

function getAccordionId(slot: InteractionSlot): string {
  return String(slot.accordionId || slot.id || '').trim();
}

function isAccordionExpanded(
  slot: InteractionSlot,
  expandedAccordionId: string
): boolean {
  const accordionId = getAccordionId(slot);
  if (!slot.accordion || !accordionId) {
    return false;
  }
  if (expandedAccordionId) {
    return accordionId === expandedAccordionId;
  }
  return slot.accordion.expandedByDefault === true;
}

function LinkedText({
  links,
  onAction,
  text
}: {
  links: readonly InteractionLink[];
  onAction(actionId: string, event: MouseEvent): void;
  text: string;
}) {
  const sourceText = String(text || '');
  const linkItems = links
    .map((link) => {
      const label = String(link.label || '').trim();
      const href = String(link.href || '').trim();
      const index = label ? sourceText.indexOf(label) : -1;
      return label && href && index >= 0
        ? {
            actionId: String(link.actionId || '').trim(),
            href,
            index,
            label
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.index - right.index);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  linkItems.forEach((item, index) => {
    if (item.index < cursor) {
      return;
    }
    if (item.index > cursor) {
      nodes.push(sourceText.slice(cursor, item.index));
    }
    nodes.push(
      <a
        className="interaction-accordion-link"
        data-action={item.actionId || undefined}
        href={item.href}
        key={`${item.label}-${index}`}
        onAuxClick={(event) => {
          // A middle click opens the page in the background.
          if (!item.actionId || event.button !== 1) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onAction(item.actionId, event.nativeEvent);
        }}
        onClick={(event) => {
          if (!item.actionId) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onAction(item.actionId, event.nativeEvent);
        }}
      >
        {item.label}
      </a>
    );
    cursor = item.index + item.label.length;
  });
  if (cursor < sourceText.length) {
    nodes.push(sourceText.slice(cursor));
  }
  return <>{nodes}</>;
}

function InteractionInfoButton({
  browserAvatars,
  infoTooltip,
  options
}: {
  browserAvatars: InteractionBrowserAvatars | undefined;
  infoTooltip: InteractionInfoTooltip;
  options: InteractionsHandlers;
}) {
  const show = (
    event: ReactMouseEvent<HTMLButtonElement> |
      ReactFocusEvent<HTMLButtonElement>
  ): void => {
    options.onShowInfoTooltip(
      event.currentTarget,
      infoTooltip,
      browserAvatars
    );
  };
  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void => {
    if (event.key === 'Escape') {
      options.onHideInfoTooltip();
      event.currentTarget.blur();
    }
  };

  return (
    <button
      aria-label={String(infoTooltip.label || 'Info')}
      className="interaction-info-button"
      data-tooltip={String(infoTooltip.text || '')}
      data-tooltip-type={infoTooltip.type || undefined}
      onBlur={options.onHideInfoTooltip}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        show(event);
      }}
      onFocus={show}
      onKeyDown={handleKeyDown}
      onMouseEnter={show}
      onMouseLeave={options.onHideInfoTooltip}
      type="button"
    >
      <Icon name={infoTooltip.icon || 'ri-information-line'} />
    </button>
  );
}

function InteractionLinkAffordance({
  linkButton,
  options
}: {
  linkButton: InteractionLinkButton;
  options: InteractionsHandlers;
}) {
  const label = String(linkButton.label || 'GitHub repo').trim() || 'GitHub repo';
  const tooltip = String(linkButton.tooltip || label).trim() || label;
  const tooltipModel = { text: tooltip };
  const show = (
    event: ReactMouseEvent<HTMLAnchorElement> |
      ReactFocusEvent<HTMLAnchorElement>
  ): void => {
    options.onShowInfoTooltip(event.currentTarget, tooltipModel, undefined);
  };
  return (
    <a
      aria-label={label}
      className="interaction-info-button interaction-link-button"
      data-tooltip={tooltip}
      href={String(linkButton.href || '')}
      onBlur={options.onHideInfoTooltip}
      onClick={options.onHideInfoTooltip}
      onFocus={show}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          options.onHideInfoTooltip();
          event.currentTarget.blur();
        }
      }}
      onMouseEnter={show}
      onMouseLeave={options.onHideInfoTooltip}
      rel="noreferrer noopener"
      target="_blank"
    >
      <Icon name={linkButton.icon || 'ri-github-fill'} />
    </a>
  );
}

function InteractionSlotCopy({
  expandedAccordionId,
  options,
  slot
}: {
  expandedAccordionId: string;
  options: InteractionsHandlers;
  slot: InteractionSlot;
}) {
  const accordion = slot.accordion || null;
  const accordionId = getAccordionId(slot);
  const expanded = isAccordionExpanded(slot, expandedAccordionId);
  const hasInfoTooltip = Boolean(
    slot.infoTooltip &&
      (slot.infoTooltip.text || slot.infoTooltip.type)
  );
  const hasLinkButton = Boolean(slot.linkButton?.href);
  const trailingIcon = slot.trailingIcon;
  const hasInlineAffordance = hasInfoTooltip || hasLinkButton || Boolean(trailingIcon);

  return (
    <>
      {slot.icon ? (
        <span className="interaction-row-icon">
          <Icon name={slot.icon} />
        </span>
      ) : null}
      <span
        className={`interaction-copy${
          hasInlineAffordance ? ' interaction-copy--with-info' : ''
        }`}
      >
        {slot.label && accordion ? (
          <button
            aria-controls={`${slot.id}-accordion`}
            aria-expanded={expanded ? 'true' : 'false'}
            className="interaction-accordion-trigger"
            data-accordion-id={accordionId}
            data-action={String(slot.actionId || '')}
            id={`${slot.id}-accordion-trigger`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              options.onToggleAccordion(accordionId);
            }}
            type="button"
          >
            <span className="interaction-label">{slot.label}</span>
            <span
              aria-hidden="true"
              className="interaction-accordion-chevron"
            >
              <Icon name={accordion.icon || 'ri-arrow-left-s-line'} />
            </span>
          </button>
        ) : slot.label ? (
          <span className="interaction-label">{slot.label}</span>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="skeleton-line skeleton-line--label"
            />
            <span
              aria-hidden="true"
              className="skeleton-line skeleton-line--meta"
            />
          </>
        )}
        {trailingIcon ? (
          <span aria-hidden="true" className="interaction-trailing-icon">
            <Icon name={trailingIcon} />
          </span>
        ) : null}
        {slot.description ? (
          <span className="interaction-description">
            {slot.description}
          </span>
        ) : null}
        {hasInfoTooltip && slot.infoTooltip ? (
          <InteractionInfoButton
            browserAvatars={slot.browserAvatars}
            infoTooltip={slot.infoTooltip}
            options={options}
          />
        ) : null}
        {hasLinkButton && slot.linkButton ? (
          <InteractionLinkAffordance
            linkButton={slot.linkButton}
            options={options}
          />
        ) : null}
      </span>
      {accordion?.text ? (
        <span
          aria-labelledby={`${slot.id}-accordion-trigger`}
          className="interaction-accordion-panel"
          data-open={expanded ? 'true' : 'false'}
          id={`${slot.id}-accordion`}
        >
          <span
            aria-hidden={expanded ? 'false' : 'true'}
            className="interaction-accordion-text t-panel-slide"
            data-open={expanded ? 'true' : 'false'}
          >
            <LinkedText
              links={accordion.links || []}
              onAction={options.onAction}
              text={String(accordion.text)}
            />
          </span>
        </span>
      ) : null}
    </>
  );
}

function InteractionSlotView({
  expandedAccordionId,
  options,
  slot
}: {
  expandedAccordionId: string;
  options: InteractionsHandlers;
  slot: InteractionSlot;
}) {
  const hasAccordion = Boolean(slot.accordion?.text);
  const hasInfoTooltip = Boolean(
    slot.infoTooltip &&
      (slot.infoTooltip.text || slot.infoTooltip.type)
  );
  const hasLinkButton = Boolean(slot.linkButton?.href);
  const itemHasAction = Boolean(slot.actionId) && !hasAccordion;
  const expanded = hasAccordion &&
    isAccordionExpanded(slot, expandedAccordionId);
  const className = [
    'interaction-slot',
    itemHasAction ? '' : 'interaction-slot--static',
    hasAccordion ? 'interaction-slot--accordion' : '',
    hasInfoTooltip || hasLinkButton ? 'interaction-slot--with-info' : ''
  ].filter(Boolean).join(' ');
  const content = (
    <InteractionSlotCopy
      expandedAccordionId={expandedAccordionId}
      options={options}
      slot={slot}
    />
  );

  if (itemHasAction) {
    return (
      <button
        className={className}
        data-action={String(slot.actionId)}
        data-browser-only={slot.browserOnly || undefined}
        data-interaction-kind={String(slot.kind || '')}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          options.onAction(String(slot.actionId), event.nativeEvent);
        }}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={className}
      data-accordion-id={hasAccordion ? getAccordionId(slot) : undefined}
      data-browser-only={slot.browserOnly || undefined}
      data-expanded={hasAccordion ? (expanded ? 'true' : 'false') : undefined}
      data-interaction-kind={String(slot.kind || '')}
    >
      {content}
    </div>
  );
}

// The slide's interaction rows: actions, notes and accordions.
export function Interactions({ model, handlers }: { model: InteractionsRenderModel; handlers: InteractionsHandlers }) {
  const slots = Array.isArray(model.slots) ? model.slots : [];
  const expandedAccordionId = String(model.expandedAccordionId || '');
  return (
    <div
      aria-label="Onboarding interaction slots"
      className="interaction-slots"
      data-accordion={slots.some((slot) => Boolean(slot.accordion?.text)) ? 'true' : 'false'}
      data-visible={slots.length > 0 ? 'true' : 'false'}
      hidden={slots.length === 0}
      id="onboarding-interaction-slots"
    >
      {slots.map((slot) => (
        <InteractionSlotView expandedAccordionId={expandedAccordionId} key={slot.id} options={handlers} slot={slot} />
      ))}
    </div>
  );
}

import { useRef, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { useSegmentedIndicator } from '../shared/segmented-indicator';

export type PopupActionId = 'clip' | 'shortcut' | 'copy' | 'search' | 'pip';
export type PopupLinkId = 'settings' | 'shortcuts' | 'feedback' | 'release' | 'sync';

export interface PopupPageModel {
  title: string;
  host: string;
  /** The favicon, Lumno's icon or the browser's logo. */
  iconUrl: string;
  /** The icon shown when there is no image, such as a puzzle piece for extensions. */
  iconClass: string;
}

export interface PopupActionModel {
  id: PopupActionId;
  label: string;
  /** Says what the action does, shown in Lumno's tooltip. */
  tooltip: string;
  iconClass: string;
  disabled: boolean;
  /** A chevron in the corner that opens this action's options below the actions. */
  menu?: { label: string; expanded: boolean };
}

/** The options a chevron opens, such as the auto picture-in-picture switch. */
export interface PopupActionPanelModel {
  actionId: PopupActionId;
  rows: PopupSettingRowModel[];
}

export interface PopupNoticeModel {
  text: string;
  tone: 'info' | 'error';
}

export interface PopupSwitchRowModel {
  kind: 'switch';
  id: string;
  label: string;
  /** A short line under the label on what the switch does. */
  hint?: string;
  checked: boolean;
}

export interface PopupSegmentedRowModel {
  kind: 'segmented';
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}

export type PopupSettingRowModel = PopupSwitchRowModel | PopupSegmentedRowModel;

export interface PopupSectionModel {
  id: string;
  title: string;
  rows: PopupSettingRowModel[];
}

/** Footer links are icons; the label is their tooltip and accessible name. */
export interface PopupLinkModel {
  id: PopupLinkId;
  label: string;
  iconClass: string;
}

export interface PopupSyncModel {
  /** Tooltip and accessible name, such as "WebDAV synced 3 minutes ago". */
  label: string;
  tone: 'ok' | 'busy' | 'waiting' | 'error';
}

export interface PopupModel {
  page: PopupPageModel;
  actionsLabel: string;
  actions: PopupActionModel[];
  actionPanel: PopupActionPanelModel | null;
  notice: PopupNoticeModel | null;
  /** The settings sit behind one disclosure; they are rarely changed. */
  settings: { label: string; expanded: boolean; sections: PopupSectionModel[] };
  links: PopupLinkModel[];
  sync: PopupSyncModel | null;
  version: string;
}

export interface PopupHandlers {
  onAction(id: PopupActionId): void;
  onSwitch(id: string, checked: boolean): void;
  onSelect(id: string, value: string): void;
  onSettingsToggle(expanded: boolean): void;
  onActionMenuToggle(id: PopupActionId, expanded: boolean): void;
  onLink(id: PopupLinkId): void;
}

// Synced and syncing share the cloud; a wait or a failure gets its own icon.
const SYNC_ICONS: Partial<Record<PopupSyncModel['tone'], string>> = {
  waiting: 'ri-time-line',
  error: 'ri-error-warning-line'
};

function ActionCell({
  action,
  handlers
}: {
  action: PopupActionModel;
  handlers: PopupHandlers;
}) {
  const panelId = `x-lumno-popup-action-panel-${action.id}`;
  return (
    <div className="x-lumno-popup__action-cell" data-has-menu={action.menu ? 'true' : 'false'}>
      <button
        className="x-lumno-popup__action"
        data-action={action.id}
        data-tooltip={action.tooltip || undefined}
        disabled={action.disabled}
        onClick={() => handlers.onAction(action.id)}
        type="button"
      >
        <i aria-hidden="true" className={`ri-icon ${action.iconClass}`} />
        <span className="x-lumno-popup__action-label">{action.label}</span>
      </button>
      {action.menu ? (
        <button
          aria-controls={panelId}
          aria-expanded={action.menu.expanded}
          aria-label={action.menu.label}
          className="x-lumno-popup__action-menu"
          data-tooltip={action.menu.label}
          onClick={() => handlers.onActionMenuToggle(action.id, !action.menu?.expanded)}
          type="button"
        >
          <i aria-hidden="true" className="ri-icon ri-arrow-down-s-line" />
        </button>
      ) : null}
    </div>
  );
}

function PageCard({
  model,
  handlers
}: {
  model: PopupModel;
  handlers: PopupHandlers;
}) {
  const { page, notice, actions, actionPanel } = model;
  return (
    <section className="x-lumno-popup__page">
      <header className="x-lumno-popup__page-head">
        <span className="x-lumno-popup__page-icon" aria-hidden="true">
          {page.iconUrl ? (
            <img alt="" draggable={false} height={16} src={page.iconUrl} width={16} />
          ) : (
            <i className={`ri-icon ${page.iconClass}`} />
          )}
        </span>
        <span className="x-lumno-popup__page-text">
          <span className="x-lumno-popup__page-title">{page.title}</span>
          {page.host ? <span className="x-lumno-popup__page-host">{page.host}</span> : null}
        </span>
      </header>
      {notice ? (
        <p className="x-lumno-popup__notice" data-tone={notice.tone} role="status">
          {notice.text}
        </p>
      ) : null}
      <div
        aria-label={model.actionsLabel}
        className="x-lumno-popup__actions"
        data-count={actions.length}
        role="group"
      >
        {actions.map((action) => (
          <ActionCell action={action} handlers={handlers} key={action.id} />
        ))}
      </div>
      {actionPanel ? (
        <div
          className="x-lumno-popup__action-panel"
          data-action={actionPanel.actionId}
          id={`x-lumno-popup-action-panel-${actionPanel.actionId}`}
        >
          {actionPanel.rows.map((row) => (
            <SettingRow handlers={handlers} key={row.id} row={row} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SegmentedControl({
  row,
  onSelect
}: {
  row: PopupSegmentedRowModel;
  onSelect(id: string, value: string): void;
}) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useSegmentedIndicator(
    indicatorRef,
    `${row.value}\u0002${row.options.map((option) => option.label).join('\u0001')}`
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const { key } = event;
    const step = key === 'ArrowRight' || key === 'ArrowDown'
      ? 1
      : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const nextIndex = (index + step + row.options.length) % row.options.length;
    const group = event.currentTarget.parentElement;
    onSelect(row.id, row.options[nextIndex].value);
    window.requestAnimationFrame(() => {
      group?.querySelectorAll<HTMLButtonElement>('button[data-value]')[nextIndex]?.focus();
    });
  };

  return (
    <div aria-label={row.label} className="x-lumno-popup__segmented" role="radiogroup">
      <span
        aria-hidden="true"
        className="x-lumno-popup__segmented-indicator"
        data-ready="false"
        ref={indicatorRef}
      />
      {row.options.map((option, index) => {
        const active = option.value === row.value;
        return (
          <button
            aria-checked={active}
            className="x-lumno-popup__segmented-option"
            data-active={active ? 'true' : 'false'}
            data-value={option.value}
            key={option.value}
            onClick={() => onSelect(row.id, option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="radio"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({
  row,
  handlers
}: {
  row: PopupSettingRowModel;
  handlers: PopupHandlers;
}) {
  if (row.kind === 'segmented') {
    return (
      <div className="x-lumno-popup__row" data-setting={row.id}>
        <span className="x-lumno-popup__row-label">{row.label}</span>
        <SegmentedControl onSelect={handlers.onSelect} row={row} />
      </div>
    );
  }
  const inputId = `x-lumno-popup-switch-${row.id}`;
  return (
    <div className="x-lumno-popup__row" data-setting={row.id}>
      <label className="x-lumno-popup__row-label" htmlFor={inputId}>
        {row.label}
        {row.hint ? <span className="x-lumno-popup__row-hint">{row.hint}</span> : null}
      </label>
      <label className="_x_extension_switch_2024_unique_ x-lumno-popup__switch">
        <input
          checked={row.checked}
          id={inputId}
          onChange={(event) => handlers.onSwitch(row.id, event.currentTarget.checked)}
          role="switch"
          type="checkbox"
        />
        <span className="_x_extension_switch_slider_2024_unique_" />
      </label>
    </div>
  );
}

export function PopupView({ model, handlers }: { model: PopupModel; handlers: PopupHandlers }) {
  return (
    <div className="x-lumno-popup">
      <div className="x-lumno-popup__hero" aria-hidden="true" />
      <PageCard handlers={handlers} model={model} />

      <section className="x-lumno-popup__settings" data-expanded={model.settings.expanded ? 'true' : 'false'}>
        <button
          aria-controls="x-lumno-popup-settings-panel"
          aria-expanded={model.settings.expanded}
          className="x-lumno-popup__settings-toggle"
          onClick={() => handlers.onSettingsToggle(!model.settings.expanded)}
          type="button"
        >
          <span>{model.settings.label}</span>
          <i aria-hidden="true" className="ri-icon ri-arrow-down-s-line x-lumno-popup__settings-chevron" />
        </button>
        {model.settings.expanded ? (
          <div className="x-lumno-popup__settings-panel" id="x-lumno-popup-settings-panel">
            {model.settings.sections.map((section) => (
              <div className="x-lumno-popup__section" data-section={section.id} key={section.id}>
                <h2 className="x-lumno-popup__section-title">{section.title}</h2>
                {section.rows.map((row) => (
                  <SettingRow handlers={handlers} key={row.id} row={row} />
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <footer className="x-lumno-popup__footer">
        <span className="x-lumno-popup__version">{model.version}</span>
        {model.sync ? (
          <button
            aria-label={model.sync.label}
            className="x-lumno-popup__icon-button x-lumno-popup__sync"
            data-tone={model.sync.tone}
            data-tooltip={model.sync.label}
            onClick={() => handlers.onLink('sync')}
            type="button"
          >
            <i
              aria-hidden="true"
              className={`ri-icon ${SYNC_ICONS[model.sync.tone] || 'ri-cloud-line'}`}
            />
          </button>
        ) : null}
        <nav className="x-lumno-popup__links">
          {model.links.map((link) => (
            <button
              aria-label={link.label}
              className="x-lumno-popup__icon-button"
              data-link={link.id}
              data-tooltip={link.label}
              key={link.id}
              onClick={() => handlers.onLink(link.id)}
              type="button"
            >
              <i aria-hidden="true" className={`ri-icon ${link.iconClass}`} />
            </button>
          ))}
        </nav>
      </footer>
    </div>
  );
}

export interface PopupController {
  render(model: PopupModel): void;
}

export function createPopupController(
  host: HTMLElement | null,
  handlers: PopupHandlers
): PopupController {
  if (!host) {
    return Object.freeze({ render() {} });
  }
  const root: Root = createRoot(host);
  return Object.freeze({
    // Synchronous, so the browser sizes the popup to its first full render.
    render(model: PopupModel) {
      flushSync(() => {
        root.render(<PopupView handlers={handlers} model={model} />);
      });
    }
  });
}

export function createPopupApi() {
  return Object.freeze({ createPopupController });
}

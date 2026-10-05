import { useEffect, useId, useRef, useState } from 'react';
import { createReactRootController } from './root-controller';
import { InlinePopconfirm } from './inline-popconfirm';
import { getAsyncErrorMessage, useExclusiveAsyncAction } from '../shared/use-exclusive-async-action';

export interface WebDavConfig {
  endpoint: string;
  directory: string;
  username: string;
  hasPassword?: boolean;
}
export interface WebDavConnection {
  id: string;
  config: WebDavConfig;
  enabled: boolean;
  state: string;
  errorText?: string;
  diagnosticText?: string;
  lastSyncAt?: number | null;
  hasMigrationBackup?: boolean;
  needsRecovery?: boolean;
  conflictsText?: string;
  remoteMissing?: boolean;
}
export interface WebDavListModel {
  connections: WebDavConnection[];
  copy: Record<string, string>;
  lang?: string;
  ready: boolean;
  outdated: boolean;
}
export interface WebDavListOptions {
  onAction(operation: string, id?: string, extra?: Record<string, unknown>): Promise<{ needsChoice?: boolean }>;
}
type Tone = 'success' | 'warning' | 'danger' | undefined;

const classes = (name: string) => `_x_extension_${name}_2024_unique_`;
const buttonClass = `${classes('shortcut_submit')} ${classes('shortcut_secondary')}`;
const primaryClass = `${classes('shortcut_submit')} ${classes('shortcut_submit_primary')} ${classes('shortcut_save')}`;
const ghostClass = `${classes('shortcut_submit')} _x_extension_shortcut_ghost_2026_unique_`;
const JIANGUOYUN_ENDPOINT = 'https://dav.jianguoyun.com/dav/';
const JIANGUOYUN_HELP = 'https://help.jianguoyun.com/?p=2064';

// Nutstore needs no different input, only its app-password guide, so it is
// recognised from the address instead of being chosen up front.
function isJianguoyun(endpoint: string) {
  try { return new URL(endpoint.trim()).hostname === 'dav.jianguoyun.com'; }
  catch { return false; }
}

function connectionTitle(item: WebDavConnection, copy: Record<string, string>) {
  if (isJianguoyun(item.config.endpoint)) return copy.webdav_provider_jianguoyun;
  try { return new URL(item.config.endpoint).host; } catch { return item.config.endpoint; }
}

function formatTime(timestamp: number, lang: string) {
  return new Date(timestamp).toLocaleString(lang || undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelative(timestamp: number, now: number, lang: string, justNow: string) {
  const seconds = Math.round((timestamp - now) / 1000);
  const format = new Intl.RelativeTimeFormat(lang || undefined, { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return justNow;
  if (Math.abs(seconds) < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (Math.abs(seconds) < 86400) return format.format(Math.round(seconds / 3600), 'hour');
  return formatTime(timestamp, lang);
}

function validTime(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(new Date(value).getTime()) ? value : null;
}

// One status per card, in the same pill the Chrome sync row uses. Anything
// that needs the user is resolved below the header, never by the color alone.
function describeStatus(item: WebDavConnection, copy: Record<string, string>, syncing: boolean, now: number, lang: string): { tone: Tone; label: string } {
  const lastSyncAt = validTime(item.lastSyncAt);
  if (item.needsRecovery) return { tone: 'danger', label: copy.webdav_state_recovery };
  if (syncing || item.state === 'syncing') return { tone: undefined, label: copy.webdav_state_syncing };
  if (item.state === 'choice' || item.state === 'conflict') return { tone: 'warning', label: copy[`webdav_state_${item.state}`] };
  if (item.errorText) return { tone: 'danger', label: copy.webdav_state_error };
  if (!item.enabled) return { tone: undefined, label: lastSyncAt ? copy.webdav_state_paused : copy.webdav_state_browser };
  if (item.state === 'ready') {
    return { tone: 'success', label: lastSyncAt ? `${copy.webdav_state_ready} · ${formatRelative(lastSyncAt, now, lang, copy.webdav_just_now)}` : copy.webdav_state_ready };
  }
  return { tone: undefined, label: copy.webdav_state_pending };
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function DiagnosticButton({ copy, text, ghost = false }: { copy: Record<string, string>; text: string; ghost?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button className={ghost ? ghostClass : buttonClass} onClick={() => {
      void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
    }} title={text} type="button">
      <i aria-hidden="true" className={`ri-icon ri-size-14 ${copied ? 'ri-check-line' : 'ri-file-copy-line'}`} />
      {copied ? copy.webdav_diagnostic_copied : copy.webdav_copy_diagnostic}
    </button>
  );
}

interface ListSummary { names: string[]; count: number }
interface DomainSummary {
  total: number;
  added: ListSummary;
  removed: ListSummary;
  changed: ListSummary;
  reordered: boolean;
  selectionChanged?: boolean;
}
interface ValueSummary { kind: 'unset' | 'boolean' | 'number' | 'text' | 'list' | 'changed'; value?: boolean | number | string; count?: number }
export interface WebDavConflictItem {
  key: string;
  label: string;
  domain: 'preference' | 'shortcuts' | 'wallpapers';
  local: DomainSummary | ValueSummary;
  remote: DomainSummary | ValueSummary;
}

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

function describeValue(value: ValueSummary, copy: Record<string, string>) {
  if (value.kind === 'boolean') return value.value ? copy.webdav_value_on : copy.webdav_value_off;
  if (value.kind === 'number' || value.kind === 'text') return String(value.value);
  if (value.kind === 'list') return fill(copy.webdav_value_list, { count: value.count ?? 0 });
  if (value.kind === 'unset') return copy.webdav_value_default;
  return copy.webdav_value_changed;
}

function describeDomain(summary: DomainSummary, domain: string, copy: Record<string, string>, separator: string) {
  const list = (template: string, part: ListSummary) => part.count ? fill(template, {
    items: part.names.join(separator) + (part.count > part.names.length ? ` ${fill(copy.webdav_diff_more, { count: part.count })}` : '')
  }) : '';
  const lines = [
    list(copy.webdav_diff_added, summary.added),
    list(copy.webdav_diff_removed, summary.removed),
    list(copy.webdav_diff_changed, summary.changed),
    summary.reordered ? copy.webdav_diff_reordered : '',
    summary.selectionChanged ? copy.webdav_diff_selection : ''
  ].filter(Boolean);
  const total = fill(copy[domain === 'shortcuts' ? 'webdav_diff_shortcut_total' : 'webdav_diff_wallpaper_total'], { count: summary.total });
  return [total, ...(lines.length ? lines : [copy.webdav_diff_unchanged])];
}

// Side by side, relative to the last successful sync, so the choice between
// this device and the server is made on what actually changed.
function ConflictDiff({ items, copy, lang }: { items: WebDavConflictItem[]; copy: Record<string, string>; lang: string }) {
  const separator = /^(zh|ja)/i.test(lang) ? '、' : ', ';
  const cell = (item: WebDavConflictItem, side: 'local' | 'remote') => item.domain === 'preference'
    ? [describeValue(item[side] as ValueSummary, copy)]
    : describeDomain(item[side] as DomainSummary, item.domain, copy, separator);
  return (
    <div className="lumno-webdav-diff" role="table">
      <div className="lumno-webdav-diff-row lumno-webdav-diff-head" role="row">
        <span role="columnheader" />
        <span role="columnheader">{copy.webdav_diff_local}</span>
        <span role="columnheader">{copy.webdav_diff_remote}</span>
      </div>
      {items.map((item) => (
        <div className="lumno-webdav-diff-row" key={item.key} role="row">
          <span className="lumno-webdav-diff-label" role="rowheader">{item.label}</span>
          {(['local', 'remote'] as const).map((side) => (
            <span data-side={side} key={side} role="cell">
              {cell(item, side).map((line, index) => <span className="lumno-webdav-diff-line" key={index}>{line}</span>)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ConnectionEditor({ item, model, options, onClose }: {
  item?: WebDavConnection;
  model: WebDavListModel;
  options: WebDavListOptions;
  onClose(): void;
}) {
  const { copy } = model;
  const formId = useId();
  const [draft, setDraft] = useState({ endpoint: item?.config.endpoint || '',
    directory: item?.config.directory || 'lumno', username: item?.config.username || '', password: '' });
  const [feedback, setFeedback] = useState<{ text: string; failed: boolean; diagnostic?: string } | null>(null);
  const [pendingOperation, setPendingOperation] = useState('');
  const action = useExclusiveAsyncAction(async (operation: string) => {
    setFeedback(null);
    setPendingOperation(operation);
    if (operation === 'test') return options.onAction('test', item?.id, { config: draft });
    return item
      ? options.onAction('save', item.id, { config: draft, resume: true })
      : options.onAction('add', undefined, { config: draft, enable: true });
  });
  let endpoint = '';
  try { endpoint = new URL(draft.endpoint.trim()).href.replace(/\/*$/, '/'); } catch { /* Native form validation handles it. */ }
  const reusePassword = item?.config.hasPassword && endpoint === item.config.endpoint && draft.username.trim() === item.config.username;
  const disabled = action.pending || !model.ready || model.outdated;
  const update = (field: keyof typeof draft, value: string) => { setFeedback(null); setDraft((current) => ({ ...current, [field]: value })); };
  const jianguoyun = isJianguoyun(draft.endpoint);
  const run = async (operation: string) => {
    const outcome = await action.run(operation);
    setPendingOperation('');
    if (outcome.status === 'rejected') {
      const error = outcome.error as { diagnostic?: string };
      setFeedback({ text: getAsyncErrorMessage(outcome.error), failed: true, diagnostic: error?.diagnostic || '' });
    }
    if (outcome.status === 'fulfilled') {
      if (operation === 'test') setFeedback({ text: copy.webdav_test_success, failed: false });
      else onClose();
    }
  };
  const fields = [
    { name: 'endpoint', type: 'url', placeholder: /^zh/i.test(model.lang || '') ? JIANGUOYUN_ENDPOINT : 'https://dav.example.com/' },
    { name: 'directory', type: 'text', placeholder: 'lumno' },
    { name: 'username', type: 'text', placeholder: jianguoyun ? 'name@example.com' : '' },
    { name: 'password', type: 'password', placeholder: reusePassword ? copy.webdav_password_saved : '' }
  ] as const;
  return (
    <form className={item ? classes('shortcut_editor') : classes('shortcut_form_fields')}
      onSubmit={(event) => { event.preventDefault(); void run('submit'); }}>
      <div className="lumno-webdav-form-grid">
        {fields.map((field) => (
          <div className={classes('shortcut_field')} key={field.name}>
            <div className={classes('shortcut_label_row')}>
              <label className={classes('shortcut_label')} htmlFor={`${formId}-${field.name}`}>
                <span>{copy[`webdav_${field.name}`]}</span><span className={classes('shortcut_required')}>*</span>
              </label>
              {field.name === 'password' && jianguoyun ? (
                <a className={`${ghostClass} lumno-webdav-help`} href={JIANGUOYUN_HELP} rel="noreferrer" target="_blank">
                  {copy.webdav_password_help}<i aria-hidden="true" className="ri-icon ri-size-12 ri-external-link-line" />
                </a>
              ) : null}
            </div>
            <input autoFocus={field.name === 'endpoint'}
              autoComplete={field.name === 'password' ? 'new-password' : 'off'}
              className={classes('shortcut_input')} disabled={disabled} id={`${formId}-${field.name}`}
              aria-describedby={field.name === 'password' ? `${formId}-password-hint` : undefined}
              name={field.name} placeholder={field.placeholder}
              required={field.name !== 'password' || !reusePassword} spellCheck={false}
              type={field.type} value={draft[field.name]}
              onChange={(event) => update(field.name, event.currentTarget.value)} />
            {/* Where credentials live is a property of the password, so it is
                said under that field instead of as loose text below the form. */}
            {field.name === 'password' ? (
              <p className="lumno-webdav-field-hint" id={`${formId}-password-hint`}>
                <i aria-hidden="true" className="ri-icon ri-size-12 ri-lock-line" />{copy.webdav_credentials_hint}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {feedback ? (
        <div className="lumno-webdav-form-feedback" data-tone={feedback.failed ? 'danger' : 'success'} role="status">
          <i aria-hidden="true" className={`ri-icon ri-size-14 ${feedback.failed ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'}`} />
          <span className="lumno-webdav-form-feedback-text">{feedback.text}</span>
          {feedback.diagnostic ? <DiagnosticButton copy={copy} ghost text={feedback.diagnostic} /> : null}
        </div>
      ) : null}
      <div className={`${classes('shortcut_editor_actions')} lumno-webdav-editor-actions`}>
        <button aria-busy={pendingOperation === 'test'} className={`${ghostClass} lumno-webdav-test`} disabled={disabled} type="button" onClick={(event) => {
          if (event.currentTarget.form?.reportValidity()) void run('test');
        }}>
          <i aria-hidden="true" className="ri-icon ri-size-14 ri-pulse-line" />
          {pendingOperation === 'test' ? copy.webdav_state_testing : copy.webdav_test}
        </button>
        <button className={buttonClass} disabled={action.pending} onClick={onClose} type="button">{copy.confirm_cancel}</button>
        <button aria-busy={pendingOperation === 'submit'} className={primaryClass} disabled={disabled} type="submit">
          {pendingOperation === 'submit' ? copy.webdav_connecting : item ? copy.webdav_save : copy.webdav_enable}
        </button>
      </div>
    </form>
  );
}

function ConnectionCard({ item, expanded, model, now, options, onEdit, onClose }: {
  item: WebDavConnection;
  expanded: boolean;
  model: WebDavListModel;
  now: number;
  options: WebDavListOptions;
  onEdit(): void;
  onClose(): void;
}) {
  const { copy } = model;
  const lang = model.lang || '';
  const editorId = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const [feedback, setFeedback] = useState<{ text: string; diagnostic: string } | null>(null);
  const [pendingOperation, setPendingOperation] = useState('');
  const [diff, setDiff] = useState<{ open: boolean; items: WebDavConflictItem[] | null; error: string }>({ open: false, items: null, error: '' });
  const toggleDiff = async () => {
    if (diff.open) { setDiff({ ...diff, open: false }); return; }
    setDiff({ open: true, items: null, error: '' });
    try {
      const result = await options.onAction('conflictDetails', item.id) as { items?: WebDavConflictItem[] };
      setDiff({ open: true, items: result.items || [], error: '' });
    } catch (error) {
      setDiff({ open: true, items: [], error: getAsyncErrorMessage(error) });
    }
  };
  const action = useExclusiveAsyncAction(async (operation: string, decision?: string) => {
    setFeedback(null);
    setPendingOperation(operation);
    return options.onAction(operation, item.id, decision ? { decision } : {});
  });
  const run = async (operation: string, decision?: string) => {
    const outcome = await action.run(operation, decision);
    setPendingOperation('');
    if (outcome.status === 'rejected') {
      const error = outcome.error as { diagnostic?: string };
      setFeedback({ text: getAsyncErrorMessage(outcome.error), diagnostic: error?.diagnostic || '' });
    }
  };
  const syncing = action.pending && ['sync', 'enable'].includes(pendingOperation);
  const busy = action.pending || item.state === 'syncing';
  const choice = item.state === 'choice' || item.state === 'conflict';
  const status = describeStatus(item, copy, syncing, now, lang);
  const title = connectionTitle(item, copy);
  const lastSyncAt = validTime(item.lastSyncAt);
  const errorText = feedback?.text || item.errorText || '';
  const diagnostic = feedback ? feedback.diagnostic : item.diagnosticText || '';
  const location = `${item.config.endpoint}${item.config.directory}`;
  const close = () => { onClose(); requestAnimationFrame(() => editRef.current?.focus()); };
  let notice = null;
  if (!expanded && item.needsRecovery) {
    notice = (
      <div className="lumno-webdav-notice" data-tone="danger">
        <p className={classes('setting_desc')}>{item.errorText || copy.webdav_error_interrupted}</p>
        {item.hasMigrationBackup ? <div className="lumno-webdav-actions">
          <button className={primaryClass} disabled={busy || model.outdated} onClick={() => { void run('restoreBackup'); }} type="button">
            <i className="ri-icon ri-size-14 ri-history-line" aria-hidden="true" />{copy.webdav_restore_backup}
          </button>
        </div> : null}
      </div>
    );
  } else if (!expanded && choice) {
    const decide = (decision: string) => { void run(item.enabled ? 'sync' : 'enable', decision); };
    notice = (
      <div className="lumno-webdav-notice" data-tone="warning" role="group"
        aria-label={copy[item.state === 'conflict' ? 'webdav_conflict_title' : 'webdav_choice_title']}>
        <p className={classes('setting_desc')}>
          {copy[item.remoteMissing ? 'webdav_missing_hint' : item.state === 'conflict' ? 'webdav_conflict_hint' : 'webdav_choice_hint']}
        </p>
        {item.conflictsText && !diff.open ? <p className={classes('setting_desc')}>{copy.webdav_conflict_items}：{item.conflictsText}</p> : null}
        {diff.open ? (diff.items === null
          ? <p className={classes('setting_desc')} role="status">{copy.webdav_diff_loading}</p>
          : diff.error ? <p className={classes('shortcut_error')}>{diff.error}</p>
            : <ConflictDiff copy={copy} items={diff.items} lang={lang} />) : null}
        {feedback ? <p className={`${classes('shortcut_error')} lumno-webdav-notice-error`}>{feedback.text}</p> : null}
        <div className="lumno-webdav-actions">
          {item.state === 'conflict' ? (
            <button aria-expanded={diff.open} className={`${buttonClass} lumno-webdav-diff-toggle`} onClick={() => { void toggleDiff(); }} type="button">
              <i aria-hidden="true" className={`ri-icon ri-size-14 ${diff.open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} />
              {diff.open ? copy.webdav_hide_diff : copy.webdav_view_diff}
            </button>
          ) : null}
          <button className={buttonClass} disabled={busy} onClick={() => { void run('pause'); }} type="button">{copy.webdav_resolve_later}</button>
          {item.remoteMissing ? (
            <button className={primaryClass} disabled={busy || model.outdated} onClick={() => decide('local')} type="button">{copy.webdav_upload_local}</button>
          ) : (['local', 'remote'] as const).map((decision) => (
            <button className={buttonClass} disabled={busy || model.outdated} key={decision} onClick={() => decide(decision)} type="button">
              {copy[`webdav_use_${decision}`]}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (!expanded && errorText) {
    notice = (
      <div className="lumno-webdav-notice" data-tone="danger">
        <p className={`${classes('setting_desc')} lumno-webdav-error`} role="status">{errorText}</p>
        <div className="lumno-webdav-actions">
          {diagnostic ? <DiagnosticButton copy={copy} text={diagnostic} /> : null}
          <button className={buttonClass} disabled={busy || model.outdated} onClick={() => { void run(item.enabled ? 'sync' : 'enable'); }} type="button">
            <i className="ri-icon ri-size-14 ri-refresh-line" aria-hidden="true" />{copy.webdav_retry}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`${classes('shortcut_item')} lumno-webdav-card`} data-expanded={expanded} data-type="custom" data-webdav-id={item.id}>
      <div className={classes('shortcut_item_header')}>
        <div className={classes('shortcut_item_info')}>
          <div className={classes('shortcut_item_title')}>
            <span className="lumno-webdav-name" title={location}>{title}</span>
            <span className={classes('sync_status')} data-status={status.tone} role="status"
              title={lastSyncAt ? `${copy.webdav_last_sync}：${formatTime(lastSyncAt, lang)}` : copy.webdav_never_synced}>
              {status.label}
            </span>
          </div>
          <div className={classes('shortcut_item_meta')} title={`${location} · ${item.config.username}`}>
            {item.config.username} · /{item.config.directory}
            {lastSyncAt && status.tone !== 'success' ? ` · ${copy.webdav_last_sync} ${formatTime(lastSyncAt, lang)}` : ''}
          </div>
        </div>
        <div className={classes('shortcut_item_actions')}>
          {item.enabled && !choice && !item.needsRecovery && !errorText ? (
            <button aria-label={copy.webdav_sync} className={`${classes('shortcut_edit')} lumno-webdav-sync-now`} data-spinning={syncing || item.state === 'syncing'}
              data-tooltip={copy.webdav_sync} disabled={busy || model.outdated} onClick={() => { void run('sync'); }} type="button">
              <i aria-hidden="true" className="ri-icon ri-size-14 ri-refresh-line" />
            </button>
          ) : null}
          <button aria-controls={editorId} aria-expanded={expanded} aria-label={copy.webdav_edit_config}
            className={classes('shortcut_edit')} disabled={busy} onClick={onEdit} ref={editRef} type="button">
            <i aria-hidden="true" className="ri-icon ri-size-14 ri-edit-line" />
          </button>
          <InlinePopconfirm copy={{ cancelLabel: copy.confirm_cancel, confirmLabel: copy.confirm_ok,
            message: copy.webdav_remove_confirm, messageKey: 'webdav_remove_confirm' }}
            onConfirm={async () => { if (!busy && !model.outdated) await run('remove'); }}
            triggerAriaLabel={copy.webdav_remove} triggerClassName={classes('shortcut_remove')}
            triggerDisabled={busy || !model.ready || model.outdated}
            triggerIconClass="ri-icon ri-size-14 ri-delete-bin-4-line" />
          <label className={classes('switch')}>
            <input aria-label={`${copy.webdav_title} · ${title} / ${item.config.directory}`} checked={item.enabled}
              disabled={busy || !model.ready || (!item.enabled && (model.outdated || choice))} type="checkbox"
              onChange={(event) => { void run(event.currentTarget.checked ? 'enable' : 'pause'); }} />
            <span className={classes('switch_slider')} aria-hidden="true" />
          </label>
        </div>
      </div>
      {notice}
      {expanded ? <div id={editorId}><ConnectionEditor item={item} model={model} options={options} onClose={close} /></div> : null}
    </div>
  );
}

export function WebDavList({ model, options }: { model: WebDavListModel; options: WebDavListOptions }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const addId = useId();
  const now = useNow(30000);
  const closeAdd = () => { setAdding(false); requestAnimationFrame(() => addRef.current?.focus()); };
  return <>
    <div className={classes('shortcut_list')}>
      {model.connections.map((item) => <ConnectionCard key={item.id} item={item} model={model} now={now} options={options}
        expanded={expandedId === item.id} onClose={() => setExpandedId(null)}
        onEdit={() => { setAdding(false); setExpandedId((value) => value === item.id ? null : item.id); }} />)}
    </div>
    <div className={`${classes('shortcut_form')} lumno-webdav-editor`} data-expanded={adding}>
      <div className={classes('shortcut_form_trigger')}>
        <button aria-controls={addId} aria-expanded={adding} className={classes('shortcut_submit')}
          disabled={!model.ready || model.outdated} onClick={() => { setExpandedId(null); setAdding(true); }} ref={addRef} type="button">
          <i className="ri-icon ri-size-14 ri-add-line" aria-hidden="true" />{model.copy.webdav_add}
        </button>
      </div>
      {adding ? <div id={addId}><ConnectionEditor model={model} options={options} onClose={closeAdd} /></div> : null}
    </div>
  </>;
}

export function createWebDavListApi() {
  return { implementation: 'react', createWebDavListController: (host: HTMLElement | null, options: WebDavListOptions) => {
    if (host) host.dataset.reactIsland = 'options-webdav-list';
    return createReactRootController(host, (model: WebDavListModel) => <WebDavList model={model} options={options} />);
  } };
}

import { useId, useRef, useState } from 'react';
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
  lastSyncAt?: number;
  hasMigrationBackup?: boolean;
  needsRecovery?: boolean;
  conflictsText?: string;
  remoteMissing?: boolean;
}
export interface WebDavListModel {
  connections: WebDavConnection[];
  copy: Record<string, string>;
  ready: boolean;
  outdated: boolean;
}
export interface WebDavListOptions {
  onAction(operation: string, id?: string, extra?: Record<string, unknown>): Promise<{ needsChoice?: boolean }>;
}
const classes = (name: string) => `_x_extension_${name}_2024_unique_`;
const buttonClass = `${classes('shortcut_submit')} ${classes('shortcut_secondary')}`;

function ConnectionEditor({ item, model, options, onClose }: {
  item?: WebDavConnection;
  model: WebDavListModel;
  options: WebDavListOptions;
  onClose(): void;
}) {
  const { copy } = model;
  const formId = useId();
  const [draft, setDraft] = useState({ endpoint: item?.config.endpoint || '', directory: item?.config.directory || 'lumno',
    username: item?.config.username || '', password: '' });
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const action = useExclusiveAsyncAction(async (operation: string) => {
    setFeedback('');
    setFailed(false);
    return options.onAction(operation, item?.id, { config: draft });
  });
  let endpoint = '';
  try { endpoint = new URL(draft.endpoint.trim()).href.replace(/\/*$/, '/'); } catch { /* Native form validation handles it. */ }
  const reusePassword = item?.config.hasPassword && endpoint === item.config.endpoint && draft.username.trim() === item.config.username;
  const disabled = action.pending || !model.ready || model.outdated;
  const run = async (operation: string) => {
    const outcome = await action.run(operation);
    if (outcome.status === 'rejected') { setFailed(true); setFeedback(getAsyncErrorMessage(outcome.error)); }
    if (outcome.status === 'fulfilled') {
      if (operation === 'test') setFeedback(copy.webdav_test_success);
      else onClose();
    }
  };
  return (
    <form className={item ? classes('shortcut_editor') : classes('shortcut_form_fields')}
      onSubmit={(event) => { event.preventDefault(); void run(item ? 'save' : 'add'); }}>
      <div className="lumno-webdav-form-grid">
        {(['endpoint', 'directory', 'username', 'password'] as const).map((field) => (
          <div className={classes('shortcut_field')} key={field}>
            <label className={classes('shortcut_label')} htmlFor={`${formId}-${field}`}>
              <span>{copy[`webdav_${field}`]}</span><span className={classes('shortcut_required')}>*</span>
            </label>
            <input autoFocus={field === 'endpoint'} autoComplete={field === 'password' ? 'new-password' : 'off'}
              className={classes('shortcut_input')} disabled={disabled} id={`${formId}-${field}`}
              name={field} placeholder={field === 'password' && reusePassword ? copy.webdav_password_saved : field === 'endpoint' ? 'https://dav.example.com/' : ''}
              required={field !== 'password' || !reusePassword} spellCheck={false}
              type={field === 'password' ? 'password' : field === 'endpoint' ? 'url' : 'text'} value={draft[field]}
              onChange={(event) => { setFeedback(''); setDraft({ ...draft, [field]: event.currentTarget.value }); }} />
          </div>
        ))}
      </div>
      <p className={classes('setting_desc')}>{copy.webdav_credentials_hint}</p>
      {item?.enabled ? <p className={classes('setting_desc')}>{copy.webdav_edit_active_hint}</p> : null}
      <div className={classes('shortcut_editor_actions')}>
        <button className={buttonClass} disabled={disabled} type="button" onClick={(event) => {
          if (event.currentTarget.form?.reportValidity()) void run('test');
        }}>{copy.webdav_test}</button>
        <button className={buttonClass} disabled={action.pending} onClick={onClose} type="button">{copy.confirm_cancel}</button>
        <button className={`${classes('shortcut_submit')} ${classes('shortcut_save')}`} disabled={disabled} type="submit">{copy.webdav_save}</button>
      </div>
      {feedback ? <p className={`${classes('setting_desc')} lumno-webdav-feedback`} data-error={failed} role="status">{feedback}</p> : null}
    </form>
  );
}

function ConnectionCard({ item, expanded, model, options, onEdit, onClose }: {
  item: WebDavConnection;
  expanded: boolean;
  model: WebDavListModel;
  options: WebDavListOptions;
  onEdit(): void;
  onClose(): void;
}) {
  const { copy } = model;
  const editorId = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const [feedback, setFeedback] = useState('');
  const [needsChoice, setNeedsChoice] = useState(false);
  const action = useExclusiveAsyncAction(async (operation: string, decision?: string) => {
    setFeedback('');
    const result = await options.onAction(operation, item.id, decision ? { decision } : {});
    setNeedsChoice(Boolean(result.needsChoice));
    return result;
  });
  const run = async (operation: string, decision?: string) => {
    const outcome = await action.run(operation, decision);
    if (outcome.status === 'rejected') setFeedback(getAsyncErrorMessage(outcome.error));
  };
  const busy = action.pending || ['syncing', 'saving', 'testing'].includes(item.state);
  const choice = needsChoice || ['choice', 'conflict'].includes(item.state);
  const date = item.lastSyncAt ? new Date(item.lastSyncAt) : null;
  const validDate = date && Number.isFinite(date.getTime());
  let title = item.config.endpoint;
  try { title = new URL(item.config.endpoint).host; } catch { /* Keep the saved display text. */ }
  const close = () => { onClose(); requestAnimationFrame(() => editRef.current?.focus()); };
  return (
    <div className={`${classes('shortcut_item')} lumno-webdav-card`} data-expanded={expanded} data-type="custom" data-webdav-id={item.id}>
      <div className={classes('shortcut_item_header')}>
        <div className={classes('shortcut_item_info')}>
          <div className={classes('shortcut_item_title')}>
            <span className={classes('shortcut_badge')} data-tone={item.enabled && item.state === 'ready' ? 'suffix' : undefined} role="status">
              {copy[`webdav_state_${action.pending ? 'syncing' : item.state}`] || copy.webdav_state_error}
            </span>
            <span title={`${item.config.endpoint}${item.config.directory}`}>{title} / {item.config.directory}</span>
          </div>
          <div className={classes('shortcut_item_meta')} title={`${item.config.endpoint}${item.config.directory} · ${item.config.username}`}>
            {item.config.endpoint}{item.config.directory} · {item.config.username}
          </div>
        </div>
        <div className={classes('shortcut_item_actions')}>
          <label className={classes('switch')}>
            <input aria-label={`${copy.webdav_title} · ${title} / ${item.config.directory}`} checked={item.enabled}
              disabled={busy || !model.ready || (!item.enabled && (model.outdated || choice))} type="checkbox"
              onChange={(event) => { void run(event.currentTarget.checked ? 'enable' : 'pause'); }} />
            <span className={classes('switch_slider')} aria-hidden="true" />
          </label>
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
        </div>
      </div>
      <div className="lumno-webdav-meta">
        <span className={classes('setting_desc')}>{copy.webdav_last_sync}：<time dateTime={validDate ? date.toISOString() : undefined}>
          {validDate ? date.toLocaleString(document.documentElement.lang || undefined) : copy.webdav_never_synced}
        </time></span>
        <button className={buttonClass} disabled={busy || !item.enabled || model.outdated} onClick={() => { void run('sync'); }} type="button">
          <i className="ri-icon ri-size-14 ri-refresh-line" aria-hidden="true" />{copy.webdav_sync}
        </button>
      </div>
      {expanded ? <div id={editorId}><ConnectionEditor item={item} model={model} options={options} onClose={close} /></div> : null}
      {choice ? <div className="lumno-webdav-choice" role="group" aria-label={copy.webdav_choice_title}>
        <p className={classes('setting_title')}>{copy[item.state === 'conflict' ? 'webdav_conflict_title' : 'webdav_choice_title']}</p>
        <p className={classes('setting_desc')}>{copy[item.remoteMissing ? 'webdav_missing_hint' : item.state === 'conflict' ? 'webdav_conflict_hint' : 'webdav_choice_hint']}</p>
        {item.conflictsText ? <p className={classes('setting_desc')}>{copy.webdav_conflict_items}：{item.conflictsText}</p> : null}
        <div className="lumno-webdav-actions">
          {(['local', 'remote'] as const).map((decision) => <button className={buttonClass} key={decision}
            disabled={busy || model.outdated || (decision === 'remote' && item.remoteMissing)}
            onClick={() => { void run(item.enabled ? 'sync' : 'enable', decision); }} type="button">{copy[`webdav_use_${decision}`]}</button>)}
          <button className={buttonClass} disabled={busy} onClick={() => { void run('pause'); }} type="button">{copy.webdav_resolve_later}</button>
        </div>
      </div> : null}
      {feedback || item.errorText ? <p className={`${classes('setting_desc')} lumno-webdav-feedback`} data-error="true" role="status">{feedback || item.errorText}</p> : null}
      {item.hasMigrationBackup && item.needsRecovery ? <div className="lumno-webdav-actions">
        <button className={buttonClass} disabled={busy || model.outdated} onClick={() => { void run('restoreBackup'); }} type="button">
          <i className="ri-icon ri-size-14 ri-history-line" aria-hidden="true" />{copy.webdav_restore_backup}
        </button>
      </div> : null}
    </div>
  );
}

export function WebDavList({ model, options }: { model: WebDavListModel; options: WebDavListOptions }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const addId = useId();
  const closeAdd = () => { setAdding(false); requestAnimationFrame(() => addRef.current?.focus()); };
  return <>
    <div className={classes('shortcut_list')}>
      {model.connections.map((item) => <ConnectionCard key={item.id} item={item} model={model} options={options}
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

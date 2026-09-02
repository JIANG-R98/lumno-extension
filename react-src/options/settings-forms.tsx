import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createReactRootController,
  type ReactRootController
} from '../shared/root-controller';
import type { BlacklistMatchMode } from './blacklist-list';
import {
  SiteSearchProviderCategoryControl,
  type SiteSearchProviderCategoryCopyModel,
  type SiteSearchProviderDraft,
  type SiteSearchSaveResult
} from './site-search-list';
import {
  getAsyncErrorMessage,
  useExclusiveAsyncAction
} from '../shared/use-exclusive-async-action';
import { InfoButton } from './info-button';

export interface SiteSearchFormCopyModel
  extends SiteSearchProviderCategoryCopyModel {
  addLabel: string;
  aliasLabel: string;
  aliasPlaceholder: string;
  cancelLabel: string;
  keyLabel: string;
  keyPlaceholder: string;
  nameLabel: string;
  namePlaceholder: string;
  queryInsertLabel: string;
  templateHelp: string;
  templateLabel: string;
  templatePlaceholder: string;
}

export interface SiteSearchFormRenderModel {
  copy: SiteSearchFormCopyModel;
}

export interface SiteSearchFormControllerOptions {
  onSave(draft: SiteSearchProviderDraft): SiteSearchSaveResult | Promise<SiteSearchSaveResult>;
}

export type SiteSearchFormController =
  ReactRootController<SiteSearchFormRenderModel>;

export interface BlacklistFormModeCopyModel {
  label: string;
  labelKey: string;
  mode: BlacklistMatchMode;
  placeholder: string;
  prefix: string;
  tooltip: string;
  tooltipKey: string;
  urlLabel: string;
  urlLabelKey: string;
}

export interface BlacklistFormCopyModel {
  addLabel: string;
  cancelLabel: string;
  matchLabel: string;
  modes: BlacklistFormModeCopyModel[];
}

export interface BlacklistFormRenderModel {
  copy: BlacklistFormCopyModel;
}

export interface BlacklistFormSaveResult {
  error?: string;
  ok: boolean;
}

export interface BlacklistFormControllerOptions {
  kind: string;
  onSave(
    value: string,
    modes: BlacklistMatchMode[]
  ): BlacklistFormSaveResult | Promise<BlacklistFormSaveResult>;
}

export interface BlacklistFormController
  extends ReactRootController<BlacklistFormRenderModel> {
  reset(): void;
}

function SiteSearchForm({
  host,
  model,
  onSave
}: {
  host: HTMLElement | null;
  model: SiteSearchFormRenderModel;
  onSave(draft: SiteSearchProviderDraft): SiteSearchSaveResult | Promise<SiteSearchSaveResult>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<SiteSearchProviderDraft>({
    aliases: '',
    category: 'site',
    key: '',
    name: '',
    template: ''
  });
  const keyInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const saveAction = useExclusiveAsyncAction(onSave);
  const saving = saveAction.pending;

  useEffect(() => {
    if (host) {
      host.dataset.expanded = expanded ? 'true' : 'false';
    }
    if (expanded) {
      keyInputRef.current?.focus();
    }
  }, [expanded, host]);

  const updateDraft = (field: keyof SiteSearchProviderDraft, value: string) => {
    setError('');
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const reset = () => {
    setDraft({ aliases: '', category: 'site', key: '', name: '', template: '' });
    setError('');
    setExpanded(false);
  };

  return (
    <>
      <div className="_x_extension_shortcut_form_trigger_2024_unique_">
        <button
          aria-expanded={expanded}
          className="_x_extension_shortcut_submit_2024_unique_"
          id="_x_extension_site_search_expand_2024_unique_"
          onClick={() => setExpanded(true)}
          type="button"
        >
          <i aria-hidden="true" className="ri-icon ri-size-14 ri-add-line" />
          <span data-i18n="shortcuts_add">{model.copy.addLabel}</span>
        </button>
      </div>
      <div className="_x_extension_shortcut_form_fields_2024_unique_">
        <div className="_x_extension_shortcut_field_2024_unique_">
          <div className="_x_extension_shortcut_label_row_2024_unique_ _x_extension_site_search_template_header_2026_unique_">
            <div className="_x_extension_site_search_template_label_2026_unique_">
              <label
                className="_x_extension_shortcut_label_2024_unique_"
                htmlFor="_x_extension_site_search_template_2024_unique_"
              >
                <span data-i18n="shortcuts_label_template">{model.copy.templateLabel}</span>
                <span className="_x_extension_shortcut_required_2024_unique_">*</span>
              </label>
              <InfoButton tooltip={model.copy.templateHelp} />
            </div>
            <button
              aria-label={model.copy.queryInsertLabel}
              className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_ghost_2026_unique_ _x_extension_site_search_insert_query_2026_unique_"
              id="_x_extension_site_search_insert_query_2026_unique_"
              onClick={() => {
                setExpanded(true);
                const input = templateInputRef.current;
                const value = draft.template;
                const start = input?.selectionStart ?? value.length;
                const end = input?.selectionEnd ?? start;
                const next = `${value.slice(0, start)}{query}${value.slice(end)}`;
                updateDraft('template', next);
                requestAnimationFrame(() => {
                  input?.focus();
                  input?.setSelectionRange(start + 7, start + 7);
                });
              }}
              type="button"
            >
              <span data-i18n="shortcuts_insert_query">{model.copy.queryInsertLabel}</span>
              <i aria-hidden="true" className="ri-icon ri-size-14 ri-add-line" />
            </button>
          </div>
          <input
            className="_x_extension_shortcut_input_2024_unique_"
            id="_x_extension_site_search_template_2024_unique_"
            onChange={(event) => updateDraft('template', event.currentTarget.value)}
            placeholder={model.copy.templatePlaceholder}
            ref={templateInputRef}
            value={draft.template}
          />
        </div>
        <div className="_x_extension_shortcut_field_2024_unique_">
          <label
            className="_x_extension_shortcut_label_2024_unique_"
            htmlFor="_x_extension_site_search_key_2024_unique_"
          >
            <span data-i18n="shortcuts_label_key">{model.copy.keyLabel}</span>
            <span className="_x_extension_shortcut_required_2024_unique_">*</span>
          </label>
          <input
            className="_x_extension_shortcut_input_2024_unique_"
            id="_x_extension_site_search_key_2024_unique_"
            onChange={(event) => updateDraft('key', event.currentTarget.value)}
            placeholder={model.copy.keyPlaceholder}
            ref={keyInputRef}
            value={draft.key}
          />
        </div>
        <div className="_x_extension_shortcut_field_2024_unique_">
          <label
            className="_x_extension_shortcut_label_2024_unique_"
            htmlFor="_x_extension_site_search_name_2024_unique_"
          >
            {model.copy.nameLabel}
          </label>
          <input
            className="_x_extension_shortcut_input_2024_unique_"
            id="_x_extension_site_search_name_2024_unique_"
            onChange={(event) => updateDraft('name', event.currentTarget.value)}
            placeholder={model.copy.namePlaceholder}
            value={draft.name}
          />
        </div>
        <div className="_x_extension_shortcut_field_2024_unique_">
          <label
            className="_x_extension_shortcut_label_2024_unique_"
            htmlFor="_x_extension_site_search_alias_2024_unique_"
          >
            <span data-i18n="shortcuts_label_alias">{model.copy.aliasLabel}</span>
            <span className="_x_extension_shortcut_required_2024_unique_">*</span>
          </label>
          <input
            className="_x_extension_shortcut_input_2024_unique_"
            id="_x_extension_site_search_alias_2024_unique_"
            onChange={(event) => updateDraft('aliases', event.currentTarget.value)}
            placeholder={model.copy.aliasPlaceholder}
            value={draft.aliases}
          />
        </div>
        <div className="_x_extension_shortcut_field_2024_unique_">
          <div className="_x_extension_shortcut_label_2024_unique_">
            {model.copy.categoryLabel}
          </div>
          <SiteSearchProviderCategoryControl
            category={draft.category}
            copy={model.copy}
            onChange={(category) => updateDraft('category', category)}
          />
        </div>
        <div className="_x_extension_shortcut_actions_row_2024_unique_">
          <button
            className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_secondary_2024_unique_"
            disabled={saving}
            id="_x_extension_site_search_cancel_2024_unique_"
            onClick={reset}
            style={{ display: expanded ? 'inline-flex' : 'none' }}
            type="button"
          >
            {model.copy.cancelLabel}
          </button>
          <button
            aria-busy={saving}
            className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_submit_primary_2024_unique_"
            disabled={saving}
            id="_x_extension_site_search_add_2024_unique_"
            onClick={async () => {
              if (!expanded) {
                setExpanded(true);
                return;
              }
              const outcome = await saveAction.run(draft);
              if (outcome.status === 'skipped') {
                return;
              }
              if (outcome.status === 'rejected') {
                setError(getAsyncErrorMessage(outcome.error));
                return;
              }
              const result = outcome.value;
              if (result.ok) {
                reset();
              } else {
                setError(result.error || '');
              }
            }}
            type="button"
          >
            {model.copy.addLabel}
          </button>
        </div>
        <div
          className="_x_extension_shortcut_error_2024_unique_"
          id="_x_extension_site_search_error_2024_unique_"
          style={{ display: error ? 'block' : 'none' }}
        >
          {error}
        </div>
      </div>
    </>
  );
}

function BlacklistForm({
  host,
  model,
  onSave,
  resetVersion
}: {
  host: HTMLElement | null;
  model: BlacklistFormRenderModel;
  onSave(
    value: string,
    modes: BlacklistMatchMode[]
  ): BlacklistFormSaveResult | Promise<BlacklistFormSaveResult>;
  resetVersion: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<BlacklistMatchMode>('suffix');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const saveAction = useExclusiveAsyncAction(onSave);
  const saving = saveAction.pending;
  const activeMode = useMemo(
    () => model.copy.modes.find((item) => item.mode === mode) || model.copy.modes[0],
    [mode, model.copy.modes]
  );

  useEffect(() => {
    if (host) {
      host.dataset.expanded = expanded ? 'true' : 'false';
    }
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded, host]);

  useEffect(() => {
    setExpanded(false);
    setMode('suffix');
    setValue('');
    setError('');
  }, [resetVersion]);

  const reset = () => {
    setExpanded(false);
    setMode('suffix');
    setValue('');
    setError('');
  };

  return (
    <>
      <div className="_x_extension_shortcut_form_trigger_2024_unique_">
        <button
          aria-expanded={expanded}
          className="_x_extension_shortcut_submit_2024_unique_"
          onClick={() => setExpanded(true)}
          type="button"
        >
          <i aria-hidden="true" className="ri-icon ri-size-14 ri-add-line" />
          <span>{model.copy.addLabel}</span>
        </button>
      </div>
      <div className="_x_extension_shortcut_form_fields_2024_unique_">
        <div className="_x_extension_shortcut_field_2024_unique_">
          <label className="_x_extension_shortcut_label_2024_unique_">
            <span data-i18n={activeMode?.urlLabelKey}>{activeMode?.urlLabel}</span>
            <span className="_x_extension_shortcut_required_2024_unique_">*</span>
          </label>
          <div
            className="_x_extension_shortcut_input_affix_2026_unique_"
            data-has-prefix={activeMode?.prefix ? 'true' : 'false'}
          >
            <span
              className="_x_extension_shortcut_input_prefix_2026_unique_"
              style={{ display: activeMode?.prefix ? 'block' : 'none' }}
            >
              {activeMode?.prefix}
            </span>
            <input
              className="_x_extension_shortcut_input_2024_unique_"
              onChange={(event) => {
                setError('');
                setValue(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget
                    .closest('._x_extension_shortcut_form_fields_2024_unique_')
                    ?.querySelector<HTMLButtonElement>('[data-form-primary="true"]')
                    ?.click();
                }
              }}
              placeholder={activeMode?.placeholder}
              ref={inputRef}
              value={value}
            />
          </div>
        </div>
        <div className="_x_extension_shortcut_field_2024_unique_">
          <div className="_x_extension_shortcut_label_2024_unique_">
            {model.copy.matchLabel}
          </div>
          <div
            className="_x_extension_checkbox_group_2026_unique_"
            data-align="start"
            data-gap="wide"
          >
            {model.copy.modes.map((item) => (
              <label className="_x_extension_checkbox_2026_unique_" key={item.mode}>
                <input
                  checked={mode === item.mode}
                  onChange={() => {
                    setMode(item.mode);
                    setError('');
                  }}
                  type="checkbox"
                />
                <span data-i18n={item.labelKey}>{item.label}</span>
                <InfoButton tooltip={item.tooltip} />
              </label>
            ))}
          </div>
        </div>
        <div className="_x_extension_shortcut_actions_row_2024_unique_">
          <button
            className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_secondary_2024_unique_"
            disabled={saving}
            onClick={reset}
            style={{ display: expanded ? 'inline-flex' : 'none' }}
            type="button"
          >
            {model.copy.cancelLabel}
          </button>
          <button
            aria-busy={saving}
            className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_submit_primary_2024_unique_"
            data-form-primary="true"
            disabled={saving}
            onClick={async () => {
              if (!expanded) {
                setExpanded(true);
                return;
              }
              const outcome = await saveAction.run(value, [mode]);
              if (outcome.status === 'skipped') {
                return;
              }
              if (outcome.status === 'rejected') {
                setError(getAsyncErrorMessage(outcome.error));
                return;
              }
              const result = outcome.value;
              if (result.ok) {
                reset();
              } else {
                setError(result.error || '');
              }
            }}
            type="button"
          >
            {model.copy.addLabel}
          </button>
        </div>
        <div
          className="_x_extension_shortcut_error_2024_unique_"
          style={{ display: error ? 'block' : 'none' }}
        >
          {error}
        </div>
      </div>
    </>
  );
}

export function createSiteSearchFormController(
  host: HTMLElement | null,
  options: SiteSearchFormControllerOptions
): SiteSearchFormController {
  if (host) {
    host.dataset.reactIsland = 'options-site-search-form';
  }
  return createReactRootController(
    host,
    (model: SiteSearchFormRenderModel) => (
      <SiteSearchForm host={host} model={model} onSave={options.onSave} />
    )
  );
}

export function createBlacklistFormController(
  host: HTMLElement | null,
  options: BlacklistFormControllerOptions
): BlacklistFormController {
  if (host) {
    host.dataset.reactIsland = 'options-blacklist-form';
    host.dataset.blacklistKind = options.kind;
  }
  let resetVersion = 0;
  let currentModel: BlacklistFormRenderModel | null = null;
  const rootController = createReactRootController(
    host,
    (model: BlacklistFormRenderModel) => (
      <BlacklistForm
        host={host}
        model={model}
        onSave={options.onSave}
        resetVersion={resetVersion}
      />
    )
  );
  return Object.freeze({
    render(model: BlacklistFormRenderModel) {
      currentModel = model;
      rootController.render(model);
    },
    reset() {
      if (!currentModel) {
        return;
      }
      resetVersion += 1;
      rootController.render(currentModel);
    },
    destroy() {
      currentModel = null;
      rootController.destroy();
    }
  });
}

export function createSettingsFormsApi() {
  return Object.freeze({
    implementation: 'react',
    createBlacklistFormController,
    createSiteSearchFormController
  });
}

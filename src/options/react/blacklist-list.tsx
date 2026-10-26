import { useState } from 'react';
import {
  getAsyncErrorMessage,
  useExclusiveAsyncAction
} from '../../shared/react/use-exclusive-async-action';
import { InlinePopconfirm } from './inline-popconfirm';
import { InfoButton } from './info-button';
import { BusyLabel } from '../../shared/react/busy-label';
import { RemixIcon } from '../../shared/react/remix-icon';

export type BlacklistMatchMode = 'exact' | 'prefix' | 'suffix';

export interface BlacklistListItemModel {
  badgeText: string;
  badgeTone: string;
  displayPattern: string;
  inputValue: string;
  key: string;
  matchModes: BlacklistMatchMode[];
}

export interface BlacklistModeOptionModel {
  label: string;
  mode: BlacklistMatchMode;
  tooltip: string;
}

export interface BlacklistListCopyModel {
  cancelLabel: string;
  confirmLabel: string;
  confirmMessage: string;
  confirmMessageKey: string;
  editLabel: string;
  matchLabel: string;
  modeOptions: BlacklistModeOptionModel[];
  placeholderDomain: string;
  placeholderExact: string;
  placeholderPrefix: string;
  removeLabel: string;
  saveLabel: string;
  urlLabel: string;
}

export interface BlacklistListRenderModel {
  copy: BlacklistListCopyModel;
  editable: boolean;
  items: BlacklistListItemModel[];
}

export interface BlacklistSaveResult {
  error?: string;
  ok: boolean;
}

// Saves an edited rule under the key it had.
export type BlacklistSaveHandler = (
  key: string,
  inputValue: string,
  matchModes: BlacklistMatchMode[]
) => BlacklistSaveResult | Promise<BlacklistSaveResult>;

function getInputPresentation(
  modes: BlacklistMatchMode[],
  copy: BlacklistListCopyModel
) {
  if (modes.includes('exact')) {
    return {
      placeholder: copy.placeholderExact,
      prefix: 'http(s)://'
    };
  }
  if (modes.includes('suffix')) {
    return {
      placeholder: copy.placeholderDomain,
      prefix: ''
    };
  }
  return {
    placeholder: copy.placeholderPrefix,
    prefix: 'http(s)://'
  };
}

function BlacklistEditor({
  copy,
  item,
  onCancel,
  onSave
}: {
  copy: BlacklistListCopyModel;
  item: BlacklistListItemModel;
  onCancel(): void;
  onSave(
    key: string,
    inputValue: string,
    matchModes: BlacklistMatchMode[]
  ): BlacklistSaveResult | Promise<BlacklistSaveResult>;
}) {
  const [inputValue, setInputValue] = useState(item.inputValue);
  const [matchModes, setMatchModes] = useState<BlacklistMatchMode[]>(
    item.matchModes
  );
  const [error, setError] = useState('');
  const saveAction = useExclusiveAsyncAction(onSave);
  const saving = saveAction.pending;
  const presentation = getInputPresentation(matchModes, copy);

  const toggleMode = (mode: BlacklistMatchMode) => {
    setError('');
    setMatchModes((current) => (
      current.includes(mode) ? [] : [mode]
    ));
  };

  return (
    <div className="_x_extension_shortcut_editor_2024_unique_">
      <div className="_x_extension_shortcut_field_2024_unique_">
        <div className="_x_extension_shortcut_label_2024_unique_">
          <span>{copy.urlLabel}</span>
          <span className="_x_extension_shortcut_required_2024_unique_">*</span>
        </div>
        <div
          className="_x_extension_shortcut_input_affix_2026_unique_"
          data-has-prefix={presentation.prefix ? 'true' : 'false'}
        >
          <span
            className="_x_extension_shortcut_input_prefix_2026_unique_"
            style={{ display: presentation.prefix ? 'block' : 'none' }}
          >
            {presentation.prefix}
          </span>
          <input
            className="_x_extension_shortcut_input_2024_unique_"
            onChange={(event) => {
              setError('');
              setInputValue(event.currentTarget.value);
            }}
            placeholder={presentation.placeholder}
            value={inputValue}
          />
        </div>
      </div>
      <div className="_x_extension_shortcut_field_2024_unique_">
        <div className="_x_extension_shortcut_label_2024_unique_">
          {copy.matchLabel}
        </div>
        <div
          className="_x_extension_checkbox_group_2026_unique_"
          data-align="start"
          data-gap="wide"
        >
          {copy.modeOptions.map((option) => (
            <label
              className="_x_extension_checkbox_2026_unique_"
              data-disabled="false"
              key={option.mode}
            >
              <input
                checked={matchModes.includes(option.mode)}
                onChange={() => toggleMode(option.mode)}
                type="checkbox"
              />
              <span>{option.label}</span>
              <InfoButton tooltip={option.tooltip} />
            </label>
          ))}
        </div>
      </div>
      <div className="_x_extension_shortcut_editor_actions_2024_unique_">
        <button
          className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_secondary_2024_unique_"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          {copy.cancelLabel}
        </button>
        <button
          aria-busy={saving}
          className="_x_extension_shortcut_submit_2024_unique_ _x_extension_shortcut_submit_primary_2024_unique_ _x_extension_shortcut_save_2024_unique_"
          disabled={saving}
          onClick={async () => {
            const outcome = await saveAction.run(
              item.key,
              inputValue,
              matchModes
            );
            if (outcome.status === 'skipped') {
              return;
            }
            if (outcome.status === 'rejected') {
              setError(getAsyncErrorMessage(outcome.error));
              return;
            }
            const result = outcome.value;
            if (result.ok) {
              onCancel();
              return;
            }
            setError(result.error || '');
          }}
          type="button"
        >
          <BusyLabel busy={saving}>{copy.saveLabel}</BusyLabel>
        </button>
      </div>
      <div
        className="_x_extension_shortcut_error_2024_unique_"
        style={{ display: error ? 'block' : 'none' }}
      >
        {error}
      </div>
    </div>
  );
}

export function BlacklistList({
  model,
  onRemove,
  onSave
}: {
  model: BlacklistListRenderModel;
  onRemove(key: string): void | Promise<void>;
  onSave?: BlacklistSaveHandler;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <>
      {model.items.map((item) => {
        const expanded = model.editable && expandedKey === item.key;
        return (
          <div
            className="_x_extension_shortcut_item_2024_unique_"
            data-expanded={expanded ? 'true' : 'false'}
            data-rule-key={item.key}
            key={item.key}
          >
            <div className="_x_extension_shortcut_item_header_2024_unique_">
              <div className="_x_extension_shortcut_item_info_2024_unique_">
                <div className="_x_extension_shortcut_item_title_2024_unique_">
                  <div
                    className="_x_extension_shortcut_badge_2024_unique_"
                    data-tone={item.badgeTone}
                  >
                    {item.badgeText}
                  </div>
                  <span>{item.displayPattern}</span>
                </div>
              </div>
              <div className="_x_extension_shortcut_item_actions_2024_unique_">
                {model.editable ? (
                  <button
                    aria-label={model.copy.editLabel}
                    className="_x_extension_shortcut_edit_2024_unique_"
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpandedKey((value) => value === item.key ? null : item.key);
                    }}
                    type="button"
                  >
                    <RemixIcon name="ri-edit-line" />
                  </button>
                ) : null}
                <InlinePopconfirm
                  copy={{
                    cancelLabel: model.copy.cancelLabel,
                    confirmLabel: model.copy.confirmLabel,
                    message: model.copy.confirmMessage,
                    messageKey: model.copy.confirmMessageKey
                  }}
                  onConfirm={() => onRemove(item.key)}
                  triggerAriaLabel={model.copy.removeLabel}
                  triggerClassName="_x_extension_shortcut_remove_2024_unique_"
                  triggerIconName="ri-delete-bin-4-line"
                />
              </div>
            </div>
            {model.editable && onSave ? (
              <BlacklistEditor
                copy={model.copy}
                item={item}
                onCancel={() => setExpandedKey(null)}
                onSave={onSave}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

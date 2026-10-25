export interface BodyCopyRenderModel {
  note: string;
  shortcutLabel: string;
  shortcutPlaceholder: string;
  shortcutTokens: string[];
  shortcutValue: string;
  value: string;
}

interface NormalizedBodyCopyModel extends BodyCopyRenderModel {
  shortcutTokens: string[];
}

function normalizeModel(model: BodyCopyRenderModel): NormalizedBodyCopyModel {
  const shortcutLabel = String(model.shortcutLabel || '');
  const shortcutTokens = Array.isArray(model.shortcutTokens)
    ? model.shortcutTokens.map((token) => String(token || ''))
    : [];

  return {
    note: String(model.note || ''),
    shortcutLabel,
    shortcutPlaceholder: String(model.shortcutPlaceholder || ''),
    shortcutTokens: shortcutTokens.length > 0
      ? shortcutTokens
      : (shortcutLabel ? [shortcutLabel] : []),
    shortcutValue: String(model.shortcutValue || ''),
    value: String(model.value || '')
  };
}

function ShortcutLabel({
  label,
  tokens,
  value
}: {
  label: string;
  tokens: string[];
  value: string;
}) {
  const hidden = !label;

  return (
    <span
      aria-label={hidden ? undefined : (value || label)}
      className="shortcut-label"
      hidden={hidden}
      id="onboarding-shortcut-label"
    >
      {hidden
        ? null
        : tokens.map((token, index) => {
            const minWidth = token.length > 1
              ? Math.max(24, Math.round(token.length * 7.5 + 14))
              : undefined;
            return (
              <span
                className="shortcut-keycap"
                key={`${token}-${index}`}
                style={minWidth ? { minWidth } : undefined}
              >
                {token}
              </span>
            );
          })}
    </span>
  );
}

function BodyCopyText({ model }: { model: NormalizedBodyCopyModel }) {
  const hasPlaceholder = Boolean(
    model.shortcutPlaceholder &&
      model.value.includes(model.shortcutPlaceholder)
  );
  const parts = hasPlaceholder
    ? model.value.split(model.shortcutPlaceholder)
    : [model.value];
  const prefix = parts[0] || '';
  const suffix = hasPlaceholder
    ? parts.slice(1).join(model.shortcutPlaceholder)
    : '';

  return (
    <>
      <span id="onboarding-body-prefix">{prefix}</span>
      <ShortcutLabel
        label={hasPlaceholder ? model.shortcutLabel : ''}
        tokens={model.shortcutTokens}
        value={model.shortcutValue}
      />
      <span id="onboarding-body-suffix">{suffix}</span>
      <span className="body-note" id="onboarding-body-note">
        {model.note}
      </span>
    </>
  );
}

// The slide's body: its text around the search shortcut, then a note.
export function BodyCopy({ model, className }: { model: BodyCopyRenderModel; className?: string }) {
  const normalizedModel = normalizeModel(model);
  return (
    <p
      className={['body-copy', className].filter(Boolean).join(' ')}
      data-empty={normalizedModel.value || normalizedModel.note ? 'false' : 'true'}
      id="onboarding-body"
    >
      <BodyCopyText model={normalizedModel} />
    </p>
  );
}

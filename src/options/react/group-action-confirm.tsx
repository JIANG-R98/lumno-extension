import { InlinePopconfirm } from './inline-popconfirm';

// A group header action that asks first, such as clearing or resetting a list.
export interface GroupActionConfirmModel {
  label: string;
  confirmMessage: string;
  confirmMessageKey: string;
  cancelLabel: string;
  confirmLabel: string;
}

export function GroupActionConfirm({
  id,
  model,
  iconClass,
  disabled = false,
  onConfirm
}: {
  id: string;
  model: GroupActionConfirmModel;
  // The Remix icon class, such as ri-delete-bin-4-line.
  iconClass: string;
  disabled?: boolean;
  onConfirm(): void | Promise<void>;
}) {
  return (
    <InlinePopconfirm
      copy={{
        cancelLabel: model.cancelLabel,
        confirmLabel: model.confirmLabel,
        message: model.confirmMessage,
        messageKey: model.confirmMessageKey
      }}
      onConfirm={onConfirm}
      triggerAriaLabel={model.label}
      triggerClassName="_x_extension_shortcut_group_action_2024_unique_"
      triggerDisabled={disabled}
      triggerIconClass={`ri-icon ri-size-14 ${iconClass}`}
      triggerId={id}
      triggerTooltip={model.label}
    />
  );
}

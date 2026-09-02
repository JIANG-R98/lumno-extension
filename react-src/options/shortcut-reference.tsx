import { Fragment } from 'react';
import {
  createReactRootController,
  type ReactRootController
} from '../shared/root-controller';

export interface ShortcutReferenceItemModel {
  commandName: string;
  editable: boolean;
  id: string;
  shortcutEmpty: boolean;
  shortcutLabel: string;
  title: string;
  titleKey: string;
}

export interface ShortcutReferenceGroupModel {
  id: string;
  items: ShortcutReferenceItemModel[];
  title: string;
  titleKey: string;
}

export interface ShortcutReferenceRenderModel {
  groups: ShortcutReferenceGroupModel[];
}

export type ShortcutReferenceController =
  ReactRootController<ShortcutReferenceRenderModel>;

function ShortcutReference({ model }: { model: ShortcutReferenceRenderModel }) {
  return (
    <>
      {model.groups.map((group) => (
        <Fragment key={group.id}>
          <div
            className="_x_extension_shortcut_reference_group_title_2026_unique_"
            data-i18n={group.titleKey}
            data-shortcut-group={group.id}
          >
            {group.title}
          </div>
          {group.items.map((item) => (
            <div
              className="_x_extension_setting_row_2024_unique_ _x_extension_setting_row_compact_2024_unique_ _x_extension_shortcut_reference_item_2026_unique_"
              data-shortcut-command={item.commandName}
              data-shortcut-editable={item.editable ? 'true' : 'false'}
              data-shortcut-id={item.id}
              key={item.id}
            >
              <div>
                <p
                  className="_x_extension_setting_title_2024_unique_"
                  data-i18n={item.titleKey}
                >
                  {item.title}
                </p>
              </div>
              <div className="_x_extension_shortcut_reference_actions_2026_unique_">
                <div
                  className="_x_extension_shortcut_reference_key_field_2026_unique_"
                  data-empty={item.shortcutEmpty ? 'true' : undefined}
                >
                  {item.shortcutLabel}
                </div>
              </div>
            </div>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export function createShortcutReferenceController(
  host: HTMLElement | null
): ShortcutReferenceController {
  if (host) {
    host.dataset.reactIsland = 'options-shortcut-reference';
  }
  return createReactRootController(
    host,
    (model: ShortcutReferenceRenderModel) => (
      <ShortcutReference model={model} />
    )
  );
}

export function createShortcutReferenceApi() {
  return Object.freeze({
    implementation: 'react',
    createShortcutReferenceController
  });
}

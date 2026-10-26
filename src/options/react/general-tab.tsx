import { Fragment, type ReactNode } from 'react';
import { GeneralGlobalSection, type GeneralGlobalSectionHandlers, type GeneralGlobalSectionModel } from './general-global-section';
import {
  GeneralShortcutsSection,
  type GeneralShortcutsSectionHandlers,
  type GeneralShortcutsSectionModel
} from './general-shortcuts-section';
import { createReactRootController, type ReactRootController } from '../../shared/react/root-controller';
import type { SectionPart } from './section-part';
import { SettingDivider } from './setting-rows';
import { SettingsRows, type SettingsRowsHandlers, type SettingsSectionModel } from './settings-rows-view';

// Each section is null until its module first draws it.
export interface GeneralTabModel {
  global: SectionPart<GeneralGlobalSectionModel, GeneralGlobalSectionHandlers> | null;
  features: SectionPart<SettingsSectionModel, SettingsRowsHandlers> | null;
  search: SectionPart<SettingsSectionModel, SettingsRowsHandlers> | null;
  overlay: SectionPart<SettingsSectionModel, SettingsRowsHandlers> | null;
  newtab: SectionPart<SettingsSectionModel, SettingsRowsHandlers> | null;
  shortcuts: SectionPart<GeneralShortcutsSectionModel, GeneralShortcutsSectionHandlers> | null;
}

function rows(part: GeneralTabModel['features']): ReactNode {
  return part ? <SettingsRows handlers={part.handlers} rows={part.model.rows} /> : null;
}

export function GeneralTab({ model }: { model: GeneralTabModel }) {
  const sections: Array<[string, ReactNode]> = [
    ['global', model.global ? <GeneralGlobalSection handlers={model.global.handlers} model={model.global.model} /> : null],
    ['features', rows(model.features)],
    ['search', rows(model.search)],
    ['overlay', rows(model.overlay)],
    ['newtab', rows(model.newtab)],
    ['shortcuts', model.shortcuts ? <GeneralShortcutsSection handlers={model.shortcuts.handlers} model={model.shortcuts.model} /> : null]
  ];
  // Sections not drawn yet take no divider.
  return (
    <>
      {sections.filter(([, section]) => section !== null).map(([key, section], index) => (
        <Fragment key={key}>
          {index > 0 ? <SettingDivider /> : null}
          {section}
        </Fragment>
      ))}
    </>
  );
}

export type GeneralTabController = ReactRootController<GeneralTabModel>;

export function createGeneralTabController(host: HTMLElement | null): GeneralTabController {
  if (host) {
    host.dataset.reactIsland = 'options-general-tab';
  }
  return createReactRootController(host, (model: GeneralTabModel) => <GeneralTab model={model} />);
}

export function createGeneralTabApi() {
  return Object.freeze({
    implementation: 'react',
    createGeneralTabController
  });
}

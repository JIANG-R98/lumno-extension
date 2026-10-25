import { Fragment, type ReactNode } from 'react';
import { AppearanceGlobalSection, type AppearanceGlobalSectionHandlers, type AppearanceGlobalSectionModel } from './appearance-global-section';
import {
  AppearanceNewtabLayoutSection,
  type AppearanceNewtabLayoutSectionHandlers,
  type AppearanceNewtabLayoutSectionModel
} from './appearance-newtab-layout-section';
import {
  AppearanceOverlaySection,
  type AppearanceOverlaySectionHandlers,
  type AppearanceOverlaySectionModel
} from './appearance-overlay-section';
import { DailyQuoteSection, type DailyQuoteSectionHandlers, type DailyQuoteSectionModel } from './daily-quote-section';
import { createReactRootController, type ReactRootController } from '../../shared/react/root-controller';
import type { SectionPart } from './section-part';
import { SettingDivider } from './setting-rows';
import { SettingsRows, type SettingsRowsHandlers, type SettingsSectionModel } from './settings-rows-view';

// Each part is null until its module first draws it. The New Tab look,
// daily quote and layout rows make up one section, under one title.
export interface AppearanceTabModel {
  global: SectionPart<AppearanceGlobalSectionModel, AppearanceGlobalSectionHandlers> | null;
  overlay: SectionPart<AppearanceOverlaySectionModel, AppearanceOverlaySectionHandlers> | null;
  newtabLook: SectionPart<SettingsSectionModel, SettingsRowsHandlers> | null;
  dailyQuote: SectionPart<DailyQuoteSectionModel, DailyQuoteSectionHandlers> | null;
  newtabLayout: SectionPart<AppearanceNewtabLayoutSectionModel, AppearanceNewtabLayoutSectionHandlers> | null;
}

export function AppearanceTab({ model }: { model: AppearanceTabModel }) {
  const { global, overlay, newtabLook, dailyQuote, newtabLayout } = model;
  const newtab: ReactNode[] = [
    newtabLook ? <SettingsRows handlers={newtabLook.handlers} key="look" rows={newtabLook.model.rows} /> : null,
    dailyQuote ? <DailyQuoteSection handlers={dailyQuote.handlers} key="quote" model={dailyQuote.model} /> : null,
    newtabLayout ? <AppearanceNewtabLayoutSection handlers={newtabLayout.handlers} key="layout" model={newtabLayout.model} /> : null
  ].filter((part) => part !== null);
  const sections: Array<[string, ReactNode]> = [
    ['global', global ? <AppearanceGlobalSection handlers={global.handlers} model={global.model} /> : null],
    ['overlay', overlay ? <AppearanceOverlaySection handlers={overlay.handlers} model={overlay.model} /> : null],
    ['newtab', newtab.length ? newtab : null]
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

export type AppearanceTabController = ReactRootController<AppearanceTabModel>;

export function createAppearanceTabController(host: HTMLElement | null): AppearanceTabController {
  if (host) {
    host.dataset.reactIsland = 'options-appearance-tab';
  }
  return createReactRootController(host, (model: AppearanceTabModel) => <AppearanceTab model={model} />);
}

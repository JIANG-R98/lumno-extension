// The Appearance tab drawn as one React view. Each section module draws its
// part through the view this hands it, the way it would draw a view of its
// own; the tab redraws whenever one of them does.
import type { AppearanceGlobalSectionHandlers, AppearanceGlobalSectionModel } from './react/appearance-global-section';
import type {
  AppearanceNewtabLayoutSectionHandlers,
  AppearanceNewtabLayoutSectionModel
} from './react/appearance-newtab-layout-section';
import type { AppearanceOverlaySectionHandlers, AppearanceOverlaySectionModel } from './react/appearance-overlay-section';
import type { AppearanceTabController, AppearanceTabModel } from './react/appearance-tab';
import type { DailyQuoteSectionHandlers, DailyQuoteSectionModel } from './react/daily-quote-section';
import type { SettingsRowsHandlers, SettingsSectionModel } from './react/settings-rows-view';
import type { SectionView } from './options-section-view';

function createAppearanceTab(controller: Pick<AppearanceTabController, 'render'>) {
  const model: AppearanceTabModel = { global: null, overlay: null, newtabLook: null, dailyQuote: null, newtabLayout: null };
  const render = (): void => controller.render({ ...model });

  return {
    global(handlers: AppearanceGlobalSectionHandlers): SectionView<AppearanceGlobalSectionModel> {
      return {
        render(next) {
          model.global = { model: next, handlers };
          render();
        },
        destroy() {
          model.global = null;
          render();
        }
      };
    },
    overlay(handlers: AppearanceOverlaySectionHandlers): SectionView<AppearanceOverlaySectionModel> {
      return {
        render(next) {
          model.overlay = { model: next, handlers };
          render();
        },
        destroy() {
          model.overlay = null;
          render();
        }
      };
    },
    newtabLook(handlers: SettingsRowsHandlers): SectionView<SettingsSectionModel> {
      return {
        render(next) {
          model.newtabLook = { model: next, handlers };
          render();
        },
        destroy() {
          model.newtabLook = null;
          render();
        }
      };
    },
    dailyQuote(handlers: DailyQuoteSectionHandlers): SectionView<DailyQuoteSectionModel> {
      return {
        render(next) {
          model.dailyQuote = { model: next, handlers };
          render();
        },
        destroy() {
          model.dailyQuote = null;
          render();
        }
      };
    },
    newtabLayout(handlers: AppearanceNewtabLayoutSectionHandlers): SectionView<AppearanceNewtabLayoutSectionModel> {
      return {
        render(next) {
          model.newtabLayout = { model: next, handlers };
          render();
        },
        destroy() {
          model.newtabLayout = null;
          render();
        }
      };
    }
  };
}

export { createAppearanceTab };

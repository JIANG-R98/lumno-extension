// The General tab drawn as one React view. Each section module draws its
// part through the view this hands it, the way it would draw a view of its
// own; the tab redraws whenever one of them does.
import type { GeneralGlobalSectionHandlers, GeneralGlobalSectionModel } from './react/general-global-section';
import type { GeneralShortcutsSectionHandlers, GeneralShortcutsSectionModel } from './react/general-shortcuts-section';
import type { GeneralTabController, GeneralTabModel } from './react/general-tab';
import type { SettingsRowsHandlers, SettingsSectionModel } from './react/settings-rows-view';
import type { SectionView } from './options-section-view';

function createGeneralTab(controller: Pick<GeneralTabController, 'render'>) {
  const model: GeneralTabModel = { global: null, features: null, search: null, overlay: null, newtab: null, shortcuts: null };
  const render = (): void => controller.render({ ...model });

  function rowsView(
    key: 'features' | 'search' | 'overlay' | 'newtab',
    handlers: SettingsRowsHandlers
  ): SectionView<SettingsSectionModel> {
    return {
      render(next) {
        model[key] = { model: next, handlers };
        render();
      },
      destroy() {
        model[key] = null;
        render();
      }
    };
  }

  return {
    global(handlers: GeneralGlobalSectionHandlers): SectionView<GeneralGlobalSectionModel> {
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
    features: (handlers: SettingsRowsHandlers) => rowsView('features', handlers),
    search: (handlers: SettingsRowsHandlers) => rowsView('search', handlers),
    overlay: (handlers: SettingsRowsHandlers) => rowsView('overlay', handlers),
    newtab: (handlers: SettingsRowsHandlers) => rowsView('newtab', handlers),
    shortcuts(handlers: GeneralShortcutsSectionHandlers): SectionView<GeneralShortcutsSectionModel> {
      return {
        render(next) {
          model.shortcuts = { model: next, handlers };
          render();
        },
        destroy() {
          model.shortcuts = null;
          render();
        }
      };
    }
  };
}

export { createGeneralTab };

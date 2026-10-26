// The top of the General tab: help and feedback with the licenses link, the
// onboarding guide, the page's language and the update notice. One React
// view draws it; the feedback and translation help sections hand it their
// models, and the language module reports the language it applied.
import type * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import * as LumnoMessaging from '../platform/messaging';
import type { MessageRuntime } from '../platform/messaging';
import { createSectionSetting, type SectionSettingBinder } from './options-section-setting';
import type { SectionView } from './options-section-view';
import type { GetMessage } from './options-types';
import type { FeedbackSupportRenderModel } from './react/feedback-support';
import type { GeneralGlobalSectionHandlers, GeneralGlobalSectionModel } from './react/general-global-section';
import type { TranslationHelpRenderModel } from './react/translation-help';

interface GeneralGlobalSectionDeps {
  // Draws the section; the General tab hands over its part of the tab's view.
  view(handlers: GeneralGlobalSectionHandlers): SectionView<GeneralGlobalSectionModel>;
  storageArea: { set(items: StorageItems): unknown } | null;
  SETTINGS: Pick<typeof Settings,
    'updateNoticeEnabled' | 'UI_LOCALES' | 'updateNoticeEnabled' | 'isMachineTranslatedLocale'>;
  runtime: MessageRuntime & { lastError?: { message?: string } | null };
  getMessage: GetMessage;
  showToast(message: string, isError?: boolean): void;
  // Applies and saves a language chosen in the picker.
  applyLanguage(mode: string): void;
  getViewportTopInset(): number;
}

const LANGUAGE_SELECT_ID = '_x_extension_language_select_2024_unique_';

function createGeneralGlobalSection(deps: GeneralGlobalSectionDeps) {
  const {
    view,
    storageArea,
    SETTINGS,
    runtime,
    getMessage,
    showToast,
    applyLanguage,
    getViewportTopInset
  } = deps;

  const render = (): void => controller.render(getModel());
  const updateNotice = createSectionSetting({
    storageKey: SETTINGS.updateNoticeEnabled.key,
    normalize: SETTINGS.updateNoticeEnabled.parse,
    refreshSelects: true
  }, storageArea, () => render());
  let feedback: FeedbackSupportRenderModel | null = null;
  let translationHelp: TranslationHelpRenderModel | null = null;
  let licensesHref = '';
  let languageMode = 'system';
  let languageLocale = '';

  const controller = view({
    onOpenOnboarding() {
      LumnoMessaging.sendBackgroundMessage(runtime, { action: 'openOnboardingPage' }, (response) => {
        if (runtime.lastError || !response || response.ok === false) {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        }
      });
    },
    onLanguage(mode) {
      applyLanguage(mode || 'system');
    },
    onUpdateNotice(checked) {
      updateNotice.change(checked);
    },
    getViewportTopInset
  });

  function getModel(): GeneralGlobalSectionModel {
    // Each language is listed in its own words, so the names are not translated.
    const locales = SETTINGS.UI_LOCALES.map((locale) => ({ value: locale.htmlLang, label: locale.name, labelKey: '' }));
    const known = languageMode === 'system' || locales.some((item) => item.value === languageMode);
    return {
      feedback,
      title: getMessage('settings_global_section_title', '全局设置'),
      licenses: {
        label: getMessage('settings_feedback_support_licenses_action', '开源许可'),
        href: licensesHref || 'https://github.com/kubai087/lumno-extension/blob/main/THIRD_PARTY_NOTICES.md'
      },
      onboardingLabel: getMessage('settings_onboarding_tutorial_action', '新手引导'),
      language: {
        title: getMessage('settings_language_title', '语言'),
        machineNote: getMessage('settings_language_machine_note', '此语言由 AI 翻译，如有不准确之处，欢迎反馈。'),
        showMachineNote: Boolean(languageLocale) && SETTINGS.isMachineTranslatedLocale(languageLocale),
        translationHelp,
        select: {
          id: LANGUAGE_SELECT_ID,
          labelledBy: `${LANGUAGE_SELECT_ID}_title`,
          value: known ? languageMode : 'system',
          searchPlaceholder: getMessage('settings_language_search_placeholder', '搜索语言'),
          emptyLabel: getMessage('settings_language_no_results', '没有匹配的语言'),
          items: [
            { value: 'system', labelKey: 'language_system', label: getMessage('language_system', '跟随浏览器语言') },
            ...locales
          ]
        }
      },
      updateNotice: {
        title: getMessage('settings_update_notice_title', '更新提示'),
        info: getMessage('settings_update_notice_desc', '更新到新版本时显示新功能组件'),
        toggle: { id: '_x_extension_update_notice_toggle_2026_unique_', checked: updateNotice.get() }
      }
    };
  }

  function bindSettings(settingBinder: SectionSettingBinder): void {
    updateNotice.bind(settingBinder);
  }

  // The language the page now shows: the picker's choice and the locale it
  // resolved to, which decides the AI translation note.
  function setLanguage(mode: string, locale: string): void {
    languageMode = mode;
    languageLocale = locale;
    render();
  }

  render();

  return {
    render,
    bindSettings,
    setLanguage,
    destroy: () => controller.destroy(),
    feedback: {
      render(model: FeedbackSupportRenderModel) {
        feedback = model;
        render();
      }
    },
    translationHelp: {
      render(model: TranslationHelpRenderModel) {
        translationHelp = model;
        render();
      }
    },
    // The feedback section sets the licenses page it links to.
    licensesLink: {
      get href(): string {
        return licensesHref;
      },
      set href(value: string) {
        licensesHref = value;
        render();
      }
    }
  };
}

export { createGeneralGlobalSection };
export type { GeneralGlobalSectionDeps };

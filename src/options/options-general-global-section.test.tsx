import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Settings from '../domain/settings';
import { createGeneralGlobalSection } from './options-general-global-section';
import { createGeneralGlobalSectionController } from './react/general-global-section';
import { getElement, getTag, getTags } from '../../tests/react/dom';
import { createOptionsTestSettings } from '../../tests/react/options-settings';

const sections: Array<{ destroy(): void }> = [];

const LANGUAGE_SELECT = '_x_extension_language_select_2024_unique_';

function setUp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settings = createOptionsTestSettings();
  const sent: unknown[] = [];
  const applyLanguage = vi.fn();
  const section = createGeneralGlobalSection({
    view: (handlers) => createGeneralGlobalSectionController(host, handlers),
    settingsStore: settings.store,
    SETTINGS: Settings,
    runtime: {
      lastError: null,
      sendMessage(message: unknown, callback?: (reply: unknown) => void) {
        sent.push(message);
        if (callback) {
          callback({ ok: true });
        }
      }
    },
    getMessage: (_key, fallback) => fallback,
    showToast: vi.fn(),
    applyLanguage,
    getViewportTopInset: () => 0
  });
  sections.push(section);
  section.bindSettings(settings.binder);
  return { host, writes: settings.writes, sent, applyLanguage, section, settings };
}

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options General global section', () => {
  it('lists every language in its own words after following the browser', () => {
    const { host } = setUp();
    const options = getTags(host, `#${LANGUAGE_SELECT} option`, 'option').map((option) => [option.value, option.textContent]);
    expect(options[0]).toEqual(['system', '跟随浏览器语言']);
    expect(options.slice(1)).toEqual(Settings.UI_LOCALES.map((locale) => [locale.htmlLang, locale.name]));
  });

  it('shows the applied language, and a dropped one as following the browser', () => {
    const { host, section } = setUp();
    act(() => section.setLanguage('ja', 'ja'));
    expect(getTag(host, `#${LANGUAGE_SELECT}`, 'select').value).toBe('ja');
    act(() => section.setLanguage('it', 'en'));
    expect(getTag(host, `#${LANGUAGE_SELECT}`, 'select').value).toBe('system');
  });

  it('notes an AI-translated language under the picker', () => {
    const { host, section } = setUp();
    const note = getElement(host, '#_x_extension_language_machine_note_2026_unique_');
    const machine = Settings.UI_LOCALES.find((locale) => Settings.isMachineTranslatedLocale(locale.htmlLang));
    const human = Settings.UI_LOCALES.find((locale) => !Settings.isMachineTranslatedLocale(locale.htmlLang));
    expect(machine && human).toBeTruthy();
    act(() => section.setLanguage(human?.htmlLang || '', human?.htmlLang || ''));
    expect(note.hidden).toBe(true);
    act(() => section.setLanguage(machine?.htmlLang || '', machine?.htmlLang || ''));
    expect(note.hidden).toBe(false);
  });

  it('applies a language chosen in the picker', async () => {
    const { host, applyLanguage } = setUp();
    const frame = getElement(host, `[data-select="${LANGUAGE_SELECT}"]`);
    await act(async () => {
      getTag(frame, '._x_extension_select_trigger_2024_unique_', 'button').click();
    });
    await act(async () => {
      getElement(frame, '[data-value="en"]').click();
    });
    expect(applyLanguage).toHaveBeenCalledWith('en');
  });

  it('draws the feedback and translation help its sections hand over, and the licenses page link', () => {
    const { host, section } = setUp();
    expect(getElement(host, '#_x_extension_feedback_support_2026_unique_').childElementCount).toBe(0);
    act(() => section.translationHelp.render({ visible: true, actionLabel: '改进翻译' }));
    expect(getElement(host, '#_x_extension_translation_help_2026_unique_').textContent).toContain('改进翻译');
    act(() => {
      section.licensesLink.href = 'https://example.test/licenses';
    });
    expect(getTag(host, '#_x_extension_open_licenses_2026_unique_', 'a').href).toBe('https://example.test/licenses');
  });

  it('puts the onboarding guide beside the Help Center card and opens it', () => {
    const { host, sent, section } = setUp();
    act(() => section.feedback.render({
      heading: '反馈与支持',
      headingKey: 'settings_feedback_support_section_title',
      help: {
        href: 'https://example.test/help/',
        label: '访问帮助中心',
        labelKey: 'settings_help_center_action',
        title: '帮助中心',
        titleKey: 'settings_help_center_title'
      },
      items: []
    }));
    const guide = getTag(host, '#_x_extension_open_onboarding_page_2026_unique_', 'button');
    expect(guide.parentElement?.lastElementChild).toBe(guide);
    expect(guide.closest('nav._x_extension_feedback_support_links_2026_unique_')).not.toBeNull();
    act(() => guide.click());
    expect(sent).toEqual([{ action: 'openOnboardingPage' }]);
  });

  it('keeps the update notice on by default and saves a change', async () => {
    const { host, writes, settings } = setUp();
    expect(settings.boundKeys()).toEqual([Settings.updateNoticeEnabled.key]);
    const toggle = getTag(host, '#_x_extension_update_notice_toggle_2026_unique_', 'input');
    expect(toggle.checked).toBe(true);
    act(() => toggle.click());
    await settings.settle();
    expect(writes).toEqual([{ [Settings.updateNoticeEnabled.key]: false }]);
  });
});

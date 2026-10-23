// "Improve translation" next to the language picker: lets native speakers
// report a wrong string on a prefilled GitHub issue form, or download every
// UI string as a spreadsheet, fill in a "Suggestion" column and attach it.
// scripts/i18n/import-sheet.js merges a returned spreadsheet.

// Lumno is written in Simplified Chinese, so there is nothing to improve there.
const SOURCE_LOCALE = 'zh_CN';
const ISSUE_TEMPLATE = 'translation.yml';

// English is the column translators read beside their own language; English
// and Traditional Chinese read the Simplified Chinese it was written in.
function getTranslationReferenceLocale(locale) {
  return locale === 'en' || locale === 'zh_TW' ? SOURCE_LOCALE : 'en';
}

function getLocaleName(uiLocales, locale) {
  const entry = (uiLocales || []).find((item) => item.id === locale);
  return entry ? entry.name : locale;
}

//   issueUrl (the repository's new-issue URL), locale, languageName, version
function buildTranslationIssueUrl(input) {
  let url;
  try {
    url = new URL(input.issueUrl);
  } catch (error) {
    return '';
  }
  const language = `${input.languageName} (${input.locale})`;
  url.searchParams.set('template', ISSUE_TEMPLATE);
  url.searchParams.set('title', `[Translation] ${input.languageName}: `);
  url.searchParams.set('language', language);
  if (input.version) {
    url.searchParams.set('version', input.version);
  }
  return url.toString();
}

function escapeCsvField(value) {
  const text = String(value === undefined || value === null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function getMessageText(messages, key) {
  const entry = messages && messages[key];
  return entry && typeof entry.message === 'string' ? entry.message : '';
}

// One row per string, in the reference file's order. The BOM makes Excel
// read the file as UTF-8.
//   headers: { reference, current, suggestion, note }
//   referenceMessages, currentMessages: messages.json objects
function buildTranslationSheetCsv(input) {
  const { headers, referenceMessages, currentMessages } = input;
  const rows = [['ID', headers.reference, headers.current, headers.suggestion, headers.note]];
  Object.keys(referenceMessages || {}).forEach((key) => {
    rows.push([key, getMessageText(referenceMessages, key), getMessageText(currentMessages, key), '', '']);
  });
  return `\uFEFF${rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`;
}

function downloadTextFile(documentObj, fileName, text, type) {
  const view = documentObj.defaultView;
  const blob = new view.Blob([text], { type });
  const url = view.URL.createObjectURL(blob);
  const link = documentObj.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  documentObj.body.appendChild(link);
  link.click();
  link.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
}

//   getMessage(key, fallback), formatTemplate(template, values), locale,
//   uiLocales, issueUrl, version, onDownload
function buildTranslationHelpModel(input) {
  const { getMessage, locale } = input;
  if (!locale || locale === SOURCE_LOCALE) {
    return { visible: false };
  }
  const languageName = getLocaleName(input.uiLocales, locale);
  return {
    visible: true,
    actionLabel: getMessage('settings_translation_help_action', '改进翻译'),
    actionLabelKey: 'settings_translation_help_action',
    closeLabel: getMessage('newtab_feedback_wechat_close_tooltip', '关闭'),
    description: getMessage('settings_translation_help_desc', '看到不准确或不自然的译文？告诉我们是哪一句，或者下载全部文案，直接在表格里改。'),
    downloadHint: getMessage('settings_translation_help_download_hint', '用 Excel 或 Google 表格打开，在「建议译文」一列写下修改，再把文件拖进「报告问题」页面提交。'),
    downloadLabel: getMessage('settings_translation_help_download_action', '下载翻译表格'),
    onDownload: input.onDownload,
    reportHref: buildTranslationIssueUrl({
      issueUrl: input.issueUrl,
      languageName,
      locale,
      version: input.version
    }),
    reportLabel: getMessage('settings_translation_help_report_action', '报告问题'),
    title: input.formatTemplate(
      getMessage('settings_translation_help_title', '帮助改进{language}翻译'),
      { language: languageName }
    )
  };
}

//   controller            the React controller (may be null)
//   getMessage, formatTemplate, getLocale(), getIssueUrl(), version,
//   uiLocales, loadLocaleMessages(locale) -> Promise<messages>, documentObj
function createTranslationHelpSection(options) {
  let downloading = null;

  function download() {
    if (downloading) {
      return downloading;
    }
    const locale = options.getLocale();
    const referenceLocale = getTranslationReferenceLocale(locale);
    downloading = Promise.all([
      options.loadLocaleMessages(referenceLocale),
      options.loadLocaleMessages(locale)
    ]).then(([referenceMessages, currentMessages]) => {
      const csv = buildTranslationSheetCsv({
        currentMessages,
        headers: {
          current: getLocaleName(options.uiLocales, locale),
          note: options.getMessage('settings_translation_help_sheet_note', '备注'),
          reference: getLocaleName(options.uiLocales, referenceLocale),
          suggestion: options.getMessage('settings_translation_help_sheet_suggestion', '建议译文')
        },
        referenceMessages
      });
      downloadTextFile(options.documentObj, `lumno-translation-${locale}.csv`, csv, 'text/csv;charset=utf-8');
    }).finally(() => {
      downloading = null;
    });
    return downloading;
  }

  function render() {
    if (!options.controller) {
      return;
    }
    options.controller.render(buildTranslationHelpModel({
      formatTemplate: options.formatTemplate,
      getMessage: options.getMessage,
      issueUrl: options.getIssueUrl(),
      locale: options.getLocale(),
      onDownload: download,
      uiLocales: options.uiLocales,
      version: options.version
    }));
  }

  return Object.freeze({ download, render });
}

export {
  buildTranslationHelpModel,
  buildTranslationIssueUrl,
  buildTranslationSheetCsv,
  createTranslationHelpSection,
  getTranslationReferenceLocale
};

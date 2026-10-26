// Searches the help center's own index (lumno.kubai.design/<locale>/help/search-index.json)
// and synonym list (search-synonyms.json). The help center's search box and the extension's
// help center site search both run this search, so both list the same pages; keep this
// folder in step with the help center's copy. The extension's copy adds
// buildFeedbackSuggestions and createSuggestionSource.
import { prepareIndex, prepareSynonyms } from './index-build';
import { planQuery } from './query';
import { matchExactly, recommend } from './score';
import type { FeedbackConfig, FeedbackLinks, HelpArticleSuggestion, HelpFeedbackSuggestion, HelpSearchOptions, HelpSearchResponse, HelpSearchResult, SuggestionSourceOptions } from './types';

const RESULT_LIMIT = 6;

function toUrl(origin: string, href: string): string {
  return /^https?:\/\//i.test(href) ? href : `${origin}${href}`;
}

// Exact matches first; when they leave room, the closest pages follow as recommended reading.
function searchIndex(index: unknown, query: unknown, options?: HelpSearchOptions | null): HelpSearchResult[] {
  const settings: HelpSearchOptions = options && typeof options === 'object' ? options : {};
  const origin = String(settings.origin || '');
  const limit = Number.isFinite(Number(settings.limit)) ? Number(settings.limit) : RESULT_LIMIT;
  const docs = prepareIndex(index);
  if (!String(query || '').trim() || !docs.length) {
    return [];
  }
  const plan = planQuery(query, prepareSynonyms(settings.synonyms), docs);
  const exact = matchExactly(docs, plan.terms).slice(0, limit);
  const recommended = exact.length < limit
    ? recommend(docs, plan.rewrites, new Set(exact.map((item) => item.doc))).slice(0, limit - exact.length)
    : [];
  return [...exact, ...recommended].map((item) => {
    const result: HelpSearchResult = {
      title: item.doc.title,
      detail: item.detail,
      context: item.context,
      url: toUrl(origin, item.section ? `${item.doc.href}#${item.section.id}` : item.doc.href)
    };
    if (item.recommended) {
      result.recommended = true;
    }
    return result;
  });
}

// When nothing in the help center matches, the ways to ask instead: the WeChat group where
// that is the community channel, a GitHub issue and the author on X (no store rating here).
function buildFeedbackSuggestions(feedback: FeedbackConfig | null | undefined): HelpFeedbackSuggestion[] {
  const config = feedback && typeof feedback === 'object' ? feedback : null;
  if (!config) {
    return [];
  }
  const links: FeedbackLinks = config.links && typeof config.links === 'object' ? config.links : {};
  const t = typeof config.t === 'function' ? config.t : (_key: string, fallback: string) => fallback;
  const rows: Array<[string, string, string] | null> = [
    config.channel === 'wechat' && links.wechatQr
      ? ['community', links.wechatQr, t('settings_feedback_support_wechat_action', '加入反馈群')]
      : null,
    links.githubIssue
      ? ['github-issue', links.githubIssue, t('settings_feedback_support_github_issue_action', '创建 Issue')]
      : null,
    links.x
      ? ['contact-author', links.x, t('settings_feedback_support_contact_author_action', '联系作者')]
      : null
  ];
  return rows.filter((row): row is [string, string, string] => Boolean(row)).map(([feedbackKey, url, title]): HelpFeedbackSuggestion => ({
    type: 'helpFeedback',
    feedbackKey,
    title: String(title || ''),
    url: String(url)
  }));
}

function createSuggestionSource(options?: SuggestionSourceOptions | null) {
  const config: SuggestionSourceOptions = options && typeof options === 'object' ? options : {};
  const sendMessage = typeof config.sendMessage === 'function' ? config.sendMessage : () => false;
  const onUpdate = typeof config.onUpdate === 'function' ? config.onUpdate : () => {};
  let current: { key: string; items: Array<Partial<HelpSearchResult> | null>; failed?: boolean } = { key: '', items: [] };
  let pendingKey = '';

  // feedback ({ links, channel, t }) fills the list with ways to ask when nothing matched.
  function getSuggestions(
    query: unknown,
    locale: unknown,
    favicon: unknown,
    feedback?: FeedbackConfig | null
  ): Array<HelpArticleSuggestion | HelpFeedbackSuggestion> {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      return [];
    }
    const key = `${String(locale || '')}\n${trimmed}`;
    if (current.key !== key && pendingKey !== key) {
      pendingKey = key;
      const sent = sendMessage({
        action: 'getHelpCenterSearchResults',
        query: trimmed,
        locale: String(locale || '')
      }, (response?: HelpSearchResponse) => {
        if (pendingKey !== key) {
          return;
        }
        pendingKey = '';
        current = {
          key,
          items: response && Array.isArray(response.items) ? response.items : [],
          // An index that could not load says nothing about the help center's content.
          failed: !response || Boolean(response.reason)
        };
        onUpdate(query);
      });
      if (!sent) {
        pendingKey = '';
        current = { key, items: [], failed: true };
      }
    }
    if (current.key === key && !current.failed && current.items.length === 0) {
      return buildFeedbackSuggestions(feedback);
    }
    return current.items.map((item): HelpArticleSuggestion => {
      const context = item && item.context;
      return {
        type: 'helpArticle',
        title: String(item && item.title || ''),
        detail: String(item && item.detail || ''),
        url: String(item && item.url || ''),
        // The passage around the match, as blocks, for the row's hover card.
        context: Array.isArray(context) ? context : [],
        favicon: String(favicon || ''),
        recommended: Boolean(item && item.recommended)
      };
    }).filter((item) => item.title && item.url);
  }

  return Object.freeze({ getSuggestions });
}

export {
  RESULT_LIMIT,
  buildFeedbackSuggestions,
  createSuggestionSource,
  searchIndex,
  toUrl
};

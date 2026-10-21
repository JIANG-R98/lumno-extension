(function(root) {
  'use strict';

  // Site search providers: templates, local search scopes, the built-in
  // and help center providers, AI and search engine providers, and
  // normalizing, sanitizing and merging provider lists.
  function createSiteSearchProviders(deps) {
    const {
      normalizeHost,
      DEFAULT_SITE_SEARCH_PROVIDERS,
      getUrlHost,
      findSiteSearchProvider,
      siteSearchHostsMatch,
      getSiteSearchProviderHost
    } = deps;

    function normalizeSiteSearchTemplate(template) {
      if (!template) {
        return '';
      }
      return String(template)
        .trim()
        .replace(/\{\{\{s\}\}\}/g, '{query}')
        .replace(/\{s\}/g, '{query}')
        .replace(/\{searchTerms\}/g, '{query}');
    }

    const LOCAL_SEARCH_SOURCE_TYPES = new Set(['topSite', 'bookmark', 'history']);

    function normalizeLocalSearchScopeTrigger(value) {
      return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function findLocalSearchScope(input, rules) {
      const trigger = normalizeLocalSearchScopeTrigger(input);
      if (!trigger || !Array.isArray(rules)) {
        return null;
      }
      for (let i = 0; i < rules.length; i += 1) {
        const rule = rules[i];
        const sourceType = String(rule && rule.searchSourceType ? rule.searchSourceType : '').trim();
        if (!LOCAL_SEARCH_SOURCE_TYPES.has(sourceType) || !Array.isArray(rule.keys)) {
          continue;
        }
        const matchedKey = rule.keys.find((key) => normalizeLocalSearchScopeTrigger(key) === trigger);
        if (!matchedKey) {
          continue;
        }
        return {
          sourceType,
          trigger,
          key: String(matchedKey)
        };
      }
      return null;
    }

    const INTERACTIVE_SITE_SEARCH_SUBMIT_STRATEGIES = Object.freeze([
      'geminiPrompt',
      'chatgptPrompt',
      'doubaoPrompt',
      'qianwenQuery',
      'yuanbaoPrompt',
      'minimaxPrompt',
      'deepseekPrompt',
      'kimiPrompt'
    ]);

    const SITE_SEARCH_PROVIDER_DISPLAY_NAME_MESSAGES = Object.freeze({
      gpt: ['site_search_name_chatgpt', 'ChatGPT'],
      gm: ['site_search_name_gemini', 'Gemini'],
      dbai: ['site_search_name_doubao', 'Doubao'],
      qw: ['site_search_name_qianwen', 'Qianwen'],
      yb: ['site_search_name_yuanbao', 'Yuanbao'],
      mx: ['site_search_name_minimax', 'MiniMax'],
      ds: ['site_search_name_deepseek', 'DeepSeek'],
      kimi: ['site_search_name_kimi', 'Kimi'],
      metaso: ['site_search_name_metaso', 'Metaso AI Search'],
      bd: ['site_search_name_baidu', 'Baidu'],
      sg: ['site_search_name_sogou', 'Sogou'],
      sm: ['site_search_name_shenma', 'Shenma'],
      zh: ['site_search_name_zhihu', 'Zhihu'],
      db: ['site_search_name_douban', 'Douban'],
      jj: ['site_search_name_juejin', 'Juejin'],
      tb: ['site_search_name_taobao', 'Taobao'],
      tm: ['site_search_name_tmall', 'Tmall'],
      wx: ['site_search_name_wechat', 'WeChat Official Accounts'],
      wb: ['site_search_name_weibo', 'Weibo'],
      xhs: ['site_search_name_xiaohongshu', 'Xiaohongshu'],
      dy: ['site_search_name_douyin', 'Douyin'],
      jd: ['site_search_name_jd', 'JD.com'],
      zw: ['site_search_name_wikipedia', 'Wikipedia'],
      lm: ['site_search_name_lumno_help', 'Lumno Help Center']
    });

    const HELP_CENTER_SITE_SEARCH_PROVIDER_KEY = 'lm';
    const HELP_CENTER_HOST = 'lumno.kubai.design';

    function cloneSiteSearchProvider(provider) {
      return {
        ...(provider || {}),
        aliases: Array.isArray(provider && provider.aliases) ? provider.aliases.slice() : []
      };
    }

    function getSiteSearchProviderDisplayNameMessage(provider) {
      if (provider && provider._xIsCustom === true) {
        return null;
      }
      const key = String(provider && provider.key ? provider.key : '').toLowerCase();
      const mapping = SITE_SEARCH_PROVIDER_DISPLAY_NAME_MESSAGES[key];
      if (!mapping) {
        return null;
      }
      return {
        messageKey: mapping[0],
        fallback: mapping[1]
      };
    }

    // The built-in Lumno Help Center search, also after the person edits it, as long as it
    // still searches the help center: its results come from the site's own search index.
    function isHelpCenterSiteSearchProvider(provider) {
      if (!provider || provider._xIsAggregateSearch === true) {
        return false;
      }
      const key = String(provider.builtinKey || provider.key || '').toLowerCase();
      if (key !== HELP_CENTER_SITE_SEARCH_PROVIDER_KEY) {
        return false;
      }
      try {
        const url = new URL(String(provider.template || '').replace(/\{query\}/g, 'test'));
        return normalizeHost(url.hostname) === HELP_CENTER_HOST && url.pathname.startsWith('/help/');
      } catch (e) {
        return false;
      }
    }

    // Help Center links carry the interface language its results came from (lang=), since the
    // site otherwise follows the browser language for pages opened from the extension.
    function withHelpCenterLocale(url, provider, locale) {
      const lang = String(locale || '').trim().replace(/_/g, '-');
      if (!url || !lang || !isHelpCenterSiteSearchProvider(provider)) {
        return url;
      }
      try {
        const next = new URL(url);
        next.searchParams.set('lang', lang);
        return next.href;
      } catch (e) {
        return url;
      }
    }

    function getDefaultSiteSearchProviders() {
      return DEFAULT_SITE_SEARCH_PROVIDERS.map(cloneSiteSearchProvider);
    }

    function isInteractiveSiteSearchSubmitStrategy(strategy) {
      return INTERACTIVE_SITE_SEARCH_SUBMIT_STRATEGIES.includes(String(strategy || '').trim());
    }

    function hasOpenAndSubmitSiteSearchAction(provider) {
      return Boolean(
        provider &&
        String(provider.action || '').trim() === 'openAndSubmit'
      );
    }

    function isAiSiteSearchProvider(provider) {
      if (!provider) {
        return false;
      }
      if (String(provider.category || '').trim() === 'aiSearch') {
        return true;
      }
      if (hasOpenAndSubmitSiteSearchAction(provider)) {
        return true;
      }
      const template = normalizeSiteSearchTemplate(provider.template);
      return Boolean(template) && !template.includes('{query}');
    }

    const SEARCH_ENGINE_SITE_SEARCH_PROVIDER_KEYS = new Set([
      'bd',
      'bi',
      'gg',
      'kg',
      'ddg',
      'br',
      'eco',
      'sg',
      'yh',
      'yx',
      'sm'
    ]);

    function isRetiredSearchEngineState(searchEngineState) {
      const state = searchEngineState && typeof searchEngineState === 'object'
        ? searchEngineState
        : {};
      const stateId = String(state.id || '').trim().toLowerCase();
      const stateHost = normalizeHost(state.host) || getUrlHost(state.searchTemplate);
      return stateId === 'so' || stateHost === 'so.com' || stateHost.endsWith('.so.com');
    }

    function isSearchEngineSiteSearchProvider(provider) {
      if (!provider) {
        return false;
      }
      const category = String(provider.category || '').trim();
      if (category === 'searchEngine') {
        return true;
      }
      if (provider._xIsCustom === true) {
        return false;
      }
      const key = String(provider.key || '').trim().toLowerCase();
      return SEARCH_ENGINE_SITE_SEARCH_PROVIDER_KEYS.has(key);
    }

    function getSearchEngineSiteSearchProvider(searchEngineState, providers) {
      const state = searchEngineState && typeof searchEngineState === 'object'
        ? searchEngineState
        : {};
      const engineProviders = (Array.isArray(providers) ? providers : [])
        .filter(isSearchEngineSiteSearchProvider);
      const stateHost = normalizeHost(state.host) || getUrlHost(state.searchTemplate);
      const fallbackProvider = findSiteSearchProvider('google', engineProviders);
      if (isRetiredSearchEngineState(state)) {
        return fallbackProvider || null;
      }
      if (stateHost) {
        const hostMatch = engineProviders.find((provider) => siteSearchHostsMatch(
          stateHost,
          getSiteSearchProviderHost(provider)
        ));
        if (hostMatch) {
          return hostMatch;
        }
      }
      const stateName = String(state.name || '').trim().toLowerCase();
      if (stateName) {
        const nameMatch = engineProviders.find((provider) => (
          String(provider && provider.name || '').trim().toLowerCase() === stateName
        ));
        if (nameMatch) {
          return nameMatch;
        }
      }
      const stateId = String(state.id || '').trim().toLowerCase();
      if (stateId) {
        const aliasMatch = engineProviders.find((provider) => (
          Array.isArray(provider && provider.aliases) &&
          provider.aliases.some((alias) => String(alias || '').trim().toLowerCase() === stateId)
        ));
        if (aliasMatch) {
          return aliasMatch;
        }
      }
      const normalizedTemplate = normalizeSiteSearchTemplate(state.searchTemplate);
      if (!normalizedTemplate || !normalizedTemplate.includes('{query}')) {
        return fallbackProvider || null;
      }
      const keyToken = (stateId || stateHost || stateName || 'detected')
        .replace(/[^a-z0-9.-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'detected';
      const displayName = String(state.name || state.host || state.id || '').trim() || 'Search';
      return {
        key: `engine-${keyToken}`,
        aliases: stateId ? [stateId] : [],
        name: displayName,
        template: normalizedTemplate,
        category: 'searchEngine',
        _xIsDetectedSearchEngine: true
      };
    }

    function isInteractiveSiteSearchProvider(provider) {
      return Boolean(
        hasOpenAndSubmitSiteSearchAction(provider) &&
        isInteractiveSiteSearchSubmitStrategy(provider.submitStrategy)
      );
    }

    function normalizeSiteSearchProvider(item, baseProvider) {
      if (!item && !baseProvider) {
        return null;
      }
      const key = String((item && item.key) || (baseProvider && baseProvider.key) || '').trim();
      const template = normalizeSiteSearchTemplate(
        (item && item.template) || (baseProvider && baseProvider.template) || ''
      );
      if (!key || !template) {
        return null;
      }
      if (!template.includes('{query}') && !isAiSiteSearchProvider({
        ...(baseProvider || {}),
        ...(item || {}),
        key,
        template
      })) {
        return null;
      }
      const aliasSource = Array.isArray(item && item.aliases)
        ? item.aliases
        : (Array.isArray(baseProvider && baseProvider.aliases) ? baseProvider.aliases : []);
      const provider = {
        id: String((item && item.id) || (baseProvider && baseProvider.id) || '').trim(),
        key,
        aliases: aliasSource.filter(Boolean),
        name: String((item && item.name) || (baseProvider && baseProvider.name) || key).trim() || key,
        template,
        action: String((item && item.action) || (baseProvider && baseProvider.action) || '').trim(),
        submitStrategy: String(
          (item && item.submitStrategy) || (baseProvider && baseProvider.submitStrategy) || ''
        ).trim(),
        category: String(
          (item && item.category) || (baseProvider && baseProvider.category) || ''
        ).trim(),
        disabled: Boolean(item && item.disabled),
        disabledReason: String((item && item.disabledReason) || '').trim(),
        icon: String((item && item.icon) || (baseProvider && baseProvider.icon) || '').trim(),
        iconUrl: String((item && item.iconUrl) || (baseProvider && baseProvider.iconUrl) || '').trim()
      };
      const builtinKey = String(
        (item && item.builtinKey) || (baseProvider && baseProvider.builtinKey) || ''
      ).trim().toLowerCase();
      if (builtinKey) {
        provider.builtinKey = builtinKey;
      }
      return provider;
    }

    function sanitizeSiteSearchProviders(items, baseItems) {
      const baseMap = new Map((Array.isArray(baseItems) ? baseItems : []).map((item) => [
        String(item && item.key ? item.key : '').toLowerCase(),
        item
      ]));
      return (Array.isArray(items) ? items : [])
        .map((item) => {
          const key = String(item && item.key ? item.key : '').toLowerCase();
          const builtinKey = String(item && item.builtinKey ? item.builtinKey : '').toLowerCase();
          return normalizeSiteSearchProvider(item, baseMap.get(builtinKey || key));
        })
        .filter(Boolean);
    }

    function inheritSiteSearchProviderBehavior(provider, baseProvider) {
      if (!provider) {
        return provider;
      }
      return {
        ...provider,
        action: String(provider.action || (baseProvider && baseProvider.action) || '').trim(),
        submitStrategy: String(
          provider.submitStrategy || (baseProvider && baseProvider.submitStrategy) || ''
        ).trim()
      };
    }

    function mergeCustomProviders(baseItems, customItems) {
      const merged = [];
      const seen = new Set();
      const baseMap = new Map((baseItems || []).map((item) => [String(item && item.key ? item.key : '').toLowerCase(), item]));
      (customItems || []).forEach((item) => {
        if (item && item.disabled) {
          return;
        }
        const key = String(item && item.key ? item.key : '').toLowerCase();
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        const builtinKey = String(item && item.builtinKey ? item.builtinKey : '').toLowerCase();
        merged.push({
          ...inheritSiteSearchProviderBehavior(item, baseMap.get(builtinKey || key)),
          _xIsCustom: true
        });
      });
      (baseItems || []).forEach((item) => {
        const key = String(item && item.key ? item.key : '').toLowerCase();
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        merged.push(item);
      });
      return merged;
    }

    function buildSearchUrlFromTemplate(template, query) {
      const normalizedTemplate = normalizeSiteSearchTemplate(template);
      if (!normalizedTemplate) {
        return '';
      }
      if (!normalizedTemplate.includes('{query}')) {
        return normalizedTemplate;
      }
      return normalizedTemplate.replace(/\{query\}/g, encodeURIComponent(String(query || '')));
    }

    function buildBlacklistProbeUrlFromTemplate(template, query) {
      return buildSearchUrlFromTemplate(template, String(query || '').trim() || 'test');
    }

    return {
      normalizeSiteSearchTemplate,
      findLocalSearchScope,
      getSiteSearchProviderDisplayNameMessage,
      isHelpCenterSiteSearchProvider,
      withHelpCenterLocale,
      getDefaultSiteSearchProviders,
      isInteractiveSiteSearchSubmitStrategy,
      hasOpenAndSubmitSiteSearchAction,
      isAiSiteSearchProvider,
      isRetiredSearchEngineState,
      isSearchEngineSiteSearchProvider,
      getSearchEngineSiteSearchProvider,
      isInteractiveSiteSearchProvider,
      normalizeSiteSearchProvider,
      sanitizeSiteSearchProviders,
      inheritSiteSearchProviderBehavior,
      mergeCustomProviders,
      buildSearchUrlFromTemplate,
      buildBlacklistProbeUrlFromTemplate
    };
  }

  const api = Object.freeze({ createSiteSearchProviders });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtilsSiteSearchProviders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoProgressMatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  // Decides whether a page is a later episode, chapter or page of the work a
  // tracked card points to. It never guesses: when neither the URL nor the
  // title proves the two pages belong to the same work, the answer is no.

  // Query parameters that carry sharing, tracking or playback offsets rather
  // than which episode is shown.
  const NOISE_QUERY_KEYS = new Set([
    'spm_id_from', 'vd_source', 'from_spmid', 'share_source', 'share_medium',
    'share_plat', 'share_session_id', 'share_tag', 'share_from', 'unique_k',
    'fbclid', 'gclid', 'si', 't'
  ]);
  const PAGE_SUFFIX_SEPARATORS = new Set(['_', '-']);
  const MAX_CHANGED_NUMBERS = 2;

  const CJK_NUMERAL = '零〇一二两三四五六七八九十百千';
  const EPISODE_MARKER_PATTERNS = [
    new RegExp(`第\\s*([0-9${CJK_NUMERAL}]+)\\s*[集话話章节節回卷部季期篇幕页頁]`, 'g'),
    /\b(?:ep|episode|chapter|ch|vol|part|p)\.?\s*(\d+)\b/gi,
    /[（(【[]\s*(\d+)\s*[)）】\]]/g
  ];
  const TITLE_SEPARATOR_PATTERN = /\s*[|｜_–—·]\s*|\s+-\s+/;
  const MIN_LATIN_WORK_NAME = 4;
  const MIN_CJK_WORK_NAME = 2;

  function parseUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch (error) {
      return null;
    }
  }

  function getSiteKey(url) {
    return url.hostname.toLowerCase().replace(/^www\./, '');
  }

  // Hash routes (#/… or #!/…) are pages in single-page apps; other hashes are anchors.
  function getPathSegments(url) {
    const segments = url.pathname.split('/').filter(Boolean);
    const hash = url.hash || '';
    const routeMatch = hash.match(/^#!?\/(.*)$/);
    if (routeMatch) {
      routeMatch[1].split(/[/?]/).filter(Boolean).forEach((segment) => {
        segments.push(segment);
      });
    }
    return segments.map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch (error) {
        return segment;
      }
    });
  }

  function getQueryEntries(url) {
    const entries = [];
    url.searchParams.forEach((value, key) => {
      const normalizedKey = key.toLowerCase();
      if (NOISE_QUERY_KEYS.has(normalizedKey) || normalizedKey.startsWith('utm_')) {
        return;
      }
      if (!entries.some((entry) => entry.key === normalizedKey)) {
        entries.push({ key: normalizedKey, value });
      }
    });
    return entries;
  }

  function tokenize(value) {
    return String(value || '').match(/\d+|\D+/g) || [];
  }

  function isDigits(token) {
    return /^\d+$/.test(token);
  }

  // A token or unit that names the work rather than the episode: a number of
  // three or more digits, or a mixed letter-and-digit id such as a BV id.
  function isIdentifier(value) {
    const text = String(value || '');
    if (/^\d{3,}$/.test(text)) return true;
    return text.length >= 6 && /\d/.test(text) && /[a-z]/i.test(text);
  }

  // Compares one path segment or query value. Returns the changed numbers in
  // order, or marks the change as opaque when the shapes differ.
  function compareUnit(before, after) {
    if (before === after) {
      return { kind: 'same', anchors: tokenize(before).filter(isIdentifier).length +
        (isIdentifier(before) && !isDigits(before) ? 1 : 0) };
    }
    const beforeTokens = tokenize(before);
    const afterTokens = tokenize(after);
    if (beforeTokens.length === afterTokens.length) {
      const changes = [];
      let anchorsBeforeChange = 0;
      for (let index = 0; index < beforeTokens.length; index += 1) {
        const a = beforeTokens[index];
        const b = afterTokens[index];
        if (a === b) {
          if (!changes.length && isIdentifier(a)) anchorsBeforeChange += 1;
          continue;
        }
        if (!isDigits(a) || !isDigits(b)) {
          return { kind: 'opaque' };
        }
        changes.push({ from: Number(a), to: Number(b) });
      }
      return { kind: 'numeric', changes, anchorsBeforeChange };
    }
    // A page suffix such as 72035.html → 72035_2.html.
    const [shorter, longer, reversed] = beforeTokens.length < afterTokens.length
      ? [beforeTokens, afterTokens, false]
      : [afterTokens, beforeTokens, true];
    if (longer.length === shorter.length + 2) {
      for (let index = 0; index <= shorter.length; index += 1) {
        const inserted = longer.slice(index, index + 2);
        const rest = longer.slice(0, index).concat(longer.slice(index + 2));
        if (rest.join('\u0000') === shorter.join('\u0000') &&
            PAGE_SUFFIX_SEPARATORS.has(inserted[0]) && isDigits(inserted[1])) {
          const page = Number(inserted[1]);
          const anchorsBeforeChange = shorter.slice(0, index).filter(isIdentifier).length;
          return {
            kind: 'numeric',
            changes: [reversed ? { from: page, to: 1 } : { from: 1, to: page }],
            anchorsBeforeChange
          };
        }
      }
    }
    return { kind: 'opaque' };
  }

  // Walks the URL in reading order: path segments, then query parameters.
  function compareUrls(before, after) {
    const beforeSegments = getPathSegments(before);
    const afterSegments = getPathSegments(after);
    if (beforeSegments.length !== afterSegments.length) {
      return { kind: 'structure-mismatch' };
    }
    // The first path segment is usually an account or channel name, so it
    // never counts as a work id (github.com/<user>/<repo>/issues/<n>).
    const units = [];
    for (let index = 0; index < beforeSegments.length; index += 1) {
      const unit = compareUnit(beforeSegments[index], afterSegments[index]);
      if (index === 0) {
        if (unit.kind === 'same') unit.anchors = 0;
        if (unit.kind === 'numeric') unit.anchorsBeforeChange = 0;
      }
      units.push(unit);
    }
    const beforeQuery = getQueryEntries(before);
    const afterQuery = getQueryEntries(after);
    const keys = beforeQuery.map((entry) => entry.key);
    afterQuery.forEach((entry) => {
      if (!keys.includes(entry.key)) keys.push(entry.key);
    });
    for (const key of keys) {
      const a = beforeQuery.find((entry) => entry.key === key);
      const b = afterQuery.find((entry) => entry.key === key);
      if (a && b) {
        units.push(compareUnit(a.value, b.value));
        continue;
      }
      // A numeric parameter that only one side has defaults to 1 (?p=2 vs none).
      const present = a || b;
      if (!isDigits(present.value)) {
        return { kind: 'structure-mismatch' };
      }
      units.push({
        kind: 'numeric',
        changes: [a ? { from: Number(a.value), to: 1 } : { from: 1, to: Number(b.value) }],
        anchorsBeforeChange: 0
      });
    }

    let anchorsBeforeFirstChange = 0;
    let firstChange = null;
    let changedNumbers = 0;
    let opaqueUnits = 0;
    for (const unit of units) {
      if (unit.kind === 'same') {
        if (!firstChange && !opaqueUnits) anchorsBeforeFirstChange += unit.anchors;
        continue;
      }
      if (unit.kind === 'opaque') {
        opaqueUnits += 1;
        continue;
      }
      if (!firstChange && !opaqueUnits) {
        anchorsBeforeFirstChange += unit.anchorsBeforeChange;
        firstChange = unit.changes[0];
      }
      changedNumbers += unit.changes.length;
    }
    if (!opaqueUnits && !changedNumbers) {
      return { kind: 'same' };
    }
    if (opaqueUnits) {
      return { kind: opaqueUnits === 1 && !changedNumbers ? 'opaque' : 'structure-mismatch' };
    }
    return {
      kind: 'numeric',
      anchored: anchorsBeforeFirstChange > 0 && changedNumbers <= MAX_CHANGED_NUMBERS,
      firstChange,
      step: Math.abs(firstChange.to - firstChange.from)
    };
  }

  function parseCjkNumber(text) {
    const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const units = { 十: 10, 百: 100, 千: 1000 };
    let total = 0;
    let current = 0;
    for (const char of text) {
      if (char in digits) {
        current = digits[char];
      } else if (char in units) {
        total += (current || 1) * units[char];
        current = 0;
      } else {
        return NaN;
      }
    }
    return total + current;
  }

  function parseEpisodeNumber(text) {
    return /^\d+$/.test(text) ? Number(text) : parseCjkNumber(text);
  }

  function normalizeTitle(title) {
    return String(title || '').replace(/\s+/g, ' ').trim();
  }

  // Splits a page title into the work name and the episode number it names.
  // The work name is what precedes the first episode marker; when the marker
  // leads the title ("第2集 副标题 - 剧名 - 站点"), it is the part after the
  // episode's own part, leaving out a trailing site name.
  function readTitle(title) {
    const text = normalizeTitle(title);
    let markerIndex = -1;
    let episode = NaN;
    for (const pattern of EPISODE_MARKER_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match && (markerIndex < 0 || match.index < markerIndex)) {
        markerIndex = match.index;
        episode = parseEpisodeNumber(match[1]);
      }
    }
    let head = markerIndex >= 0
      ? text.slice(0, markerIndex)
      : text.split(TITLE_SEPARATOR_PATTERN)[0];
    if (markerIndex >= 0 && !head.replace(/[\s|｜_–—·:：\-【\[（(]+/g, '')) {
      const parts = text.split(TITLE_SEPARATOR_PATTERN).filter(Boolean);
      const rest = parts.slice(1, parts.length >= 3 ? -1 : undefined);
      head = rest[0] || '';
    }
    const workName = head.replace(/[\s|｜_–—·:：\-【\[（(]+$/, '').trim().toLowerCase();
    return { workName, episode, hasMarker: markerIndex >= 0 };
  }

  function isMeaningfulWorkName(name) {
    const cjk = (name.match(/[\u3400-\u9fff]/g) || []).length;
    return cjk >= MIN_CJK_WORK_NAME || name.replace(/[^a-z0-9]/gi, '').length >= MIN_LATIN_WORK_NAME;
  }

  // Titles agree when both name the same work and one marks an episode;
  // identical generic titles prove nothing. They disagree when both name a
  // work and the names differ.
  function compareTitles(beforeTitle, afterTitle) {
    const before = readTitle(beforeTitle);
    const after = readTitle(afterTitle);
    const differentText = normalizeTitle(beforeTitle) !== normalizeTitle(afterTitle);
    const bothNamed = isMeaningfulWorkName(before.workName) && isMeaningfulWorkName(after.workName);
    const sameWork = Boolean(
      bothNamed && before.workName === after.workName &&
      (before.hasMarker || after.hasMarker) && differentText
    );
    const differentWork = Boolean(bothNamed && differentText && before.workName !== after.workName);
    let direction = 'unknown';
    if (sameWork && Number.isFinite(before.episode) && Number.isFinite(after.episode) &&
        before.episode !== after.episode) {
      direction = after.episode > before.episode ? 'forward' : 'backward';
    }
    return { sameWork, differentWork, direction };
  }

  // Path words that suggest episodes and chapters, or pages whose numbered
  // neighbours are unrelated (issues, threads, products, search results).
  const SERIES_PATH_WORDS = new Set([
    'play', 'player', 'vodplay', 'watch', 'video', 'videos', 'vod', 'bangumi', 'anime',
    'episode', 'episodes', 'chapter', 'chapters', 'read', 'reader', 'novel', 'novels',
    'book', 'books', 'manga', 'comic', 'comics', 'drama', 'series', 'show', 'shows'
  ]);
  const UNRELATED_PATH_WORDS = new Set([
    'issue', 'issues', 'pull', 'pulls', 'commit', 'commits', 'blob', 'tree', 'wiki',
    't', 'thread', 'threads', 'topic', 'topics', 'post', 'posts', 'forum', 'forums',
    'discussion', 'discussions', 'question', 'questions', 'answer', 'answers',
    'item', 'items', 'product', 'products', 'goods', 'search', 'tag', 'tags',
    'user', 'users', 'u', 'profile', 'people', 'status', 'statuses'
  ]);

  function getPathWords(url) {
    const words = new Set();
    getPathSegments(url).forEach((segment) => {
      segment.toLowerCase().split(/[^a-z]+/).filter(Boolean).forEach((word) => words.add(word));
    });
    return words;
  }

  function hasPathWord(url, wordSet) {
    for (const word of getPathWords(url)) {
      if (wordSet.has(word)) return true;
    }
    return false;
  }

  // A URL in the form links and history use for the same page: no anchor
  // hash, no trailing slash, no sharing or tracking parameters.
  function getComparableUrl(value) {
    const url = parseUrl(value);
    if (!url) return '';
    const route = /^#!?\//.test(url.hash) ? url.hash : '';
    const query = getQueryEntries(url)
      .map(({ key, value: paramValue }) => `${key}=${paramValue}`)
      .sort()
      .join('&');
    const path = url.pathname.replace(/\/+$/, '');
    return `${getSiteKey(url)}${path}${query ? `?${query}` : ''}${route}`;
  }

  function listHas(list, url) {
    const target = getComparableUrl(url);
    return Boolean(target) && Array.isArray(list) &&
      list.some((entry) => getComparableUrl(entry) === target);
  }

  function normalizeSeriesName(value) {
    return normalizeTitle(value).toLowerCase();
  }

  // Points each signal contributes; a page continues the card's work at
  // MEDIUM_SCORE, and HIGH_SCORE outranks title-only matches on other cards.
  const SCORE = Object.freeze({
    anchoredNumber: 3,
    looseNumber: 1,
    bigJump: -2,
    sameTitle: 2,
    differentTitle: -3,
    navigatedFromCard: 2,
    typedOrBookmarked: -1,
    seriesPathWord: 1,
    unrelatedPathWord: -2,
    pageLink: 5,
    sameSeriesMeta: 3,
    differentSeriesMeta: -3
  });
  const HIGH_SCORE = 4;
  const MEDIUM_SCORE = 3;
  const MAX_FORWARD_STEP = 20;
  const NAVIGATION_TRANSITIONS = new Set(['link', 'form_submit', 'reload', 'auto_subframe', 'manual_subframe']);

  function result(match, confidence, reason, direction, score, factors) {
    return Object.freeze({
      match,
      confidence,
      reason,
      direction: direction || 'unknown',
      score: Number.isFinite(score) ? score : 0,
      factors: Object.freeze((factors || []).slice())
    });
  }

  /**
   * Compares the page a tracked card points to with a page the person is on.
   * @param {{url: string, title?: string}} current - the card
   * @param {{url: string, title?: string}} candidate - the visited page
   * @param {{
   *   fromCurrent?: boolean,
   *   transition?: string,
   *   currentHints?: {nextUrls?: string[], prevUrls?: string[], seriesName?: string},
   *   candidateHints?: {nextUrls?: string[], prevUrls?: string[], seriesName?: string, episode?: number},
   *   currentEpisode?: number
   * }} [context] - how the person got here and what the pages say about themselves
   * @returns {{match: boolean, confidence: 'high'|'medium'|'none', reason: string,
   *   direction: 'forward'|'backward'|'unknown', score: number,
   *   factors: Array<{signal: string, points: number}>}}
   */
  function compareProgressPages(current, candidate, context) {
    const ctx = context && typeof context === 'object' ? context : {};
    const before = parseUrl(current && current.url);
    const after = parseUrl(candidate && candidate.url);
    if (!before || !after) return result(false, 'none', 'invalid-url');
    if (getSiteKey(before) !== getSiteKey(after)) return result(false, 'none', 'site-mismatch');

    const factors = [];
    const add = (signal, points) => factors.push({ signal, points });
    let direction = 'unknown';

    // What the pages say about each other: a next or previous link between
    // them settles it, whatever the URLs look like.
    const currentHints = ctx.currentHints || {};
    const candidateHints = ctx.candidateHints || {};
    if (listHas(currentHints.nextUrls, candidate.url) || listHas(candidateHints.prevUrls, current.url)) {
      add('page-link', SCORE.pageLink);
      direction = 'forward';
    } else if (listHas(currentHints.prevUrls, candidate.url) || listHas(candidateHints.nextUrls, current.url)) {
      add('page-link', SCORE.pageLink);
      direction = 'backward';
    }
    const linked = factors.length > 0;

    const urlComparison = compareUrls(before, after);
    if (urlComparison.kind === 'same') return result(false, 'none', 'same-page');
    if (urlComparison.kind === 'structure-mismatch' && !linked) {
      return result(false, 'none', 'structure-mismatch');
    }
    if (urlComparison.kind === 'numeric') {
      add(urlComparison.anchored ? 'url-pattern' : 'url-number',
        urlComparison.anchored ? SCORE.anchoredNumber : SCORE.looseNumber);
      const { from, to } = urlComparison.firstChange;
      if (to > from && urlComparison.step > MAX_FORWARD_STEP) add('big-jump', SCORE.bigJump);
      if (direction === 'unknown') direction = to > from ? 'forward' : 'backward';
    }

    const titles = compareTitles(current && current.title, candidate && candidate.title);
    if (titles.sameWork) add('title-match', SCORE.sameTitle);
    if (titles.differentWork) add('title-mismatch', SCORE.differentTitle);
    // Direction: page links, then the URL's numbers, then episode metadata,
    // then the titles.

    const currentSeries = normalizeSeriesName(currentHints.seriesName);
    const candidateSeries = normalizeSeriesName(candidateHints.seriesName);
    if (currentSeries && candidateSeries) {
      add(currentSeries === candidateSeries ? 'series-meta' : 'series-meta-mismatch',
        currentSeries === candidateSeries ? SCORE.sameSeriesMeta : SCORE.differentSeriesMeta);
    } else if (candidateSeries && readTitle(current && current.title).workName === candidateSeries) {
      add('series-meta', SCORE.sameTitle);
    }
    const currentEpisode = Number(ctx.currentEpisode);
    const candidateEpisode = Number(candidateHints.episode);
    if (direction === 'unknown' && Number.isFinite(currentEpisode) && Number.isFinite(candidateEpisode) &&
        currentEpisode !== candidateEpisode && currentEpisode > 0 && candidateEpisode > 0) {
      direction = candidateEpisode > currentEpisode ? 'forward' : 'backward';
    }
    if (direction === 'unknown') direction = titles.direction;

    const transition = String(ctx.transition || '');
    if (ctx.fromCurrent === true && (!transition || NAVIGATION_TRANSITIONS.has(transition))) {
      add('navigated-from-card', SCORE.navigatedFromCard);
    } else if (transition && !NAVIGATION_TRANSITIONS.has(transition)) {
      add('typed-or-bookmarked', SCORE.typedOrBookmarked);
    }

    if (hasPathWord(after, UNRELATED_PATH_WORDS)) {
      add('unrelated-path', SCORE.unrelatedPathWord);
    } else if (hasPathWord(after, SERIES_PATH_WORDS)) {
      add('series-path', SCORE.seriesPathWord);
    }

    const score = factors.reduce((total, factor) => total + factor.points, 0);
    if (score < MEDIUM_SCORE) return result(false, 'none', 'insufficient', 'unknown', score, factors);
    const strongest = factors.reduce((best, factor) => (factor.points > best.points ? factor : best));
    return result(true, score >= HIGH_SCORE ? 'high' : 'medium', strongest.signal, direction, score, factors);
  }

  // Automatic updates move forward only, so rewatching an earlier episode
  // never rewinds the card.
  function shouldAdvance(comparison) {
    return Boolean(comparison && comparison.match && comparison.direction !== 'backward');
  }

  // Pinning a page that looks like part of a series (an episode, chapter or
  // page of a longer work) starts tracking it. Generic numbered pages such
  // as issues, threads or products must not qualify: tracking would then
  // wander to their neighbours.
  const SERIES_TITLE_PATTERNS = [
    // 第12集 / 第十二话 / 第3章 / 第2季 / 第5話 / 第1巻 / 第4课
    new RegExp(`第\\s*[0-9${CJK_NUMERAL}]+\\s*[集话話章节節回卷巻册冊部季期篇幕页頁课課讲講]`),
    // 12集 / 12话 / 12話 / 12화
    /\d+\s*[集话話화]/,
    // EP12 / Ep.12 / Episode 12 / S01E02 / Season 2
    /\b(?:ep|episode|season)\.?\s*\d+\b/i,
    /\bs\d{1,2}\s*e\d{1,3}\b/i,
    // Chapter 12 / Ch. 12 / Chap 12 / Vol. 3 / Volume 3 / Part 2 / Lesson 4 / P2
    /\b(?:chapter|chap|ch|vol|volume|part|lesson)\.?\s*\d+\b/i,
    /(?:^|[\s【\[(（|｜_-])p\s?\d+\b/i,
    // 最终话 / 最終回 / 大结局 / 完结篇 / 番外 / 上集 / 下篇
    /最终话|最終話|最終回|大结局|完结篇|番外|[上中下]集|[上中下]篇/
  ];
  // Query parameters that name an episode, chapter or part.
  const SERIES_QUERY_KEYS = new Set([
    'p', 'ep', 'episode', 'episode_id', 'episodeid', 'eid', 'e',
    'chapter', 'chapter_id', 'chapterid', 'chap', 'cid',
    'part', 'vol', 'volume', 'season'
  ]);
  const SERIES_PATH_PATTERNS = [
    // ep123 / episode-4 / chapter_12 / ch5 / vol-2 / part3 / season-2 / s01e02
    /^(?:ep|episode|chapter|chap|ch|vol|volume|part|season|s\d{1,2}e)[-_]?\d+/i,
    // 55357-1-2.html (play pages: work-source-episode)
    /^\d+(?:[-_]\d+){2,}(?:\.[a-z]+)?$/i,
    // 72035_2.html (the second page of a chapter)
    /^\d{3,}_\d+\.html?$/i
  ];

  function hasSeriesTitle(title) {
    const text = normalizeTitle(title);
    return Boolean(text) && SERIES_TITLE_PATTERNS.some((pattern) => pattern.test(text));
  }

  function hasSeriesUrl(value) {
    const url = parseUrl(value);
    if (!url || hasPathWord(url, UNRELATED_PATH_WORDS)) return false;
    for (const { key, value: paramValue } of getQueryEntries(url)) {
      if (SERIES_QUERY_KEYS.has(key) && isDigits(paramValue)) return true;
    }
    const segments = getPathSegments(url);
    if (segments.some((segment) => SERIES_PATH_PATTERNS.some((pattern) => pattern.test(segment)))) {
      return true;
    }
    // /novel/2013/72035.html: a chapter file under a numeric work id.
    const last = segments[segments.length - 1] || '';
    const parent = segments[segments.length - 2] || '';
    return /^\d{3,}\.html?$/i.test(last) && /^\d{3,}$/.test(parent);
  }

  /**
   * Whether a page reads as one part of a longer work, from its title, its
   * URL, or what the page itself says (episode navigation or metadata).
   * @param {{url: string, title?: string}} page
   * @param {{episodeNavigation?: boolean, seriesName?: string}} [hints]
   */
  function looksLikeSeriesPage(page, hints) {
    if (!page || !parseUrl(page.url)) return false;
    if (hints && (hints.episodeNavigation === true || normalizeSeriesName(hints.seriesName))) return true;
    return hasSeriesTitle(page.title) || hasSeriesUrl(page.url);
  }

  // The key progress history is stored under; one tracked card per site.
  function getProgressSiteKey(value) {
    const url = parseUrl(value);
    return url ? getSiteKey(url) : '';
  }

  return Object.freeze({
    compareProgressPages,
    shouldAdvance,
    readTitle,
    getProgressSiteKey,
    getComparableUrl,
    looksLikeSeriesPage
  });
});

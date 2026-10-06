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
    const units = [];
    for (let index = 0; index < beforeSegments.length; index += 1) {
      units.push(compareUnit(beforeSegments[index], afterSegments[index]));
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
      firstChange
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
    const head = markerIndex >= 0
      ? text.slice(0, markerIndex)
      : text.split(TITLE_SEPARATOR_PATTERN)[0];
    const workName = head.replace(/[\s|｜_–—·:：\-【\[（(]+$/, '').trim().toLowerCase();
    return { workName, episode, hasMarker: markerIndex >= 0 };
  }

  function isMeaningfulWorkName(name) {
    const cjk = (name.match(/[㐀-鿿]/g) || []).length;
    return cjk >= MIN_CJK_WORK_NAME || name.replace(/[^a-z0-9]/gi, '').length >= MIN_LATIN_WORK_NAME;
  }

  // Same work by title only when both titles name the same work and at least
  // one marks an episode; identical generic titles prove nothing.
  function compareTitles(beforeTitle, afterTitle) {
    const before = readTitle(beforeTitle);
    const after = readTitle(afterTitle);
    const sameWork = Boolean(
      before.workName && before.workName === after.workName &&
      isMeaningfulWorkName(before.workName) &&
      (before.hasMarker || after.hasMarker) &&
      normalizeTitle(beforeTitle) !== normalizeTitle(afterTitle)
    );
    let direction = 'unknown';
    if (sameWork && Number.isFinite(before.episode) && Number.isFinite(after.episode) &&
        before.episode !== after.episode) {
      direction = after.episode > before.episode ? 'forward' : 'backward';
    }
    return { sameWork, direction };
  }

  function result(match, confidence, reason, direction) {
    return Object.freeze({ match, confidence, reason, direction: direction || 'unknown' });
  }

  /**
   * Compares the page a tracked card points to with a page the person is on.
   * @param {{url: string, title?: string}} current - the card
   * @param {{url: string, title?: string}} candidate - the visited page
   * @returns {{match: boolean, confidence: 'high'|'medium'|'none', reason: string,
   *   direction: 'forward'|'backward'|'unknown'}}
   */
  function compareProgressPages(current, candidate) {
    const before = parseUrl(current && current.url);
    const after = parseUrl(candidate && candidate.url);
    if (!before || !after) return result(false, 'none', 'invalid-url');
    if (getSiteKey(before) !== getSiteKey(after)) return result(false, 'none', 'site-mismatch');

    const urlComparison = compareUrls(before, after);
    if (urlComparison.kind === 'same') return result(false, 'none', 'same-page');
    if (urlComparison.kind === 'structure-mismatch') return result(false, 'none', 'structure-mismatch');

    if (urlComparison.kind === 'numeric' && urlComparison.anchored) {
      const { from, to } = urlComparison.firstChange;
      return result(true, 'high', 'url-pattern', to > from ? 'forward' : 'backward');
    }

    // The URL alone cannot tell a next episode from another work on the same
    // site, so the titles have to agree.
    const titles = compareTitles(current && current.title, candidate && candidate.title);
    if (!titles.sameWork) return result(false, 'none', 'title-mismatch');
    let direction = titles.direction;
    if (direction === 'unknown' && urlComparison.kind === 'numeric') {
      const { from, to } = urlComparison.firstChange;
      direction = to > from ? 'forward' : 'backward';
    }
    return result(true, 'medium', 'title-match', direction);
  }

  // Automatic updates move forward only, so rewatching an earlier episode
  // never rewinds the card.
  function shouldAdvance(comparison) {
    return Boolean(comparison && comparison.match && comparison.direction !== 'backward');
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
    getProgressSiteKey
  });
});

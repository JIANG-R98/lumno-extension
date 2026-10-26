// Matching and ranking pages: exact term matches first, then pages
// recommended for a rewrite of the query.
import { prepareSynonyms } from './index-build';
import { passage, snippet } from './passage';
import { CJK_RUN, LATIN_STOP_WORDS, contains, planQuery } from './query';
import type { HelpIndexDoc, HelpIndexSection, RankedPage, WordHit } from './types';

// Where one spelling of a word appears: the title, a heading, a section's aliases, the page's
// aliases, then the body.
const RECOMMENDED_LIMIT = 3;

function locate(doc: HelpIndexDoc, variant: string): WordHit | null {
  const heading = doc.sections.find((section) => contains(section.lowerTitle, variant));
  if (contains(doc.lower.title, variant)) {
    return { score: 10, section: heading || null, variant };
  }
  if (heading) {
    return { score: 4, section: heading, variant };
  }
  const aliased = doc.sections.find((section) => section.lowerAliases.some((alias) => contains(alias, variant)));
  if (aliased) {
    return { score: 3, section: aliased, variant };
  }
  if (doc.lower.aliases.some((alias) => contains(alias, variant))) {
    return { score: 2, section: null, variant };
  }
  if (contains(doc.lower.text, variant)) {
    return { score: 1, section: null, variant };
  }
  return null;
}

// A heading or alias that holds every word of a longer query is the question being asked.
function phraseBonus(doc: HelpIndexDoc, terms: string[][]): number {
  if (terms.length < 2) {
    return 0;
  }
  const fields = [doc.lower.title, ...doc.lower.aliases, ...doc.sections.flatMap((section) => [section.lowerTitle, ...section.lowerAliases])];
  return fields.some((field) => terms.every((variants) => fieldHas(field, variants))) ? 4 : 0;
}

// Short English words only count on their own ("ai" not in "email", "pc" not in "npc").

function fieldHas(text: string, variants: string[]): boolean {
  return variants.some((variant) => contains(text, variant));
}

function sectionHas(section: HelpIndexSection, variants: string[]): boolean {
  return fieldHas(section.lowerTitle, variants) || section.lowerAliases.some((alias) => fieldHas(alias, variants));
}

// The section to open: the one whose heading or aliases hold the most of the query's words,
// rarer words counting for more (支持 Safari 吗 → the Safari section, not 支持情况).
function bestSection(
  doc: HelpIndexDoc,
  terms: string[][],
  weights: number[],
  fallback: HelpIndexSection | null
): HelpIndexSection | null {
  let best = fallback;
  let bestScore = 0;
  let bestLength = 0;
  doc.sections.forEach((section) => {
    let value = 0;
    let length = 0;
    terms.forEach((variants, i) => {
      if (sectionHas(section, variants)) {
        value += weights[i];
        length += variants[0].length;
      }
    });
    // Ties go to the section that holds the longer words (Safari over 支持).
    if (value > bestScore + 1e-9 || (value > 0 && Math.abs(value - bestScore) < 1e-9 && length > bestLength)) {
      best = section;
      bestScore = value;
      bestLength = length;
    }
  });
  return best;
}

// Every word must match somewhere; a title hit outranks a heading, which outranks the body.
function matchExactly(docs: HelpIndexDoc[], terms: string[][]): RankedPage[] {
  const weights = terms.map((variants) => {
    const count = docs.reduce((sum, doc) => sum + doc.sections.filter((section) => sectionHas(section, variants)).length, 0);
    return 1 / (1 + count);
  });
  return docs
    .map((doc, order): RankedPage | null => {
      let score = 0;
      let section: HelpIndexSection | null = null;
      let firstVariant = '';
      for (const variants of terms) {
        let best: WordHit | null = null;
        for (const variant of variants) {
          const hit = locate(doc, variant);
          if (hit && (!best || hit.score > best.score)) {
            best = hit;
          }
        }
        if (!best) {
          return null;
        }
        score += best.score;
        if (best.section && !section) {
          section = best.section;
        }
        firstVariant = firstVariant || best.variant;
      }
      // Every spelling counts here, so a title hit on one (pinn) still opens the section another names (pin).
      section = bestSection(doc, terms, weights, section);
      score += phraseBonus(doc, terms);
      return {
        doc,
        score,
        order,
        section,
        detail: section ? section.title : snippet(doc.text, firstVariant),
        context: passage(doc, section, terms.flat())
      };
    })
    .filter((page): page is RankedPage => Boolean(page))
    .sort((a, b) => b.score - a.score || a.order - b.order);
}

// The pieces a loose match compares: pairs of characters for CJK text, which has no spaces
// between words, and whole words for the rest.
function unitsOf(text: string): string[] {
  const units = new Set<string>();
  (text.match(CJK_RUN) || []).forEach((run) => {
    if (run.length === 1) {
      units.add(run);
      return;
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      units.add(run.slice(i, i + 2));
    }
  });
  text.replace(CJK_RUN, ' ').split(/[^\p{L}\p{N}']+/u).forEach((word) => {
    if (word.length >= 2 && !LATIN_STOP_WORDS.has(word)) {
      units.add(word);
    }
  });
  return [...units];
}

function getQueryUnits(query: unknown, synonyms: unknown): string[] {
  const prepared = prepareSynonyms(synonyms);
  return unitsOf(planQuery(query, prepared, []).rewrites[0] || '');
}

function coverage(text: string, units: string[]): number {
  return units.filter((unit) => text.includes(unit)).length / units.length;
}

// The longest stretch of the query's CJK text found as typed (快捷键老是失灵 → 快捷键 in 修改快捷键).
function longestSharedRun(text: string, runs: string[]): number {
  let longest = 0;
  runs.forEach((run) => {
    for (let start = 0; start < run.length; start += 1) {
      for (let end = run.length; end - start > longest; end -= 1) {
        if (text.includes(run.slice(start, end))) {
          longest = end - start;
          break;
        }
      }
    }
  });
  return longest;
}

// How well a title, heading or alias answers the query: the share of its pieces it contains,
// or, for a long question, a phrase of three or more characters taken from it.
function headingMatch(text: string, units: string[], runs: string[]): number {
  const value = coverage(text, units);
  return longestSharedRun(text, runs) >= 3 ? Math.max(value, 0.4) + 0.1 : value;
}

function recommendFor(docs: HelpIndexDoc[], rewrite: string, excludedDocs: Set<HelpIndexDoc>): RankedPage[] {
  const units = unitsOf(rewrite);
  if (!units.length) {
    return [];
  }
  const runs = rewrite.match(CJK_RUN) || [];
  return docs
    .map((doc, order): RankedPage | null => {
      if (excludedDocs.has(doc)) {
        return null;
      }
      let headingCoverage = headingMatch(doc.lower.title, units, runs);
      let section: HelpIndexSection | null = null;
      doc.lower.aliases.forEach((alias) => {
        headingCoverage = Math.max(headingCoverage, headingMatch(alias, units, runs) * 0.9);
      });
      for (const item of doc.sections) {
        const value = Math.max(
          headingMatch(item.lowerTitle, units, runs) * 0.9,
          ...item.lowerAliases.map((alias) => headingMatch(alias, units, runs) * 0.85)
        );
        if (value > headingCoverage) {
          headingCoverage = value;
          section = item;
        }
      }
      const bodyCoverage = coverage(doc.lower.text, units);
      if (headingCoverage < 0.4 && !(units.length > 1 && bodyCoverage === 1)) {
        return null;
      }
      return {
        doc,
        order,
        section,
        score: headingCoverage + bodyCoverage * 0.25,
        detail: section ? section.title : snippet(doc.text, units[0]),
        context: passage(doc, section, units),
        recommended: true
      };
    })
    .filter((page): page is RankedPage => Boolean(page));
}

// When the words don't all appear, the pages whose title, a heading or an alias share most of
// the query's pieces (under any of its synonyms) are still worth reading; the body only breaks ties.
function recommend(docs: HelpIndexDoc[], rewrites: string[], excludedDocs: Set<HelpIndexDoc>): RankedPage[] {
  const best = new Map<HelpIndexDoc, RankedPage>();
  rewrites.forEach((rewrite) => {
    recommendFor(docs, rewrite, excludedDocs).forEach((item) => {
      const current = best.get(item.doc);
      if (!current || item.score > current.score) {
        best.set(item.doc, item);
      }
    });
  });
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, RECOMMENDED_LIMIT);
}

export {
  bestSection,
  coverage,
  fieldHas,
  getQueryUnits,
  headingMatch,
  locate,
  longestSharedRun,
  matchExactly,
  phraseBonus,
  recommend,
  recommendFor,
  sectionHas,
  unitsOf
};

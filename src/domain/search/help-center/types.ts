// The help center index, its synonyms and search results.

type LineKind = 'text' | 'heading' | 'bullet' | 'row';

// A block of a page's text (see parseLines).
interface HelpIndexLine {
  kind: LineKind | 'step';
  start: number;
  end: number;
  marker: string;
  cells: string[] | null;
  header: boolean;
}

interface HelpIndexSection {
  id: string;
  title: string;
  aliases: string[];
  lowerTitle: string;
  lowerAliases: string[];
  // Where the section's body sits in the page text, once located.
  body?: { start: number; end: number } | null;
}

// An index page, prepared for matching.
interface HelpIndexDoc {
  title: string;
  href: string;
  text: string;
  lines: HelpIndexLine[];
  aliases: string[];
  sections: HelpIndexSection[];
  lower: { title: string; text: string; aliases: string[]; all: string };
}

interface SynonymMember {
  word: string;
  groupIndex: number;
  memberIndex: number;
  // English words match only on their own; null for CJK words.
  pattern: RegExp | null;
}

interface HelpSynonyms {
  groups: string[][];
  members: SynonymMember[];
}

// A block of the passage a result's hover card shows.
type HelpContextBlock =
  | { kind: 'row'; cells: string[]; header?: true }
  | { kind: 'heading' | 'text' | 'bullet' | 'step'; text: string; marker?: string };

interface HelpSearchResult {
  title: string;
  detail: string;
  context: HelpContextBlock[];
  url: string;
  recommended?: true;
}

interface HelpSearchOptions {
  // Prefixed to the index's relative links.
  origin?: string;
  limit?: number;
  // A prepared synonym list or the raw groups.
  synonyms?: unknown;
}

// Where one spelling of a word was found on a page.
interface WordHit {
  score: number;
  section: HelpIndexSection | null;
  variant: string;
}

interface RankedPage {
  doc: HelpIndexDoc;
  score: number;
  order: number;
  section: HelpIndexSection | null;
  detail: string;
  context: HelpContextBlock[];
  recommended?: true;
}

interface QueryPlan {
  words: string[];
  // Per word, every spelling to try.
  terms: string[][];
  rewrites: string[];
}

interface FeedbackLinks {
  wechatQr?: string;
  githubIssue?: string;
  x?: string;
}

interface FeedbackConfig {
  links?: FeedbackLinks;
  // 'wechat' where the WeChat group is the community channel.
  channel?: string;
  t?: (key: string, fallback: string) => string;
}

interface HelpFeedbackSuggestion {
  type: 'helpFeedback';
  feedbackKey: string;
  title: string;
  url: string;
}

interface HelpArticleSuggestion {
  type: 'helpArticle';
  title: string;
  detail: string;
  url: string;
  context: HelpContextBlock[];
  favicon: string;
  recommended: boolean;
}

// The worker's reply to getHelpCenterSearchResults.
interface HelpSearchResponse {
  items?: Array<Partial<HelpSearchResult> | null>;
  // Set when the index could not load.
  reason?: string;
}

interface SuggestionSourceOptions {
  sendMessage?: (message: { action: 'getHelpCenterSearchResults'; query: string; locale: string },
    callback: (response?: HelpSearchResponse) => void) => unknown;
  onUpdate?: (query: unknown) => void;
}


type RawIndexDoc = Record<string, unknown> & { title: string; href: string };
type RawIndexSection = Record<string, unknown> & { id: string; title: string };

export type {
  FeedbackConfig,
  FeedbackLinks,
  HelpArticleSuggestion,
  HelpContextBlock,
  HelpFeedbackSuggestion,
  HelpIndexDoc,
  HelpIndexLine,
  HelpIndexSection,
  HelpSearchOptions,
  HelpSearchResponse,
  HelpSearchResult,
  HelpSynonyms,
  LineKind,
  QueryPlan,
  RankedPage,
  RawIndexDoc,
  RawIndexSection,
  SuggestionSourceOptions,
  SynonymMember,
  WordHit
};

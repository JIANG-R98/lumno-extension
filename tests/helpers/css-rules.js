'use strict';

// Parses CSS with the browser's CSS object model (JSDOM's), so a check reads
// the declarations a rule really ends up with instead of matching the
// stylesheet's text: comments, whitespace and declaration order stop
// mattering, and a later declaration in the same rule wins as it does in a
// browser.

const { JSDOM, VirtualConsole } = require('jsdom');

// A selector list split at its top-level commas (not those inside :is()).
function selectorsOf(rule) {
  const text = String(rule.selectorText || '');
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function normalizeSelector(selector) {
  return String(selector).replace(/\s+/g, ' ').trim();
}

function conditionOf(rule) {
  if (rule.media && typeof rule.media.mediaText === 'string') return rule.media.mediaText;
  return String(rule.conditionText || '');
}

// The rules of a parsed stylesheet, flattened. Each entry is
// { selectors, style, conditions } where conditions lists the @media and
// @supports conditions the rule is nested in.
function flatten(cssRules, conditions) {
  return Array.from(cssRules).flatMap((rule) => {
    if (rule.cssRules && !rule.selectorText) {
      return flatten(rule.cssRules, conditions.concat(conditionOf(rule)));
    }
    if (!rule.style) return [];
    return [{ selectors: selectorsOf(rule), style: rule.style, conditions }];
  });
}

function parseCss(cssText) {
  // @import rules are kept as rules but never fetched; the console stays quiet
  // about the URLs it cannot resolve.
  const dom = new JSDOM('<!doctype html><html><head></head></html>', { virtualConsole: new VirtualConsole() });
  const style = dom.window.document.createElement('style');
  style.textContent = String(cssText || '');
  dom.window.document.head.appendChild(style);
  const entries = flatten(style.sheet.cssRules, []);
  const matching = (selector, condition) => {
    const wanted = normalizeSelector(selector);
    return entries.filter((entry) => {
      if (!entry.selectors.includes(wanted)) return false;
      if (condition === undefined) return entry.conditions.length === 0;
      if (condition === '*') return true;
      return entry.conditions.some((text) => (condition instanceof RegExp ? condition.test(text) : text === condition));
    });
  };
  return {
    entries,
    // The declarations for `selector`, merged in source order as the cascade
    // would for rules of equal specificity. Without `condition` only top-level
    // rules count; pass a condition string or RegExp for rules inside an
    // @media / @supports block, or '*' for all.
    rule(selector, condition) {
      const found = matching(selector, condition);
      if (!found.length) return null;
      const merged = {};
      const priorities = {};
      found.forEach((entry) => {
        for (let index = 0; index < entry.style.length; index += 1) {
          const name = entry.style[index];
          merged[name] = entry.style.getPropertyValue(name)
            .replace(/\s+/g, ' ')
            .replace(/\(\s+/g, '(')
            .replace(/\s+\)/g, ')')
            .trim();
          priorities[name] = entry.style.getPropertyPriority(name);
        }
      });
      return {
        has(name) {
          return Object.hasOwn(merged, name);
        },
        // The declared value, without !important (see priority()).
        get(name) {
          return Object.hasOwn(merged, name) ? merged[name] : null;
        },
        priority(name) {
          return Object.hasOwn(priorities, name) ? priorities[name] : null;
        },
        names() {
          return Object.keys(merged);
        }
      };
    },
    // An @keyframes rule's frames as { '0%': CSSStyleDeclaration, ... }
    // (from/to read as 0%/100%), or null.
    keyframes(name) {
      const find = (rules) => {
        for (const rule of Array.from(rules)) {
          if (rule.name === name && rule.cssRules) return rule;
          if (rule.cssRules && !rule.name) {
            const nested = find(rule.cssRules);
            if (nested) return nested;
          }
        }
        return null;
      };
      const found = find(style.sheet.cssRules);
      if (!found) return null;
      return Object.fromEntries(Array.from(found.cssRules).map((frame) => [
        String(frame.keyText).replace(/^from$/, '0%').replace(/^to$/, '100%'),
        frame.style
      ]));
    },
    // Every selector the stylesheet declares, top level or nested.
    selectors() {
      return entries.flatMap((entry) => entry.selectors);
    },
    // The conditions of the @media / @supports blocks declaring `selector`.
    conditionsFor(selector) {
      const wanted = normalizeSelector(selector);
      return entries.filter((entry) => entry.selectors.includes(wanted)).flatMap((entry) => entry.conditions);
    }
  };
}

module.exports = { parseCss };

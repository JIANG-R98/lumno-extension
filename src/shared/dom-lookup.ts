// Typed lookups for a page's own elements: an element of the expected kind,
// or null (or nothing) when the page holds another kind or none.
import { isHtmlElement, isHtmlTag } from './dom-guards';

function getHtmlElement(root: Document | ShadowRoot, id: string): HTMLElement | null {
  const element = root.getElementById(id);
  return isHtmlElement(element) ? element : null;
}

function getHtmlTag<K extends keyof HTMLElementTagNameMap>(
  root: Document | ShadowRoot,
  id: string,
  tag: K
): HTMLElementTagNameMap[K] | null {
  const element = root.getElementById(id);
  return isHtmlTag(element, tag) ? element : null;
}

function queryHtmlElement(root: ParentNode, selector: string): HTMLElement | null {
  const element = root.querySelector(selector);
  return isHtmlElement(element) ? element : null;
}

function queryHtmlElements(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(selector)).filter(isHtmlElement);
}

function queryHtmlTags<K extends keyof HTMLElementTagNameMap>(
  root: ParentNode,
  selector: string,
  tag: K
): Array<HTMLElementTagNameMap[K]> {
  return Array.from(root.querySelectorAll(selector))
    .filter((element): element is HTMLElementTagNameMap[K] => isHtmlTag(element, tag));
}

export { getHtmlElement, getHtmlTag, queryHtmlElement, queryHtmlElements, queryHtmlTags };

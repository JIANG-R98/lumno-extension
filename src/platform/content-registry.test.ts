import { afterEach, describe, expect, it } from 'vitest';
import {
  claimContentScript,
  isDocumentPipActiveState,
  isOverlayOpenState,
  setDocumentPipActiveState,
  setOverlayOpenState
} from './content-registry';

describe('content registry', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__lumnoContent');
  });

  it('lets only the first copy of a content script run in a world', () => {
    expect(claimContentScript('shortcut-key-observer')).toBe(true);
    expect(claimContentScript('shortcut-key-observer')).toBe(false);
    expect(claimContentScript('site-auto-pip')).toBe(true);
  });

  it('starts with the overlay unknown, then follows what it publishes', () => {
    expect(globalThis.__lumnoContent).toBeUndefined();
    expect(isOverlayOpenState()).toBe(false);
    setOverlayOpenState(true);
    expect(globalThis.__lumnoContent?.overlayOpen).toBe(true);
    setOverlayOpenState(false);
    expect(isOverlayOpenState()).toBe(false);
  });

  it('shares whether the page clip picker has the page in Picture-in-Picture', () => {
    expect(isDocumentPipActiveState()).toBe(false);
    setDocumentPipActiveState(true);
    expect(isDocumentPipActiveState()).toBe(true);
  });
});

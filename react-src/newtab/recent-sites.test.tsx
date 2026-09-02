import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRecentSitesView,
  createRecentSitesViewApi,
  getRecentSitesSignature,
  type RecentCardElement,
  type RecentSiteItem,
  type RecentSitesViewController,
  type RecentSitesViewOptions
} from './recent-sites';

let views: RecentSitesViewController[] = [];

function createOptions(
  overrides: Partial<RecentSitesViewOptions> = {}
): RecentSitesViewOptions {
  const grid = document.createElement('div');
  document.body.appendChild(grid);
  return {
    documentObj: document,
    windowObj: window,
    grid,
    cards: [],
    t: (_key, fallback) => fallback,
    formatMessage: (_key, fallback, values) =>
      fallback.replace('{title}', values.title),
    sanitizeDisplayText: (value) => String(value || ''),
    getOwnExtensionPageDisplay: () => null,
    getHostFromUrl: () => 'example.com',
    getCanonicalPageUrlForFavicon: (url) => url,
    getBrowserPageFaviconUrl: () => 'chrome://favicon/',
    getSiteDisplayName: (_host, title) => title || 'Example',
    getUrlDisplay: (url) => url,
    getRiSvg: (id, sizeClass = '') =>
      `<i class="${sizeClass} ${id}"></i>`,
    attachFaviconWithFallbacks: (image) => {
      image.src = 'data:image/png;base64,dGVzdA==';
    },
    getImmediateThemeForSuggestion: () => ({ accent: 'blue' }),
    queueThemeForTarget: () => {},
    applyCardTheme: (card) => {
      card.dataset.themed = 'true';
    },
    getCurrentRecentCount: () => 4,
    isPinned: () => false,
    isTracked: () => false,
    getPinnedCount: () => 0,
    getMaxPinnedCount: () => 3,
    updatePinButton: (button, pinned, limitReached) => {
      button.dataset.pinned = String(pinned);
      button.dataset.limitReached = String(limitReached);
      button.setAttribute('aria-label', pinned ? 'Unpin' : 'Pin');
    },
    updateTrackingButton: (button, tracked, pinned, limitReached, activeTabCount) => {
      button.dataset.tracked = String(tracked);
      button.dataset.pinned = String(pinned);
      button.dataset.limitReached = String(limitReached);
      button.dataset.activeTabCount = String(activeTabCount);
      button.setAttribute('aria-label', tracked ? 'Stop tracking' : 'Track link');
      button.setAttribute('aria-pressed', String(tracked));
    },
    showToast: () => {},
    showTopActionTooltip: () => {},
    hideTopActionTooltip: () => {},
    hideCursorTooltip: () => {},
    bindCursorTooltip: () => null,
    openUrl: () => {},
    togglePinned: () => Promise.resolve(null),
    toggleTracking: () => Promise.resolve(null),
    onItemContextMenu: () => {},
    ...overrides
  };
}

function createView(
  overrides: Partial<RecentSitesViewOptions> = {}
): {
  view: RecentSitesViewController;
  options: RecentSitesViewOptions;
} {
  const options = createOptions(overrides);
  const view = createRecentSitesView(options);
  views.push(view);
  return { view, options };
}

function renderItems(
  view: RecentSitesViewController,
  items: RecentSiteItem[],
  signature = ''
) {
  let result = {
    changed: false,
    count: 0,
    signature: ''
  };
  act(() => {
    result = view.render(items, { signature });
  });
  return result;
}

afterEach(() => {
  act(() => {
    views.forEach((view) => view.clear());
  });
  views = [];
});

describe('Recent Sites React island', () => {
  it('preserves signatures without a legacy renderer', () => {
    const items = [{
      title: 'Example',
      url: 'https://example.com/',
      visitCount: 2
    }];
    expect(getRecentSitesSignature(items)).toBe(
      '0::https://example.com/::Example::::::2::::0::::'
    );
    expect(getRecentSitesSignature([{ ...items[0], trackingEnabled: true }]))
      .toBe('0::https://example.com/::Example::::::2::tracked::0::::');
    expect(getRecentSitesSignature([{
      ...items[0],
      trackingEnabled: true,
      activeTabCount: 2
    }])).toBe('0::https://example.com/::Example::::::2::tracked::2::::');
    expect(getRecentSitesSignature([{ ...items[0], updatePending: true }]))
      .toBe('0::https://example.com/::Example::::::2::::0::updated::');

    const options = createOptions();
    const view = createRecentSitesView(options);
    views.push(view);
    expect(createRecentSitesViewApi().implementation).toBe('react');
  });

  it('renders cards synchronously and keeps external card metadata intact', () => {
    const attachFavicon = vi.fn();
    const applyTheme = vi.fn((card: RecentCardElement) => {
      card.dataset.themed = 'true';
    });
    const bindTooltip = vi.fn();
    const { view, options } = createView({
      attachFaviconWithFallbacks: attachFavicon,
      applyCardTheme: applyTheme,
      bindCursorTooltip: bindTooltip
    });
    const items = [{
      title: 'Example Docs',
      url: 'https://example.com/docs',
      lastVisitTime: 42,
      visitCount: 3
    }];

    const result = renderItems(view, items);
    const grid = options.grid as HTMLElement;
    const card = grid.querySelector<RecentCardElement>('.x-nt-recent-card');

    expect(result).toEqual({
      changed: true,
      count: 1,
      signature: getRecentSitesSignature(items)
    });
    expect(grid.dataset.reactIsland).toBe('recent-sites');
    expect(view.getCards()).toEqual([card]);
    expect(card?._xHost).toBe('example.com');
    expect(card?._xTitleText).toBe('Example Docs');
    expect(card?._xActionText?.textContent).toBe('前往');
    expect(card?._xPinButton).toBeInstanceOf(HTMLButtonElement);
    expect(card?._xTrackingButton).toBeInstanceOf(HTMLButtonElement);
    expect(card?.querySelector('.x-nt-recent-dismiss')).toBeNull();
    expect(
      card?.querySelector('.x-nt-recent-card-visual')
    ).toBeInstanceOf(HTMLDivElement);
    expect(card?.dataset.themed).toBe('true');
    expect(attachFavicon).toHaveBeenCalledOnce();
    expect(applyTheme).toHaveBeenCalledOnce();
    expect(bindTooltip).toHaveBeenCalledOnce();

    const unchanged = renderItems(view, items, result.signature);
    expect(unchanged.changed).toBe(false);
    expect(attachFavicon).toHaveBeenCalledOnce();
  });

  it('preserves card nodes when history metadata changes or order moves', () => {
    const { view } = createView();
    const first = {
      title: 'First',
      url: 'https://first.example/',
      lastVisitTime: 10,
      visitCount: 1
    };
    const second = {
      title: 'Second',
      url: 'https://second.example/',
      lastVisitTime: 20,
      visitCount: 2
    };
    const initial = renderItems(view, [first, second]);
    const firstCard = view.getCards()[0];
    const secondCard = view.getCards()[1];

    renderItems(view, [
      {
        ...second,
        lastVisitTime: 30,
        visitCount: 3
      },
      {
        ...first,
        lastVisitTime: 40,
        visitCount: 4
      }
    ], initial.signature);

    expect(view.getCards()).toEqual([secondCard, firstCard]);
    expect(view.getCards()[0]._xTitleText).toBe('Second');
    expect(view.getCards()[1]._xTitleText).toBe('First');
  });

  it('shows a stable fallback before a browser-page favicon attaches', () => {
    const attachFavicon = vi.fn();
    const browserPageUrl = 'chrome://extensions/';
    const browserPageFaviconUrl =
      'chrome-extension://lumno/_favicon/?pageUrl=chrome%3A%2F%2Fextensions%2F&size=128';
    const { view, options } = createView({
      getHostFromUrl: (url) =>
        url === browserPageUrl ? 'extensions' : 'example.com',
      getBrowserPageFaviconUrl: (url) =>
        url === browserPageUrl ? browserPageFaviconUrl : '',
      attachFaviconWithFallbacks: attachFavicon
    });

    renderItems(view, [{
      title: 'Extensions',
      url: browserPageUrl
    }]);

    const grid = options.grid as HTMLElement;
    const image = grid.querySelector<HTMLImageElement>(
      '.x-nt-recent-favicon'
    );
    const fallback = grid.querySelector<HTMLElement>(
      '._x_extension_favicon_fallback_2024_unique_'
    );

    expect(image?.hasAttribute('src')).toBe(false);
    expect(image?.dataset.faviconPlaceholder).toBe('true');
    expect(image?.dataset.fallbackIconName).toBe('ri-link');
    expect(fallback?.dataset.visible).toBe('true');
    expect(fallback?.innerHTML).toContain('ri-link');
    expect(attachFavicon).toHaveBeenCalledWith(
      image,
      browserPageUrl,
      'extensions',
      { primaryUrl: browserPageFaviconUrl }
    );
  });

  it('preserves pointer suppression and background-open behavior', async () => {
    const opened: Array<{
      url: string;
      openInBackgroundTab: boolean;
    }> = [];
    const { view } = createView({
      openUrl: (url, options) => {
        opened.push({ url, ...options });
      }
    });
    renderItems(view, [{
      title: 'Example',
      url: 'https://example.com/'
    }]);
    const card = view.getCards()[0];

    act(() => {
      card.dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        ctrlKey: true
      }));
      card.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        button: 0,
        ctrlKey: true
      }));
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    act(() => {
      card.dispatchEvent(new MouseEvent('auxclick', {
        bubbles: true,
        button: 1
      }));
    });

    expect(opened).toEqual([
      {
        url: 'https://example.com/',
        openInBackgroundTab: true,
        trackingCardId: ''
      },
      {
        url: 'https://example.com/',
        openInBackgroundTab: true,
        trackingCardId: ''
      }
    ]);
  });

  it('cleans foreground navigation listeners when the view clears', () => {
    const documentAdd = vi.spyOn(document, 'addEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const { view } = createView();
    renderItems(view, [{
      title: 'Example',
      url: 'https://example.com/'
    }]);

    act(() => {
      view.getCards()[0].dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        button: 0
      }));
    });
    expect(
      documentAdd.mock.calls.some(([type]) => type === 'visibilitychange')
    ).toBe(true);
    expect(
      windowAdd.mock.calls.some(([type]) => type === 'pagehide')
    ).toBe(true);

    act(() => {
      view.clear();
    });
    expect(
      documentRemove.mock.calls.some(([type]) => type === 'visibilitychange')
    ).toBe(true);
    expect(
      windowRemove.mock.calls.some(([type]) => type === 'pagehide')
    ).toBe(true);
    expect(view.getCards()).toEqual([]);
  });

  it('keeps pin-limit activation inside the action button', () => {
    const opened = vi.fn();
    const showToast = vi.fn();
    const updatePinButton = vi.fn();
    const { view } = createView({
      openUrl: opened,
      getPinnedCount: () => 3,
      getMaxPinnedCount: () => 3,
      showToast,
      updatePinButton
    });
    renderItems(view, [{
      title: 'Example',
      url: 'https://example.com/'
    }]);
    updatePinButton.mockClear();

    act(() => {
      view.getCards()[0]._xPinButton?.click();
    });

    expect(opened).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('最多只能置顶 3 个卡片', false);
    expect(updatePinButton).toHaveBeenCalledWith(
      view.getCards()[0]._xPinButton,
      false,
      true
    );
  });

  it('routes right-click through the shared New Tab context-menu callback', () => {
    const onItemContextMenu = vi.fn((payload) => {
      payload.event.preventDefault();
      payload.event.stopPropagation();
    });
    const opened = vi.fn();
    const item = {
      title: 'Example',
      url: 'https://example.com/'
    };
    const { view } = createView({
      openUrl: opened,
      onItemContextMenu
    });
    renderItems(view, [item]);
    const card = view.getCards()[0];
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 120,
      clientY: 80
    });

    act(() => {
      card.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(onItemContextMenu).toHaveBeenCalledWith({
      event,
      item,
      element: card
    });
    expect(opened).not.toHaveBeenCalled();
  });

  it('tracks from a sibling action without opening the card', async () => {
    const opened = vi.fn();
    const updatePinButton = vi.fn();
    const updateTrackingButton = vi.fn(
      (button: HTMLButtonElement, tracked: boolean) => {
        button.dataset.tracked = String(tracked);
        button.setAttribute('aria-label', tracked ? 'Stop tracking' : 'Track link');
      }
    );
    const toggleTracking = vi.fn(() => Promise.resolve({
      pinned: true,
      tracking: true,
      limitReached: false
    }));
    const { view } = createView({
      openUrl: opened,
      toggleTracking,
      updateTrackingButton,
      updatePinButton
    });
    renderItems(view, [{
      title: 'Example',
      url: 'https://example.com/'
    }]);
    const card = view.getCards()[0];
    const trackingButton = card._xTrackingButton;

    expect(trackingButton).toBeInstanceOf(HTMLButtonElement);
    expect(trackingButton?.getAttribute('aria-label')).toBe('Track link');
    expect(trackingButton?.querySelector('[data-recent-track-icon]')?.className)
      .toContain('ri-radar-line');

    await act(async () => {
      trackingButton?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(opened).not.toHaveBeenCalled();
    expect(toggleTracking).toHaveBeenCalledOnce();
    expect(updateTrackingButton).toHaveBeenCalledWith(
      trackingButton,
      true,
      true,
      false,
      0
    );
    expect(updatePinButton).toHaveBeenCalledWith(
      card._xPinButton,
      true,
      false
    );
  });

  it('exposes active tracked-tab count on the tracking action', () => {
    const { view } = createView({
      isPinned: () => true,
      isTracked: (item) => item.trackingEnabled === true
    });
    renderItems(view, [{
      cardId: 'pinned-live',
      title: 'Live course',
      url: 'https://example.com/course',
      trackingEnabled: true,
      activeTabCount: 2
    }]);

    const trackingButton = view.getCards()[0]._xTrackingButton;
    expect(trackingButton?.dataset.tracked).toBe('true');
    expect(trackingButton?.dataset.activeTabCount).toBe('2');
  });

  it('shows an update badge and clears it when the card is opened', async () => {
    const opened = vi.fn();
    const acknowledgeUpdate = vi.fn(() => Promise.resolve(true));
    const rememberTrackingTarget = vi.fn();
    const { view } = createView({
      openUrl: opened,
      acknowledgeUpdate,
      rememberTrackingTarget,
      isTracked: () => true
    });
    const item = {
      title: 'Updated episode',
      url: 'https://example.com/episode-2',
      updatePending: true
    };
    renderItems(view, [item]);
    const card = view.getCards()[0];

    expect(card.dataset.recentUpdatePending).toBe('true');
    expect(card.querySelector('.x-nt-recent-update-badge')?.textContent)
      .toBe('更新');

    await act(async () => {
      card.click();
      await Promise.resolve();
    });

    expect(acknowledgeUpdate).toHaveBeenCalledWith(item);
    expect(rememberTrackingTarget).toHaveBeenCalledWith(item);
    expect(card.hasAttribute('data-recent-update-pending')).toBe(false);
    expect(card.querySelector('.x-nt-recent-update-badge')).toBeNull();
    expect(opened).toHaveBeenCalledWith(item.url, {
      openInBackgroundTab: false,
      trackingCardId: ''
    });
  });

  it('binds a foreground tracked tab before navigation starts', async () => {
    let finishBinding: () => void = () => {};
    const opened = vi.fn();
    const rememberTrackingTarget = vi.fn(() => new Promise<void>((resolve) => {
      finishBinding = resolve;
    }));
    const { view } = createView({
      openUrl: opened,
      rememberTrackingTarget,
      isTracked: () => true
    });
    renderItems(view, [{
      cardId: 'pinned-sequenced',
      title: 'Sequenced',
      url: 'https://example.com/sequenced'
    }]);

    view.getCards()[0].click();
    expect(rememberTrackingTarget).toHaveBeenCalledOnce();
    expect(opened).not.toHaveBeenCalled();

    await act(async () => {
      finishBinding();
      await Promise.resolve();
    });
    expect(opened).toHaveBeenCalledOnce();
  });

  it('serializes pin and tracking actions on the same card', async () => {
    let resolveTracking: (
      result: { pinned: boolean; tracking: boolean; limitReached: boolean }
    ) => void = () => {};
    const toggleTracking = vi.fn(() => new Promise<{
      pinned: boolean;
      tracking: boolean;
      limitReached: boolean;
    }>((resolve) => {
      resolveTracking = resolve;
    }));
    const togglePinned = vi.fn(() => Promise.resolve({
      pinned: true,
      limitReached: false
    }));
    const { view } = createView({ togglePinned, toggleTracking });
    renderItems(view, [{
      title: 'Example',
      url: 'https://example.com/'
    }]);
    const card = view.getCards()[0];

    act(() => {
      card._xTrackingButton?.click();
      card._xPinButton?.click();
    });

    expect(toggleTracking).toHaveBeenCalledOnce();
    expect(togglePinned).not.toHaveBeenCalled();
    expect(card._xTrackingButton?.disabled).toBe(true);
    expect(card._xPinButton?.disabled).toBe(true);

    await act(async () => {
      resolveTracking({ pinned: true, tracking: true, limitReached: false });
      await Promise.resolve();
    });
  });

  it('coalesces rapid pin actions while persistence is pending', async () => {
    let resolvePin: (
      result: { pinned: boolean; limitReached: boolean }
    ) => void = () => {};
    const togglePinned = vi.fn(() => new Promise<{
      pinned: boolean;
      limitReached: boolean;
    }>((resolve) => {
      resolvePin = resolve;
    }));
    const { view } = createView({ togglePinned });
    renderItems(view, [{
      title: 'Example',
      url: 'https://example.com/'
    }]);
    const pinButton = view.getCards()[0]._xPinButton;

    act(() => {
      pinButton?.click();
      pinButton?.click();
    });

    expect(togglePinned).toHaveBeenCalledTimes(1);
    expect(pinButton?.disabled).toBe(true);
    expect(pinButton?.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      resolvePin({ pinned: true, limitReached: false });
      await Promise.resolve();
    });

    expect(pinButton?.disabled).toBe(false);
    expect(pinButton?.getAttribute('aria-busy')).toBe('false');
  });
});

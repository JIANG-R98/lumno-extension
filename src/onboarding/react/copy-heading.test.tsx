import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCopyHeadingApi,
  createCopyHeadingController,
  type CopyHeadingController,
  type CopyHeadingRenderModel
} from './copy-heading';

let controllers: CopyHeadingController[] = [];

function createFixture() {
  const eyebrow = document.createElement('p');
  eyebrow.id = 'onboarding-eyebrow';
  const title = document.createElement('h1');
  title.id = 'onboarding-title';
  document.body.append(eyebrow, title);
  const options = {
    onTitleFitNeeded: vi.fn()
  };
  const controller = createCopyHeadingController(
    { eyebrow, title },
    options
  );
  controllers.push(controller);
  return { controller, eyebrow, options, title };
}

function render(
  controller: CopyHeadingController,
  overrides: Partial<CopyHeadingRenderModel> = {}
): void {
  act(() => {
    controller.render({
      cycleFirstDelayMs: 520,
      cycleIntervalMs: 1900,
      eyebrow: 'Welcome',
      reducedMotion: false,
      swapDurationMs: 200,
      title: 'Search your bookmarks',
      titleCycle: null,
      titleLines: [],
      titleLogo: null,
      ...overrides
    });
  });
}

afterEach(() => {
  act(() => {
    controllers.forEach((controller) => controller.destroy());
  });
  controllers = [];
  document.body.textContent = '';
  vi.useRealTimers();
});

describe('Onboarding copy heading React island', () => {
  it('renders eyebrow and plain title copy on stable hosts', () => {
    const { controller, eyebrow, title } = createFixture();
    render(controller);

    expect(createCopyHeadingApi().implementation).toBe('react');
    expect(eyebrow.dataset.reactIsland).toBe('onboarding-eyebrow');
    expect(eyebrow.dataset.empty).toBe('false');
    expect(eyebrow.textContent).toBe('Welcome');
    expect(title.dataset.reactIsland).toBe('onboarding-title-copy');
    expect(title.dataset.empty).toBe('false');
    expect(title.textContent).toBe('Search your bookmarks');
    expect(title.hasAttribute('aria-label')).toBe(false);
  });

  it('renders multiline title copy and the optional logo contract', () => {
    const { controller, title } = createFixture();
    render(controller, {
      title: 'Meet Lumno',
      titleLines: ['Meet', 'Lumno'],
      titleLogo: {
        label: 'Lumno',
        src: '/assets/lumno.svg'
      }
    });

    expect(title.getAttribute('aria-label')).toBe('Meet Lumno');
    expect(title.querySelectorAll('.title-line')).toHaveLength(2);
    expect(title.querySelector('.title-break')).not.toBeNull();
    const logo = title.querySelector<HTMLImageElement>('.title-logo-mark');
    expect(logo?.getAttribute('src')).toBe('/assets/lumno.svg');
    expect(logo?.title).toBe('Lumno');
    expect(logo?.getAttribute('aria-hidden')).toBe('true');
  });

  it('cycles title labels with the existing exit and enter timing', () => {
    vi.useFakeTimers();
    const { controller, options, title } = createFixture();
    render(controller, {
      title: 'Search bookmarks and history',
      titleCycle: {
        prefix: 'Search ',
        items: [
          { label: 'bookmarks', tone: 'bookmark' },
          { label: 'history', tone: 'history' }
        ]
      },
      titleLines: ['Search bookmarks', 'from anywhere']
    });
    const getText = () => title.querySelector<HTMLElement>(
      '[data-title-rotator-text]'
    );
    const getRotator = () => title.querySelector<HTMLElement>(
      '[data-title-rotator]'
    );

    expect(getText()?.textContent).toBe('bookmarks');
    expect(getRotator()?.dataset.tone).toBe('bookmark');

    act(() => {
      vi.advanceTimersByTime(520);
    });
    expect(getText()?.classList.contains('is-exit')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(getText()?.textContent).toBe('history');
    expect(getText()?.classList.contains('is-enter-start')).toBe(true);
    expect(getRotator()?.dataset.tone).toBe('history');

    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(getText()?.classList.contains('is-enter-start')).toBe(false);
    expect(options.onTitleFitNeeded).toHaveBeenCalled();
  });

  it('keeps the first title item static when reduced motion is preferred', () => {
    vi.useFakeTimers();
    const { controller, title } = createFixture();
    render(controller, {
      reducedMotion: true,
      titleCycle: {
        prefix: 'Search ',
        items: [
          { label: 'bookmarks', tone: 'bookmark' },
          { label: 'history', tone: 'history' }
        ]
      },
      titleLines: ['Search bookmarks', 'from anywhere']
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(
      title.querySelector('[data-title-rotator-text]')?.textContent
    ).toBe('bookmarks');
    expect(
      title.querySelector('[data-title-rotator]')?.getAttribute('data-tone')
    ).toBe('bookmark');
  });
});

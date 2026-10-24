import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPageStripApi,
  createPageStripController,
  type PageStripController
} from './page-strip';

let controllers: PageStripController[] = [];

function createFixture() {
  const host = document.createElement('div');
  host.hidden = true;
  document.body.appendChild(host);
  const onNavigate = vi.fn();
  const controller = createPageStripController(host, { onNavigate });
  controllers.push(controller);
  return { controller, host, onNavigate };
}

function renderPage(
  controller: PageStripController,
  overrides: Partial<Parameters<PageStripController['render']>[0]> = {}
): void {
  act(() => {
    controller.render({
      pageCount: 4,
      currentPageIndex: 1,
      hidden: false,
      entering: false,
      ariaLabel: 'Page 2 of 4',
      segmentAriaLabels: ['Page 1', 'Page 2', 'Page 3', 'Page 4'],
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
});

describe('Onboarding page strip React island', () => {
  it('renders the current step with the legacy class and ARIA contract', () => {
    const { controller, host } = createFixture();
    renderPage(controller);

    const segments = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.page-strip-segment')
    );
    expect(createPageStripApi().implementation).toBe('react');
    expect(host.dataset.reactIsland).toBe('onboarding-page-strip');
    expect(host.hidden).toBe(false);
    expect(host.style.getPropertyValue('--page-strip-count')).toBe('4');
    expect(host.getAttribute('aria-label')).toBe('Page 2 of 4');
    expect(segments).toHaveLength(4);
    expect(segments[1].dataset.active).toBe('true');
    expect(segments[1].getAttribute('aria-current')).toBe('step');
    expect(
      segments[3].style.getPropertyValue('--page-strip-segment-index')
    ).toBe('3');
  });

  it('removes segments while the intro page keeps the strip hidden', () => {
    const { controller, host } = createFixture();
    renderPage(controller);
    renderPage(controller, { hidden: true });

    expect(host.hidden).toBe(true);
    expect(host.childElementCount).toBe(0);
  });

  it('preserves the one-render entrance marker', () => {
    const { controller, host } = createFixture();
    renderPage(controller, { entering: true });
    expect(host.dataset.entering).toBe('true');

    renderPage(controller, { entering: false });
    expect(host.dataset.entering).toBe('false');
  });

  it('navigates once without reaching the legacy document delegate', () => {
    const { controller, host, onNavigate } = createFixture();
    const documentClick = vi.fn();
    document.addEventListener('click', documentClick);
    renderPage(controller);

    act(() => {
      host.querySelectorAll<HTMLButtonElement>('button')[2].click();
    });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(3);
    expect(documentClick).not.toHaveBeenCalled();
    document.removeEventListener('click', documentClick);
  });
});

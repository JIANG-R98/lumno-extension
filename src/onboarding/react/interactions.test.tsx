import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInteractionsApi,
  createInteractionsController,
  type InteractionsController
} from './interactions';

let controllers: InteractionsController[] = [];

function createFixture() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const options = {
    onAction: vi.fn(),
    onHideInfoTooltip: vi.fn(),
    onShowInfoTooltip: vi.fn(),
    onToggleAccordion: vi.fn()
  };
  const controller = createInteractionsController(host, options);
  controllers.push(controller);
  return { controller, host, options };
}

function renderSlots(
  controller: InteractionsController,
  slots: Parameters<InteractionsController['render']>[0]['slots'],
  expandedAccordionId = ''
): void {
  act(() => {
    controller.render({
      expandedAccordionId,
      slots
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

describe('Onboarding interactions React island', () => {
  it('removes an empty interaction host from the page layout', () => {
    const { controller, host } = createFixture();

    renderSlots(controller, []);

    expect(host.hidden).toBe(true);
    expect(host.dataset.visible).toBe('false');

    renderSlots(controller, [
      {
        id: 'intro-trust',
        kind: 'trust-row',
        label: 'Open source'
      }
    ]);

    expect(host.hidden).toBe(false);
    expect(host.dataset.visible).toBe('true');
  });

  it('renders information rows, icons, and external affordances', () => {
    const { controller, host } = createFixture();
    renderSlots(controller, [
      {
        id: 'intro-trust',
        kind: 'trust-row',
        icon: 'ri-shield-check-line',
        label: 'Open source',
        linkButton: {
          href: 'https://github.com/example/project',
          icon: 'ri-github-fill',
          label: 'GitHub repo',
          tooltip: 'View source'
        }
      },
      {
        id: 'intro-browser',
        kind: 'browser-row',
        icon: 'ri-chrome-line',
        label: 'Supports browsers',
        browserAvatars: {
          browsers: [{ id: 'chrome', name: 'Chrome' }]
        },
        infoTooltip: {
          icon: 'ri-information-line',
          label: 'Supported browsers',
          type: 'browser-avatars'
        }
      }
    ]);

    expect(createInteractionsApi().implementation).toBe('react');
    expect(host.dataset.reactIsland).toBe('onboarding-interactions');
    expect(host.dataset.accordion).toBe('false');
    expect(host.querySelectorAll('.interaction-slot')).toHaveLength(2);
    expect(host.querySelector('.ri-shield-check-line')).not.toBeNull();
    expect(
      host.querySelector<HTMLAnchorElement>('.interaction-link-button')?.href
    ).toBe('https://github.com/example/project');
    expect(
      host.querySelector<HTMLButtonElement>('button.interaction-info-button')
        ?.dataset.tooltipType
    ).toBe('browser-avatars');
  });

  it('updates accordion state through the controller without document delegation', () => {
    const { controller, host, options } = createFixture();
    const documentClick = vi.fn();
    document.addEventListener('click', documentClick);
    renderSlots(controller, [
      {
        id: 'setup-dia',
        accordionId: 'dia-browser',
        actionId: 'toggleInteractionAccordion',
        kind: 'accordion-row',
        label: 'Dia browser users',
        accordion: {
          text: 'Open shortcut settings',
          links: [
            {
              actionId: 'openShortcuts',
              href: 'chrome://extensions/shortcuts',
              label: 'shortcut settings'
            }
          ]
        }
      }
    ]);

    const trigger = host.querySelector<HTMLButtonElement>(
      '.interaction-accordion-trigger'
    );
    act(() => {
      trigger?.click();
    });

    expect(options.onToggleAccordion).toHaveBeenCalledWith('dia-browser');
    expect(documentClick).not.toHaveBeenCalled();

    act(() => {
      controller.setExpandedAccordionId('dia-browser');
    });
    expect(
      host.querySelector('.interaction-slot')?.getAttribute('data-expanded')
    ).toBe('true');
    expect(
      host.querySelector('.interaction-accordion-trigger')
        ?.getAttribute('aria-expanded')
    ).toBe('true');
    expect(
      host.querySelector('.interaction-accordion-text')
        ?.getAttribute('aria-hidden')
    ).toBe('false');
    document.removeEventListener('click', documentClick);
  });

  it('routes accordion links and skeleton row actions exactly once', () => {
    const { controller, host, options } = createFixture();
    renderSlots(
      controller,
      [
        {
          id: 'setup-file',
          accordionId: 'local-file',
          kind: 'accordion-row',
          label: 'Local files',
          accordion: {
            text: 'Open extension details',
            links: [
              {
                actionId: 'openExtensionDetails',
                href: 'chrome://extensions/',
                label: 'extension details'
              }
            ]
          }
        },
        {
          id: 'search-placeholder',
          actionId: 'next',
          kind: 'segmented-control',
          label: ''
        }
      ],
      'local-file'
    );

    act(() => {
      host.querySelector<HTMLAnchorElement>(
        '.interaction-accordion-link'
      )?.click();
      host.querySelector<HTMLButtonElement>(
        '.interaction-slot[data-action="next"]'
      )?.click();
    });

    expect(options.onAction.mock.calls.map((call) => call[0])).toEqual([
      'openExtensionDetails',
      'next'
    ]);
    expect(host.querySelectorAll('.skeleton-line')).toHaveLength(2);
  });

  it('preserves Tooltip hover, focus, click, and Escape behavior', () => {
    const { controller, host, options } = createFixture();
    renderSlots(controller, [
      {
        id: 'intro-info',
        kind: 'info-row',
        label: 'Compatibility',
        infoTooltip: {
          label: 'Compatibility info',
          text: 'Works with other extensions'
        }
      }
    ]);
    const button = host.querySelector<HTMLButtonElement>(
      '.interaction-info-button'
    );
    if (!button) {
      throw new Error('fixture info button is missing');
    }

    act(() => {
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      button.focus();
      button.click();
      button.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
      );
    });

    expect(options.onShowInfoTooltip).toHaveBeenCalled();
    expect(options.onHideInfoTooltip).toHaveBeenCalled();
    expect(document.activeElement).not.toBe(button);
  });

  it('renders inline descriptions without a Tooltip affordance', () => {
    const { controller, host } = createFixture();
    renderSlots(controller, [
      {
        id: 'search-compatibility',
        kind: 'compatibility-row',
        label: 'Compatibility',
        description: 'Works with other new tab extensions.'
      }
    ]);

    expect(host.querySelector('.interaction-description')?.textContent).toBe(
      'Works with other new tab extensions.'
    );
    expect(host.querySelector('.interaction-info-button')).toBeNull();
  });
});

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAskDemoFrames,
  FeedbackSupportView,
  type FeedbackSupportRenderModel
} from './feedback-support';
import { createReactRootController, type ReactRootController } from '../../shared/react/root-controller';
import { queryHtmlElement, queryHtmlTag } from '../../shared/dom-lookup';

let controllers: Array<ReactRootController<FeedbackSupportRenderModel>> = [];

const model: FeedbackSupportRenderModel = {
  heading: '反馈与支持',
  headingKey: 'settings_feedback_support_section_title',
  items: [
    {
      href: 'https://example.com/qrcode.JPG',
      iconClass: 'ri-wechat-line',
      key: 'community',
      label: '加入反馈群',
      labelKey: 'settings_feedback_support_wechat_action'
    },
    {
      href: 'https://chromewebstore.google.com/example/reviews',
      iconClass: 'ri-star-line',
      key: 'chrome-review',
      label: '为 Lumno 评分',
      labelKey: 'settings_feedback_support_review_action'
    },
    {
      href: 'https://github.com/example/issues/new',
      iconClass: 'ri-github-line',
      key: 'github-issue',
      label: '创建 Issue',
      labelKey: 'settings_feedback_support_github_issue_action'
    },
    {
      href: 'https://x.com/example',
      iconClass: 'ri-twitter-x-line',
      key: 'contact-author',
      label: '联系作者',
      labelKey: 'settings_feedback_support_contact_author_action'
    }
  ]
};

function createFixture() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const controller = createReactRootController(host, (value: FeedbackSupportRenderModel) => <FeedbackSupportView {...value} />);
  controllers.push(controller);
  return { controller, host };
}

afterEach(() => {
  vi.useRealTimers();
  act(() => {
    controllers.forEach((controller) => controller.destroy());
  });
  controllers = [];
  document.body.textContent = '';
});

describe('Options feedback support', () => {
  it('lays the feedback channels out as one row of tiles under the heading', () => {
    const { controller, host } = createFixture();
    act(() => controller.render(model));

    const nav = host.querySelector('nav._x_extension_feedback_support_links_2026_unique_');
    const tiles = nav?.querySelectorAll('a._x_extension_feedback_support_link_2026_unique_') || [];
    expect(tiles).toHaveLength(4);
    tiles.forEach((tile) => {
      expect(tile.firstElementChild?.classList.contains('ri-icon')).toBe(true);
      expect(tile.querySelector('span')?.textContent).toBeTruthy();
      // The whole tile is the link; no external-link mark.
      expect(tile.querySelector('.ri-external-link-line')).toBeNull();
    });
  });

  it('uses secure external anchors and preserves the provided destinations', () => {
    const { controller, host } = createFixture();
    act(() => controller.render(model));

    const community = queryHtmlTag(host, '[data-feedback-support="community"]', 'a');
    expect(community?.href).toBe('https://example.com/qrcode.JPG');
    expect(community?.target).toBe('_blank');
    expect(community?.rel).toContain('noopener');
  });

  it('puts the help center first as a card that links to it', () => {
    const { controller, host } = createFixture();
    act(() => controller.render({
      ...model,
      help: {
        description: '不清楚某个功能怎么用？每个功能的用法都写在这里',
        descriptionKey: 'settings_help_center_desc',
        href: 'https://lumno.kubai.design/help/what-is-lumno/',
        label: '访问帮助中心',
        labelKey: 'settings_help_center_action',
        title: '帮助中心',
        titleKey: 'settings_help_center_title'
      }
    }));

    const card = host.querySelector('._x_extension_feedback_support_help_card_2026_unique_');
    // The card's row and the tiles share one block, with no row title between them.
    expect(card?.parentElement?.nextElementSibling?.tagName).toBe('NAV');
    expect(host.querySelector('._x_extension_setting_title_2024_unique_')).toBeNull();
    const link = card ? queryHtmlTag(card, '[data-feedback-support="help-center"]', 'a') : null;
    expect(link?.href).toBe('https://lumno.kubai.design/help/what-is-lumno/');
    expect(link?.target).toBe('_blank');
    expect(link?.textContent).toBe('帮助中心');
    expect(link?.getAttribute('aria-label')).toBe('访问帮助中心');
    expect(card?.querySelector('._x_extension_feedback_support_help_desc_2026_unique_')?.textContent)
      .toBe('不清楚某个功能怎么用？每个功能的用法都写在这里');
    expect(card?.querySelector('.ri-external-link-line')).toBeNull();
    // Without the Help Center site search there is nothing to demo.
    expect(card?.querySelector('[data-feedback-support="help-center-ask"]')).toBeNull();
  });

  it('draws channel cards beside the help center and action tiles after the channels', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onClick = vi.fn();
    const controller = createReactRootController(host, (value: FeedbackSupportRenderModel) => (
      <FeedbackSupportView
        {...value}
        actions={[{ iconClass: 'ri-compass-3-line', label: '新手引导', onClick }]}
      />
    ));
    controllers.push(controller);
    const [community, ...channels] = model.items;
    act(() => controller.render({
      ...model,
      cards: [{
        ...community,
        qr: { alt: '二维码', closeLabel: '关闭', imageUrl: 'https://example.com/qrcode.webp', title: '反馈群' }
      }],
      items: channels,
      help: {
        href: 'https://lumno.kubai.design/help/what-is-lumno/',
        label: '访问帮助中心',
        labelKey: 'settings_help_center_action',
        title: '帮助中心',
        titleKey: 'settings_help_center_title'
      }
    }));

    const cards = host.querySelector('._x_extension_feedback_support_cards_2026_unique_');
    // Both rows take one column per tile, so the card beside the Help Center lines up with the last tile.
    expect(queryHtmlElement(host, '._x_extension_feedback_support_cards_2026_unique_')?.style
      .getPropertyValue('--feedback-support-columns')).toBe('4');
    const row = cards?.firstElementChild;
    expect(row?.classList.contains('_x_extension_feedback_support_help_row_2026_unique_')).toBe(true);
    expect(row?.firstElementChild?.querySelector('[data-feedback-support="help-center"]')).not.toBeNull();
    const group = row?.lastElementChild?.querySelector('[data-feedback-support="community"]');
    expect(group?.classList.contains('_x_extension_feedback_support_help_card_2026_unique_')).toBe(true);
    expect(group?.getAttribute('aria-haspopup')).toBe('dialog');
    const nav = host.querySelector('nav._x_extension_feedback_support_links_2026_unique_');
    expect(nav?.children).toHaveLength(4);
    const guide = nav ? queryHtmlTag(nav, ':scope > button:last-child', 'button') : null;
    expect(guide?.classList.contains('_x_extension_feedback_support_link_2026_unique_')).toBe(true);
    expect(guide?.textContent).toBe('新手引导');
    act(() => guide?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('plays a demo of asking the help center from the search box on hover or focus', () => {
    vi.useFakeTimers();
    const { controller, host } = createFixture();
    act(() => controller.render({
      ...model,
      help: {
        ask: {
          caption: '输入 lm，按 Tab，再写下你的问题。',
          captionKey: 'settings_help_center_ask_caption',
          descriptionTemplate: '用法都在这里，也可以{ask}。',
          iconUrl: 'chrome-extension://id/assets/images/site-search/glyph-lm.png',
          label: '在搜索框里直接提问',
          labelKey: 'settings_help_center_ask_action',
          prefix: 'lm',
          providerName: 'Lumno 帮助中心',
          query: '怎么改',
          results: [{ detail: '修改快捷键', title: '快捷键' }]
        },
        description: '不清楚某个功能怎么用？',
        descriptionKey: 'settings_help_center_desc',
        href: 'https://lumno.kubai.design/help/what-is-lumno/',
        label: '访问帮助中心',
        labelKey: 'settings_help_center_action',
        title: '帮助中心',
        titleKey: 'settings_help_center_title'
      }
    }));

    const card = host.querySelector('._x_extension_feedback_support_help_card_2026_unique_');
    // The demo hangs off words in the description, not a button beside the title or the link.
    expect(card?.querySelector('[data-feedback-support="help-center"] button')).toBeNull();
    const description = card?.querySelector('._x_extension_feedback_support_help_desc_2026_unique_');
    // The description mixes copy and markup, so the page-wide i18n pass must leave it alone.
    expect(description?.hasAttribute('data-i18n')).toBe(false);
    const trigger = (description ? queryHtmlTag(description, 'button[data-feedback-support="help-center-ask"]', 'button') : null);
    expect(trigger?.classList.contains('_x_extension_help_ask_trigger_2026_unique_')).toBe(true);
    expect(trigger?.querySelector('[data-i18n="settings_help_center_ask_action"]')?.textContent).toBe('在搜索框里直接提问');
    expect(description?.firstChild?.textContent).toBe('用法都在这里，也可以');
    expect(description?.lastChild?.textContent).toBe('。');
    const popover = queryHtmlElement(host, '[role="tooltip"]');
    expect(popover?.dataset.open).toBe('false');
    expect(trigger?.getAttribute('aria-describedby')).toBe(popover?.id);

    act(() => {
      trigger?.focus();
      vi.advanceTimersByTime(0);
    });
    expect(popover?.dataset.open).toBe('true');

    const demo = (popover ? queryHtmlElement(popover, '._x_extension_help_ask_demo_2026_unique_') : null);
    const frames = buildAskDemoFrames('lm', '怎么改');
    const playUntil = (phase: string) => {
      for (let step = 0; step < frames.length * 2 && demo?.dataset.phase !== phase; step += 1) {
        act(() => {
          vi.advanceTimersByTime(3000);
        });
      }
    };
    // While the question is typed, placeholder rows stand in for each page about to appear.
    const skeletonRows = demo?.querySelectorAll('._x_extension_help_ask_demo_skeleton_2026_unique_ li');
    expect(skeletonRows).toHaveLength(1);
    expect(skeletonRows?.[0].textContent).toBe('');
    expect((demo ? queryHtmlElement(demo, '._x_extension_help_ask_demo_results_2026_unique_') : null)?.dataset.visible)
      .toBe('false');
    playUntil('tab');
    expect(demo?.querySelector('._x_extension_help_ask_demo_text_2026_unique_')?.textContent).toBe('lm');
    expect(demo?.querySelector('kbd')?.dataset.pressed).toBe('true');
    playUntil('results');
    expect(demo?.querySelector('._x_extension_help_ask_demo_chip_2026_unique_')?.textContent).toBe('Lumno 帮助中心');
    expect(demo?.querySelector('._x_extension_help_ask_demo_text_2026_unique_')?.textContent).toBe('怎么改');
    const results = (demo ? queryHtmlElement(demo, '._x_extension_help_ask_demo_results_2026_unique_') : null);
    expect(results?.dataset.visible).toBe('true');
    expect(results?.querySelectorAll('._x_extension_help_ask_demo_list_2026_unique_ li')).toHaveLength(1);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(popover?.dataset.open).toBe('false');
    expect(demo?.dataset.phase).toBe('idle');
  });

  it('builds one demo loop: keyword, Tab, the question letter by letter, then the pages', () => {
    const frames = buildAskDemoFrames('lm', '快捷键');
    expect(frames.map((frame) => frame.phase)).toEqual([
      'idle', 'prefix', 'prefix', 'tab', 'question', 'question', 'question', 'question', 'results'
    ]);
    expect(frames.every((frame) => frame.duration > 0)).toBe(true);
  });

  it('appends the ask trigger when a translation leaves out the {ask} slot', () => {
    const { controller, host } = createFixture();
    act(() => controller.render({
      ...model,
      help: {
        ask: {
          caption: '',
          captionKey: 'settings_help_center_ask_caption',
          descriptionTemplate: 'Feature guides.',
          iconUrl: '',
          label: 'ask from the search box',
          labelKey: 'settings_help_center_ask_action',
          prefix: 'lm',
          providerName: 'Lumno Help Center',
          query: 'shortcut',
          results: []
        },
        description: 'Feature guides.',
        descriptionKey: 'settings_help_center_desc',
        href: 'https://lumno.kubai.design/help/what-is-lumno/',
        label: 'Visit Help Center',
        labelKey: 'settings_help_center_action',
        title: 'Help Center',
        titleKey: 'settings_help_center_title'
      }
    }));

    const description = host.querySelector('._x_extension_feedback_support_help_desc_2026_unique_');
    expect(description?.firstChild?.textContent).toBe('Feature guides.');
    expect(description?.querySelector('[data-feedback-support="help-center-ask"]')?.textContent)
      .toBe('ask from the search box');
  });

  it('opens the WeChat group QR code in a popover instead of a new tab', () => {
    const { controller, host } = createFixture();
    act(() => controller.render({
      ...model,
      items: model.items.map((item) => item.key === 'community'
        ? {
            ...item,
            qr: {
              alt: 'Lumno 微信群二维码',
              closeLabel: '关闭',
              imageUrl: 'https://example.com/qrcode.webp',
              title: 'Bug 反馈 & 新功能提需'
            }
          }
        : item)
    }));

    const trigger = queryHtmlTag(host, 'button[data-feedback-support="community"]', 'button');
    expect(trigger?.classList.contains('_x_extension_feedback_support_link_2026_unique_')).toBe(true);
    expect(trigger?.querySelector('.ri-qr-code-line')).not.toBeNull();
    const popover = queryHtmlElement(host, '[role="dialog"]');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(popover?.dataset.open).toBe('false');
    expect(popover?.querySelector('img')?.getAttribute('src')).toBe('https://example.com/qrcode.webp');

    act(() => trigger?.click());
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(popover?.dataset.open).toBe('true');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(popover?.dataset.open).toBe('false');

    act(() => trigger?.click());
    act(() => (popover ? queryHtmlTag(popover, 'button', 'button') : null)?.click());
    expect(popover?.dataset.open).toBe('false');
  });

  it('updates the localized community entry in place', () => {
    const { controller, host } = createFixture();
    act(() => controller.render(model));
    act(() => controller.render({
      ...model,
      heading: 'Feedback & Support',
      items: model.items.map((item) => item.key === 'community'
        ? {
            ...item,
            href: 'https://example.com/qr-v2.webp',
            label: '加入反馈群（新）',
            labelKey: 'settings_feedback_support_wechat_action'
          }
        : item)
    }));

    expect(host.querySelector('h2')?.textContent).toBe('Feedback & Support');
    expect(host.querySelector('[data-feedback-support="community"]')?.textContent)
      .toContain('加入反馈群（新）');
  });
});

// The switcher's stylesheet, inside its shadow root.

const PANEL_ID = '_x_extension_tab_switcher_panel_2026_unique_';

const SWITCHER_STYLES = `
    :host {
      all: initial;
    }
    #${PANEL_ID},
    #${PANEL_ID} * {
      box-sizing: border-box;
      font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    #${PANEL_ID} {
      all: unset;
      --x-tab-switcher-accent: #2563eb;
      --x-tab-switcher-card-width: clamp(136px, calc((100vw - 68px) / 5), 204px);
      --x-tab-switcher-gap: 6px;
      --x-tab-switcher-padding-panel: 6px;
      --x-tab-switcher-padding-card: 4px;
      --x-tab-switcher-border-card: 1px;
      --x-tab-switcher-radius-panel: 26px;
      --x-tab-switcher-radius-card: calc(var(--x-tab-switcher-radius-panel) - var(--x-tab-switcher-padding-panel));
      --x-tab-switcher-radius-thumb: calc(var(--x-tab-switcher-radius-card) - var(--x-tab-switcher-padding-card) - var(--x-tab-switcher-border-card));
      --x-tab-switcher-radius-icon: 9px;
      --x-tab-switcher-radius-title-icon: 4px;
      --x-tab-switcher-meta-inline-padding: 4px;
      --x-tab-switcher-visible-scale: 1;
      --x-tab-switcher-motion-card: 180ms cubic-bezier(0.22, 1, 0.36, 1);
      --x-tab-switcher-motion-cover: 220ms cubic-bezier(0.22, 1, 0.36, 1);
      --x-tab-switcher-thumb-stroke-color: rgba(15, 23, 42, 0.12);
      --x-tab-switcher-title-icon-size: 16px;
      --x-tab-switcher-title-icon-gap: 5px;
      color-scheme: light;
      position: fixed;
      left: var(--x-tab-switcher-center-left, 50%);
      top: var(--x-tab-switcher-center-top, 50%);
      transform: translate3d(-50%, -50%, 0) scale(var(--x-tab-switcher-visible-scale));
      transform-origin: center center;
      z-index: 2147483647;
      width: fit-content;
      max-width: calc(100vw - 24px);
      color: #172033;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(245, 247, 250, 0.88));
      border: 0;
      border-radius: var(--x-tab-switcher-radius-panel);
      box-shadow:
        0 0 0 0.5px rgba(15, 23, 42, 0.1),
        0 1px 2px rgba(15, 23, 42, 0.06),
        0 10px 24px -6px rgba(15, 23, 42, 0.12),
        0 36px 84px -12px rgba(15, 23, 42, 0.22),
        0 96px 220px -16px rgba(15, 23, 42, 0.3),
        0 0 140px 8px rgba(15, 23, 42, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.9),
        inset 0 0 0 1px rgba(255, 255, 255, 0.4);
      backdrop-filter: blur(40px) saturate(120%);
      -webkit-backdrop-filter: blur(40px) saturate(120%);
      padding: var(--x-tab-switcher-padding-panel);
      pointer-events: auto;
      opacity: 0;
      transition: opacity 90ms ease;
      will-change: opacity;
    }
    #${PANEL_ID}[data-visible="true"] {
      opacity: 1;
      transform: translate3d(-50%, -50%, 0) scale(var(--x-tab-switcher-visible-scale));
    }
    .x-tab-switcher-list {
      display: grid;
      grid-template-columns: repeat(var(--x-tab-count, 5), var(--x-tab-switcher-card-width));
      gap: var(--x-tab-switcher-gap);
      width: max-content;
      max-width: 100%;
    }
    .x-tab-switcher-item {
      position: relative;
      min-width: 0;
      transition: opacity 140ms ease;
    }
    .x-tab-switcher-item[data-closing="true"] {
      opacity: 0.45;
      pointer-events: none;
    }
    .x-tab-switcher-card {
      all: unset;
      width: var(--x-tab-switcher-card-width);
      min-width: var(--x-tab-switcher-card-width);
      max-width: var(--x-tab-switcher-card-width);
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-radius: var(--x-tab-switcher-radius-card);
      border: var(--x-tab-switcher-border-card) solid transparent;
      outline: 0;
      background: transparent;
      padding: var(--x-tab-switcher-padding-card);
      color: #172033;
      cursor: pointer;
      box-shadow: none;
    }
    .x-tab-switcher-card[data-active="true"] {
      transform: none;
      border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 32%, rgba(15, 23, 42, 0.08));
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 16%, rgba(255, 255, 255, 0.88)),
          color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 8%, rgba(255, 255, 255, 0.78))
        );
      box-shadow:
        0 0 16px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 7%, transparent),
        0 4px 10px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 3%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.84),
        inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.72));
    }
    .x-tab-switcher-card:focus-visible {
      border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 42%, rgba(15, 23, 42, 0.1));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.84),
        inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 14%, rgba(255, 255, 255, 0.72));
    }
    .x-tab-switcher-thumb {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: var(--x-tab-switcher-radius-thumb);
      background: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 14%, rgba(248, 250, 252, 0.94));
    }
    .x-tab-switcher-thumb::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 2;
      border-radius: inherit;
      box-sizing: border-box;
      border: 0.5px solid var(--x-tab-switcher-thumb-stroke-color);
      box-shadow: none;
      pointer-events: none;
    }
    .x-tab-switcher-thumb img[data-kind="thumbnail"] {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      object-position: top center;
      opacity: 1;
      transition: opacity var(--x-tab-switcher-motion-cover);
      will-change: opacity;
    }
    .x-tab-switcher-thumb img[data-kind="thumbnail"][data-entering="true"] {
      opacity: 0;
    }
    .x-tab-switcher-thumb img[data-kind="thumbnail"][data-exiting="true"] {
      opacity: 0;
    }
    .x-tab-switcher-thumb img[data-broken="true"] {
      display: none;
    }
    .x-tab-switcher-fallback {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .x-tab-switcher-favicon {
      width: 38px;
      height: 38px;
      border-radius: var(--x-tab-switcher-radius-icon);
    }
    .x-tab-switcher-favicon[data-broken="true"] {
      visibility: hidden;
    }
    .x-tab-switcher-close {
      all: unset;
      --x-tab-switcher-close-inset: calc(var(--x-tab-switcher-padding-card) + var(--x-tab-switcher-border-card) + 5px);
      position: absolute;
      top: var(--x-tab-switcher-close-inset);
      left: var(--x-tab-switcher-close-inset);
      z-index: 3;
      width: 20px;
      height: 20px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: rgba(23, 32, 51, 0.72);
      background: rgba(255, 255, 255, 0.9);
      box-shadow:
        0 1px 3px rgba(15, 23, 42, 0.16),
        0 0 0 0.5px rgba(15, 23, 42, 0.16);
      cursor: pointer;
      opacity: 0;
      transform: scale(0.7);
      pointer-events: none;
      transition:
        opacity 120ms ease,
        transform var(--x-tab-switcher-motion-card),
        color 120ms ease,
        background 120ms ease;
    }
    #${PANEL_ID}[data-close-placement="right"] .x-tab-switcher-close {
      left: auto;
      right: var(--x-tab-switcher-close-inset);
    }
    .x-tab-switcher-item:hover .x-tab-switcher-close {
      opacity: 1;
      transform: scale(1);
      pointer-events: auto;
    }
    .x-tab-switcher-close:hover {
      color: #0f172a;
      background: #ffffff;
    }
    .x-tab-switcher-close:active {
      transform: scale(0.9);
    }
    .x-tab-switcher-close svg {
      width: 10px;
      height: 10px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
    }
    .x-tab-switcher-meta {
      min-width: 0;
      display: grid;
      gap: 1px;
      padding: 0 var(--x-tab-switcher-meta-inline-padding) 2px;
    }
    .x-tab-switcher-name-row {
      min-width: 0;
      display: grid;
      grid-template-columns: var(--x-tab-switcher-title-icon-size) minmax(0, 1fr);
      align-items: center;
      gap: var(--x-tab-switcher-title-icon-gap);
    }
    .x-tab-switcher-title-favicon {
      width: var(--x-tab-switcher-title-icon-size);
      height: var(--x-tab-switcher-title-icon-size);
      min-width: 0;
      border-radius: var(--x-tab-switcher-radius-title-icon);
      object-fit: cover;
      opacity: 1;
    }
    .x-tab-switcher-name {
      min-width: 0;
      display: block;
      color: #172033;
      font-size: 11.5px;
      font-weight: 500;
      line-height: 1.32;
      letter-spacing: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .x-tab-switcher-host {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: rgba(23, 32, 51, 0.58);
      font-size: 11px;
      font-weight: 560;
      line-height: 1.32;
    }
    @supports (corner-shape: superellipse(1.25)) {
      #${PANEL_ID},
      .x-tab-switcher-card,
      .x-tab-switcher-thumb,
      .x-tab-switcher-thumb::after,
      .x-tab-switcher-favicon,
      .x-tab-switcher-title-favicon {
        corner-shape: superellipse(1.25);
      }
    }
    @media (max-width: 860px) {
      #${PANEL_ID} {
        --x-tab-switcher-card-width: calc((100vw - 32px) / 5);
        --x-tab-switcher-gap: 3px;
        --x-tab-switcher-padding-panel: 4px;
        --x-tab-switcher-padding-card: 3px;
        --x-tab-switcher-radius-panel: 23px;
        --x-tab-switcher-radius-icon: 9px;
        --x-tab-switcher-radius-title-icon: 4px;
        --x-tab-switcher-meta-inline-padding: 3px;
        --x-tab-switcher-title-icon-size: 13px;
        --x-tab-switcher-title-icon-gap: 4px;
        top: 50%;
        max-width: calc(100vw - 10px);
        padding: var(--x-tab-switcher-padding-panel);
      }
      .x-tab-switcher-card {
        gap: 4px;
        padding: var(--x-tab-switcher-padding-card);
      }
      .x-tab-switcher-meta {
        gap: 0;
      }
      .x-tab-switcher-close {
        --x-tab-switcher-close-inset: calc(var(--x-tab-switcher-padding-card) + var(--x-tab-switcher-border-card) + 3px);
        width: 18px;
        height: 18px;
      }
      .x-tab-switcher-name {
        font-size: 10.5px;
        line-height: 1.3;
      }
      .x-tab-switcher-host {
        display: none;
      }
    }
    #${PANEL_ID}[data-theme="dark"] {
      --x-tab-switcher-thumb-stroke-color: rgba(255, 255, 255, 0.14);
      color-scheme: dark;
      color: #f8fafc;
      background: linear-gradient(180deg, rgba(36, 38, 44, 0.88), rgba(22, 24, 28, 0.9));
      box-shadow:
        0 0 0 0.5px rgba(0, 0, 0, 0.5),
        0 1px 3px rgba(0, 0, 0, 0.32),
        0 12px 26px -6px rgba(0, 0, 0, 0.4),
        0 40px 92px -12px rgba(0, 0, 0, 0.55),
        0 104px 236px -16px rgba(0, 0, 0, 0.66),
        0 0 150px 10px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card {
      color: #f8fafc;
      background: transparent;
      box-shadow: none;
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card[data-active="true"] {
      border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 34%, rgba(255, 255, 255, 0.12));
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 18%, rgba(30, 41, 59, 0.72)),
          color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 10%, rgba(8, 13, 24, 0.72))
        );
      box-shadow:
        0 0 18px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 10%, transparent),
        0 4px 10px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 5%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.13),
        inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.08));
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card:focus-visible {
      border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 42%, rgba(255, 255, 255, 0.16));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.13),
        inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.08));
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-name {
      color: #f8fafc;
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-host {
      color: rgba(248, 250, 252, 0.58);
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-close {
      color: rgba(248, 250, 252, 0.8);
      background: rgba(30, 41, 59, 0.92);
      box-shadow:
        0 1px 3px rgba(0, 0, 0, 0.32),
        0 0 0 0.5px rgba(255, 255, 255, 0.18);
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-close:hover {
      color: #ffffff;
      background: rgba(51, 65, 85, 0.96);
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-thumb {
      background: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 18%, rgba(15, 23, 42, 0.92));
    }
    @media (prefers-reduced-motion: reduce) {
      .x-tab-switcher-thumb img[data-kind="thumbnail"],
      .x-tab-switcher-close {
        transition: none;
      }
    }
  `;

export { PANEL_ID, SWITCHER_STYLES };

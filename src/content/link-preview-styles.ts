// The look of the link preview window, inside its shadow root.
import { EMPTY_STATE_ART_CSS } from '../shared/ui/empty-state-art';

const STYLES = `
  :host {
    all: initial;
  }
  .root {
    --lp-stage: #0c0c0f;
    --lp-scrim: rgba(8, 8, 12, 0.2);
    --lp-panel: #ffffff;
    --lp-panel-edge: rgba(0, 0, 0, 0.12);
    --lp-muted: rgba(20, 20, 26, 0.48);
    --lp-control: rgba(255, 255, 255, 0.24);
    --lp-control-hover: rgba(255, 255, 255, 0.32);
    --lp-control-edge: rgba(255, 255, 255, 0.34);
    --lp-control-ink: #ffffff;
    --lp-notice-ink: #18181d;
    --lp-button: rgba(20, 20, 26, 0.08);
    --lp-button-hover: rgba(20, 20, 26, 0.14);
    position: fixed;
    inset: 0;
    /* Clipped, not hidden: a hidden overflow can still be scrolled by
       script, and a previewed page that scrolls an element into view
       past its own end (X does on load) carried the scroll out to here,
       lifting the whole window off the page. */
    overflow: clip;
    color-scheme: light dark;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    .root {
      --lp-panel: #1d1d21;
      --lp-panel-edge: rgba(255, 255, 255, 0.12);
      --lp-muted: rgba(235, 235, 245, 0.42);
      --lp-notice-ink: #f2f2f5;
      --lp-button: rgba(255, 255, 255, 0.1);
      --lp-button-hover: rgba(255, 255, 255, 0.16);
    }
  }
  .root:focus {
    outline: none;
  }
  /* Not quite 0: Chrome neither rasters nor uploads a layer at opacity 0,
     which left all of it for the opening's first frame. At 0.002 it stays
     below one step of color, so nothing shows while it gets ready. */
  .root[data-state="prewarm"] {
    opacity: 0.002;
    pointer-events: none;
  }
  .stage {
    position: absolute;
    inset: 0;
    background: var(--lp-stage);
  }
  /* The receding page: the same picture blurred once in advance (the
     veil), and over it the screenshot. Receding scales the pair and fades
     the screenshot out while the scrim darkens both, so the compositor
     animates only transform and opacity, and the veil stays still;
     animating a blur radius re-blurred two full-screen layers each frame. */
  /* captureVisibleTab takes the whole window, scrollbars included, while
     this layer stops at the page's scrollbar. Laid out at the window's
     size (set from innerWidth and innerHeight; vw leaves the scrollbar
     out on pages whose root always scrolls), the picture keeps the page's
     scale and its own scrollbar falls under the real one; fitted to the
     layer, it was narrower than the page and showed a second scrollbar
     while the preview closed. */
  .page {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--lp-window-width, 100vw);
    height: var(--lp-window-height, 100vh);
    transform-origin: 50% 50%;
    will-change: transform;
  }
  .shot,
  .veil {
    position: absolute;
    display: block;
    object-fit: fill;
  }
  /* Cut to the page's content: the screenshot's own scrollbars, uncovered
     as the page recedes, showed as a sharp strip while it faded. A plain
     rectangle, the clip costs nothing per frame. */
  .shot {
    inset: 0;
    width: 100%;
    height: 100%;
    clip-path: inset(0 var(--lp-scrollbar-right, 0px) var(--lp-scrollbar-bottom, 0px) var(--lp-scrollbar-left, 0px));
    will-change: opacity;
  }
  /* The picture runs on past the page's edges (mirrored, see paintVeil),
     so the receded page fills the window with no edge of its own; a
     second, enlarged copy behind it lined up nowhere but the middle and
     showed the page's edges twice. */
  .veil {
    top: calc(-1 * var(--lp-veil-margin-y, 0px));
    left: calc(-1 * var(--lp-veil-margin-x, 0px));
    width: calc(100% + 2 * var(--lp-veil-margin-x, 0px));
    height: calc(100% + 2 * var(--lp-veil-margin-y, 0px));
  }
  .page[hidden] {
    display: none;
  }
  .scrim {
    position: absolute;
    inset: 0;
    display: none;
    background: var(--lp-scrim);
    opacity: 0;
  }
  /* Without a screenshot the live page shows through, blurred. */
  .root[data-shot="none"] .stage {
    background: transparent;
    backdrop-filter: blur(16px) saturate(1.2);
  }
  .root[data-shot="none"] .scrim {
    display: block;
  }
  /* Over the screenshot and the veil alike, so the two are one tone while
     one fades into the other: toned into the veil alone, the darker veil
     showed the sharp screenshot's edge through the whole fade. One flat
     color, it is the cheapest layer to fade. Its tone is brightness(0.9)
     under the scrim, rgba(8, 8, 12, 0.2), in one color. */
  .root[data-shot="image"] .scrim {
    display: block;
    background: rgba(6, 6, 9, 0.28);
  }
  .window {
    position: absolute;
    inset: 40px 0;
    width: min(1180px, calc(100vw - 176px));
    margin: 0 auto;
  }
  .panel {
    position: absolute;
    inset: 0;
    overflow: clip;
    border-radius: 23px;
    background: var(--lp-panel);
    box-shadow:
      0 0 0 0.5px var(--lp-panel-edge),
      0 24px 64px rgba(0, 0, 0, 0.28),
      0 4px 16px rgba(0, 0, 0, 0.12);
  }
  /* A continuous (squircle) corner like a macOS window's. Its curve starts
     as far from the corner as a 26pt continuous corner does, about 1.5
     times the radius, so it looks the size of the window corner. Only
     while the window is still: clipping the frame to it takes a mask pass
     on every frame. The plain corner it stands in for while the window
     springs open or shrinks away is the circle closest to it, within about
     half a pixel, so the swap does not show; a 26px circle was nearly two
     pixels off and the corner visibly jumped when the spring settled. */
  @supports (corner-shape: squircle) {
    .root[data-motion="still"] .panel {
      border-radius: 40px;
      corner-shape: squircle;
    }
  }
  /* The site's name while its page loads. It waits a moment before fading
     in, so a page that loads quickly opens without it flashing, then
     breathes gently until the page arrives. */
  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--lp-muted);
    font-size: 13px;
    letter-spacing: 0.01em;
    opacity: 0;
  }
  .root[data-state="open"]:not([data-loaded="true"]) .placeholder {
    animation:
      lp-placeholder-in 320ms ease-out 360ms forwards,
      lp-placeholder-breathe 2000ms ease-in-out 680ms infinite;
  }
  @keyframes lp-placeholder-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes lp-placeholder-breathe {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @media (prefers-reduced-motion: reduce) {
    .root[data-state="open"]:not([data-loaded="true"]) .placeholder {
      animation: lp-placeholder-in 320ms ease-out 360ms forwards;
    }
  }
  /* Gone once the page has loaded: a page with no background of its own
     leaves the frame clear, and the site's name showed through it. */
  .root[data-loaded="true"] .placeholder {
    visibility: hidden;
  }
  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
    background: transparent;
  }
  .notice {
    position: absolute;
    inset: 0;
    display: none;
    place-content: center;
    justify-items: center;
    gap: 14px;
    background: var(--lp-panel);
    color: var(--lp-notice-ink);
    font-size: 14px;
  }
  .root[data-blocked="true"] .notice {
    display: grid;
  }
  .notice .lumno-empty-art {
    display: block;
    margin-bottom: 4px;
  }
  .notice button {
    appearance: none;
    border: 0;
    border-radius: 999px;
    padding: 7px 16px;
    background: var(--lp-button);
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .notice button:hover {
    background: var(--lp-button-hover);
  }
  ${EMPTY_STATE_ART_CSS}
  .controls {
    position: absolute;
    top: 0;
    left: calc(100% + 14px);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .control {
    appearance: none;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--lp-control-ink);
    background: var(--lp-control);
    /* No backdrop blur: what lies under the buttons is the veil, already
       blurred, and re-blurring it under each button cost a render pass per
       button on every frame of the opening. */
    box-shadow: inset 0 0 0 0.5px var(--lp-control-edge), 0 6px 18px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    transition: background-color 140ms ease, transform 140ms ease;
  }
  .control:hover {
    background: var(--lp-control-hover);
  }
  .control[hidden] {
    display: none;
  }
  /* While the page loads, an arc turns around the close button: out of
     the page's way, and gone once it has loaded. */
  .control-close {
    position: relative;
  }
  .control-close::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    border-top-color: rgba(255, 255, 255, 0.9);
    pointer-events: none;
    animation: lp-spin 820ms linear infinite;
    transition: opacity 240ms ease;
  }
  .root[data-loaded="true"] .control-close::after {
    opacity: 0;
    animation-play-state: paused;
  }
  @keyframes lp-spin {
    to { transform: rotate(1turn); }
  }
  .control:active {
    transform: scale(0.92);
  }
  .control:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.9);
    outline-offset: 2px;
  }
  .control svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }
  @media (max-width: 760px) {
    .window {
      inset: 64px 12px 12px;
      width: auto;
      margin: 0;
    }
    .controls {
      top: -50px;
      left: auto;
      right: 0;
      flex-direction: row-reverse;
    }
  }
`;

export {
  STYLES
};

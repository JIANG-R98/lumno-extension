// How the preview opens and closes: the page receding behind its blurred
// veil, and the window springing open from the click.
import type { LinkPreviewOrigin } from '../domain/messages';
import { isFocusable, send, teardown, update } from './link-preview-surface';
import type { LinkPreview } from './link-preview-surface';

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
// Stiff springs: the window reaches 90% of its size in under 100ms and
// overshoots about 3% at 150ms, so it lands crisply and still bounces.
const OPEN_SPRING = createSpringEasing(600, 26);
const SOFT_SPRING = createSpringEasing(640, 38);

// The page receded behind the preview: scaled, and crossfaded to its veil, the
// screenshot blurred by BLUR_CSS_PX and toned by VEIL_TONE. The veil is
// painted at BLUR_RENDER_WIDTH pixels wide; blurred, it scales up unseen.
const PAGE_AT_REST = { transform: 'scale(1)' };
const PAGE_RECEDED = { transform: 'scale(0.95)' };
const BLUR_CSS_PX = 16;
const VEIL_TONE = 'brightness(0.9) saturate(1.1)';
const BLUR_RENDER_WIDTH = 480;
// The scrim over the receded page, and the width of the veil's feathered
// edge in CSS pixels.
const SCRIM_TONE = 'rgba(8, 8, 12, 0.2)';
const FEATHER_CSS_PX = 48;


// Samples a damped spring from 0 to 1 into a CSS linear() easing, so the
// window can overshoot and settle on the compositor like a physical spring.
function createSpringEasing(stiffness: number, damping: number): { duration: number; easing: string } {
  const step = 1 / 120;
  const samples = [0];
  let position = 0;
  let velocity = 0;
  let time = 0;
  let settledAt = step;
  while (time < 1.6) {
    for (let substep = 0; substep < 4; substep += 1) {
      const acceleration = -stiffness * (position - 1) - damping * velocity;
      velocity += acceleration * (step / 4);
      position += velocity * (step / 4);
    }
    time += step;
    samples.push(position);
    if (Math.abs(position - 1) > 0.002 || Math.abs(velocity) > 0.02) {
      settledAt = time;
    }
  }
  const used = samples.slice(0, Math.ceil(settledAt / step) + 1);
  used.push(1);
  const supportsLinear = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
    CSS.supports('animation-timing-function', 'linear(0, 1)');
  return {
    duration: Math.round(settledAt * 1000),
    easing: supportsLinear
      ? `linear(${used.map((value) => Number(value.toFixed(4))).join(', ')})`
      : 'cubic-bezier(0.34, 1.4, 0.64, 1)'
  };
}


function decodeImage(image: HTMLImageElement, dataUrl: string): Promise<boolean> {
  image.src = dataUrl;
  return image.decode().then(() => true, () => false);
}

// Paints the veil: the screenshot blurred and toned, small. The blurred
// edge would fade to transparent, so a slightly enlarged copy is painted
// first to fill it, then the copy that lines up with the screenshot. The
// surround gets the same picture.
function paintVeil(preview: LinkPreview): boolean {
  const image = preview.shot;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const context = preview.veil.getContext('2d');
  if (!width || !height || !context) {
    return false;
  }
  const scale = Math.min(1, BLUR_RENDER_WIDTH / width);
  const canvasWidth = Math.max(1, Math.round(width * scale));
  const canvasHeight = Math.max(1, Math.round(height * scale));
  // The screenshot is in device pixels; the blur is meant in CSS pixels.
  const radius = BLUR_CSS_PX * (width / Math.max(1, window.innerWidth)) * scale;
  const pad = Math.ceil(radius * 2);
  preview.veil.width = canvasWidth;
  preview.veil.height = canvasHeight;
  context.filter = `blur(${radius}px) ${VEIL_TONE}`;
  context.drawImage(image, -pad, -pad, canvasWidth + pad * 2, canvasHeight + pad * 2);
  context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
  // The scrim's tone goes into the picture rather than a layer of its own
  // over the whole window.
  context.filter = 'none';
  context.fillStyle = SCRIM_TONE;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  const surroundContext = preview.surround.getContext('2d');
  if (surroundContext) {
    preview.surround.width = canvasWidth;
    preview.surround.height = canvasHeight;
    surroundContext.drawImage(preview.veil, 0, 0);
  }
  featherEdges(context, canvasWidth, canvasHeight, FEATHER_CSS_PX * canvasWidth / Math.max(1, window.innerWidth));
  return true;
}

// Fades the veil's edges out, once: a CSS mask did the same on every frame
// the veil faded in, each time compositing the whole window offscreen.
function featherEdges(context: CanvasRenderingContext2D, width: number, height: number, feather: number): void {
  const fade = (x0: number, y0: number, x1: number, y1: number, length: number): CanvasGradient => {
    const gradient = context.createLinearGradient(x0, y0, x1, y1);
    const stop = Math.min(0.5, feather / Math.max(1, length));
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(stop, '#000');
    gradient.addColorStop(1 - stop, '#000');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    return gradient;
  };
  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = fade(0, 0, width, 0, width);
  context.fillRect(0, 0, width, height);
  context.fillStyle = fade(0, 0, 0, height, height);
  context.fillRect(0, 0, width, height);
  context.restore();
}


function playOpening(preview: LinkPreview, origin: LinkPreviewOrigin | null): void {
  const reduced = reducedMotionQuery.matches;
  update(preview, { motion: 'moving' });
  const rect = preview.windowElement.getBoundingClientRect();
  const originX = origin ? Math.min(Math.max(origin.x - rect.left, 0), rect.width) : rect.width / 2;
  const originY = origin ? Math.min(Math.max(origin.y - rect.top, 0), rect.height) : rect.height / 2;
  preview.windowElement.style.transformOrigin = `${originX}px ${originY}px`;
  const recede: KeyframeAnimationOptions = { duration: reduced ? 1 : 360, easing: 'cubic-bezier(0.2, 0.9, 0.1, 1)', fill: 'forwards' };
  const blurIn: KeyframeAnimationOptions = { duration: reduced ? 1 : 260, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' };
  preview.page.animate([PAGE_AT_REST, PAGE_RECEDED], recede);
  preview.shot.animate([{ opacity: 1 }, { opacity: 0 }], blurIn);
  preview.veil.animate([{ opacity: 0 }, { opacity: 1 }], blurIn);
  preview.scrim.animate([{ opacity: 0 }, { opacity: 1 }], blurIn);
  if (reduced) {
    update(preview, { motion: 'still' });
    preview.windowElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' });
    return;
  }
  const spring = preview.windowElement.animate([
    { transform: 'scale(0.78)' },
    { transform: 'scale(1)' }
  ], { duration: OPEN_SPRING.duration, easing: OPEN_SPRING.easing, fill: 'forwards' });
  spring.finished.then(() => {
    if (!preview.closing) {
      update(preview, { motion: 'still' });
    }
  }, () => {});
  preview.windowElement.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 110,
    easing: 'ease-out',
    fill: 'forwards'
  });
  preview.controls.animate([
    { opacity: 0, transform: 'scale(0.7)' },
    { opacity: 1, transform: 'scale(1)' }
  ], { duration: SOFT_SPRING.duration, delay: 60, easing: SOFT_SPRING.easing, fill: 'backwards' });
}

function close(preview: LinkPreview | null, closeOptions?: { instant?: boolean }): void {
  if (!preview || preview.closing) {
    return;
  }
  preview.closing = true;
  send({ action: 'linkPreviewClose', token: preview.token });
  const instant = Boolean(closeOptions && closeOptions.instant) || !preview.shown;
  const restoreFocus = preview.restoreFocus;
  const closing = preview;
  const finish = (): void => {
    teardown(closing);
    if (restoreFocus && restoreFocus.isConnected && isFocusable(restoreFocus)) {
      try {
        restoreFocus.focus({ preventScroll: true });
      } catch (_error) {
        // The element may refuse focus now.
      }
    }
  };
  if (instant) {
    finish();
    return;
  }
  const reduced = reducedMotionQuery.matches;
  update(preview, { closing: true, motion: 'moving' });
  preview.controls.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: reduced ? 1 : 110,
    easing: 'ease-out',
    fill: 'forwards'
  });
  preview.windowElement.animate([
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 0, transform: reduced ? 'scale(1)' : 'scale(0.92)' }
  ], { duration: reduced ? 120 : 160, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
  const restore: KeyframeAnimationOptions = { duration: reduced ? 1 : 280, easing: 'cubic-bezier(0.2, 0.9, 0.1, 1)', fill: 'forwards' };
  const blurOut: KeyframeAnimationOptions = { duration: reduced ? 1 : 220, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' };
  preview.shot.animate([{ opacity: 0 }, { opacity: 1 }], blurOut);
  preview.veil.animate([{ opacity: 1 }, { opacity: 0 }], blurOut);
  preview.scrim.animate([{ opacity: 1 }, { opacity: 0 }], blurOut);
  preview.page.animate([PAGE_RECEDED, PAGE_AT_REST], restore).finished.then(finish, finish);
}

export {
  BLUR_CSS_PX,
  BLUR_RENDER_WIDTH,
  FEATHER_CSS_PX,
  OPEN_SPRING,
  PAGE_AT_REST,
  PAGE_RECEDED,
  SCRIM_TONE,
  SOFT_SPRING,
  VEIL_TONE,
  close,
  createSpringEasing,
  decodeImage,
  featherEdges,
  paintVeil,
  playOpening,
  reducedMotionQuery
};

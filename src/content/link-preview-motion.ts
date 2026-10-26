// How the preview opens and closes: the page receding behind its blurred
// veil, and the window springing open from the click.
import type { LinkPreviewOrigin } from '../domain/messages';
import { isFocusable, send, teardown, update } from './link-preview-surface';
import type { LinkPreview } from './link-preview-surface';
import { RECEDED_SCALE } from './link-preview-veil';

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
// Stiff springs: the window reaches 90% of its size in under 100ms and
// overshoots about 3% at 150ms, so it lands crisply and still bounces.
const OPEN_SPRING = createSpringEasing(600, 26);
const SOFT_SPRING = createSpringEasing(640, 38);

// The page receded behind the preview: scaled, with the screenshot faded out
// to show its veil (link-preview-veil.ts), and the scrim darkening both.
const PAGE_AT_REST = { transform: 'scale(1)' };
const PAGE_RECEDED = { transform: `scale(${RECEDED_SCALE})` };

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
  preview.scrim.animate([{ opacity: 1 }, { opacity: 0 }], blurOut);
  preview.page.animate([PAGE_RECEDED, PAGE_AT_REST], restore).finished.then(finish, finish);
}

export {
  OPEN_SPRING,
  PAGE_AT_REST,
  PAGE_RECEDED,
  SOFT_SPRING,
  close,
  createSpringEasing,
  decodeImage,
  playOpening,
  reducedMotionQuery
};

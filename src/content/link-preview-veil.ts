// The veil the page recedes to: its screenshot blurred and toned once, small,
// running on past the page's edges, so the receded page fills the window
// with no edge of its own.
import { update } from './link-preview-surface';
import type { LinkPreview } from './link-preview-surface';

// How far the page recedes, and the blur and tone of its veil. The veil is
// painted at BLUR_RENDER_WIDTH pixels wide; blurred, it scales up unseen.
const RECEDED_SCALE = 0.95;
const BLUR_CSS_PX = 16;
const VEIL_TONE = 'saturate(1.1)';
const BLUR_RENDER_WIDTH = 480;

// The part of the window the page's content fills, as fractions of it.
interface ContentBox {
  left: number;
  width: number;
  height: number;
}

// How far past the page's edge the veil must reach, in CSS pixels, to
// cover the window once the page has receded about its center.
function veilMarginFor(size: number): number {
  return Math.ceil(size * (1 - RECEDED_SCALE) / (2 * RECEDED_SCALE)) + 4;
}

// The screenshot takes the page's scrollbars too, which would show as a
// grey band inside the receded page. The vertical one sits on the left of a
// right-to-left page.
function readContentBox(): ContentBox {
  const root = document.documentElement;
  const width = Math.min(1, root.clientWidth / Math.max(1, window.innerWidth)) || 1;
  const height = Math.min(1, root.clientHeight / Math.max(1, window.innerHeight)) || 1;
  const rightToLeft = window.getComputedStyle(root).direction === 'rtl';
  return { left: rightToLeft ? 1 - width : 0, width, height };
}

// Draws the page's content, and mirrored copies of it around it, so the
// picture continues across each edge (and over the scrollbars) the way the
// page left it. `origin` is where the content's top-left lands.
function drawMirrored(context: CanvasRenderingContext2D, image: HTMLImageElement, content: ContentBox,
  picture: { width: number; height: number }, origin: { x: number; y: number }): void {
  const contentLeft = content.left * picture.width;
  const contentWidth = content.width * picture.width;
  const contentHeight = content.height * picture.height;
  [-1, 0, 1].forEach((column) => {
    [-1, 0, 1].forEach((row) => {
      context.setTransform(
        column === 0 ? 1 : -1, 0, 0, row === 0 ? 1 : -1,
        origin.x + contentLeft + (column === 1 ? contentWidth * 2 : 0),
        origin.y + (row === 1 ? contentHeight * 2 : 0)
      );
      context.drawImage(
        image,
        content.left * image.naturalWidth, 0, content.width * image.naturalWidth, content.height * image.naturalHeight,
        0, 0, contentWidth, contentHeight
      );
    });
  });
}

// Paints the veil. The blur reads only picture: its own fade to transparent
// falls outside the canvas.
function paintVeil(preview: LinkPreview): boolean {
  const image = preview.shot;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const context = preview.veil.getContext('2d');
  const source = document.createElement('canvas');
  const sourceContext = source.getContext('2d');
  if (!width || !height || !context || !sourceContext) {
    return false;
  }
  const scale = Math.min(1, BLUR_RENDER_WIDTH / width);
  const picture = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  // The screenshot is in device pixels; the blur and margins are meant in
  // CSS pixels.
  const perCssX = picture.width / Math.max(1, window.innerWidth);
  const perCssY = picture.height / Math.max(1, window.innerHeight);
  const radius = BLUR_CSS_PX * perCssX;
  const marginX = Math.ceil(veilMarginFor(window.innerWidth) * perCssX);
  const marginY = Math.ceil(veilMarginFor(window.innerHeight) * perCssY);
  const pad = Math.ceil(radius * 3);
  const content = readContentBox();
  source.width = picture.width + (marginX + pad) * 2;
  source.height = picture.height + (marginY + pad) * 2;
  drawMirrored(sourceContext, image, content, picture, { x: marginX + pad, y: marginY + pad });
  preview.veil.width = picture.width + marginX * 2;
  preview.veil.height = picture.height + marginY * 2;
  context.filter = `blur(${radius}px) ${VEIL_TONE}`;
  context.drawImage(source, -pad, -pad);
  update(preview, {
    veilMargin: { x: marginX / perCssX, y: marginY / perCssY },
    scrollbars: {
      left: content.left * window.innerWidth,
      right: (1 - content.left - content.width) * window.innerWidth,
      bottom: (1 - content.height) * window.innerHeight
    }
  });
  return true;
}

export { BLUR_CSS_PX, BLUR_RENDER_WIDTH, RECEDED_SCALE, VEIL_TONE, paintVeil, veilMarginFor };

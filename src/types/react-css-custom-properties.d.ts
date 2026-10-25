import 'react';

declare module 'react' {
  interface CSSProperties {
    // CSS custom properties, such as --x-range-slider-percent.
    [property: `--${string}`]: string | number | undefined;
    // corner-shape, which Chromium has and csstype does not describe yet.
    cornerShape?: string;
  }
}

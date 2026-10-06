import type { ReactNode } from 'react';

// Content of a text button that can wait on its own work. Give the button
// aria-busy and position: relative; busy.css swaps the label for a spinner in place.
export function BusyLabel({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <>
      <span className="x-lumno-busy-label">{children}</span>
      {busy ? <span aria-hidden="true" className="x-lumno-spinner" /> : null}
    </>
  );
}

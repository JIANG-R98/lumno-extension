// What a page's preload scripts hand to the page's own scripts. A preload
// runs as a classic script in <head>, before first paint; the page's scripts
// come later, from bundles of their own, so the values travel on one object
// on the page's global (LumnoBootHandoff in src/types/globals.d.ts). This
// module is the only code that reads or writes it.

function getHandoff(): LumnoBootHandoff {
  const existing = globalThis.__lumnoBoot;
  if (existing) {
    return existing;
  }
  const created: LumnoBootHandoff = {};
  globalThis.__lumnoBoot = created;
  return created;
}

// Called by a preload with a value for the page's scripts.
function publishBootValue<K extends keyof LumnoBootHandoff>(key: K, value: LumnoBootHandoff[K]): void {
  getHandoff()[key] = value;
}

// A value a preload published, or undefined when none did.
function readBootValue<K extends keyof LumnoBootHandoff>(key: K): LumnoBootHandoff[K] | undefined {
  const handoff = globalThis.__lumnoBoot;
  return handoff ? handoff[key] : undefined;
}

// Reads a value once: later reads find nothing.
function takeBootValue<K extends keyof LumnoBootHandoff>(key: K): LumnoBootHandoff[K] | undefined {
  const handoff = globalThis.__lumnoBoot;
  if (!handoff) {
    return undefined;
  }
  const value = handoff[key];
  delete handoff[key];
  return value;
}

export { publishBootValue, readBootValue, takeBootValue };

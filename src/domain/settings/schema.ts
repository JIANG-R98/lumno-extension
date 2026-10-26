// How a stored value is read back: a schema turns whatever storage holds
// (a value an older version wrote, another device's shape, nothing at all)
// into a valid value of the setting's type.

interface Schema<T> {
  parse(value: unknown): T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return list.some((item) => item === value);
}

// A switch. Only the opposite of the default, stored as a boolean, turns it
// over; anything else reads as the default.
function flag(defaultValue: boolean): Schema<boolean> {
  return { parse: (value) => (defaultValue ? value !== false : value === true) };
}

// One of a fixed set of names, or the fallback.
function oneOf<T extends string>(values: readonly T[], fallback: T): Schema<T> {
  return { parse: (value) => (isOneOf(values, value) ? value : fallback) };
}

interface IntegerOptions {
  min: number;
  max: number;
  fallback: number;
  // Read null and '' as missing (the fallback) instead of as 0.
  blankIsMissing?: boolean;
}

// A whole number held to [min, max]; a missing or non-numeric value is the
// fallback.
function integer(options: IntegerOptions): Schema<number> {
  return {
    parse(value) {
      const number = Number(value);
      if ((options.blankIsMissing && (value === null || value === '')) || !Number.isFinite(number)) {
        return options.fallback;
      }
      return Math.min(options.max, Math.max(options.min, Math.round(number)));
    }
  };
}

// A value read by its own function, for shapes the combinators do not cover.
function custom<T>(parse: (value: unknown) => T): Schema<T> {
  return { parse };
}

// A value whose shape belongs to the module that owns it (a store that
// spreads one list over several keys, a cache with its own format). The
// registry still declares where it lives and how it travels.
function opaque(): Schema<unknown> {
  return { parse: (value) => value };
}

export { custom, flag, integer, isOneOf, isRecord, oneOf, opaque };
export type { IntegerOptions, Schema };

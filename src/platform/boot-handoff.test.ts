import { afterEach, describe, expect, it } from 'vitest';
import { publishBootValue, readBootValue, takeBootValue } from './boot-handoff';

describe('boot handoff', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__lumnoBoot');
  });

  it('reads nothing before a preload publishes', () => {
    expect(readBootValue('motionPreferenceReady')).toBeUndefined();
    expect(takeBootValue('localePrefetch')).toBeUndefined();
    expect(globalThis.__lumnoBoot).toBeUndefined();
  });

  it('hands a published value to later readers', () => {
    const ready = Promise.resolve(true);
    publishBootValue('motionPreferenceReady', ready);

    expect(readBootValue('motionPreferenceReady')).toBe(ready);
    expect(readBootValue('motionPreferenceReady')).toBe(ready);
  });

  it('lets a value be taken once', () => {
    const prefetch = { locale: 'zh_CN', messages: Promise.resolve({}) };
    publishBootValue('localePrefetch', prefetch);

    expect(takeBootValue('localePrefetch')).toBe(prefetch);
    expect(takeBootValue('localePrefetch')).toBeUndefined();
  });

  it('keeps values from different preloads side by side', () => {
    publishBootValue('focusResumeTransition', null);
    publishBootValue('motionPreferenceReady', Promise.resolve(false));

    expect(Object.keys(globalThis.__lumnoBoot || {}).sort()).toEqual(['focusResumeTransition', 'motionPreferenceReady']);
  });
});

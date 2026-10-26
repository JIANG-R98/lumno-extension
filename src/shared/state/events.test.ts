import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './events';

interface TestEvents {
  opened: { focus: boolean };
  closed: undefined;
}

describe('event bus', () => {
  it('hands each listener the payload of its own event', () => {
    const bus = createEventBus<TestEvents>();
    const opened = vi.fn();
    const closed = vi.fn();
    bus.on('opened', opened);
    bus.on('closed', closed);
    bus.emit('opened', { focus: true });
    expect(opened).toHaveBeenCalledWith({ focus: true });
    expect(closed).not.toHaveBeenCalled();
  });

  it('stops calling a listener once it unsubscribes, and after clear', () => {
    const bus = createEventBus<TestEvents>();
    const first = vi.fn();
    const second = vi.fn();
    const off = bus.on('closed', first);
    bus.on('closed', second);
    off();
    bus.emit('closed', undefined);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    bus.clear();
    bus.emit('closed', undefined);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('leaves a listener added during an event for the next one', () => {
    const bus = createEventBus<TestEvents>();
    const late = vi.fn();
    bus.on('closed', () => {
      bus.on('closed', late);
    });
    bus.emit('closed', undefined);
    expect(late).not.toHaveBeenCalled();
    bus.emit('closed', undefined);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

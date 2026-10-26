// A typed event bus. Events state facts that happened ("the menu opened");
// a part that must react to another subscribes here instead of being called
// by it, so parts are made in dependency order and never call the parts
// made after them.

type EventListener<Payload> = (payload: Payload) => void;

interface EventBus<EventMap> {
  emit<Name extends keyof EventMap>(name: Name, payload: EventMap[Name]): void;
  // Returns the unsubscribe.
  on<Name extends keyof EventMap>(name: Name, listener: EventListener<EventMap[Name]>): () => void;
  clear(): void;
}

type ListenerRegistry<EventMap> = { [Name in keyof EventMap]?: Set<EventListener<EventMap[Name]>> };

function createEventBus<EventMap>(): EventBus<EventMap> {
  let registry: ListenerRegistry<EventMap> = {};
  return {
    emit(name, payload) {
      const named = registry[name];
      // A listener added while emitting waits for the next event.
      Array.from(named || []).forEach((listener) => listener(payload));
    },
    on(name, listener) {
      const named = registry[name] || new Set();
      registry[name] = named;
      named.add(listener);
      return () => {
        named.delete(listener);
      };
    },
    clear() {
      registry = {};
    }
  };
}

export type { EventBus, EventListener };
export { createEventBus };

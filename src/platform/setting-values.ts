// The values a settings store keeps: what storage holds for each setting it
// knows, what the setting reads it as, which could not be read, and who
// follows each setting and each family's members.
import type { Setting, SettingFamily } from '../domain/settings/define';
import { isRecord } from './storage-call';

type SettingsListener = (setting: Setting<unknown>) => void;
type MemberListener = (id: string) => void;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isRecord(a) && !isRecord(b)) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_error) {
    return false;
  }
}

class SettingValues {
  // The settings the store knows, by key.
  readonly byKey = new Map<string, Setting<unknown>>();
  readonly memberListeners = new Map<SettingFamily<unknown>, Set<MemberListener>>();
  private readonly stored = new Map<string, unknown>();
  private readonly parsed = new Map<string, unknown>();
  // Settings whose area could not be read.
  private readonly unread = new Set<string>();
  private readonly everRead = new Set<string>();
  private readonly listeners = new Map<string, Set<SettingsListener>>();

  know(setting: Setting<unknown>): void {
    this.byKey.set(setting.key, setting);
  }

  get<T>(setting: Setting<T>): T {
    return setting.parse(this.stored.get(setting.key));
  }

  getStored(setting: Setting<unknown>): unknown {
    return this.stored.get(setting.key);
  }

  isRead(setting: Setting<unknown>): boolean {
    return this.byKey.has(setting.key) && !this.unread.has(setting.key);
  }

  hasBeenRead(setting: Setting<unknown>): boolean {
    return this.everRead.has(setting.key);
  }

  markRead(settings: readonly Setting<unknown>[]): void {
    settings.forEach((setting) => this.everRead.add(setting.key));
  }

  markUnread(settings: readonly Setting<unknown>[]): void {
    settings.forEach((setting) => this.unread.add(setting.key));
  }

  // Takes a stored value; tells listeners when what the setting reads as
  // changed. A setting's first read is not a change.
  accept(setting: Setting<unknown>, value: unknown, firstRead = false): void {
    this.unread.delete(setting.key);
    const storedBefore = this.stored.get(setting.key);
    const before = this.parsed.has(setting.key) ? this.parsed.get(setting.key) : setting.default;
    if (value === undefined) this.stored.delete(setting.key);
    else this.stored.set(setting.key, value);
    const next = setting.parse(value);
    this.parsed.set(setting.key, next);
    if (!firstRead && (!sameValue(storedBefore, value) || !sameValue(before, next))) this.notify(setting);
  }

  follow(settings: readonly Setting<unknown>[], listener: SettingsListener): void {
    settings.forEach((setting) => {
      const set = this.listeners.get(setting.key) || new Set<SettingsListener>();
      set.add(listener);
      this.listeners.set(setting.key, set);
    });
  }

  unfollow(settings: readonly Setting<unknown>[], listener: SettingsListener): void {
    settings.forEach((setting) => {
      const set = this.listeners.get(setting.key);
      if (set) set.delete(listener);
    });
  }

  followMembers(family: SettingFamily<unknown>, listener: MemberListener): Set<MemberListener> {
    const set = this.memberListeners.get(family) || new Set<MemberListener>();
    set.add(listener);
    this.memberListeners.set(family, set);
    return set;
  }

  // Whether anything still follows a setting or a family.
  hasFollowers(): boolean {
    return Array.from(this.listeners.values()).some((set) => set.size > 0) ||
      Array.from(this.memberListeners.values()).some((set) => set.size > 0);
  }

  clearFollowers(): void {
    this.listeners.clear();
    this.memberListeners.clear();
  }

  private notify(setting: Setting<unknown>): void {
    const set = this.listeners.get(setting.key);
    if (!set) return;
    Array.from(set).forEach((listener) => {
      try {
        listener(setting);
      } catch (error) {
        // One part of the context failing to apply a change must not keep
        // the rest from seeing it.
        console.error('[Lumno] Setting listener failed.', error);
      }
    });
  }
}

export type { MemberListener, SettingsListener };
export { SettingValues };

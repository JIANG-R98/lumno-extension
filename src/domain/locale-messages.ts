import type { LocaleMessage } from './messages';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readPlaceholders(value: unknown): Record<string, { content: string; example?: string }> | null {
  if (!isRecord(value)) {
    return null;
  }
  const placeholders: Record<string, { content: string; example?: string }> = {};
  Object.keys(value).forEach((name) => {
    const placeholder = value[name];
    if (isRecord(placeholder) && typeof placeholder.content === 'string') {
      placeholders[name] = typeof placeholder.example === 'string'
        ? { content: placeholder.content, example: placeholder.example }
        : { content: placeholder.content };
    }
  });
  return placeholders;
}

// A _locales messages.json, with only well-formed entries.
function readLocaleMessages(value: unknown): Record<string, LocaleMessage> {
  const messages: Record<string, LocaleMessage> = {};
  if (!isRecord(value)) {
    return messages;
  }
  Object.keys(value).forEach((key) => {
    const entry = value[key];
    if (!isRecord(entry) || typeof entry.message !== 'string') {
      return;
    }
    const message: LocaleMessage = { message: entry.message };
    if (typeof entry.description === 'string') {
      message.description = entry.description;
    }
    const placeholders = readPlaceholders(entry.placeholders);
    if (placeholders) {
      message.placeholders = placeholders;
    }
    messages[key] = message;
  });
  return messages;
}

export { readLocaleMessages };

#!/usr/bin/env node

const fs = require('fs');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_EVENT_PATH = process.env.GITHUB_EVENT_PATH || '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const RELEASE_TAG = process.env.RELEASE_TAG || '';

if (!DISCORD_WEBHOOK_URL) {
  console.error('Missing DISCORD_WEBHOOK_URL.');
  process.exit(1);
}

if (!GITHUB_EVENT_PATH) {
  console.error('Missing GITHUB_EVENT_PATH.');
  process.exit(1);
}

const event = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, 'utf8'));
let release = null;

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function trimSection(value) {
  return normalizeText(value)
    .replace(/^[-*]\s+/gm, '• ')
    .trim();
}

function simplifyLabel(line) {
  return String(line || '')
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^__(.*?)__$/, '$1')
    .replace(/^[\[\(（【]\s*/, '')
    .replace(/[\]\)）】]\s*$/, '')
    .replace(/[：:]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function classifySectionLabel(line) {
  const label = simplifyLabel(line);
  if (!label) {
    return null;
  }

  const zhLabels = new Set([
    '中文',
    '简体中文',
    '繁體中文',
    '繁体中文',
    'zh',
    'zh cn',
    'zh-cn',
    'zh_hans',
    'zh hans',
    'chinese',
  ]);
  const enLabels = new Set([
    '英文',
    '英语',
    '英語',
    'english',
    'en',
    'en us',
    'en-us',
    'en gb',
    'en-gb',
  ]);

  if (zhLabels.has(label)) {
    return 'zh';
  }
  if (enLabels.has(label)) {
    return 'en';
  }
  return null;
}

function splitByExplicitSections(body) {
  const lines = normalizeText(body).split('\n');
  const sections = { zh: [], en: [] };
  let current = null;

  for (const line of lines) {
    const sectionType = classifySectionLabel(line);
    if (sectionType) {
      current = sectionType;
      continue;
    }

    if (current) {
      sections[current].push(line);
    }
  }

  const zh = trimSection(sections.zh.join('\n'));
  const en = trimSection(sections.en.join('\n'));
  return zh && en ? { zh, en } : null;
}

function languageScore(text) {
  const value = normalizeText(text);
  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  return { cjk, latin };
}

function splitByDivider(body) {
  const normalized = normalizeText(body);
  const parts = normalized
    .split(/\n(?:-{3,}|_{3,}|\*{3,}|\*\s\*\s\*)\n/g)
    .map((part) => trimSection(part))
    .filter(Boolean);

  if (parts.length !== 2) {
    return null;
  }

  const firstScore = languageScore(parts[0]);
  const secondScore = languageScore(parts[1]);

  if (secondScore.latin >= 40 && secondScore.latin > secondScore.cjk) {
    return { zh: parts[0], en: parts[1] };
  }

  if (firstScore.cjk > firstScore.latin && secondScore.latin >= secondScore.cjk) {
    return { zh: parts[0], en: parts[1] };
  }

  if (secondScore.cjk > secondScore.latin && firstScore.latin >= firstScore.cjk) {
    return { zh: parts[1], en: parts[0] };
  }

  return null;
}

function splitByLanguageTransition(body) {
  const lines = normalizeText(body).split('\n');
  let seenChineseContent = false;
  let splitIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const score = languageScore(trimmed);
    if (score.cjk >= 2) {
      seenChineseContent = true;
      continue;
    }

    const isHeading = /^#{1,6}\s+/.test(trimmed);
    const looksEnglishParagraph = score.cjk === 0 && score.latin >= 12 && !isHeading;

    if (seenChineseContent && looksEnglishParagraph) {
      splitIndex = index;
      break;
    }
  }

  if (splitIndex <= 0) {
    return null;
  }

  const zh = trimSection(lines.slice(0, splitIndex).join('\n'));
  const en = trimSection(lines.slice(splitIndex).join('\n'));
  return zh && en ? { zh, en } : null;
}

function extractBilingualSections(body) {
  return (
    splitByExplicitSections(body) ||
    splitByDivider(body) ||
    splitByLanguageTransition(body) ||
    { raw: trimSection(body) }
  );
}

function truncate(text, maxLength) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildEmbedDescription(parsed) {
  if (parsed.zh && parsed.en) {
    return truncate(parsed.en.replace(/^Tags:\s.*$/gim, '').trim(), 4000);
  }

  return truncate((parsed.raw || 'No release notes provided.').replace(/^Tags:\s.*$/gim, '').trim(), 4000);
}

function buildPayload() {
  if (!release) {
    throw new Error('Release payload not loaded.');
  }

  const tag = release.tag_name || release.name || 'New Release';
  const parsed = extractBilingualSections(release.body || '');
  const repoUrl = GITHUB_REPOSITORY ? `https://github.com/${GITHUB_REPOSITORY}` : undefined;
  const releaseTitle = release.name && release.name !== release.tag_name
    ? `${release.name} (${release.tag_name})`
    : tag;

  return {
    username: 'Lumno Releases',
    embeds: [
      {
        title: `Lumno ${releaseTitle}`,
        url: release.html_url,
        description: buildEmbedDescription(parsed),
        color: 0x5865F2,
        footer: {
          text: GITHUB_REPOSITORY || 'GitHub Release',
        },
        timestamp: release.published_at || new Date().toISOString(),
        fields: [
          {
            name: 'GitHub',
            value: `[Open Release](${release.html_url})`,
            inline: true,
          },
          ...(repoUrl
            ? [
                {
                  name: 'Repository',
                  value: `[${GITHUB_REPOSITORY}](${repoUrl})`,
                  inline: true,
                },
              ]
            : []),
        ],
      },
    ],
  };
}

async function postToDiscord(payload) {
  const webhookUrl = new URL(DISCORD_WEBHOOK_URL);
  webhookUrl.searchParams.set('wait', 'true');

  const response = await fetch(webhookUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Discord webhook failed (${response.status}): ${errorBody}`);
  }

  return response.json();
}

async function crosspostMessage(message) {
  if (!DISCORD_BOT_TOKEN || !message || !message.id || !message.channel_id) {
    return;
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${message.channel_id}/messages/${message.id}/crosspost`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 403) {
      console.warn(`Discord crosspost skipped (${response.status}): ${errorBody}`);
      return;
    }
    throw new Error(`Discord crosspost failed (${response.status}): ${errorBody}`);
  }
}

async function fetchReleaseByTag(tag) {
  if (!GITHUB_REPOSITORY) {
    throw new Error('Missing GITHUB_REPOSITORY.');
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/tags/${encodeURIComponent(tag)}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lumno-discord-release-announcement',
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub release lookup failed for ${tag} (${response.status}): ${errorBody}`);
  }

  return response.json();
}

async function loadRelease() {
  if (event && event.release) {
    return event.release;
  }

  if (RELEASE_TAG) {
    return fetchReleaseByTag(RELEASE_TAG);
  }

  throw new Error('Release payload not found and RELEASE_TAG was not provided.');
}

async function main() {
  release = await loadRelease();
  const payload = buildPayload();
  const message = await postToDiscord(payload);
  await crosspostMessage(message);
  console.log(`Posted Discord release announcement for ${release.tag_name || release.name || 'release'}.`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

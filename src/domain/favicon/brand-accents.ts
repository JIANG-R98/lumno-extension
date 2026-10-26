// The brand colors of well-known sites, which tint their results before (or
// instead of) a color read from their icon.
import type { ThemeRgb } from './types';

const brandAccentMap: Readonly<Record<string, ThemeRgb>> = {
  'github.com': [36, 41, 46],
  'docs.github.com': [36, 41, 46],
  'douban.com': [0, 181, 29],
  'zhihu.com': [23, 127, 255],
  'bilibili.com': [0, 174, 236],
  'dribbble.com': [234, 100, 217],
  'youtube.com': [255, 0, 0],
  'youtu.be': [255, 0, 0],
  'google.com': [66, 133, 244],
  'chatgpt.com': [16, 163, 127],
  'gemini.google.com': [66, 133, 244],
  'doubao.com': [79, 70, 229],
  'qianwen.com': [37, 99, 235],
  'yuanbao.tencent.com': [0, 82, 217],
  'chat.minimax.io': [24, 119, 242],
  'chat.deepseek.com': [74, 107, 255],
  'kimi.com': [77, 92, 255],
  'copilot.com': [34, 83, 206],
  'copilot.microsoft.com': [34, 83, 206],
  'grok.com': [17, 24, 39],
  'chat.qwen.ai': [99, 54, 231],
  'aistudio.google.com': [66, 133, 244],
  'bing.com': [0, 120, 215],
  'baidu.com': [41, 98, 255],
  'taobao.com': [255, 80, 0],
  'tmall.com': [226, 35, 26],
  'juejin.cn': [30, 128, 255],
  'reddit.com': [255, 69, 0],
  'wikipedia.org': [64, 64, 64],
  'zh.wikipedia.org': [64, 64, 64],
  'dodopayments.com': [190, 255, 0],
  'x.com': [17, 24, 39],
  'twitter.com': [29, 161, 242]
};

function normalizeHost(hostname: unknown): string {
  if (!hostname) {
    return '';
  }
  const lower = String(hostname).toLowerCase();
  const stripped = lower.replace(/^www\./i, '');
  if (stripped === 'my.feishu.cn') {
    return 'feishu.cn';
  }
  return stripped;
}

function getBrandAccentForHost(hostname: unknown): ThemeRgb | null {
  const host = String(hostname || '').toLowerCase();
  if (!host) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(brandAccentMap, host)) {
    return brandAccentMap[host];
  }
  const entry = Object.keys(brandAccentMap).find((key) => host === key || host.endsWith(`.${key}`));
  return entry ? brandAccentMap[entry] : null;
}

function getBrandAccentForUrl(url: unknown): ThemeRgb | null {
  if (!url) {
    return null;
  }
  try {
    const hostname = normalizeHost(new URL(String(url)).hostname);
    return getBrandAccentForHost(hostname);
  } catch (_error) {
    return null;
  }
}

export { getBrandAccentForHost, getBrandAccentForUrl, normalizeHost };

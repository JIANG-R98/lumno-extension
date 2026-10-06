const assert = require('assert');
const { compareProgressPages, shouldAdvance, readTitle } = require('../src/shared/progress-match.js');

function check(name, current, candidate, expected) {
  const actual = compareProgressPages(current, candidate);
  Object.keys(expected).forEach((key) => {
    assert.strictEqual(actual[key], expected[key],
      `${name}: expected ${key}=${expected[key]}, got ${JSON.stringify(actual)}`);
  });
  return actual;
}

const page = (url, title = '') => ({ url, title });

// 1. The episode, chapter or page is in the URL.
check('vidhub3 next episode',
  page('https://vidhub3.top/vodplay/55357-1-1.html'),
  page('https://vidhub3.top/vodplay/55357-1-2.html'),
  { match: true, confidence: 'high', direction: 'forward' });
check('bilibili collection p=2 from the first part',
  page('https://www.bilibili.com/video/BV11LEA6eEuj/'),
  page('https://www.bilibili.com/video/BV11LEA6eEuj?p=2'),
  { match: true, confidence: 'high', direction: 'forward' });
check('bilibili collection p=2 → p=3',
  page('https://www.bilibili.com/video/BV11LEA6eEuj?p=2'),
  page('https://www.bilibili.com/video/BV11LEA6eEuj?p=3'),
  { match: true, confidence: 'high', direction: 'forward' });
check('bilibili sharing parameters do not count as a change',
  page('https://www.bilibili.com/video/BV11LEA6eEuj?p=2&spm_id_from=333.788'),
  page('https://www.bilibili.com/video/BV11LEA6eEuj?p=3&vd_source=abc&t=42'),
  { match: true, confidence: 'high', direction: 'forward' });
check('shencou next chapter keeps the book id',
  page('https://m.shencou.com/chapter.php?aid=993&cid=53107'),
  page('https://m.shencou.com/chapter.php?aid=993&cid=53108'),
  { match: true, confidence: 'high', direction: 'forward' });
check('bilinovel second page of a chapter',
  page('https://www.bilinovel.com/novel/2013/72035.html'),
  page('https://www.bilinovel.com/novel/2013/72035_2.html'),
  { match: true, confidence: 'high', direction: 'forward' });
check('bilinovel next chapter',
  page('https://www.bilinovel.com/novel/2013/72035_3.html'),
  page('https://www.bilinovel.com/novel/2013/72036.html'),
  { match: false, reason: 'title-mismatch' });
check('bilinovel next chapter with the work in the title',
  page('https://www.bilinovel.com/novel/2013/72035_3.html', '某轻小说 第一章 开端（3/3）_哔哩轻小说'),
  page('https://www.bilinovel.com/novel/2013/72036.html', '某轻小说 第二章 转折_哔哩轻小说'),
  { match: true, confidence: 'medium', direction: 'forward' });
check('faxiantv opaque share ids with matching titles',
  page('https://faxiantv.cc/player.php?share=aae5ca3dda55', '某剧 第1集 - 发现TV'),
  page('https://faxiantv.cc/player.php?share=f3a3ce602a22', '某剧 第2集 - 发现TV'),
  { match: true, confidence: 'medium', direction: 'forward' });

// 2 and 3. The URL stays the same; nothing to move the card to.
check('Emby keeps one URL for every episode',
  page('https://media.nijigem.by/web/index.html#!/videoosd/videoosd.html', 'Emby'),
  page('https://media.nijigem.by/web/index.html#!/videoosd/videoosd.html', 'Emby'),
  { match: false, reason: 'same-page' });
check('WeRead keeps one URL for the whole book',
  page('https://weread.qq.com/web/reader/ce7325b0813ab9558g014d3a'),
  page('https://weread.qq.com/web/reader/ce7325b0813ab9558g014d3a'),
  { match: false, reason: 'same-page' });
check('Emby hash routes are pages, not anchors',
  page('https://media.nijigem.by/web/index.html#!/videoosd/videoosd.html'),
  page('https://media.nijigem.by/web/index.html#!/home.html'),
  { match: false });

// Same site, different work or a different kind of page: never a match.
check('another work with the same URL template',
  page('https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集'),
  page('https://vidhub3.top/vodplay/60001-1-1.html', '另一部剧 第1集'),
  { match: false, reason: 'title-mismatch' });
check('another book on shencou',
  page('https://m.shencou.com/chapter.php?aid=993&cid=53107', '书A 第一章'),
  page('https://m.shencou.com/chapter.php?aid=1000&cid=60000', '书B 第一章'),
  { match: false });
check('a recommended bilibili video',
  page('https://www.bilibili.com/video/BV11LEA6eEuj?p=2', '合集名 P2 第二集_哔哩哔哩_bilibili'),
  page('https://www.bilibili.com/video/BV1xx411c7mD', '完全无关的视频_哔哩哔哩_bilibili'),
  { match: false });
check('a collection whose episodes are separate videos',
  page('https://www.bilibili.com/video/BV11LEA6eEuj', '合集名 第1集_哔哩哔哩_bilibili'),
  page('https://www.bilibili.com/video/BV1xx411c7mD', '合集名 第2集_哔哩哔哩_bilibili'),
  { match: true, confidence: 'medium', direction: 'forward' });
check('the site home page',
  page('https://www.bilibili.com/video/BV11LEA6eEuj?p=2'),
  page('https://www.bilibili.com/'),
  { match: false, reason: 'structure-mismatch' });
check('the detail page of the same work',
  page('https://vidhub3.top/vodplay/55357-1-1.html'),
  page('https://vidhub3.top/voddetail/55357.html'),
  { match: false });
check('a search page with a text query',
  page('https://vidhub3.top/vodplay/55357-1-1.html'),
  page('https://vidhub3.top/vodplay/55357-1-1.html?wd=柯南'),
  { match: false, reason: 'structure-mismatch' });
check('opaque ids with one generic title prove nothing',
  page('https://faxiantv.cc/player.php?share=aae5ca3dda55', '发现TV 在线播放'),
  page('https://faxiantv.cc/player.php?share=f3a3ce602a22', '发现TV 在线播放'),
  { match: false });
check('another site',
  page('https://vidhub3.top/vodplay/55357-1-1.html'),
  page('https://vidhub4.top/vodplay/55357-1-2.html'),
  { match: false, reason: 'site-mismatch' });
check('www is the same site',
  page('https://bilibili.com/video/BV11LEA6eEuj?p=2'),
  page('https://www.bilibili.com/video/BV11LEA6eEuj?p=3'),
  { match: true, confidence: 'high' });

// Going back is recognised but never advances the card.
const rewatch = check('rewatching an earlier episode',
  page('https://vidhub3.top/vodplay/55357-1-12.html'),
  page('https://vidhub3.top/vodplay/55357-1-3.html'),
  { match: true, direction: 'backward' });
assert.strictEqual(shouldAdvance(rewatch), false);
const reread = check('rereading an earlier page of a chapter',
  page('https://www.bilinovel.com/novel/2013/72035_2.html'),
  page('https://www.bilinovel.com/novel/2013/72035.html'),
  { match: true, direction: 'backward' });
assert.strictEqual(shouldAdvance(reread), false);
const titleRewind = check('title says an earlier episode',
  page('https://faxiantv.cc/player.php?share=f3a3ce602a22', '某剧 第十二集'),
  page('https://faxiantv.cc/player.php?share=aae5ca3dda55', '某剧 第三集'),
  { match: true, direction: 'backward' });
assert.strictEqual(shouldAdvance(titleRewind), false);
assert.strictEqual(shouldAdvance(compareProgressPages(
  page('https://vidhub3.top/vodplay/55357-1-1.html'),
  page('https://vidhub3.top/vodplay/55357-1-2.html')
)), true);

// Title reading.
assert.deepStrictEqual(
  { ...readTitle('名侦探柯南 第1128集_高清在线观看') },
  { workName: '名侦探柯南', episode: 1128, hasMarker: true }
);
assert.strictEqual(readTitle('某剧 第二十三集').episode, 23);
assert.strictEqual(readTitle('Some Show - Episode 4 | Site').workName, 'some show');

console.log('progress match tests passed');

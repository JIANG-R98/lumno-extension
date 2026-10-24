const assert = require('assert');
const intent = require('../../src/domain/selection-intent.ts');

function classify(text, options) {
  return intent.classifySelection(text, options || { uiLanguage: 'zh-CN' });
}

{
  const result = classify('serendipity', { uiLanguage: 'zh-CN' });
  assert.strictEqual(result.action, 'translate');
  assert.strictEqual(result.confidence, 'high');
  assert.strictEqual(result.features.languageMismatch, true);
}

{
  const result = classify('React', { uiLanguage: 'zh-CN' });
  assert.strictEqual(result.action, 'explain');
  assert.strictEqual(result.confidence, 'medium');
  assert.strictEqual(result.features.languageMismatch, false);
  assert.strictEqual(result.triggerable, true);
}

{
  const result = classify('React components', { uiLanguage: 'en' });
  assert.strictEqual(result.triggerable, true);
}

{
  const result = classify('100', { uiLanguage: 'zh-CN' });
  assert.strictEqual(result.features.numericLike, false);
  assert.strictEqual(result.triggerable, false);
}

{
  const result = classify('这是你需要的资料', { uiLanguage: 'zh-CN' });
  assert.strictEqual(result.confidence, 'low');
  assert.strictEqual(result.triggerable, false);
}

{
  const result = classify('The request failed because the server was unavailable.', {
    uiLanguage: 'en'
  });
  assert.strictEqual(result.features.errorLike, false);
  assert.strictEqual(result.triggerable, false);
}

{
  const result = classify('TypeError: Cannot read properties of undefined', {
    insideCode: true,
    uiLanguage: 'zh-CN'
  });
  assert.strictEqual(result.action, 'explain');
  assert.strictEqual(result.confidence, 'high');
  assert.strictEqual(result.features.errorLike, true);
}

{
  const result = classify('为什么这个请求会失败？', { uiLanguage: 'zh-CN' });
  assert.strictEqual(result.action, 'ask');
  assert.strictEqual(result.confidence, 'high');
}

[
  'the',
  'and',
  'click here',
  'learn more',
  'next page',
  'Welcome to our website'
].forEach((text) => {
  assert.strictEqual(
    classify(text, { uiLanguage: 'en' }).triggerable,
    false,
    `generic English selection should stay quiet: ${text}`
  );
});

assert.strictEqual(
  classify('click here', { uiLanguage: 'zh-CN' }).triggerable,
  false,
  'foreign-language boilerplate should not become a translation trigger'
);

[
  '点击这里',
  '了解更多',
  '下一步',
  '欢迎访问我们的网站',
  '这里',
  '更多'
].forEach((text) => {
  assert.strictEqual(
    classify(text, { uiLanguage: 'zh-CN' }).triggerable,
    false,
    `generic Chinese selection should stay quiet: ${text}`
  );
});

assert.strictEqual(
  classify('了解更多', { uiLanguage: 'en' }).triggerable,
  false,
  'CJK boilerplate should stay quiet in a foreign UI locale'
);

[
  ['React', { uiLanguage: 'en' }],
  ['React components', { uiLanguage: 'en' }],
  ['AI', { uiLanguage: 'en' }],
  ['量子纠缠', { uiLanguage: 'zh-CN' }],
  ['算法', { uiLanguage: 'zh-CN' }],
  ['提示词', { uiLanguage: 'zh-CN' }]
].forEach(([text, options]) => {
  assert.strictEqual(
    classify(text, options).triggerable,
    true,
    `meaningful term should expose the toolbar: ${text}`
  );
});

{
  const result = classify('OpenAI GPT-5 latest news', { uiLanguage: 'en' });
  assert.strictEqual(result.triggerable, true);
  assert.strictEqual(result.action, 'search');
}

{
  const result = classify('OpenAI GPT-5 latest news', { uiLanguage: 'zh-CN' });
  assert.strictEqual(result.action, 'search');
}

{
  const result = classify('How much is 100 USD in CNY?', { uiLanguage: 'en' });
  assert.strictEqual(result.action, 'calculate');
}

{
  const result = classify('Why is the sky blue?', { uiLanguage: 'zh-CN' });
  assert.strictEqual(result.action, 'ask');
}

[
  {
    name: 'a complete Chinese article paragraph',
    text: '今年初，一款名为 Bookology 的读书管理应用进入我的视野，它集合了我需要的原本分散在各个读书应用中的功能。总结来说，Bookology 将书籍管理、阅读进度、阅读笔记和数据统计整合在一个简洁的数字书架中，在这一个 App 中就可以建立专属于我自己的阅读档案。',
    options: { uiLanguage: 'zh-CN', pageLanguage: 'zh-CN' }
  },
  {
    name: 'a complete English article paragraph',
    text: 'The product combines reading notes and progress in one place. It keeps a personal archive that remains easy to review later.',
    options: { uiLanguage: 'en', pageLanguage: 'en' }
  },
  {
    name: 'a complete Japanese article paragraph',
    text: 'このアプリは読書記録と進捗管理を一つの場所にまとめ、日々の読書体験を整理しやすくします。さらに、保存したメモや統計を後から振り返ることで、自分だけの読書履歴を継続的に育てられます。',
    options: { uiLanguage: 'ja', pageLanguage: 'ja' }
  },
  {
    name: 'a substantial single-sentence paragraph',
    text: 'This paragraph contains a sustained explanation of a product workflow and includes enough context to be useful when asking an assistant for interpretation even though the author chose to write it as one long sentence without terminal punctuation',
    options: { uiLanguage: 'en', pageLanguage: 'en' }
  }
].forEach(({ name, text, options }) => {
  const result = classify(text, options);
  assert.strictEqual(result.features.substantialProseLike, true,
    `${name} should satisfy the general substantial-prose rule`);
  assert.strictEqual(result.action, 'summarize', `${name} should rank Summarize first`);
  assert.strictEqual(result.confidence, 'high');
  assert.strictEqual(result.triggerable, true);
});

[
  {
    name: 'short UI-like sentences',
    text: '产品支持同步。稍后再试。',
    options: { uiLanguage: 'zh-CN', pageLanguage: 'zh-CN' }
  },
  {
    name: 'repeated UI actions',
    text: 'Save changes. Cancel operation. '.repeat(4),
    options: { uiLanguage: 'en', pageLanguage: 'en' }
  },
  {
    name: 'symbol-only sentences',
    text: `${'😀'.repeat(40)}。${'😀'.repeat(40)}。`,
    options: { uiLanguage: 'zh-CN', pageLanguage: 'zh-CN' }
  },
  {
    name: 'hard-wrapped repeated fragments',
    text: `${'configuration value '.repeat(4)}\n${'configuration value '.repeat(4)}\n${'configuration value '.repeat(4)}`,
    options: { uiLanguage: 'en', pageLanguage: 'en' }
  }
].forEach(({ name, text, options }) => {
  const result = classify(text, options);
  assert.strictEqual(result.features.substantialProseLike, false,
    `${name} should not be promoted by punctuation, UTF-16 length, or hard wrapping`);
  assert.notStrictEqual(result.action, 'summarize');
  assert.strictEqual(result.triggerable, false);
});

{
  const result = classify(
    'const result = records.map((record) => normalize(record)).filter(Boolean); This function normalizes every record before filtering it. It returns a clean array for the next processing stage.',
    { insideCode: true, uiLanguage: 'en', pageLanguage: 'en' }
  );
  assert.strictEqual(result.features.substantialProseLike, false,
    'code should stay outside the prose gate even when it includes full sentences');
  assert.strictEqual(result.action, 'explain');
  assert.strictEqual(result.confidence, 'high');
  assert.strictEqual(result.triggerable, true);
}

{
  const result = classify('100 USD to CNY', { uiLanguage: 'zh-CN' });
  assert.strictEqual(result.action, 'calculate');
  assert.strictEqual(result.confidence, 'high');
}

assert.strictEqual(classify('https://example.com/').suppressed, true);
assert.strictEqual(classify('person@example.com').suppressed, true);
{
  const result = classify('selected text', { editable: true, uiLanguage: 'en' });
  assert.strictEqual(result.suppressed, false);
  assert.strictEqual(result.triggerable, true);
}

assert.strictEqual(
  classify('secret token', { sensitive: true, uiLanguage: 'en' }).suppressed,
  true
);

assert.match(intent.buildPrompt('translate', 'hello', 'zh-CN'), /简体中文/);
assert.match(intent.buildPrompt('translate', 'hello', 'zh-TW'), /繁體中文/);
assert.strictEqual(intent.buildPrompt('ask', 'Why?', 'en'), 'Why?');

console.log('selection intent tests passed');

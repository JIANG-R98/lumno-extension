// The traditional-to-simplified table and pinyin-pro the mode menu's
// filter reads, loaded on first use.
import { getHanVariantPairs, installHanVariantPairs, readHanVariantModule } from '../../../domain/search/han-variants';
import { readPinyinApi } from '../../../domain/search/pinyin-api';
import type { PinyinApi } from '../../../domain/search/pinyin-api';
import type { InputModeState } from './controller-types';

// The traditional-to-simplified table and pinyin-pro, each built as its own
// module so pages load them only when the scope panel's filter first needs them.
const HAN_VARIANTS_MODULE_PATH = 'build/han-variants.js';
const PINYIN_MODULE_PATH = 'build/pinyin.js';

const MODE_MENU_PINYIN_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  书: 'shu',
  信: 'xin',
  元: 'yuan',
  众: 'zhong',
  包: 'bao',
  千: 'qian',
  历: 'li',
  号: 'hao',
  天: 'tian',
  常: 'chang',
  已: 'yi',
  开: 'kai',
  微: 'wei',
  打: 'da',
  搜: 'sou',
  掘: 'jue',
  标: 'biao',
  淘: 'tao',
  猫: 'mao',
  用: 'yong',
  百: 'bai',
  知: 'zhi',
  签: 'qian',
  索: 'suo',
  维: 'wei',
  翻: 'fan',
  豆: 'dou',
  金: 'jin',
  问: 'wen',
  页: 'ye',
  度: 'du',
  乎: 'hu',
  瓣: 'ban',
  公: 'gong',
  基: 'ji',
  科: 'ke',
  史: 'shi'
});


// pinyin-pro once a menu on this page has loaded it; later menus start with it.
let loadedPinyinApi: PinyinApi | null = null;

// One menu's pinyin: what it filters with, and whether it asked to load.
interface PinyinRuntime {
  api: PinyinApi | null;
  requested: boolean;
}

function createPinyinRuntime(configured: PinyinApi | null | undefined): PinyinRuntime {
  return { api: configured !== undefined ? configured : loadedPinyinApi, requested: false };
}

function readExtensionUrl(path: string): string {
  const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
  return chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function'
    ? chromeApi.runtime.getURL(path)
    : '';
}

function ensurePinyinApi(runtime: PinyinRuntime): Promise<PinyinApi | null> | null {
  if (runtime.api) {
    return null;
  }
  const url = readExtensionUrl(PINYIN_MODULE_PATH);
  if (!url) {
    return null;
  }
  try {
    return import(url)
      .then((loaded: unknown) => {
        const api = readPinyinApi(loaded);
        if (api) {
          loadedPinyinApi = api;
          runtime.api = api;
        }
        return api;
      })
      .catch(() => null);
  } catch (_error) {
    return null;
  }
}

// The traditional-to-simplified table the shared matcher folds with, so
// 臺灣 finds a card named 台湾 and the other way round.
function ensureHanVariants(): Promise<boolean | null> | null {
  const url = getHanVariantPairs() ? '' : readExtensionUrl(HAN_VARIANTS_MODULE_PATH);
  if (!url) {
    return null;
  }
  try {
    return import(url)
      .then((loaded: unknown) => {
        const pairs = readHanVariantModule(loaded);
        if (pairs) {
          installHanVariantPairs(pairs);
        }
        return Boolean(pairs);
      })
      .catch(() => null);
  } catch (_error) {
    return null;
  }
}

// Only the scope panel's filter reads pinyin, so the runtime loads on the
// first typed character or the first panel open, not while the page is
// opening. onLoaded runs once pinyin-pro or the variant table arrives, so
// cards indexed from the fallback table pick up every reading and the
// simplified forms.
function requestPinyinRuntime(
  runtime: PinyinRuntime,
  inputModeState: Pick<InputModeState, 'modeMenuPinyinRuntimeReady'>,
  onLoaded: () => void
): PromiseLike<unknown> | null | undefined {
  if (!runtime.requested) {
    runtime.requested = true;
    const runtimeReady = ensurePinyinApi(runtime);
    inputModeState.modeMenuPinyinRuntimeReady = runtimeReady;
    Promise.all([runtimeReady, ensureHanVariants()])
      .then(([api, variantsLoaded]) => {
        if (api || variantsLoaded) {
          onLoaded();
        }
      });
  }
  return inputModeState.modeMenuPinyinRuntimeReady;
}

export type { PinyinRuntime };
export { MODE_MENU_PINYIN_FALLBACKS, createPinyinRuntime, requestPinyinRuntime };

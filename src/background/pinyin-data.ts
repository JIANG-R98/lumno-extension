// pinyin-pro for the service worker, built as its own classic script: the
// worker imports it on first use (worker-context.ts, PINYIN_DATA_SCRIPT_PATH)
// and reads the converter it publishes.
import { pinyin } from 'pinyin-pro';
import { publishWorkerLazyModule } from '../platform/worker-lazy';

publishWorkerLazyModule('pinyin', { pinyin });

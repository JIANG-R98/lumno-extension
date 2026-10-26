import { describe, expect, it } from 'vitest';
import { HAN_VARIANT_PAIRS } from './han-variants.generated';
import { readHanVariantModule } from './han-variants';

function pairsToMap(pairs: string): Map<string, string> {
  const map = new Map<string, string>();
  for (let index = 0; index + 1 < pairs.length; index += 2) {
    map.set(pairs.charAt(index), pairs.charAt(index + 1));
  }
  return map;
}

describe('han variant table', () => {
  const variants = pairsToMap(HAN_VARIANT_PAIRS);

  it('holds one-character pairs only', () => {
    expect(HAN_VARIANT_PAIRS.length % 2).toBe(0);
    expect(variants.size).toBe(2903);
  });

  it('maps traditional characters to the simplified ones search reads them as', () => {
    expect(variants.get('臺')).toBe('台');
    expect(variants.get('灣')).toBe('湾');
    expect(variants.get('國')).toBe('国');
  });

  it('leads straight to the final form, never to another traditional character', () => {
    variants.forEach((simplified, traditional) => {
      expect(simplified).not.toBe(traditional);
      expect(variants.has(simplified)).toBe(false);
    });
  });
});

describe('readHanVariantModule', () => {
  it('reads the table a loaded module exports', () => {
    expect(readHanVariantModule({ HAN_VARIANT_PAIRS })).toBe(HAN_VARIANT_PAIRS);
  });

  it('rejects values that are not the table', () => {
    expect(readHanVariantModule(null)).toBeNull();
    expect(readHanVariantModule({})).toBeNull();
    expect(readHanVariantModule({ HAN_VARIANT_PAIRS: '' })).toBeNull();
    expect(readHanVariantModule({ HAN_VARIANT_PAIRS: '臺' })).toBeNull();
    expect(readHanVariantModule({ HAN_VARIANT_PAIRS: 42 })).toBeNull();
  });
});

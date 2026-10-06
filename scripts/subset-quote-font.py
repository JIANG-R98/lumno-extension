#!/usr/bin/env python3
"""Rebuild the LXGW WenKai subset used by the New Tab quote.

Requires fonttools and brotli (pip install fonttools brotli). Inputs:
  - LXGWWenKai-Regular.ttf from https://github.com/lxgw/LxgwWenKai/releases
  - d.json and i.json from https://github.com/hitokoto-osc/sentences-bundle/tree/master/sentences
    (the literature and poetry categories the quote requests)

The primary file covers ASCII, Latin-1, CJK punctuation, GB2312 symbols and the
3,755 level-1 GB2312 hanzi; the extended file covers level-2 GB2312 plus every
other character seen in the hitokoto bundle. Both are declared with
unicode-range so the extended file only loads when a quote needs it.

Usage: python3 scripts/subset-quote-font.py <ttf> <d.json> <i.json>
"""
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

OUT_DIR = Path(__file__).resolve().parent.parent / 'assets' / 'fonts' / 'lxgw-wenkai'


def gb2312_rows(first, last):
    chars = set()
    for hi in range(first, last + 1):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(ord(bytes([hi, lo]).decode('gb2312')))
            except UnicodeDecodeError:
                pass
    return chars


def unicode_range(codepoints):
    cps = sorted(codepoints)
    spans = []
    start = prev = cps[0]
    for cp in cps[1:]:
        if cp != prev + 1:
            spans.append((start, prev))
            start = cp
        prev = cp
    spans.append((start, prev))
    return ', '.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in spans)


def write_subset(ttf, codepoints, out):
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.hinting = False
    font = TTFont(ttf)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(out)


def main(ttf, *sentence_files):
    available = set(TTFont(ttf).getBestCmap())
    base = set(range(0x20, 0x7F)) | set(range(0xA0, 0x100))
    base |= set(range(0x2010, 0x2027)) | set(range(0x3000, 0x3020)) | set(range(0xFF01, 0xFF5F))
    base |= {0x2E3A, 0x2E3B, 0x30FB}
    quote_chars = set()
    for path in sentence_files:
        for item in json.loads(Path(path).read_text(encoding='utf-8')):
            for field in ('hitokoto', 'from', 'from_who'):
                quote_chars |= {ord(c) for c in (item.get(field) or '')}

    primary = (base | gb2312_rows(0xA1, 0xA9) | gb2312_rows(0xB0, 0xD7)) & available
    extended = ((gb2312_rows(0xD8, 0xF7) | quote_chars) & available) - primary

    faces = []
    for name, codepoints in (('primary', primary), ('extended', extended)):
        filename = f'LXGWWenKai-Regular-{name}.woff2'
        write_subset(ttf, codepoints, OUT_DIR / filename)
        faces.append(
            '@font-face {\n'
            '  font-family: "LXGW WenKai";\n'
            f'  src: url("./{filename}") format("woff2");\n'
            '  font-style: normal;\n'
            '  font-weight: 400;\n'
            '  font-display: swap;\n'
            f'  unicode-range: {unicode_range(codepoints)};\n'
            '}\n'
        )
    header = ('/* LXGW WenKai v1.522 Regular, subset to woff2 for the New Tab quote (SIL OFL 1.1, see OFL.txt).\n'
              '   Rebuild with scripts/subset-quote-font.py. */\n')
    (OUT_DIR / 'lxgw-wenkai.css').write_text(header + ''.join(faces), encoding='utf-8')
    print(f'primary {len(primary)} glyphs, extended {len(extended)} glyphs')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], *sys.argv[2:])

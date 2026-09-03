const assert = require('assert');
const fs = require('fs');
const zlib = require('zlib');

function readRgbaPngForAssetTest(filePath) {
  const bytes = fs.readFileSync(filePath);
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  let width = 0;
  let height = 0;
  let colorType = 0;
  const dataChunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString();
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.strictEqual(data[8], 8, 'tracking icon must use 8-bit PNG channels');
      colorType = data[9];
    } else if (type === 'IDAT') {
      dataChunks.push(data);
    }
    offset += length + 12;
  }
  assert.strictEqual(colorType, 6, 'tracking icon must be RGBA for deterministic rendering');
  const inflated = zlib.inflateSync(Buffer.concat(dataChunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (stride + 1);
    const filter = inflated[sourceOffset];
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
        value += distances[0] <= distances[1] && distances[0] <= distances[2]
          ? left
          : distances[1] <= distances[2] ? up : upLeft;
      } else assert.strictEqual(filter, 0, `unsupported PNG filter ${filter}`);
      pixels[y * stride + x] = value & 255;
    }
  }
  return { width, height, pixels };
}

for (const size of [16, 32]) {
  const icon = readRgbaPngForAssetTest(`assets/images/lumno-tracked-${size}.png`);
  assert.deepStrictEqual([icon.width, icon.height], [size, size]);
  let darkMarkerPixels = 0;
  for (let y = Math.floor(size / 2); y < size; y += 1) {
    for (let x = Math.floor(size / 2); x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const [red, green, blue, alpha] = icon.pixels.subarray(offset, offset + 4);
      if (alpha > 220 && red < 45 && green < 90 && blue < 135) darkMarkerPixels += 1;
    }
  }
  assert(
    darkMarkerPixels >= Math.round(size * size * 0.08),
    `${size}px toolbar icon needs a larger high-contrast marker; found ${darkMarkerPixels} dark pixels`
  );
}

console.log('toolbar tracking icon tests passed');

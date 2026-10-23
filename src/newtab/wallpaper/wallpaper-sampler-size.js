// The largest image the wallpaper effects sample. A wallpaper's small copy is made at this size, so
// sampling it reads the same pixels as sampling the full image: scripts/build/generate-wallpaper-samples.js
// makes the built-in ones, and wallpaper-local-store.js one for each upload and cached photo.
const SAMPLER_MAX_WIDTH = 520;
const SAMPLER_MAX_HEIGHT = 320;

function getSamplerSize(naturalWidth, naturalHeight) {
  const width = Math.max(1, Number(naturalWidth) || 1);
  const height = Math.max(1, Number(naturalHeight) || 1);
  const scale = Math.min(1, SAMPLER_MAX_WIDTH / width, SAMPLER_MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export { getSamplerSize };

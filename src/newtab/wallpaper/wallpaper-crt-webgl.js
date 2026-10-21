(function initLumnoNewtabCrtWebGL(root) {
  'use strict';

  const CONTEXT_ATTRIBUTES = {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false
  };

  const WEBGL1_VERTEX_SHADER = [
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  const WEBGL1_FRAGMENT_SHADER = [
    'precision mediump float;',
    'uniform sampler2D uImage;',
    'uniform vec2 uResolution;',
    'uniform vec2 uSourceSize;',
    'uniform float uStrength;',
    'uniform float uBloom;',
    'uniform float uRgbOffset;',
    'uniform float uCurvature;',
    'varying vec2 vUv;',
    'vec2 coverUv(vec2 uv) {',
    '  float outputAspect = uResolution.x / max(uResolution.y, 1.0);',
    '  float sourceAspect = uSourceSize.x / max(uSourceSize.y, 1.0);',
    '  vec2 scale = sourceAspect > outputAspect',
    '    ? vec2(outputAspect / sourceAspect, 1.0)',
    '    : vec2(1.0, sourceAspect / outputAspect);',
    '  return (uv - 0.5) * scale + 0.5;',
    '}',
    'vec3 sampleRgb(vec2 uv, float shift) {',
    '  vec2 offset = vec2(',
    '    shift / max(uResolution.x, 1.0),',
    '    shift * 0.12 / max(uResolution.y, 1.0)',
    '  );',
    '  return vec3(',
    '    texture2D(uImage, coverUv(uv + offset)).r,',
    '    texture2D(uImage, coverUv(uv)).g,',
    '    texture2D(uImage, coverUv(uv - offset)).b',
    '  );',
    '}',
    'float luma(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }',
    'void main() {',
    '  vec2 centered = vUv * 2.0 - 1.0;',
    '  float curve = uCurvature * 0.16;',
    '  vec2 warped = centered * (1.0 + curve * dot(centered, centered));',
    '  vec2 uv = warped * 0.5 + 0.5;',
    '  float border = 1.0 - smoothstep(0.985, 1.03, max(abs(warped.x), abs(warped.y)));',
    '  float shift = mix(0.0, 4.2, uRgbOffset) * 1.25;',
    '  vec3 color = sampleRgb(uv, shift);',
    '  vec2 texel = 1.0 / max(uResolution, vec2(1.0));',
    '  float radius = mix(2.0, 10.0, uBloom);',
    '  float farRadius = radius * 2.15;',
    '  vec3 glow = vec3(0.0);',
    '  if (uBloom > 0.0001) {',
    '    glow += texture2D(uImage, coverUv(uv)).rgb * 0.18;',
    '    glow += texture2D(uImage, coverUv(uv + vec2(radius, 0.0) * texel)).rgb * 0.12;',
    '    glow += texture2D(uImage, coverUv(uv - vec2(radius, 0.0) * texel)).rgb * 0.12;',
    '    glow += texture2D(uImage, coverUv(uv + vec2(0.0, radius) * texel)).rgb * 0.12;',
    '    glow += texture2D(uImage, coverUv(uv - vec2(0.0, radius) * texel)).rgb * 0.12;',
    '    glow += texture2D(uImage, coverUv(uv + vec2(radius) * texel)).rgb * 0.055;',
    '    glow += texture2D(uImage, coverUv(uv - vec2(radius) * texel)).rgb * 0.055;',
    '    glow += texture2D(uImage, coverUv(uv + vec2(radius, -radius) * texel)).rgb * 0.055;',
    '    glow += texture2D(uImage, coverUv(uv + vec2(-radius, radius) * texel)).rgb * 0.055;',
    '    glow += texture2D(uImage, coverUv(uv + vec2(farRadius, 0.0) * texel)).rgb * 0.03;',
    '    glow += texture2D(uImage, coverUv(uv - vec2(farRadius, 0.0) * texel)).rgb * 0.03;',
    '    glow += texture2D(uImage, coverUv(uv + vec2(0.0, farRadius) * texel)).rgb * 0.03;',
    '    glow += texture2D(uImage, coverUv(uv - vec2(0.0, farRadius) * texel)).rgb * 0.03;',
    '    glow *= smoothstep(0.28, 0.78, luma(glow));',
    '  }',
    '  float displayResponse = clamp(uStrength / 0.2, 0.0, 1.0);',
    '  float bloomGain = uBloom * 0.28;',
    '  color += glow * bloomGain * (0.65 + 0.75 * displayResponse);',
    '  float scanPeriod = 2.0;',
    '  float scanWave = step(1.0, mod(floor(gl_FragCoord.y), scanPeriod));',
    '  float scanDepth = mix(0.035, 0.21, displayResponse);',
    '  color *= 1.0 - scanDepth * scanWave;',
    '  float channel = mod(floor(gl_FragCoord.x), 3.0);',
    '  vec3 mask = channel < 1.0 ? vec3(1.35, 0.16, 0.16)',
    '    : (channel < 2.0 ? vec3(0.16, 1.35, 0.16) : vec3(0.16, 0.16, 1.35));',
    '  float maskAmount = mix(0.32, 0.68, displayResponse);',
    '  color *= mix(vec3(1.0), mask, maskAmount);',
    '  float vignette = 1.0 - smoothstep(0.28, 1.15, length(centered * vec2(0.86, 1.0)));',
    '  color *= mix(0.72, 1.0, vignette) * border;',
    '  color = (color - 0.5) * (1.02 + 0.16 * uStrength) + 0.5;',
    '  color *= 1.01 + 0.07 * uStrength;',
    '  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);',
    '}'
  ].join('\n');

  const WEBGL2_VERTEX_SHADER = [
    '#version 300 es',
    'in vec2 aPosition;',
    'out vec2 vUv;',
    'void main() {',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  const WEBGL2_CRT_FRAGMENT_SHADER = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uImage;',
    'uniform vec2 uResolution;',
    'uniform vec2 uSourceSize;',
    'uniform float uStrength;',
    'uniform float uRgbOffset;',
    'uniform float uCurvature;',
    'in vec2 vUv;',
    'out vec4 fragColor;',
    'vec2 coverUv(vec2 uv) {',
    '  float outputAspect = uResolution.x / max(uResolution.y, 1.0);',
    '  float sourceAspect = uSourceSize.x / max(uSourceSize.y, 1.0);',
    '  vec2 scale = sourceAspect > outputAspect',
    '    ? vec2(outputAspect / sourceAspect, 1.0)',
    '    : vec2(1.0, sourceAspect / outputAspect);',
    '  return (uv - 0.5) * scale + 0.5;',
    '}',
    'vec3 sampleRgb(vec2 uv, float shift) {',
    '  vec2 offset = vec2(',
    '    shift / max(uResolution.x, 1.0),',
    '    shift * 0.12 / max(uResolution.y, 1.0)',
    '  );',
    '  return vec3(',
    '    texture(uImage, coverUv(uv + offset)).r,',
    '    texture(uImage, coverUv(uv)).g,',
    '    texture(uImage, coverUv(uv - offset)).b',
    '  );',
    '}',
    'void main() {',
    '  vec2 centered = vUv * 2.0 - 1.0;',
    '  float curve = uCurvature * 0.16;',
    '  vec2 warped = centered * (1.0 + curve * dot(centered, centered));',
    '  vec2 uv = warped * 0.5 + 0.5;',
    '  float border = 1.0 - smoothstep(0.985, 1.03, max(abs(warped.x), abs(warped.y)));',
    '  float shift = mix(0.0, 4.2, uRgbOffset) * 1.25;',
    '  vec3 color = sampleRgb(uv, shift);',
    '  float displayResponse = clamp(uStrength / 0.2, 0.0, 1.0);',
    '  float scanPeriod = 2.0;',
    '  float scanWave = step(1.0, mod(floor(gl_FragCoord.y), scanPeriod));',
    '  float scanDepth = mix(0.035, 0.21, displayResponse);',
    '  color *= 1.0 - scanDepth * scanWave;',
    '  float channel = mod(floor(gl_FragCoord.x), 3.0);',
    '  vec3 mask = channel < 1.0 ? vec3(1.35, 0.16, 0.16)',
    '    : (channel < 2.0 ? vec3(0.16, 1.35, 0.16) : vec3(0.16, 0.16, 1.35));',
    '  float maskAmount = mix(0.32, 0.68, displayResponse);',
    '  color *= mix(vec3(1.0), mask, maskAmount);',
    '  float vignette = 1.0 - smoothstep(0.28, 1.15, length(centered * vec2(0.86, 1.0)));',
    '  color *= mix(0.72, 1.0, vignette) * border;',
    '  color = (color - 0.5) * (1.02 + 0.16 * uStrength) + 0.5;',
    '  color *= 1.01 + 0.07 * uStrength;',
    '  fragColor = vec4(max(color, vec3(0.0)), 1.0);',
    '}'
  ].join('\n');

  const WEBGL2_BLOOM_FRAGMENT_SHADER = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uImage;',
    'uniform vec2 uTexelSize;',
    'uniform vec2 uDirection;',
    'uniform float uRadius;',
    'uniform float uThreshold;',
    'in vec2 vUv;',
    'out vec4 fragColor;',
    'float luma(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }',
    'vec3 brightSample(vec2 uv) {',
    '  vec3 color = texture(uImage, uv).rgb;',
    '  float gate = uThreshold < 0.0 ? 1.0 : smoothstep(uThreshold, 0.86, luma(color));',
    '  return color * gate;',
    '}',
    'void main() {',
    '  vec2 stepUv = uDirection * uTexelSize * uRadius;',
    '  vec3 color = brightSample(vUv) * 0.2270270270;',
    '  color += brightSample(vUv + stepUv * 1.3846153846) * 0.3162162162;',
    '  color += brightSample(vUv - stepUv * 1.3846153846) * 0.3162162162;',
    '  color += brightSample(vUv + stepUv * 3.2307692308) * 0.0702702703;',
    '  color += brightSample(vUv - stepUv * 3.2307692308) * 0.0702702703;',
    '  fragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  const WEBGL2_COMPOSITE_FRAGMENT_SHADER = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uCrt;',
    'uniform sampler2D uBloom;',
    'uniform float uBloomAmount;',
    'in vec2 vUv;',
    'out vec4 fragColor;',
    'void main() {',
    '  vec3 crt = texture(uCrt, vUv).rgb;',
    '  vec3 bloom = texture(uBloom, vUv).rgb;',
    '  fragColor = vec4(max(crt + bloom * uBloomAmount, vec3(0.0)), 1.0);',
    '}'
  ].join('\n');

  function createRenderer(options) {
    const settings = options || {};
    const documentObj = settings.documentObj || root.document;
    const canvas = settings.canvas || (documentObj && documentObj.createElement
      ? documentObj.createElement('canvas')
      : null);
    if (!canvas || typeof canvas.getContext !== 'function') return null;

    let gl = null;
    let backend = '';
    let resources = null;
    let contextLost = false;
    let supported = false;
    let uploadedImage = null;

    function normalizePercent(value, fallback) {
      const number = Number(value);
      return Math.max(0, Math.min(100, Number.isFinite(number) ? number : fallback)) / 100;
    }

    function normalizeRange(value, max, fallback) {
      const number = Number(value);
      const limit = Math.max(1, Number(max) || 100);
      return Math.max(0, Math.min(limit, Number.isFinite(number) ? number : fallback)) / limit;
    }

    function compileShader(type, source) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    function createProgram(vertexSource, fragmentSource) {
      const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      if (!vertex || !fragment) {
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
        return null;
      }
      const program = gl.createProgram();
      if (!program) {
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        return null;
      }
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
      }
      return program;
    }

    function createTexture() {
      const texture = gl.createTexture();
      if (!texture) return null;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return texture;
    }

    function createBuffer() {
      const buffer = gl.createBuffer();
      if (!buffer) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );
      return buffer;
    }

    function createTarget() {
      const texture = createTexture();
      const framebuffer = gl.createFramebuffer();
      if (!texture || !framebuffer) {
        if (texture) gl.deleteTexture(texture);
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        return null;
      }
      return { texture, framebuffer };
    }

    function getLocations(program, names) {
      const locations = { position: gl.getAttribLocation(program, 'aPosition') };
      names.forEach((name) => {
        locations[name] = gl.getUniformLocation(program, name);
      });
      return locations;
    }

    function initializeWebGL1() {
      const program = createProgram(WEBGL1_VERTEX_SHADER, WEBGL1_FRAGMENT_SHADER);
      const buffer = program ? createBuffer() : null;
      const sourceTexture = buffer ? createTexture() : null;
      if (!program || !buffer || !sourceTexture) {
        if (sourceTexture) gl.deleteTexture(sourceTexture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        return false;
      }
      resources = {
        program,
        buffer,
        sourceTexture,
        locations: getLocations(program, [
          'uImage', 'uResolution', 'uSourceSize', 'uStrength',
          'uBloom', 'uRgbOffset', 'uCurvature'
        ])
      };
      return true;
    }

    function initializeWebGL2() {
      const crtProgram = createProgram(WEBGL2_VERTEX_SHADER, WEBGL2_CRT_FRAGMENT_SHADER);
      const bloomProgram = crtProgram
        ? createProgram(WEBGL2_VERTEX_SHADER, WEBGL2_BLOOM_FRAGMENT_SHADER)
        : null;
      const compositeProgram = bloomProgram
        ? createProgram(WEBGL2_VERTEX_SHADER, WEBGL2_COMPOSITE_FRAGMENT_SHADER)
        : null;
      const buffer = compositeProgram ? createBuffer() : null;
      const sourceTexture = buffer ? createTexture() : null;
      const crtTarget = sourceTexture ? createTarget() : null;
      const bloomTargetA = crtTarget ? createTarget() : null;
      const bloomTargetB = bloomTargetA ? createTarget() : null;
      if (!crtProgram || !bloomProgram || !compositeProgram || !buffer || !sourceTexture ||
          !crtTarget || !bloomTargetA || !bloomTargetB) {
        [crtTarget, bloomTargetA, bloomTargetB].forEach((target) => {
          if (!target) return;
          gl.deleteFramebuffer(target.framebuffer);
          gl.deleteTexture(target.texture);
        });
        if (sourceTexture) gl.deleteTexture(sourceTexture);
        if (buffer) gl.deleteBuffer(buffer);
        [crtProgram, bloomProgram, compositeProgram].forEach((program) => {
          if (program) gl.deleteProgram(program);
        });
        return false;
      }
      resources = {
        buffer,
        sourceTexture,
        crtTarget,
        bloomTargetA,
        bloomTargetB,
        targetWidth: 0,
        targetHeight: 0,
        crt: {
          program: crtProgram,
          locations: getLocations(crtProgram, [
            'uImage', 'uResolution', 'uSourceSize', 'uStrength',
            'uRgbOffset', 'uCurvature'
          ])
        },
        bloom: {
          program: bloomProgram,
          locations: getLocations(bloomProgram, [
            'uImage', 'uTexelSize', 'uDirection', 'uRadius', 'uThreshold'
          ])
        },
        composite: {
          program: compositeProgram,
          locations: getLocations(compositeProgram, ['uCrt', 'uBloom', 'uBloomAmount'])
        }
      };
      return true;
    }

    function releaseResources() {
      if (!gl || !resources) {
        resources = null;
        uploadedImage = null;
        return;
      }
      const programs = backend === 'webgl2'
        ? [resources.crt && resources.crt.program, resources.bloom && resources.bloom.program,
          resources.composite && resources.composite.program]
        : [resources.program];
      const targets = backend === 'webgl2'
        ? [resources.crtTarget, resources.bloomTargetA, resources.bloomTargetB]
        : [];
      targets.forEach((target) => {
        if (!target) return;
        if (target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
        if (target.texture) gl.deleteTexture(target.texture);
      });
      if (resources.sourceTexture) gl.deleteTexture(resources.sourceTexture);
      if (resources.buffer) gl.deleteBuffer(resources.buffer);
      programs.forEach((program) => {
        if (program) gl.deleteProgram(program);
      });
      resources = null;
      uploadedImage = null;
    }

    function initialize(preferredBackend) {
      try {
        if (preferredBackend === 'webgl2') {
          backend = 'webgl2';
          gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
          return Boolean(gl) && initializeWebGL2();
        }
        if (preferredBackend === 'webgl1') {
          backend = 'webgl1';
          gl = canvas.getContext('webgl', CONTEXT_ATTRIBUTES);
          return Boolean(gl) && initializeWebGL1();
        }
        gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
        if (gl) {
          backend = 'webgl2';
          return initializeWebGL2();
        }
        gl = canvas.getContext('webgl', CONTEXT_ATTRIBUTES);
        backend = 'webgl1';
        return Boolean(gl) && initializeWebGL1();
      } catch (_error) {
        releaseResources();
        return false;
      }
    }

    function bindProgram(programInfo) {
      gl.useProgram(programInfo.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, resources.buffer);
      gl.enableVertexAttribArray(programInfo.locations.position);
      gl.vertexAttribPointer(programInfo.locations.position, 2, gl.FLOAT, false, 0, 0);
    }

    function uploadSource(image) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.sourceTexture);
      if (uploadedImage === image) return true;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      if (typeof gl.getError === 'function' && gl.getError() !== gl.NO_ERROR) {
        uploadedImage = null;
        return false;
      }
      uploadedImage = image;
      return true;
    }

    function getSourceSize(params) {
      return [
        Math.max(1, Number(params.sourceWidth) || params.image.naturalWidth || params.image.width || 1),
        Math.max(1, Number(params.sourceHeight) || params.image.naturalHeight || params.image.height || 1)
      ];
    }

    function allocateTarget(target, width, height) {
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        target.texture,
        0
      );
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }

    function ensureWebGL2Targets(width, height) {
      if (resources.targetWidth === width && resources.targetHeight === height) return true;
      const bloomWidth = Math.max(1, Math.ceil(width / 4));
      const bloomHeight = Math.max(1, Math.ceil(height / 4));
      if (!allocateTarget(resources.crtTarget, width, height) ||
          !allocateTarget(resources.bloomTargetA, bloomWidth, bloomHeight) ||
          !allocateTarget(resources.bloomTargetB, bloomWidth, bloomHeight)) {
        return false;
      }
      resources.targetWidth = width;
      resources.targetHeight = height;
      return true;
    }

    function bindTextureUnit(texture, unit, location) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(location, unit);
    }

    function renderWebGL1(params, width, height) {
      const locations = resources.locations;
      const sourceSize = getSourceSize(params);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      bindProgram({ program: resources.program, locations });
      bindTextureUnit(resources.sourceTexture, 0, locations.uImage);
      gl.uniform2f(locations.uResolution, width, height);
      gl.uniform2f(locations.uSourceSize, sourceSize[0], sourceSize[1]);
      gl.uniform1f(locations.uStrength, normalizePercent(params.strength, 50));
      gl.uniform1f(locations.uBloom, normalizeRange(params.bloom, 20, 15));
      gl.uniform1f(locations.uRgbOffset, normalizePercent(params.rgbOffset, 35));
      gl.uniform1f(locations.uCurvature, normalizePercent(params.curvature, 18));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function renderWebGL2(params, width, height) {
      const sourceSize = getSourceSize(params);
      const bloomRatio = normalizeRange(params.bloom, 20, 15);
      const strengthRatio = normalizePercent(params.strength, 50);
      const bloomWidth = Math.max(1, Math.ceil(width / 4));
      const bloomHeight = Math.max(1, Math.ceil(height / 4));

      if (bloomRatio > 0.0001 && !ensureWebGL2Targets(width, height)) return false;
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        bloomRatio > 0.0001 ? resources.crtTarget.framebuffer : null
      );
      gl.viewport(0, 0, width, height);
      bindProgram(resources.crt);
      bindTextureUnit(resources.sourceTexture, 0, resources.crt.locations.uImage);
      gl.uniform2f(resources.crt.locations.uResolution, width, height);
      gl.uniform2f(resources.crt.locations.uSourceSize, sourceSize[0], sourceSize[1]);
      gl.uniform1f(resources.crt.locations.uStrength, strengthRatio);
      gl.uniform1f(resources.crt.locations.uRgbOffset, normalizePercent(params.rgbOffset, 35));
      gl.uniform1f(resources.crt.locations.uCurvature, normalizePercent(params.curvature, 18));
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (bloomRatio <= 0.0001) return true;

      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.bloomTargetA.framebuffer);
      gl.viewport(0, 0, bloomWidth, bloomHeight);
      bindProgram(resources.bloom);
      bindTextureUnit(resources.crtTarget.texture, 0, resources.bloom.locations.uImage);
      gl.uniform2f(resources.bloom.locations.uTexelSize, 1 / width, 1 / height);
      gl.uniform2f(resources.bloom.locations.uDirection, 1, 0);
      gl.uniform1f(resources.bloom.locations.uRadius, 1.2 + (bloomRatio * 2.8));
      gl.uniform1f(resources.bloom.locations.uThreshold, 0.28);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.bloomTargetB.framebuffer);
      bindTextureUnit(resources.bloomTargetA.texture, 0, resources.bloom.locations.uImage);
      gl.uniform2f(resources.bloom.locations.uTexelSize, 1 / bloomWidth, 1 / bloomHeight);
      gl.uniform2f(resources.bloom.locations.uDirection, 0, 1);
      gl.uniform1f(resources.bloom.locations.uRadius, 0.8 + (bloomRatio * 1.8));
      gl.uniform1f(resources.bloom.locations.uThreshold, -1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      bindProgram(resources.composite);
      bindTextureUnit(resources.crtTarget.texture, 0, resources.composite.locations.uCrt);
      bindTextureUnit(resources.bloomTargetB.texture, 1, resources.composite.locations.uBloom);
      gl.uniform1f(
        resources.composite.locations.uBloomAmount,
        bloomRatio * 0.28 * (0.65 + (0.75 * Math.min(1, strengthRatio / 0.2)))
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    }

    function render(params) {
      if (!gl || !resources || !params || !params.image || contextLost) return false;
      const width = Math.max(1, Math.round(Number(params.width) || 1));
      const height = Math.max(1, Math.round(Number(params.height) || 1));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      try {
        if (!uploadSource(params.image)) return false;
        const rendered = backend === 'webgl2'
          ? renderWebGL2(params, width, height)
          : (renderWebGL1(params, width, height), true);
        if (!rendered || (typeof gl.getError === 'function' && gl.getError() !== gl.NO_ERROR)) {
          return false;
        }
        return true;
      } catch (_error) {
        return false;
      }
    }

    function destroy() {
      releaseResources();
      if (typeof canvas.removeEventListener === 'function') {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      }
      gl = null;
      supported = false;
    }

    function handleContextLost(event) {
      contextLost = true;
      supported = false;
      uploadedImage = null;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof settings.onContextLost === 'function') settings.onContextLost();
    }

    function handleContextRestored() {
      const restoredBackend = backend;
      contextLost = false;
      releaseResources();
      supported = initialize(restoredBackend);
      if (typeof settings.onContextRestored === 'function') settings.onContextRestored(supported);
    }

    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);
    }
    supported = initialize();
    return {
      canvas,
      destroy,
      isSupported: () => supported && Boolean(gl) && !contextLost,
      render
    };
  }

  root.LumnoNewtabCrtWebGL = { createRenderer };
})(typeof globalThis !== 'undefined' ? globalThis : this);

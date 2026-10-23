const assert = require('assert');
const fs = require('fs');
const path = require('path');

// THIRD_PARTY_NOTICES.md is the index of every third-party license the store
// package ships. A moved license file, a bundled dependency without its
// license text or a vendored upgrade the notices miss would ship a package
// that no longer carries the notices its licenses require.

const repoRoot = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');

const notices = read('THIRD_PARTY_NOTICES.md');

const linkTargets = [...notices.matchAll(/\]\(([^)#]+)\)/g)]
  .map((match) => match[1])
  .filter((target) => !/^https?:/.test(target));
assert(linkTargets.length > 0, 'THIRD_PARTY_NOTICES.md should link to the license files');
linkTargets.forEach((target) => {
  assert(fs.existsSync(path.join(repoRoot, target)), `THIRD_PARTY_NOTICES.md links to missing ${target}`);
});

const generatedLicenseFiles = [
  'src/react/third-party-licenses.md',
  'src/react/overlay-third-party-licenses.md'
];
const bundledSections = generatedLicenseFiles.flatMap((file) => read(file).split(/^## /m).slice(1));
const bundledPackages = new Set(bundledSections.map((section) => section.split(' - ')[0]));
bundledSections.forEach((section) => {
  const [heading, ...body] = section.trim().split('\n');
  assert(body.join('\n').trim(), `${heading} should ship with its license text`);
});
Object.keys(JSON.parse(read('package.json')).dependencies).forEach((name) => {
  assert(bundledPackages.has(name), `the React bundles' license files should list ${name}`);
  assert(notices.includes(name), `THIRD_PARTY_NOTICES.md should list ${name}`);
});

const remixVersion = read('assets/remixicon/fonts/remixicon.css').match(/Remix Icon v(\d+\.\d+\.\d+)/)[1];
assert(
  notices.includes(`Remix Icon](https://github.com/Remix-Design/RemixIcon) ${remixVersion}`),
  `THIRD_PARTY_NOTICES.md should name the bundled Remix Icon ${remixVersion}`
);

console.log('third-party notices tests passed');

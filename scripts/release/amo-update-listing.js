// Brings the live AMO listing's translated text in line with
// scripts/release/amo-listing.json. The publish workflow only sends that file
// with the first listed version, so later edits to it need this script.
//
// Usage: node scripts/release/amo-update-listing.js <add-on guid> [--apply]
//
// Without --apply it only prints, per field, which locales it would add or
// change. With --apply it PATCHes those locales. AMO merges translated fields
// per locale, and this script never sends null, so locales that are live but
// missing from the file are left as they are.
const fs = require('fs');
const path = require('path');
const { createAmoJwt } = require('./amo-jwt');

const API = 'https://addons.mozilla.org/api/v5/addons/addon';
const LISTING_PATH = path.join(__dirname, 'amo-listing.json');
const FIELDS = ['summary', 'description', 'homepage', 'support_email'];
const MAX_ATTEMPTS = 6;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const addonId = args.find((arg) => !arg.startsWith('--'));
if (!addonId) {
  console.error('Usage: node scripts/release/amo-update-listing.js <add-on guid> [--apply]');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads work without credentials for a listed add-on; writes need them.
function authHeaders(required) {
  if (!required && (!process.env.AMO_JWT_ISSUER || !process.env.AMO_JWT_SECRET)) {
    return {};
  }
  return { Authorization: `JWT ${createAmoJwt()}` };
}

// AMO rate-limits bursts of writes with HTTP 429; wait as long as it asks.
async function amoFetch(url, options = {}, authRequired = false) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, ...authHeaders(authRequired) }
    });
    if (response.status !== 429 || attempt === MAX_ATTEMPTS) {
      return response;
    }
    const waitSeconds = Number(response.headers.get('retry-after')) || 30 * attempt;
    console.log(`Rate limited by AMO; retrying in ${waitSeconds}s.`);
    await sleep(waitSeconds * 1000);
  }
}

// The detail response nests the homepage as { url: {...}, outgoing: {...} },
// and serves descriptions with each link wrapped in an <a> to AMO's outgoing
// redirector; unwrapped, they compare equal to the text that was sent.
function liveTranslations(detail, field) {
  const value = detail[field];
  if (field === 'homepage') {
    return (value && value.url) || {};
  }
  return Object.fromEntries(Object.entries(value || {}).map(([locale, text]) => [
    locale,
    typeof text === 'string' ? text.replace(/<a\b[^>]*>([^<]*)<\/a>/g, '$1') : text
  ]));
}

async function main() {
  const listing = JSON.parse(fs.readFileSync(LISTING_PATH, 'utf8'));
  const detailResponse = await amoFetch(`${API}/${encodeURIComponent(addonId)}/`);
  if (!detailResponse.ok) {
    throw new Error(`AMO returned HTTP ${detailResponse.status} for ${addonId}.`);
  }
  const detail = await detailResponse.json();

  const patch = {};
  FIELDS.forEach((field) => {
    const live = liveTranslations(detail, field);
    const wanted = listing[field] || {};
    const added = [];
    const changed = [];
    Object.entries(wanted).forEach(([locale, text]) => {
      if (live[locale] === text) {
        return;
      }
      (live[locale] ? changed : added).push(locale);
      patch[field] = { ...patch[field], [locale]: text };
    });
    const liveOnly = Object.keys(live).filter((locale) => !(locale in wanted));
    console.log(`${field}: add ${added.length ? added.join(' ') : '-'}; ` +
      `change ${changed.length ? changed.join(' ') : '-'}` +
      (liveOnly.length ? `; live only, kept: ${liveOnly.join(' ')}` : ''));
  });

  if (Object.keys(patch).length === 0) {
    console.log('The live listing already matches amo-listing.json.');
    return;
  }
  if (!apply) {
    console.log('Dry run; pass --apply to send these changes to AMO.');
    return;
  }
  const response = await amoFetch(`${API}/${encodeURIComponent(addonId)}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  }, true);
  if (!response.ok) {
    throw new Error(`Updating the listing failed with HTTP ${response.status}: ${await response.text()}`);
  }
  console.log('Updated the AMO listing.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

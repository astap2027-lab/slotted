import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the version shown in Settings matches the service worker cache version', () => {
  const cache = read('sw.js').match(/const CACHE = 'slotted-v(\d+)'/);
  const app = read('js/app.js').match(/const APP_VERSION = (\d+);/);
  assert.ok(cache && app, 'both version numbers are present');
  assert.equal(Number(app[1]), Number(cache[1]), 'bump APP_VERSION in js/app.js together with CACHE in sw.js');
});

test('every module in js/ is cached for offline use', () => {
  const sw = read('sw.js');
  const html = read('index.html');
  const build = read('tools/build-preview.mjs');
  for (const f of readdirSync(new URL('../js/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    assert.ok(sw.includes(`./js/${f}`), `${f} is in SHELL in sw.js`);
    assert.ok(build.includes(`js/${f}`), `${f} is in the preview build list`);
  }
  assert.ok(html.includes('js/app.js'));
});

test('the app itself is fetched from the network first; the API is never cached', () => {
  const sw = read('sw.js');
  assert.match(sw, /function networkFirst/);
  assert.match(sw, /cache: 'no-cache'/);
  assert.match(sw, /startsWith\('\/api\/'\)\) return/);
});

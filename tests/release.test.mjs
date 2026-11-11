import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  for (const f of ['app', 'scheduler', 'timetable', 'adjust', 'coach', 'store', 'sync', 'tracking', 'units', 'exercises', 'freshness', 'progress', 'stats', 'workout', 'readiness', 'anatomy']) {
    assert.ok(sw.includes(`./js/${f}.js`), `${f}.js is in SHELL`);
  }
  assert.ok(html.includes('js/app.js'));
});

test('the app itself is fetched from the network first; the API is never cached', () => {
  const sw = read('sw.js');
  assert.match(sw, /function networkFirst/);
  assert.match(sw, /cache: 'no-cache'/);
  assert.match(sw, /startsWith\('\/api\/'\)\) return/);
});

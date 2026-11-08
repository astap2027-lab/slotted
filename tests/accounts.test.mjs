import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import * as start from '../functions/api/auth/google/start.js';
import * as callback from '../functions/api/auth/google/callback.js';
import * as logout from '../functions/api/auth/logout.js';
import * as me from '../functions/api/me.js';
import * as sync from '../functions/api/sync.js';
import * as del from '../functions/api/account/delete.js';
import * as sStart from '../functions/api/strava/start.js';
import * as sCallback from '../functions/api/strava/callback.js';
import * as sActivities from '../functions/api/strava/activities.js';
import * as sDisconnect from '../functions/api/strava/disconnect.js';
import { simplify } from '../server/strava.js';

const SITE = 'https://slotted.pages.dev';
const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
let env;
let calls;
beforeEach(() => {
  env = { DB: makeD1(), GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', STRAVA_CLIENT_ID: '123', STRAVA_CLIENT_SECRET: 'ssecret', TOKEN_KEY: KEY };
  calls = [];
});

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const cookieOf = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(';')[0].split('=')[1];
const get = (path, cookie = '') => new Request(SITE + path, { headers: cookie ? { Cookie: cookie } : {} });
const send = (method, path, cookie, body, origin = SITE) => new Request(SITE + path, {
  method, headers: { Cookie: cookie, Origin: origin, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
});

function mockFetch(routes) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, reply] of routes) if (String(url).includes(match)) return reply(init);
    throw new Error(`unexpected fetch ${url}`);
  };
}

async function signIn(sub = 'google-1') {
  const s = await start.onRequestGet({ request: get('/api/auth/google/start'), env });
  const state = decodeURIComponent(cookieOf(s, 'slotted_oauth'));
  mockFetch([['oauth2.googleapis.com/token', () => Response.json({
    id_token: jwt({ iss: 'https://accounts.google.com', aud: 'gid', sub, email: 'axel@example.com', name: 'Axel', exp: Date.now() / 1000 + 600 }),
  })]]);
  const res = await callback.onRequestGet({ request: get(`/api/auth/google/callback?code=abc&state=${state}`, `slotted_oauth=${state}`), env });
  return { res, cookie: `slotted_session=${cookieOf(res, 'slotted_session')}` };
}

test('Google sign-in creates an account and a session', async () => {
  const s = await start.onRequestGet({ request: get('/api/auth/google/start'), env });
  assert.equal(s.status, 302);
  const loc = new URL(s.headers.get('Location'));
  assert.equal(loc.host, 'accounts.google.com');
  assert.equal(loc.searchParams.get('redirect_uri'), `${SITE}/api/auth/google/callback`);
  assert.equal(loc.searchParams.get('scope'), 'openid email profile');

  const { res, cookie } = await signIn();
  assert.equal(res.headers.get('Location'), '/?signin=ok#profile');
  assert.match(res.headers.getSetCookie().join(';'), /HttpOnly; Secure; SameSite=Lax/);
  const body = calls[0].init.body.toString();
  assert.match(body, /client_secret=gsecret/);

  const who = await (await me.onRequestGet({ request: get('/api/me', cookie), env })).json();
  assert.equal(who.signedIn, true);
  assert.equal(who.user.name, 'Axel');
  assert.equal(who.strava.connected, false);
  const row = env.DB.raw.prepare('SELECT token_hash FROM sessions').get();
  assert.notEqual(row.token_hash, cookie.split('=')[1], 'only a hash of the session token is stored');
});

test('sign-in fails safely with a wrong state or wrong audience', async () => {
  const bad = await callback.onRequestGet({ request: get('/api/auth/google/callback?code=a&state=x', 'slotted_oauth=y'), env });
  assert.equal(bad.headers.get('Location'), '/?signin=failed#profile');
  mockFetch([['oauth2.googleapis.com/token', () => Response.json({ id_token: jwt({ iss: 'https://accounts.google.com', aud: 'someone-else', sub: 's', exp: Date.now() / 1000 + 60 }) })]]);
  const res = await callback.onRequestGet({ request: get('/api/auth/google/callback?code=a&state=z', 'slotted_oauth=z'), env });
  assert.equal(res.headers.get('Location'), '/?signin=failed#profile');
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('signing in again reuses the same account', async () => {
  await signIn('same');
  await signIn('same');
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM users').get().n, 1);
});

test('sync saves, refuses stale saves with the newer copy, and needs sign-in', async () => {
  const { cookie } = await signIn();
  assert.equal((await sync.onRequestGet({ request: get('/api/sync'), env })).status, 401);
  const empty = await (await sync.onRequestGet({ request: get('/api/sync', cookie), env })).json();
  assert.deepEqual(empty, { data: null, updatedAt: 0 });

  const first = await sync.onRequestPut({ request: send('PUT', '/api/sync', cookie, { data: { a: 1 }, baseUpdatedAt: 0 }), env });
  assert.equal(first.status, 200);
  const { updatedAt } = await first.json();
  const stale = await sync.onRequestPut({ request: send('PUT', '/api/sync', cookie, { data: { a: 2 }, baseUpdatedAt: 0 }), env });
  assert.equal(stale.status, 409);
  assert.deepEqual((await stale.json()).data, { a: 1 });
  const ok = await sync.onRequestPut({ request: send('PUT', '/api/sync', cookie, { data: { a: 3 }, baseUpdatedAt: updatedAt }), env });
  assert.equal(ok.status, 200);
  const now = await (await sync.onRequestGet({ request: get('/api/sync', cookie), env })).json();
  assert.deepEqual(now.data, { a: 3 });
  const evil = await sync.onRequestPut({ request: send('PUT', '/api/sync', cookie, { data: {}, baseUpdatedAt: 1e15 }, 'https://evil.example'), env });
  assert.equal(evil.status, 403);
});

test('sign out ends the session', async () => {
  const { cookie } = await signIn();
  await logout.onRequestPost({ request: send('POST', '/api/auth/logout', cookie), env });
  const who = await (await me.onRequestGet({ request: get('/api/me', cookie), env })).json();
  assert.equal(who.signedIn, false);
});

async function connectStrava(cookie) {
  const s = await sStart.onRequestGet({ request: get('/api/strava/start', cookie), env });
  const loc = new URL(s.headers.get('Location'));
  assert.equal(loc.host, 'www.strava.com');
  assert.equal(loc.searchParams.get('scope'), 'activity:read_all');
  const state = decodeURIComponent(cookieOf(s, 'slotted_strava'));
  mockFetch([['strava.com/oauth/token', () => Response.json({
    access_token: 'acc-1', refresh_token: 'ref-1', expires_at: Math.floor(Date.now() / 1000) - 10, athlete: { id: 99, firstname: 'Axel', lastname: 'S' },
  })]]);
  return sCallback.onRequestGet({ request: get(`/api/strava/callback?code=c&state=${state}&scope=read,activity:read_all`, `${cookie}; slotted_strava=${state}`), env });
}

test('Strava connects with encrypted tokens and refreshes them when expired', async () => {
  const { cookie } = await signIn();
  const res = await connectStrava(cookie);
  assert.equal(res.headers.get('Location'), '/?strava=connected#profile');
  const row = env.DB.raw.prepare('SELECT * FROM strava').get();
  assert.equal(row.athlete_name, 'Axel S');
  assert.ok(!row.access_token.includes('acc-1') && !row.refresh_token.includes('ref-1'), 'tokens are encrypted at rest');

  mockFetch([
    ['strava.com/oauth/token', () => Response.json({ access_token: 'acc-2', refresh_token: 'ref-2', expires_at: Math.floor(Date.now() / 1000) + 21600 })],
    ['athlete/activities', (init) => {
      assert.equal(init.headers.authorization, 'Bearer acc-2');
      return Response.json([{ id: 5, name: 'Morning run', sport_type: 'Run', start_date_local: '2026-11-03T06:30:00Z', moving_time: 1800, distance: 5230, workout_type: 1 }]);
    }],
  ]);
  const acts = await (await sActivities.onRequestGet({ request: get('/api/strava/activities?after=1762000000', cookie), env })).json();
  assert.deepEqual(acts.activities[0], { id: '5', name: 'Morning run', type: 'Run', date: '2026-11-03', start: '06:30', minutes: 30, km: 5.2, hard: true });
  assert.match(calls[0].init.body.toString(), /grant_type=refresh_token&refresh_token=ref-1|refresh_token=ref-1/);
  const who = await (await me.onRequestGet({ request: get('/api/me', cookie), env })).json();
  assert.equal(who.strava.connected, true);
  assert.equal(who.strava.athlete, 'Axel S');
});

test('Strava connect is refused when activity access is unticked', async () => {
  const { cookie } = await signIn();
  const s = await sStart.onRequestGet({ request: get('/api/strava/start', cookie), env });
  const state = decodeURIComponent(cookieOf(s, 'slotted_strava'));
  const res = await sCallback.onRequestGet({ request: get(`/api/strava/callback?code=c&state=${state}&scope=read`, `${cookie}; slotted_strava=${state}`), env });
  assert.equal(res.headers.get('Location'), '/?strava=noscope#profile');
});

test('disconnecting Strava revokes access and forgets the tokens', async () => {
  const { cookie } = await signIn();
  await connectStrava(cookie);
  mockFetch([['strava.com/oauth/revoke', () => new Response('', { status: 200 })]]);
  await sDisconnect.onRequestPost({ request: send('POST', '/api/strava/disconnect', cookie), env });
  assert.equal(calls[0].init.headers.authorization, `Basic ${btoa('123:ssecret')}`);
  assert.match(calls[0].init.body.toString(), /token=ref-1/);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM strava').get().n, 0);
});

test('deleting the account removes everything', async () => {
  const { cookie } = await signIn();
  await connectStrava(cookie);
  await sync.onRequestPut({ request: send('PUT', '/api/sync', cookie, { data: { a: 1 }, baseUpdatedAt: 0 }), env });
  mockFetch([['strava.com/oauth/revoke', () => new Response('', { status: 200 })]]);
  const res = await del.onRequestPost({ request: send('POST', '/api/account/delete', cookie), env });
  assert.equal(res.status, 200);
  for (const t of ['users', 'sessions', 'user_data', 'strava']) {
    assert.equal(env.DB.raw.prepare(`SELECT count(*) AS n FROM ${t}`).get().n, 0, t);
  }
});

test('without setup, sign-in says so instead of breaking', async () => {
  const res = await start.onRequestGet({ request: get('/api/auth/google/start'), env: {} });
  assert.equal(res.status, 503);
  const who = await (await me.onRequestGet({ request: get('/api/me'), env: {} })).json();
  assert.deepEqual(who, { signedIn: false, available: false });
});

test('half-finished setup (no client secret) hides sign-in instead of showing a button that fails', async () => {
  const { GOOGLE_CLIENT_SECRET, ...partial } = env;
  assert.equal((await start.onRequestGet({ request: get('/api/auth/google/start'), env: partial })).status, 503);
  const who = await (await me.onRequestGet({ request: get('/api/me'), env: partial })).json();
  assert.equal(who.available, false);
});

test('signing in removes that person’s expired sessions, and keeps live ones', async () => {
  const { cookie } = await signIn('tidy');
  const uid = env.DB.raw.prepare('SELECT id FROM users').get().id;
  env.DB.raw.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run('old', uid, 1);
  await signIn('tidy');
  const hashes = env.DB.raw.prepare('SELECT token_hash FROM sessions').all().map((r) => r.token_hash);
  assert.ok(!hashes.includes('old'), 'expired session removed');
  assert.equal(hashes.length, 2, 'both live sessions stay');
  assert.equal((await (await me.onRequestGet({ request: get('/api/me', cookie), env })).json()).signedIn, true);
});

test('a non-race Strava activity is not marked hard', () => {
  assert.equal(simplify({ id: 1, sport_type: 'Ride', start_date_local: '2026-11-04T17:00:00Z', moving_time: 3600 }).hard, false);
});

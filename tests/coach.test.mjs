import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, cleanTurns } from '../functions/api/coach.js';
import { formatReply } from '../js/coach.js';

const makeKV = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const req = (body, headers = {}) => new Request('https://slotted.pages.dev/api/coach', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('without an API key the coach reports it is not set up', async () => {
  const res = await onRequestPost({ request: req({ messages: [{ role: 'user', content: 'hi' }] }), env: {} });
  assert.equal(res.status, 503);
});

test('sends instructions, context and trimmed turns to the Claude API', async () => {
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Take Thursday off.' }] }), { status: 200 });
  };
  const res = await onRequestPost({
    request: req({ context: 'Goal: build muscle', messages: [{ role: 'assistant', content: 'stray' }, { role: 'user', content: 'I feel wrecked' }] }),
    env: { ANTHROPIC_API_KEY: 'k' },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).text, 'Take Thursday off.');
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.init.headers['x-api-key'], 'k');
  assert.equal(sent.init.headers['anthropic-version'], '2026-10-21');
  assert.match(sent.body.system, /not medical advice/);
  assert.match(sent.body.system, /Goal: build muscle/);
  assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'I feel wrecked' }]);
  assert.equal(sent.body.temperature, undefined);
});

test('other websites cannot use the coach', async () => {
  const res = await onRequestPost({ request: req({ messages: [{ role: 'user', content: 'hi' }] }, { Origin: 'https://evil.example' }), env: { ANTHROPIC_API_KEY: 'k' } });
  assert.equal(res.status, 403);
});

test('daily limit per visitor', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 });
  const env = { ANTHROPIC_API_KEY: 'k', COACH_LIMITS: makeKV(), COACH_DAILY_LIMIT: '2' };
  const ask = () => onRequestPost({ request: req({ messages: [{ role: 'user', content: 'q' }] }, { 'CF-Connecting-IP': '1.2.3.4' }), env });
  assert.equal((await ask()).status, 200);
  assert.equal((await ask()).status, 200);
  assert.equal((await ask()).status, 429);
});

test('turns are capped and must end on a question', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  const out = cleanTurns(many);
  assert.ok(out.length <= 12 && out[0].role === 'user');
  assert.equal(cleanTurns([{ role: 'system', content: 'x' }]).length, 0);
});

test('replies are escaped and lightly formatted', () => {
  const html = formatReply('Do this:\n- **Rest** today\n- <b>sleep</b>\n\n1. Eat');
  assert.match(html, /<ul><li><strong>Rest<\/strong> today<\/li><li>&lt;b&gt;sleep&lt;\/b&gt;<\/li><\/ul>/);
  assert.match(html, /<ol><li>Eat<\/li><\/ol>/);
});

test('uses low effort with room for thinking, and retries without thinking if no text came back', async () => {
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    const content = bodies.length === 1 ? [{ type: 'thinking', thinking: '', signature: 'x' }] : [{ type: 'text', text: 'Mon: Upper. Wed: Lower.' }];
    return new Response(JSON.stringify({ content, stop_reason: bodies.length === 1 ? 'max_tokens' : 'end_turn' }), { status: 200 });
  };
  const res = await onRequestPost({ request: req({ messages: [{ role: 'user', content: 'Plan next week' }] }), env: { ANTHROPIC_API_KEY: 'k' } });
  assert.equal((await res.json()).text, 'Mon: Upper. Wed: Lower.');
  assert.equal(bodies[0].output_config.effort, 'low');
  assert.ok(bodies[0].max_tokens >= 4000);
  assert.deepEqual(bodies[1].thinking, { type: 'disabled' });
});

test('a reply that starts with a thinking block still returns its text', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Rest today.' }], stop_reason: 'end_turn' }), { status: 200 });
  const res = await onRequestPost({ request: req({ messages: [{ role: 'user', content: 'q' }] }), env: { ANTHROPIC_API_KEY: 'k' } });
  assert.equal((await res.json()).text, 'Rest today.');
});

test('a declined question gets a helpful redirect, not an empty reply', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ content: [], stop_reason: 'refusal' }), { status: 200 });
  const res = await onRequestPost({ request: req({ messages: [{ role: 'user', content: 'q' }] }), env: { ANTHROPIC_API_KEY: 'k' } });
  assert.match((await res.json()).text, /Ask me about your training/);
});

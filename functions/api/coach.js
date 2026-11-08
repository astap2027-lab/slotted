// Cloudflare Pages Function: POST /api/coach
// Holds the Claude API key so it never reaches the browser, adds the coaching instructions,
// trims what the page sends, and limits each visitor to a number of questions a day.
//
// Settings (Cloudflare dashboard > your Pages project > Settings > Variables and secrets):
//   ANTHROPIC_API_KEY   required, add it as a secret
//   COACH_MODEL         optional, defaults to claude-haiku-5-5
//   COACH_DAILY_LIMIT   optional, questions per visitor per day, defaults to 20
// Bindings: a KV namespace bound as COACH_LIMITS turns the daily limit on.
import { COACH_INSTRUCTIONS } from '../../js/coach.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
const MAX_TURNS = 12;
const MAX_CHARS = 2000;
const MAX_CONTEXT = 6000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export function cleanTurns(messages) {
  let turns = (Array.isArray(messages) ? messages : [])
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content.trim().slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  while (turns.length && turns[0].role !== 'user') turns = turns.slice(1);
  return turns;
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_set_up' }, 503);

  // Only this site's own pages may use the coach.
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const turns = cleanTurns(body.messages);
  if (!turns.length || turns[turns.length - 1].role !== 'user') return json({ error: 'bad_request' }, 400);
  const context = String(body.context || '').slice(0, MAX_CONTEXT);

  if (env.COACH_LIMITS) {
    const visitor = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `${new Date().toISOString().slice(0, 10)}:${visitor}`;
    const used = Number(await env.COACH_LIMITS.get(key)) || 0;
    if (used >= (Number(env.COACH_DAILY_LIMIT) || 20)) return json({ error: 'rate_limited' }, 429);
    await env.COACH_LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  }

  const base = {
    model: env.COACH_MODEL || 'claude-haiku-5-5',
    system: `${COACH_INSTRUCTIONS}\n\n${context}`,
    messages: turns,
  };
  // The model thinks before answering by default, and that thinking counts toward max_tokens.
  // Low effort keeps chat replies quick; the generous limit leaves room for thinking plus the answer.
  let out = await callClaude(env, { ...base, max_tokens: 4000, output_config: { effort: 'low' } });
  if (out.error) return json({ error: out.error }, 502);
  // If it ran out of room before writing anything, ask again with thinking switched off.
  if (!out.text && out.stop !== 'refusal') {
    out = await callClaude(env, { ...base, max_tokens: 2000, thinking: { type: 'disabled' }, output_config: { effort: 'low' } });
    if (out.error) return json({ error: out.error }, 502);
  }
  if (out.stop === 'refusal' && !out.text) return json({ text: REFUSED_TEXT });
  if (!out.text) return json({ error: 'upstream_error' }, 502);
  return json({ text: out.text });
}

const REFUSED_TEXT = 'I can’t help with that one. Ask me about your training, recovery, sleep or fitting workouts into your week and I’ll help straight away.';

async function callClaude(env, body) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: 'upstream_error' };
  }
  if (res.status === 429 || res.status === 529) return { error: 'busy' };
  if (!res.ok) return { error: 'upstream_error' };
  const data = await res.json().catch(() => ({}));
  // Pick text blocks by type: replies can start with thinking blocks.
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { text, stop: data.stop_reason };
}

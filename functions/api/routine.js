// Cloudflare Pages Function: POST /api/routine { images, text }
// Copies gym workout templates from screenshots (or pasted text) of another app into a strict structure. The app
// matches exercises and the user checks a preview before anything is saved. Images are never stored.
import { ROUTINE_PROMPT, ROUTINE_SCHEMA, ROUTINE_MAX_IMAGES } from '../../js/routine-import.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
const IMAGE_TYPE = /^image\/(jpeg|png|webp|gif)$/;
const MAX_IMAGE_CHARS = 4000000;
const TOOL = { name: 'routine_copy', description: 'Record exactly what the workout templates show: each workout and its exercises with sets, reps and weight.', input_schema: ROUTINE_SCHEMA, strict: true };
const STRONG_MS = 65000;
const FALLBACK_MS = 25000;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function call(env, body, ms) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
    });
  } catch (e) { return { failed: e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'upstream_error' }; }
  if (res.status === 429 || res.status === 529) return { failed: 'busy' };
  if (!res.ok) return { failed: 'upstream_error' };
  const data = await res.json().catch(() => ({}));
  const use = (data.content || []).find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  return { input: use && use.input && typeof use.input === 'object' ? use.input : null };
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_set_up' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'forbidden' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > ROUTINE_MAX_IMAGES || images.some((i) => !i || !IMAGE_TYPE.test(i.media_type) || typeof i.data !== 'string' || !i.data || i.data.length > MAX_IMAGE_CHARS || /[^A-Za-z0-9+/=]/.test(i.data))) {
    return json({ error: 'image_rejected' }, 400);
  }
  const text = String(body.text || '').trim().slice(0, 6000);
  if (!images.length && !text) return json({ error: 'bad_request' }, 400);

  if (env.COACH_LIMITS) {
    const visitor = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `${new Date().toISOString().slice(0, 10)}:${visitor}`;
    const used = Number(await env.COACH_LIMITS.get(key)) || 0;
    if (used >= (Number(env.COACH_DAILY_LIMIT) || 20)) return json({ error: 'rate_limited' }, 429);
    await env.COACH_LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  }

  const content = [
    ...images.flatMap((i, n) => [{ type: 'text', text: `Screenshot ${n + 1}:` }, { type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } }]),
    { type: 'text', text: `${text ? `Pasted text:\n${text}\n\n` : ''}Copy the workouts by calling the routine_copy tool.` },
  ];
  const base = { system: ROUTINE_PROMPT, tools: [TOOL], messages: [{ role: 'user', content }] };
  let out = await call(env, { ...base, model: env.PHOTO_MODEL || 'claude-sonnet-5-5', max_tokens: 8000, tool_choice: { type: 'auto' }, output_config: { effort: 'medium' } }, STRONG_MS);
  if (!out.input) out = await call(env, { ...base, model: env.COACH_MODEL || 'claude-haiku-5-5', max_tokens: 6000, thinking: { type: 'disabled' }, tool_choice: { type: 'tool', name: TOOL.name } }, FALLBACK_MS);
  if (out.failed === 'timeout') return json({ error: 'timeout' }, 504);
  if (out.failed) return json({ error: out.failed }, 502);
  if (!out.input) return json({ copy: null, note: 'That couldn’t be read. Try clearer screenshots of each workout.' });
  return json({ copy: out.input });
}

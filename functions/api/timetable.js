// Cloudflare Pages Function: POST /api/timetable
// Turns one sentence about the athlete's week ("I finish school at 1:05 on Tuesdays") into structured
// timetable changes. It only reads words; the app validates every change and the user approves it.
// Uses the same ANTHROPIC_API_KEY, model and daily limit (COACH_LIMITS) as the coach.
import { TIMETABLE_PROMPT, TIMETABLE_SCHEMA, cleanChanges, PHOTO_PROMPT, PHOTO_MAX_CHANGES, PHOTO_MAX_IMAGES } from '../../js/timetable.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';

const IMAGE_TYPE = /^image\/(jpeg|png|webp|gif)$/;
const MAX_IMAGE_CHARS = 2000000; // base64 characters per image, about 1.5 MB

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_set_up' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'forbidden' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  // A photo of a timetable: up to two images, already shrunk by the page. They are passed on to be read and never stored.
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > PHOTO_MAX_IMAGES || images.some((i) => !i || !IMAGE_TYPE.test(i.media_type) || typeof i.data !== 'string' || !i.data || i.data.length > MAX_IMAGE_CHARS || /[^A-Za-z0-9+/=]/.test(i.data))) {
    return json({ error: 'image_rejected' }, 400);
  }
  const text = String(body.text || '').trim().slice(0, 400) || (images.length ? 'Here is my timetable.' : '');
  if (!text) return json({ error: 'bad_request' }, 400);
  const context = String(body.context || '').slice(0, 2000);

  if (env.COACH_LIMITS) {
    const visitor = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `${new Date().toISOString().slice(0, 10)}:${visitor}`;
    const used = Number(await env.COACH_LIMITS.get(key)) || 0;
    if (used >= (Number(env.COACH_DAILY_LIMIT) || 20)) return json({ error: 'rate_limited' }, 429);
    await env.COACH_LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  }

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.COACH_MODEL || 'claude-haiku-5-5',
        max_tokens: images.length ? 4000 : 1500,
        // A forced tool call returns the changes as structured data; thinking is off so the tool can be forced.
        thinking: { type: 'disabled' },
        system: `${TIMETABLE_PROMPT}${images.length ? `\n\n${PHOTO_PROMPT}` : ''}\n\nThe athlete's current week:\n${context}`,
        tools: [{ name: 'timetable_changes', description: 'The structured changes described by the sentence.', input_schema: TIMETABLE_SCHEMA }],
        tool_choice: { type: 'tool', name: 'timetable_changes' },
        messages: [{
          role: 'user',
          content: images.length
            ? [...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } })), { type: 'text', text }]
            : text,
        }],
      }),
    });
  } catch {
    return json({ error: 'upstream_error' }, 502);
  }
  if (res.status === 429 || res.status === 529) return json({ error: 'busy' }, 502);
  if (!res.ok) return json({ error: 'upstream_error' }, 502);
  const data = await res.json().catch(() => ({}));
  if (data.stop_reason === 'refusal') return json({ changes: [], note: 'That couldn’t be read. Try a clear photo or screenshot of your timetable.' });
  if (data.stop_reason === 'max_tokens') return json({ changes: [], note: 'That timetable was too long to read in one go. Try a photo of one week at a time.' });
  const call = (data.content || []).find((b) => b.type === 'tool_use' && b.name === 'timetable_changes');
  if (!call) return json({ changes: [], note: 'I couldn’t turn that into a timetable change.' });
  return json({ changes: cleanChanges(call.input && call.input.changes, images.length ? PHOTO_MAX_CHANGES : 10), note: String((call.input && call.input.note) || '').slice(0, 300) });
}

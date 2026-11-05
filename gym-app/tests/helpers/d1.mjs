// A tiny stand-in for Cloudflare D1, backed by Node's built-in SQLite.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare(sql) {
      const st = db.prepare(sql);
      let params = [];
      const api = {
        bind(...p) { params = p; return api; },
        async first() { const r = st.get(...params); return r ? { ...r } : null; },
        async all() { return { results: st.all(...params).map((r) => ({ ...r })) }; },
        async run() { st.run(...params); return { success: true }; },
      };
      return api;
    },
  };
}

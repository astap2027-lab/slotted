-- Slotted database (Cloudflare D1). Run once:
--   npx wrangler d1 execute slotted --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  created_at INTEGER NOT NULL
);

-- Only a hash of each session token is stored, so a leaked database can't be used to sign in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Each person's app data (plan, logs, routine), synced between their devices.
CREATE TABLE IF NOT EXISTS user_data (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Strava connection. Tokens are encrypted with TOKEN_KEY before they're stored.
CREATE TABLE IF NOT EXISTS strava (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL,
  athlete_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Google Calendar connection (writing gym sessions and Slotted commitments into a "Slotted" calendar in their
-- Google account). Tokens are encrypted with TOKEN_KEY. Added November 2026: run this part once in the D1 console.
CREATE TABLE IF NOT EXISTS google_calendar (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at INTEGER,
  calendar_id TEXT,
  connected_at INTEGER NOT NULL
);

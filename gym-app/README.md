# Slotted

Training that fits your actual week. A gym planner for students who play sport: tell it your week once and it fits gym sessions around school, games and everything else.

Five places, on a sidebar (desktop) or bottom bar (phone): **Home, Training, Progress, Coach, Settings**. Dark by default, with light and match-device themes in Settings.

What it does:

- **Home:** greeting, today's workout as the main card (time, muscles, freshness, exercises, status, start or continue), four stat cards built only from recorded data (sessions this week, weekly streak, volume, weeks the target was hit), the recovery map, the week as slots (tap a day to open it), what's coming up, and a progress snapshot.
- **Training:** This week (overview, Up next, calendar that becomes an agenda on phones, the rest of the week as cards), My week (commitments, your split, rest days, training hours) and Your routine.
- **Workout mode:** a focused screen with big controls. Last time and a suggestion for each lift, set rows to record and edit, skip or swap an exercise, warm-up and plates, a rest timer, then Finish workout and a summary with sets, volume, time and new bests.
- **Move a session** to another free day or time. Moves that clash with commitments, training hours or another session are refused, and moved sessions stay put when the week is re-planned.
- **Rest days:** days Slotted never plans gym sessions on, every week.
- **Daily check-in:** sleep, soreness and energy before today's session. A flat day drops a set from each exercise; a rough day offers a light session (3 exercises, one set less, about 10% lighter) or a rest day that moves the workout.
- **Coach:** an AI coach that sees your plan, your week, rest days, today's check-in, recovery, consistency, recent bests and lifts, with safety rules for pain, injury, diet and wellbeing. Ask buttons around the app open it with a question about that screen. It suggests changes; it never changes your plan. Needs a Claude API key to work on the live site (see below).
- **Progress:** consistency (sessions per week, streak, target hit, done and missed), strength trends with estimated 1-rep max, volume per week and sets by muscle, personal records, and every finished workout. Filter by 4 weeks, 12 weeks or all time.
- **Recovery:** a front and back body map, estimated only from recorded training (ticked sets, sessions marked done, Strava activities) in the last 7 days. Tap a muscle for when it was worked and when it's likely recovered. Shown on Home, Progress, session cards and to the coach, always labelled as an estimate, not a medical measurement.
- **Accounts:** Sign in with Google to back up and sync across devices. Edits from two devices merge without losing logged sets.
- **Strava:** connect to show this week's activities on your week and count them toward your streak. Never stored, never sent to the AI coach.
- **Your own routine:** enter the program you already follow, or start from Arnold split, push/pull/legs, upper/lower or full body templates.
- **Missed it / Can't make it** moves the session to the best day left, or folds its main lifts into another session if the week runs out.
- **Busy week** switches to fewer, shorter full-body sessions with a lower streak target.
- **Short on time** cuts a session to its first three exercises, 30 minutes.
- **Monday recap:** last week's sessions, sets, streak and new bests, Monday to Wednesday.
- **Keeping data safe:** prompts people to add the site to their home screen and asks the browser not to clear its storage. Backup, restore and delete in Settings.

## What's in here

| Path | What it is |
| --- | --- |
| `index.html` | The page |
| `styles.css` | The design system: colours, type (Archivo), layout and every screen, dark and light |
| `js/scheduler.js` | The planner: finds free time, places sessions, keeps legs off game days, streak maths |
| `js/progress.js` | Turns logged sets into per-exercise history, estimated 1-rep max and personal bests |
| `js/stats.js` | Read-only numbers for Home and Progress: consistency, missed sessions, finished workouts, records, volume and sets by muscle |
| `js/readiness.js` | Daily check-in rules: how sleep, soreness and energy change today's session |
| `js/coach.js` | The coach's instructions and how the page reaches it |
| `functions/api/coach.js` | Cloudflare Pages Function that calls the Claude API with your key, limits questions per visitor |
| `js/freshness.js` | Muscle freshness: which muscles each exercise and Strava activity works, and how they recover |
| `js/anatomy.js` | Front and back muscle shapes for the freshness map (from react-body-highlighter, MIT licence, notice kept in the file) |
| `js/workout.js` | Rest times, plate maths, warm-up sets, exercise swaps and the weekly recap |
| `js/sync.js` | Merges data from two devices so nothing logged is lost |
| `functions/api/auth`, `me.js`, `sync.js`, `account` | Sign in with Google, sessions, sync, account deletion |
| `functions/api/strava` | Connect, read activities, disconnect |
| `server/` | Shared server code: cookies, sessions, encryption, Strava |
| `schema.sql` | Database tables |
| `privacy.html` | Draft privacy page (fill in the brackets) |
| `js/store.js` | Saves to the browser on this device, backup and restore |
| `js/app.js` | The screens, re-planning and set logging |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Lets people install it to their home screen and use it offline |
| `tests/` | Scheduler, history, stats, check-in, coach, accounts, Strava, sync and freshness tests |
| `tools/build-preview.mjs` | Bundles everything into one file for previews (not needed for the real site) |

No framework and no build step. Plain HTML, CSS and JavaScript.

## Run it on your computer

Browsers block JavaScript modules opened straight from a file, so use a tiny local server from this folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Run the tests

Needs Node 18 or newer:

```
npm test
```

## Put it live on Cloudflare Pages

1. In the Cloudflare dashboard, go to Workers & Pages, then Create, then Pages, then Upload assets.
2. Name the project, then drag this whole folder in. Leave out `tests`, `tools`, `dist` and `node_modules` if you like; they're harmless either way.
3. Deploy. You get a `*.pages.dev` link straight away, and can add your own domain later.

Or connect a GitHub repo instead, with no build command and `/` as the output folder, so every push redeploys.

## How the planner decides

- Free time = your training hours minus every commitment, with 15 minutes either side for travel.
- Each day gets its best slot: after school first, then mornings on weekends. If only 30 to 59 minutes are free, it plans a short version.
- It tries every way of placing your sessions on free days and picks the one with the lowest penalty score: same muscles on back-to-back days, leg sessions on or the day before a game, three or more hard days in a row, and awkward times all cost points.
- A week counts toward your streak when gym sessions done, plus up to one sport session, reach your weekly target.

## Switch on the coach

The coach needs a Claude API key. The key stays on Cloudflare's servers and never reaches the browser.

1. Create an account at https://platform.claude.com, add billing, and create an API key. Check the account age requirement; if you're under it, a parent will need to own the account.
2. Deploy with Cloudflare Pages connected to a GitHub repo (drag-and-drop uploads don't run the `functions` folder). No build command, output folder `/`.
3. In the Pages project, go to Settings, then Variables and secrets, and add `ANTHROPIC_API_KEY` as a secret.
4. Turn on the daily question limit: create a KV namespace (Workers & Pages, then KV), then in the Pages project go to Settings, then Bindings, and bind it with the variable name `COACH_LIMITS`. The default is 20 questions per visitor per day; change it with a `COACH_DAILY_LIMIT` variable.
5. Optional: set `COACH_MODEL` to use a different Claude model. The default is `claude-haiku-5-5`, the fastest and cheapest.
6. Set a monthly spend limit in the Claude Console so a busy month can't surprise you.

Without a key, the rest of the site works normally and the Coach tab says it isn't switched on yet.

## Switch on accounts and Strava

Deploy from GitHub first (see the coach section). Then:

### 1. Database
1. Cloudflare dashboard, Storage & Databases, D1, Create, name it `slotted`.
2. Open it, go to the Console tab, paste everything from `schema.sql`, and run it.
3. In your Pages project: Settings, Bindings, Add, D1 database. Variable name `DB`, pick `slotted`.

### 2. Encryption key (protects stored Strava tokens)
Make a random key. In any browser's developer console, run:
`btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))`
Add the result as a secret called `TOKEN_KEY` (Settings, Variables and secrets). Keep it; changing it disconnects everyone's Strava.

### 3. Sign in with Google
1. Go to https://console.cloud.google.com, create a project.
2. Google Auth Platform (or APIs & Services, OAuth consent screen): set it up as External, with the app name, a support email, and your privacy page link (`https://YOUR-SITE/privacy.html`).
3. Clients, Create client, Web application. Add the authorised redirect URI:
   `https://YOUR-SITE/api/auth/google/callback`
4. Add `GOOGLE_CLIENT_ID` (variable) and `GOOGLE_CLIENT_SECRET` (secret) to the Pages project.
5. While the Google app is in Testing, only test users you add can sign in. Publish it when you're ready; Google may ask to verify the app name and logo.

### 4. Strava
1. Go to https://www.strava.com/settings/api and create an app. Set the Authorization Callback Domain to your site's domain only, for example `slotted.pages.dev`.
2. Add `STRAVA_CLIENT_ID` (variable) and `STRAVA_CLIENT_SECRET` (secret) to the Pages project.
3. Limits to know: a new Strava app connects 1 athlete, 10 without review, and more needs Strava's approval. Standard developer access needs a Strava subscription. Strava's terms forbid using its data in AI, so Slotted never sends it to the coach.
4. Strava's brand guidelines ask apps to use their official "Connect with Strava" button. Download it from Strava's developer site and swap it in for the orange button in Settings before launch.

### 5. Redeploy
Settings and secrets apply on the next deploy. Push a commit or press Retry deployment. Settings in the app then shows "Sign in with Google".

### Try it locally (optional)
`npx wrangler pages dev .` runs the site and server together. Put the same settings in a `.dev.vars` file (never commit it), and add `http://localhost:8788/api/auth/google/callback` as an extra Google redirect URI.

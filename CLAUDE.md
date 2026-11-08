# Slotted

A gym planner for students who play sport. It fits gym sessions around school, sport and other commitments, tracks lifts and progress, estimates muscle recovery, and has an AI coach. Owner: Axel (a student in Sydney). Keep explanations to him short and plain.

## Rules that always apply
- **Upgrade, never rebuild.** Keep the current design (dark theme, lime accent, Archivo font), navigation, pages and every feature. Do not reset or discard saved data. Any change to stored data must read old data correctly (no destructive migrations).
- **Safety for teenage users:** no calorie targets, no supplement advice beyond "ask a GP or parent", refer pain to a physio or GP. Recovery and fatigue numbers are estimates, never medical measurements. Keep the safety rules in `js/coach.js`.
- **Strava data never goes to the AI coach.**
- **The coach never changes the plan by itself.** It proposes; the user accepts.
- All numbers come from app logic, not the AI. Charts show only recorded data. No decorative buttons or placeholder features.
- Logging must stay quick: pre-filled sets, one tap to tick.

## Stack
- Plain HTML, CSS and ES modules. No framework, no build step. Data is stored in the browser (`localStorage` key `slotted:v1`), with optional Google sign-in sync.
- Hosted on Cloudflare Pages from the GitHub repo `astap2027-lab/slotted`. Pushing to `main` deploys. Server code is Cloudflare Pages Functions in `functions/api/` (coach, auth, sync, Strava, account) with a D1 database (`schema.sql`).
- The coach secret is `ANTHROPIC_API_KEY` in the Pages project settings. The model is `claude-haiku-5-5` with API version `2026-10-21`. It thinks by default, so keep `max_tokens` generous; `functions/api/coach.js` retries without thinking if no text comes back.

## Commands
- `npm test` runs all tests (`node --test tests/*.test.mjs`). Keep them passing; add tests for new logic.
- `python3 -m http.server 8765` then open http://localhost:8765 to try the app locally (API features need the deployed site).
- `node tools/build-preview.mjs` builds `dist/slotted.html`, a single-file preview. It concatenates every module and strips imports and exports, so **top-level names must be unique across all files in `js/`**. New modules must be added to its file list in dependency order.
- When you add or rename a file in `js/`, add it to `SHELL` in `sw.js`. **Bump the `CACHE` version in `sw.js` on every release** or installed apps keep old code.

## Where things live
- `js/app.js`: every screen (Home, This week, My week, Routine, Workout mode, Progress, Coach, Settings, setup), routing, logging and sync.
- `js/scheduler.js`: week planning (free time, session placement, spacing, sport-day rules, time-of-day preference), splits, A/B weeks, streaks, suggested exercises (`MOVES`), custom routines.
- `js/exercises.js`: **the exercise library** (about 200 exercises), detailed muscles (`MUSCLE_INFO`, grouped by `MUSCLE_GROUPS`), tracking types, load types, search, alternatives, custom exercises and validation.
- `js/freshness.js`: muscle recovery estimate (unchanged model; it now takes muscle maps from the library).
- `js/progress.js`: per-exercise history and personal bests, type-aware (weight, reps, time, distance).
- `js/stats.js`: Home and Progress numbers (consistency, volume, records, finished workouts).
- `js/workout.js`: rest timer lengths, plates, warm-ups, older swap logic. `js/readiness.js`: daily check-in. `js/coach.js`: coach instructions and client. `js/sync.js`: merging two devices. `js/store.js`: saving, defaults, backup.
- `styles.css`: the design system. `index.html`, `privacy.html`, `sw.js`, `manifest.webmanifest`.

## Data model (keep compatible)
- `state.history[weekKey]` holds `{ plan, done, skipDays, shortKeys, busy, checkins, swaps, skips, times }`. Week keys are Monday dates (`2026-11-02`).
- `state.log[weekKey][sessionKey][move]` is a list of sets `{ kg, reps, done }`. New fields `sec` and `m` are allowed. **Weights are stored in kg.** Older plank logs put seconds in `reps`; `secOf()` in `exercises.js` handles that.
- A `move` is either a built-in movement slot (`squat`, `horizontalPush`, and so on; its name depends on equipment via `moveName`) or `x_<slug>` made from an exercise name (`exerciseKey`). Never rename stored keys. Map them to library exercises with `exerciseForMove(move)` (the app sets the resolver with `setMoveResolver`).
- Custom exercises are planned to live in `state.customExercises` (ids start with `u_`). `sync.js` already merges them; `setCustomExercises()` loads them into the library.

## The current upgrade
The full brief is in `docs/upgrade-brief.md`. Axel chose:
1. **Muscle map:** keep the body map at group level. Tapping a group expands it into its individual muscles, each with its own freshness, recent exercises and dates.
2. **Effort:** one optional tap per exercise after it's done (Easy / Hard / To failure). Skipping it means "normal hard set".
3. **Delivery:** in stages, tested as each lands.

### Stage 1: exercise library and tracking (in progress)
Done:
- `js/exercises.js` with the full library, detailed muscle mapping (primary 1, secondary 0.5, stabiliser 0.2, overridable per muscle), search and filters, alternatives, custom exercise validation, duplicate detection, mapping suggestions, `volumeOf`, `secOf`, `targetOf`. Tests in `tests/exercises.test.mjs`.
- Recovery (`musclesFor`), progress history, records and volume use the library. Dumbbell pairs count twice in volume; assisted, timed and distance work have no volume.
- `sync.js` merges `customExercises`; `sw.js` and the preview build include `exercises.js`.

Still to do:
- `app.js`: import from `exercises.js`; call `setMoveResolver(nameOfMove)` and `setCustomExercises(state.customExercises)` on start, after restoring a backup, and after a sync pull. Add `units: 'kg'` and `customExercises: []` to `defaultState` in `store.js`.
- **Units:** a kg or lb setting. Store kg, convert for display and input. Plates and warm-ups in lb use a 45 lb bar and lb plates.
- **Workout mode:** set rows follow the exercise's tracking type (reps; weight and reps; time; weight and time; distance and time; weight and distance). The weight label says what it means ("kg each hand", "kg added", "kg assistance", "kg total"). A large timer for timed exercises (start, pause, resume, reset; finishing fills in and ticks the next set; manual entry still works). Suggestions and "Tick all as planned" follow the tracking type. Personal best toasts match the type (heavier, more reps, longer, further).
- **Swap:** use `alternativesFor()` (same main muscles and movement, kit the user has). Keep the existing fallback.
- **Library page** (`#library`, under Training next to Routine): search, filters (muscle group, equipment, primary or secondary muscle, compound or isolation, type), exercise details (muscles by role, equipment, tracking, instructions, alternatives, the user's history with it). "Create exercise" form with duplicate warning and a suggested muscle mapping the user reviews. "Add to a workout" when they use their own routine.
- **Routine editor:** the name box suggests every library and custom exercise; a known exercise fills in its muscle group automatically.
- **Progress:** charts and bests per tracking type (`summarise()` returns `kind`: kg, reps, sec or m). Never compare different types as the same thing. Show units.
- **Coach context:** include sets in their own units and tracking types (time, distance).
- Then update tests, run `npm test`, check every page in a browser on desktop and phone in both themes, bump `sw.js`, and push.

### Stage 2: detailed muscles and fatigue
Track the detailed muscles separately (quads and hamstrings must recover independently). Use weight, reps, effort tap and recent volume in the fatigue estimate, built on the existing model in `freshness.js`. Extend the optional daily check-in (energy, tiredness, sleep hours and quality, soreness, stress, readiness) without making it a chore. Add the map's tap-to-expand detail, recent volume and trends.

### Stage 3: smart timetable and fatigue-aware changes
Natural-language availability ("I finish school at 1:05 pm on Tuesdays", "I can't train this Saturday") through the coach: the AI turns it into a structured change, app logic validates it, and the user sees a preview and approves. Add one-off exceptions, fortnightly or rotating schedules, travel and preparation time, fixed versus flexible commitments, and locking individual workouts. Fatigue-aware proposals (move, swap, lighten or rest), each with the reason, what moves, and accept or reject. Fixed commitments are never moved.

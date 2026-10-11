# Map Challenge — TikTok Mini Games package

A TikTok-native port of all 7 Map Challenge games, built on the **Mini Games SDK
(JavaScript, native runtime)** — no DOM, canvas-only rendering, exactly what
TikTok requires for new submissions.

## The 7 games

| # | Game | Source |
|---|------|--------|
| 1 | World Map | `js/app.js` + `js/data-world.js` |
| 2 | World Capitals | same |
| 3 | Continent Map | same (+ continent picker) |
| 4 | Continent Capitals | same |
| 5 | US Map | `js/app.js` + `js/data-us.js` |
| 6 | US Capitals | same |
| 7 | Daily Challenge | `daily-challenge/` (30 terrain images, 4-choice, 3 lives, date-seeded) |

Map regions render with `new Path2D(svgPathString)` (with a tiny M/L/Z manual
parser as fallback) — the world/US path data is reused **verbatim**.

## Layout

```
tiktok/
  src/            JS sources, load order: 00,10, data/*, 30,40,50,60,70,80,90,95
    00-env.js     environment abstraction + guarded TTMinis/tt/wx calls
    10-util.js    seeds, shuffle, text normalization
    30-daily-data.js  175 country names+slugs (order matches web game)
    40-mapquiz.js pure quiz engine (6 modes) + Learn mode
    50-daily.js   Daily Challenge engine (same seeds as web)
    60-path.js    SVG path -> Path2D + bounding boxes + hit circles
    70-ui.js      canvas UI kit (screens, buttons, tap routing)
    80-views-map.js  Home, ContinentPicker, MapQuiz, Learn, Results
    90-views-daily.js Daily + DailyResults
    95-game.js    entry: SDK init, canvas, input, main loop
  data/           verbatim copies of data-world.js / data-us.js
  assets/relief/  175 terrain JPGs (~5 MB)
  dist/           build output (tiktok-game.js) — generated, not committed
  test/harness.js node test harness (canvas + TTMinis stubs)
  preview.html    browser test page (dev only — NOT part of upload)
  build.sh        concatenates src/ -> dist/tiktok-game.js
```

Total package ≈ 5.5 MB — well under TikTok's 60 MB limit.

## Quick test in a browser

```bash
cd tiktok
python3 -m http.server 8080   # then open http://localhost:8080/preview.html
```

(`file://` won't load the relief images; use a local server.)

## Build the upload bundle

```bash
./build.sh   # -> dist/tiktok-game.js
```

## Publishing to TikTok (needs Anthony's developer account)

1. Register at the TikTok for Developers mini-games portal and create a mini-game.
2. In `src/00-env.js`, replace `'__CLIENT_KEY__'` with your real client key, then re-run `./build.sh`.
3. Upload `dist/tiktok-game.js` + `assets/relief/` via the Mini Games CLI
   (`upload` command) or the manual upload in the developer console.
4. Fill in the game metadata (name, icon, description, category: Trivia).

## What's stubbed for review (must wire before submitting)

- **Login** — `MC.login()` in `src/00-env.js` currently resolves a guest identity.
  Replace with `tt.login()` and map the result to a player profile.
- **Payments** — `MC.pay()` rejects. There are no purchasables in this game;
  either keep the stub and declare "no in-app purchases" at review, or wire
  `tt.requestPayment` if you add any.
- **Leaderboard** — scores are local-only (same as the web games today, whose
  `LEADERBOARD_URL` is also empty). For a shared TikTok leaderboard you need a
  backend; the `submitDaily`/board code paths are the integration points.

## Porting notes / intentional differences from web

- **Typed answers**: TikTok has no DOM inputs — tapping the answer field opens
  `tt.showKeyboard()`; in a browser it falls back to `prompt()`.
- **Autocomplete** was dropped (no DOM list); the keyboard is the input.
- **Zoom**: pinch / double-tap / on-screen +/− buttons; pan by dragging when zoomed.
- **Theme**: light earthy theme only (dark mode not ported).
- **Daily Challenge images**: drawn with `drawImage` from `assets/relief/`.
- The map quiz keeps the web rules: 3 lives, 30:00 timer, stats (last-3 average,
  best, games played), practice/learn list with 2-in-a-row mastery.
- The Daily Challenge keeps the web rules: 30 date-seeded countries (same set as
  the website every day), 4 choices, 3 lives, one run per day, streaks, share grid.

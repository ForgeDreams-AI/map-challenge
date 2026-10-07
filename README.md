# Map Challenge

A geography quiz hub — pure static site, no build step, no external dependencies.
Host by serving this folder as-is (e.g. GitHub Pages: push to a repo, enable Pages).

## Play
Open `index.html`. Six games: World Map, World Capitals, Continent Map,
Continent Capitals, US Map, US Capitals. Each has a Learn mode that drills the
places you miss.

## How it works
- All map data is bundled in `js/data-world.js` (172 countries) and
  `js/data-us.js` (50 states) as compact SVG paths.
- Stats (average of last 3 tries, best, games played) and per-game practice
  lists are stored in the browser's `localStorage` under key `mapChallenge.v1`
  — per device, no accounts, works offline after first load.
- Game rules: click a region, type the answer (autocomplete helps), 30-minute
  timer, game over after 3 wrong answers.

## Files
- `index.html` — app shell (home, continent picker, game, results, learn views)
- `styles.css` — playful theme + dark mode
- `js/app.js` — all game logic
- `js/data-world.js`, `js/data-us.js` — generated map data (see `/tmp/mapdata/build.py`
  on the build machine to regenerate)

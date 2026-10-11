#!/bin/bash
# Build the single-file TikTok upload bundle.
# Usage: ./build.sh
# Output: dist/tiktok-game.js  (concatenated in load order)
set -e
cd "$(dirname "$0")"
mkdir -p dist
{
  echo "/* Map Challenge — TikTok Mini Games bundle (built $(date -u +%Y-%m-%dT%H:%M:%SZ)) */"
  cat src/00-env.js
  echo
  cat src/10-util.js
  echo
  cat data/data-world.js
  echo
  cat data/data-us.js
  echo
  cat src/30-daily-data.js
  echo
  cat src/40-mapquiz.js
  echo
  cat src/50-daily.js
  echo
  cat src/60-path.js
  echo
  cat src/70-ui.js
  echo
  cat src/80-views-map.js
  echo
  cat src/90-views-daily.js
  echo
  cat src/95-game.js
} > dist/tiktok-game.js
node --check dist/tiktok-game.js && echo "OK: dist/tiktok-game.js ($(wc -c < dist/tiktok-game.js) bytes)"

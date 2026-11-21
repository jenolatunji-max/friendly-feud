# Friendly Feud: seller notes

A survey-style team game show that runs from a single offline HTML file. Customers double-click `index.html` and play in their browser. No back end, no accounts, no network requests.

## What you ship

`npm run package` produces `dist/friendly-feud.zip` with:

- `index.html`: the whole game (about 400 KB, everything inlined)
- `Quick-Start-Guide.html`: one printable US Letter page

## Build

You need Node.js 18 or newer.

```bash
npm install          # dev only: Playwright for tests, @fontsource/anton for the font
npm run build        # writes dist/index.html and dist/Quick-Start-Guide.html
npm run package      # build + dist/friendly-feud.zip
npm test             # build + end-to-end tests over file:// (Chromium, Firefox, WebKit)
node tests/run.js chromium --shots   # one browser, with screenshots in /screenshots
```

`tools/build.js` and `tools/package.js` use no dependencies. If the font package is missing, the build still works and the display font falls back to Impact.

## Project layout

```
src/index.html        page template (has the Content-Security-Policy)
src/styles.css        all styles, including the TV board and print styles
src/guide.html        Quick-Start Guide template
src/js/*.js           app code, joined in the order listed in tools/build.js
src/packs/*.json      built-in question packs
tools/build.js        inliner
tools/package.js      zip writer
tests/run.js          Playwright end-to-end tests
```

## Rename the brand

Change one line in `src/js/core.js`:

```js
const BRAND_NAME = 'Friendly Feud';
```

Rebuild. The title, logo wordmark, guide and in-app text all follow it. The logo puts the last word on its own big line, so two-word names look best. Also update the zip name in `tools/package.js`, the backup file id (`app: 'friendly-feud'` in `src/js/screens.js`, only if you want old backups to stop importing), and `LISTING.md`.

Never use another show's name, logo shape (no ovals), catchphrases or music.

## Add a question pack

Drop a JSON file in `src/packs/` and rebuild. Format:

```json
{
  "id": "summer-bbq",
  "name": "Summer Barbecue",
  "audience": "Families",
  "region": "US",
  "source": "estimate",
  "rounds": [
    { "q": "Name something you grill at a cookout",
      "answers": [
        { "text": "Burgers", "points": 38, "accept": ["hamburgers", "cheeseburgers"] },
        { "text": "Hot dogs", "points": 30, "accept": ["franks", "hotdogs"] }
      ] }
  ],
  "lightning": [
    { "name": "Set 1", "questions": [ { "q": "...", "answers": [ { "text": "...", "points": 40, "accept": [] } ] } ] }
  ]
}
```

Rules the build checks: 3 to 8 answers per question, points sorted high to low, total 100 or less, no duplicate answers, none of the banned phrases. Keep answer text under about 22 characters so it fits a tile. To control the order packs appear in, edit `PACK_ORDER` in `tools/build.js`.

## Add a region (Canada, UK, Ireland)

The pack system is region-ready. Add packs with `"region": "CA"`, `"UK"` or `"IE"` and rebuild. No code changes are needed. For a UK or Irish edition, also make a copy of the UI strings with British spelling (colour, favourite, organiser) and say "telly" only in that edition. The US build uses American spelling and "TV".

## About "estimate" packs

All built-in packs are marked `"source": "estimate"`. They are careful guesses at the most popular answers from American adults, not results from a real survey. The app never claims otherwise.

If you run a real survey (for example 100 people through a survey service), replace the answers and points with your results and set `"source": "surveyed"` before you advertise "surveyed answers". Packs your customers make with Your Crowd are marked `surveyed` because they come from their own guests.

## How it works (for maintainers)

- **State:** the host window holds the only game state (`G` in `src/js/game.js`). Every host action runs through `act()`, which saves an undo snapshot, autosaves to localStorage and syncs the board.
- **Two screens:** "Open TV board" calls `window.open` on the same file with `#board`. The host sends state with `postMessage(state, '*')` (file:// origins are opaque). The board says hello to `window.opener` on load and keeps asking every few seconds until the host answers, so either window can reload. A localStorage `storage` event is a fallback. USB buzzer keystrokes that land on the TV window are forwarded to the host.
- **Audio:** every sound is made live with the Web Audio API. There are no audio files.
- **Storage:** every storage call is wrapped in try/catch. If storage is blocked, the game still runs and shows a note suggesting Export.

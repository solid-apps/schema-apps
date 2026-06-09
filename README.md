# schema-apps

Single-page apps for [schema.org](https://schema.org) types. Each app is a
JSON-LD **data island** plus an auto-generated **render + edit UI**. All styling
lives in one shared **`app.css`** and all behaviour in one shared **`app.js`**,
so every app stays tiny — just its data and a small config — and the whole
collection is restyled by editing a single file. Served straight from the
`gh-pages` branch (this branch is the site).

Live: <https://solid-apps.github.io/schema-apps/>

## Anatomy of an app

`person.html` is the reference. Each `<type>.html` contains only:

1. A JSON-LD island: `<script type="application/ld+json" id="data"> … </script>`
   with `"@context": "https://schema.org"` and `"@type"`.
2. A mount point: `<main id="app"></main>`.
3. A config object:
   ```js
   window.APP = {
     type: "Person", titleProp: "name", icon: "👤", accent: "#2d6cdf",
     fields: [ { prop: "name", label: "Name", type: "text" }, … ],
   };
   ```
4. The two shared includes: `<link rel="stylesheet" href="./app.css">` and
   `<script src="./app.js">`.

The filename is the kebab-case of the type (`JobPosting` → `job-posting.html`).

## Add an app for a new type

Copy `person.html`, then change **only** the island, `window.APP`, and the
`<title>`. Use real schema.org property names. Do **not** touch `app.css`,
`app.js`, or any other app.

## Design

All visual design is in **`app.css`** — edit it once and every app updates.
Each app sets its own `--accent` via `window.APP.accent`; everything else (the
header band, icon, rows, edit form, source view) is shared.

## The gate

`npm run check` (CI on every push/PR to `gh-pages`) runs `gate/check.mjs`, which
loads each app in a real DOM (jsdom, with `app.js` inlined) and fails if the
island is malformed, the `@type`/filename don't match, the wiring is missing, or
the app throws / doesn't render. `gh-pages` is branch-protected and requires this
check, so a broken app cannot merge.

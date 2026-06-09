# schema-apps

Single-page HTML apps for [schema.org](https://schema.org) types. Each app is a
**self-contained `.html` file** holding a **JSON-LD data island** plus an
auto-generated **read view** and **edit form** on top of it. No build, no
dependencies, no framework — open the file and it works. Served straight from
the `gh-pages` branch (this branch is the site).

Live: `https://solid-apps.github.io/schema-apps/person.html`

## The app contract

Every `<type>.html` (the reference is [`person.html`](./person.html)) must:

1. Contain **exactly one** JSON-LD island:
   `<script type="application/ld+json" id="data"> … </script>` that `JSON.parse`s,
   with `"@context": "https://schema.org"` and `"@type"` equal to the type.
2. Declare its config in the page script: `const TYPE = "Person"` and a
   `FIELDS` array (`{prop, label, type}` per property), and a `TITLE_PROP`.
3. Be named the **kebab-case** of the type — `Person` → `person.html`,
   `JobPosting` → `job-posting.html`.
4. Include the contract elements: `#data` (island), `#view` (render target),
   and `<form id="edit">`.
5. **Render and edit with no errors**: on load it shows the island's data, and
   typing in the form writes changes back into the island live.

## Making an app for a new type

Copy `person.html`, then change **only**:

- the island's `@type` and sample data,
- `const TYPE`, the `FIELDS` array, and `TITLE_PROP`,
- the `<title>` and the `<h1 id="type-label">` (the script overwrites the
  latter from `TYPE` anyway).

The generic engine (render / form / write-back) is identical across every app —
do not rewrite it. Use real schema.org property names for `prop` (e.g. `Event`:
`startDate`, `location`, `organizer`).

## The gate

`npm run check` (CI on every push/PR to `gh-pages`) runs `gate/check.mjs`, which
loads each app in a real DOM (jsdom) and fails if the island is malformed, the
`@type`/filename don't match, the contract elements are missing, or the app
throws / doesn't render. A broken app cannot merge — `gh-pages` is branch-
protected and requires this check.

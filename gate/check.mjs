#!/usr/bin/env node
// Structural + functional gate for solid-apps/schema-apps.
// Each app is a JSON-LD island + a window.APP config that the shared app.js
// renders. For every <type>.html this asserts:
//   1. exactly one JSON-LD island that JSON.parses, @context schema.org
//   2. filename is the kebab-case of @type
//   3. it links ./app.css and ./app.js and has #data + <main id="app">
//   4. it RUNS (jsdom, with app.js inlined) with no console errors
//   5. after render: #type-label === @type, the title + rows + form are present
// A broken app cannot pass — which is what lets app scaffolding auto-merge.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const appjs = readFileSync(join(root, "app.js"), "utf8");

const files = readdirSync(root).filter((f) => f.endsWith(".html") && f !== "index.html");
const fails = [];
const add = (f, m) => fails.push(`${f}: ${m}`);

for (const f of files) {
  const html = readFileSync(join(root, f), "utf8");

  // 1. island
  const islands = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  if (islands.length !== 1) { add(f, `expected exactly 1 JSON-LD island, found ${islands.length}`); continue; }
  let data;
  try { data = JSON.parse(islands[0][1]); }
  catch (e) { add(f, `island is not valid JSON (${e.message})`); continue; }
  const ctx = Array.isArray(data["@context"]) ? data["@context"].join(" ") : String(data["@context"] || "");
  if (!/schema\.org/.test(ctx)) add(f, `@context must reference schema.org`);
  const type = data["@type"];
  if (typeof type !== "string" || !type) { add(f, `island needs a string @type`); continue; }

  // 2. filename
  if (basename(f, ".html") !== kebab(type)) add(f, `filename should be "${kebab(type)}.html" for @type ${type}`);

  // 3. wiring
  if (!/id=["']data["']/.test(html)) add(f, `missing #data island id`);
  if (!/<main[^>]*id=["']app["']/.test(html)) add(f, `missing <main id="app"> mount`);
  if (!/href=["']\.\/app\.css["']/.test(html)) add(f, `must link ./app.css`);
  if (!/src=["']\.\/app\.js["']/.test(html)) { add(f, `must include ./app.js`); continue; }

  // 4/5. run with app.js inlined so jsdom executes the real engine
  const runnable = html.replace(/<script\s+src=["']\.\/app\.js["']>\s*<\/script>/i, `<script>${appjs}</script>`);
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (m) => errors.push(String(m)));
  try {
    const dom = new JSDOM(runnable, { runScripts: "dangerously", virtualConsole: vc, pretendToBeVisual: true });
    await new Promise((r) => setTimeout(r, 30));
    const doc = dom.window.document;
    const label = doc.querySelector("#type-label");
    if (!label || label.textContent.trim() !== type) add(f, `#type-label ("${label?.textContent.trim()}") must equal @type ("${type}")`);
    const view = doc.querySelector("#view");
    if (!view || view.children.length === 0) add(f, `#view rendered no rows`);
    const title = doc.querySelector("#title");
    if (!title || title.textContent.trim() === "" || title.textContent.includes("untitled"))
      add(f, `#title did not render the title value`);
    const inputs = doc.querySelectorAll("#edit input, #edit textarea");
    if (inputs.length < 2) add(f, `edit form has too few inputs (${inputs.length})`);
    dom.window.close();
  } catch (e) { add(f, `threw while loading in jsdom: ${e.message}`); }
  for (const e of errors) add(f, `console/runtime error: ${e.split("\n")[0]}`);
}

if (fails.length) {
  console.error("App gate FAILED:\n" + fails.map((x) => "  - " + x).join("\n"));
  process.exit(1);
}
console.log(`App gate OK — ${files.length} app(s) valid: ${files.join(", ") || "(none yet)"}`);

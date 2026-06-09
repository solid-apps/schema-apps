#!/usr/bin/env node
// Structural + functional gate for solid-apps/schema-apps.
// For every <type>.html app (excluding index.html) it asserts the contract:
//   1. exactly one JSON-LD island that JSON.parses
//   2. @context is schema.org and @type matches the file's `const TYPE`
//   3. the filename is the kebab-case of TYPE
//   4. the contract elements exist (#data, #view, #edit form)
//   5. it actually RUNS in a DOM (jsdom) with no console errors / uncaught throws
//   6. after load, the read view (#view) is populated and shows the title value
// Fails (exit 1) listing every problem. This is what lets prose-free app
// scaffolding auto-merge safely: a broken app cannot pass.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const files = readdirSync(root).filter((f) => f.endsWith(".html") && f !== "index.html");
const fails = [];
const add = (f, msg) => fails.push(`${f}: ${msg}`);

for (const f of files) {
  const html = readFileSync(join(root, f), "utf8");

  // 1. JSON-LD island
  const islands = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  if (islands.length !== 1) { add(f, `expected exactly 1 JSON-LD island, found ${islands.length}`); continue; }
  let data;
  try { data = JSON.parse(islands[0][1]); }
  catch (e) { add(f, `island is not valid JSON (${e.message})`); continue; }

  // 2. @context / @type
  const ctx = Array.isArray(data["@context"]) ? data["@context"].join(" ") : String(data["@context"] || "");
  if (!/schema\.org/.test(ctx)) add(f, `@context must reference schema.org (got "${data["@context"]}")`);
  const typeMatch = html.match(/const\s+TYPE\s*=\s*["']([^"']+)["']/);
  if (!typeMatch) add(f, `missing \`const TYPE = "..."\` declaration`);
  const TYPE = typeMatch?.[1];
  if (TYPE && data["@type"] !== TYPE) add(f, `island @type ("${data["@type"]}") must equal const TYPE ("${TYPE}")`);

  // 3. filename == kebab(TYPE)
  if (TYPE && basename(f, ".html") !== kebab(TYPE)) add(f, `filename should be "${kebab(TYPE)}.html" for type ${TYPE}`);

  // 4. contract elements
  if (!/id=["']data["']/.test(html)) add(f, `missing #data island id`);
  if (!/id=["']view["']/.test(html)) add(f, `missing #view render container`);
  if (!/<form[^>]*id=["']edit["']/.test(html)) add(f, `missing <form id="edit">`);

  // 5/6. run it in jsdom
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (m) => errors.push(String(m)));
  try {
    const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole: vc, pretendToBeVisual: true });
    await new Promise((r) => setTimeout(r, 30));
    const doc = dom.window.document;
    const view = doc.querySelector("#view");
    if (!view || view.textContent.trim() === "") add(f, `#view is empty after load (render did not run)`);
    else {
      const titleProp = (html.match(/TITLE_PROP\s*=\s*["']([^"']+)["']/) || [])[1] || "name";
      const titleVal = data[titleProp];
      if (titleVal && !view.textContent.includes(String(titleVal)))
        add(f, `#view does not show the ${titleProp} value ("${titleVal}")`);
    }
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

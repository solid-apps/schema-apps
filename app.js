// schema-apps shared engine. Every app is just a JSON-LD island + a window.APP
// config; this builds the card, the read view and the edit form, and keeps the
// island in sync. Design lives in app.css — don't put styling here.
(function () {
  const cfg = window.APP || {};
  const island = document.getElementById("data");
  let data = JSON.parse(island.textContent);
  if (cfg.accent) document.documentElement.style.setProperty("--accent", cfg.accent);

  const mount = document.getElementById("app");
  mount.innerHTML = `
    <div class="wrap">
      <div class="card">
        <header class="hd">
          <div class="icon" id="icon"></div>
          <div class="type" id="type-label"></div>
          <h1 class="title" id="title"></h1>
          <button class="theme-toggle" id="theme-toggle" type="button" title="Toggle light/dark theme">\u263E</button>
        </header>
        <div class="bd">
          <div class="rows" id="view"></div>
          <details><summary>Edit</summary><form id="edit"></form></details>
          <details class="src"><summary>JSON-LD source</summary><div class="src-actions"><button class="copy-btn" id="copy-btn" type="button">Copy</button></div><pre id="src"></pre></details>
        </div>
      </div>
      <footer>A <a href="https://schema.org/${cfg.type}">schema.org/${cfg.type}</a> app ·
        <a href="https://github.com/solid-apps/schema-apps">source</a></footer>
    </div>`;

  document.getElementById("icon").textContent = cfg.icon || "◆";
  document.getElementById("type-label").textContent = cfg.type || "";

  function writeIsland() {
    island.textContent = "\n" + JSON.stringify(data, null, 2) + "\n";
    document.getElementById("src").textContent = island.textContent.trim();
  }

  function render() {
    document.getElementById("title").textContent = data[cfg.titleProp] || "(untitled)";
    const view = document.getElementById("view");
    view.innerHTML = "";
    for (const f of cfg.fields) {
      if (f.prop === cfg.titleProp) continue;
      const val = data[f.prop];
      if (val === undefined || val === "") continue;
      const row = document.createElement("div"); row.className = "row";
      const k = document.createElement("span"); k.className = "k"; k.textContent = f.label;
      const v = document.createElement("span"); v.className = "v";
      v.setAttribute("data-prop", f.prop);
      v.setAttribute("data-type", f.type);
      v.setAttribute("tabindex", "0");
      v.setAttribute("title", "Click to edit");
      if (f.type === "url" || f.type === "email") {
        const a = document.createElement("a");
        a.href = (f.type === "email" ? "mailto:" : "") + val; a.textContent = val;
        v.appendChild(a);
      } else { v.textContent = val; }
      row.append(k, v); view.appendChild(row);
    }
    attachInlineEditors(view);
  }

  // ── Inline click-to-edit ──
  function attachInlineEditors(container) {
    container.querySelectorAll(".v[data-prop]").forEach((v) => {
      v.addEventListener("click", function handler(e) {
        // Don't trigger on link clicks
        if (e.target.tagName === "A") return;
        const prop = v.getAttribute("data-prop");
        const ftype = v.getAttribute("data-type") || "text";
        const current = data[prop] || "";
        // Already editing?
        if (v.querySelector("input, textarea")) return;
        v.classList.add("editing");
        const input = ftype === "textarea" ? document.createElement("textarea") : document.createElement("input");
        if (ftype !== "textarea") input.type = ftype === "email" ? "email" : ftype === "url" ? "url" : "text";
        input.value = current;
        input.className = "inline-edit";
        v.innerHTML = "";
        v.appendChild(input);
        input.focus();
        function save() {
          const val = input.value;
          if (val === "") delete data[prop]; else data[prop] = val;
          v.classList.remove("editing");
          writeIsland();
          render();
          syncForm(prop, val);
        }
        input.addEventListener("blur", save);
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" && ftype !== "textarea") { ev.preventDefault(); input.blur(); }
          if (ev.key === "Escape") { input.value = current; input.blur(); }
        });
      });
    });
  }

  // Sync the #edit form after an inline edit
  function syncForm(prop, val) {
    const form = document.getElementById("edit");
    if (!form) return;
    const inputs = form.querySelectorAll("input, textarea");
    inputs.forEach((inp) => {
      if (inp.closest("label") && inp.closest("label").nextElementSibling === null) return;
      // Walk up to find the label that matches this prop
    });
    // Simpler: just rebuild form values
    for (const f of cfg.fields) {
      const inp = form.querySelector(`[data-prop="${f.prop}"]`);
      if (inp) inp.value = data[f.prop] || "";
    }
  }

  function buildForm() {
    const form = document.getElementById("edit");
    form.innerHTML = "";
    for (const f of cfg.fields) {
      const label = document.createElement("label");
      label.textContent = f.label;
      const input = f.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      if (f.type !== "textarea") input.type = f.type;
      input.value = data[f.prop] || "";
      input.setAttribute("data-prop", f.prop);
      input.addEventListener("input", () => {
        if (input.value === "") delete data[f.prop]; else data[f.prop] = input.value;
        writeIsland(); render();
      });
      label.appendChild(input); form.appendChild(label);
    }
  }

  render(); buildForm(); writeIsland();

  // ── Theme toggle ──
  const themeBtn = document.getElementById("theme-toggle");
  function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    themeBtn.textContent = dark ? "\u2600" : "\u263E";
    try { localStorage.setItem("schema-apps-theme", dark ? "dark" : "light"); } catch (_) {}
  }
  const stored = (() => { try { return localStorage.getItem("schema-apps-theme"); } catch (_) { return null; } })();
  if (stored) applyTheme(stored === "dark");
  themeBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(!isDark);
  });

  // ── Copy JSON-LD ──
  const copyBtn = document.getElementById("copy-btn");
  copyBtn.addEventListener("click", () => {
    const text = island.textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = "Copied!";
      copyBtn.classList.add("copied");
      setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.classList.remove("copied"); }, 1500);
    }).catch(() => {
      // Fallback for non-HTTPS / jsdom
      copyBtn.textContent = "Failed";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
    });
  });
})();

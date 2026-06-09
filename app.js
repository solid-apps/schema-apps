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
        </header>
        <div id="hero-mount"></div>
        <div class="bd">
          <div class="rows" id="view"></div>
          <details><summary>Edit</summary><form id="edit"></form></details>
          <details><summary>JSON-LD source</summary><pre id="src"></pre></details>
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

  const IMAGE_PROPS = ["image", "photo", "logo", "thumbnailUrl", "avatar", "image", "thumbnail"];
  const DATE_PROPS = ["datePublished", "dateCreated", "dateModified", "foundingDate", "startDate", "endDate", "birthDate"];
  const LIST_PROPS = ["recipeIngredient", "recipeInstructions", "ingredients", "instructions"];

  // Detect if a value looks like an image URL
  function isImageUrl(val) {
    return typeof val === "string" && /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/i.test(val.trim());
  }

  // Format ISO 8601 duration to human-readable
  function formatDuration(val) {
    if (typeof val !== "string" || !val.startsWith("PT")) return null;
    const m = val.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!m) return null;
    const parts = [];
    if (m[1]) parts.push(m[1] + "h");
    if (m[2]) parts.push(m[2] + "min");
    return parts.length ? parts.join(" ") : val;
  }

  // Format a date-like value nicely
  function formatDate(val) {
    if (typeof val !== "string") return null;
    if (!/^\d{4}-\d{2}-\d{2}/.test(val)) return null;
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch (_) { return null; }
  }

  // Render a value with type-awareness
  const RATING_PROPS = ["ratingValue", "rating", "aggregateRating", "reviewRating", "score"];
  const PRICE_PROPS = ["price", "priceAmount", "amount", "cost", "value", "salary"];
  const CURRENCY_SYMBOLS = { USD: "$", EUR: "\u20ac", GBP: "\u00a3", JPY: "\u00a5", CNY: "\u00a5", KRW: "\u20a9", CZK: "K\u010d" };

  // Format rating as star icons
  function formatRating(val, prop) {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0 || num > 10) return null;
    // Detect if this is a 1-5 or 1-10 scale
    const maxStars = num <= 5 ? 5 : (num <= 10 ? 10 : null);
    if (!maxStars) return null;
    const outOf5 = num / maxStars * 5;
    const full = Math.floor(outOf5);
    const half = (outOf5 - full) >= 0.4 ? 1 : 0;
    const empty = 5 - full - half;
    return { full, half, empty, raw: num, max: maxStars };
  }

  // Format price/currency
  function formatPrice(val, prop) {
    if (typeof val === "number") return { amount: val, currency: null };
    if (typeof val !== "string") return null;
    // Try to detect currency prefix/suffix: $100, €50, 100 USD, 100.00
    const m = val.match(/^([\$\u20ac\u00a3\u00a5\u20a9])\s*([\d,]+\.?\d*)$/);
    if (m) return { amount: parseFloat(m[2].replace(",", "")), symbol: m[1] };
    const m2 = val.match(/^([\d,]+\.?\d*)\s*([A-Z]{3})$/);
    if (m2) return { amount: parseFloat(m2[1].replace(",", "")), currency: m2[2] };
    const m3 = val.match(/^([\d,]+\.?\d*)$/);
    if (m3 && PRICE_PROPS.includes(prop)) return { amount: parseFloat(m3[1].replace(",", "")), currency: null };
    return null;
  }

  function renderValue(v, f, val) {
    const prop = f.prop;
    const ftype = f.type;

    // Image fields
    if (ftype === "image" || IMAGE_PROPS.includes(prop) || isImageUrl(val)) {
      const img = document.createElement("img");
      img.src = val; img.alt = f.label; img.className = "rich-img";
      img.loading = "lazy";
      v.appendChild(img);
      return;
    }

    // Date fields
    const dateStr = formatDate(val);
    if (ftype === "date" || DATE_PROPS.includes(prop) || dateStr) {
      const span = document.createElement("span");
      span.className = "rich-date";
      span.textContent = dateStr || val;
      v.appendChild(span);
      return;
    }

    // Duration fields (ISO 8601)
    const dur = formatDuration(val);
    if (dur) {
      const span = document.createElement("span");
      span.className = "rich-duration";
      span.textContent = dur;
      v.appendChild(span);
      return;
    }

    // List fields — split comma-separated into <ul>
    if (ftype === "list" || LIST_PROPS.includes(prop)) {
      const items = typeof val === "string" ? val.split(/,\s*/) : (Array.isArray(val) ? val : [val]);
      if (items.length > 1) {
        const ul = document.createElement("ul"); ul.className = "rich-list";
        items.forEach((item) => {
          const li = document.createElement("li"); li.textContent = item.trim();
          ul.appendChild(li);
        });
        v.appendChild(ul);
        return;
      }
      // Single item: fall through to text
    }

    // URL / Email links
    if (ftype === "url" || ftype === "email") {
      const a = document.createElement("a");
      a.href = (ftype === "email" ? "mailto:" : "") + val; a.textContent = val;
      v.appendChild(a);
      return;
    }

    // Rating — star icons
    if (ftype === "rating" || RATING_PROPS.includes(prop) || /rating/i.test(prop)) {
      const r = formatRating(val, prop);
      if (r) {
        const span = document.createElement("span");
        span.className = "rich-rating";
        let stars = "";
        for (let i = 0; i < r.full; i++) stars += "\u2605";
        if (r.half) stars += "\u00BD";
        for (let i = 0; i < r.empty; i++) stars += "\u2606";
        span.textContent = stars + " ";
        const num = document.createElement("small");
        num.className = "rating-num";
        num.textContent = r.raw + "/" + r.max;
        span.appendChild(num);
        v.appendChild(span);
        return;
      }
    }

    // Price / currency
    const price = formatPrice(val, prop);
    if (price) {
      const span = document.createElement("span");
      span.className = "rich-price";
      if (price.symbol) {
        span.textContent = price.symbol + price.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else if (price.currency) {
        const sym = CURRENCY_SYMBOLS[price.currency] || price.currency + " ";
        span.textContent = sym + price.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        span.textContent = price.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      v.appendChild(span);
      return;
    }

    // Default: plain text
    v.textContent = val;
  }

  function render() {
    document.getElementById("title").textContent = data[cfg.titleProp] || "(untitled)";
    const view = document.getElementById("view");
    view.innerHTML = "";

    // Render hero image first (if any image field exists)
    const heroMount = document.getElementById("hero-mount");
    heroMount.innerHTML = "";
    let heroRendered = false;
    const isProfileType = cfg.type === "Person" || cfg.type === "Organization";
    for (const f of cfg.fields) {
      const val = data[f.prop];
      if (val === undefined || val === "") continue;
      const isImage = f.type === "image" || IMAGE_PROPS.includes(f.prop) || isImageUrl(val);
      if (isImage && !heroRendered) {
        if (isProfileType) {
          // Avatar: circle overlapping header band
          const avatar = document.createElement("div"); avatar.className = "avatar";
          avatar.setAttribute("data-prop", f.prop);
          avatar.setAttribute("title", "Click to change image URL");
          avatar.setAttribute("tabindex", "0");
          const img = document.createElement("img");
          img.src = val; img.alt = f.label; img.className = "avatar-img";
          img.loading = "lazy";
          avatar.appendChild(img);
          heroMount.appendChild(avatar);
        } else {
          // Hero banner: full-width
          const hero = document.createElement("div"); hero.className = "hero";
          hero.setAttribute("data-prop", f.prop);
          hero.setAttribute("title", "Click to change image URL");
          hero.setAttribute("tabindex", "0");
          const img = document.createElement("img");
          img.src = val; img.alt = f.label; img.className = "hero-img";
          img.loading = "lazy";
          hero.appendChild(img);
          heroMount.appendChild(hero);
        }
        heroRendered = true;
        continue;
      }
    }

    for (const f of cfg.fields) {
      if (f.prop === cfg.titleProp) continue;
      const val = data[f.prop];
      if (val === undefined || val === "") continue;
      // Skip image fields already rendered as hero
      const isImage = f.type === "image" || IMAGE_PROPS.includes(f.prop) || isImageUrl(val);
      if (isImage && heroRendered) continue;
      const row = document.createElement("div"); row.className = "row";
      const k = document.createElement("span"); k.className = "k"; k.textContent = f.label;
      const v = document.createElement("span"); v.className = "v";
      v.setAttribute("data-prop", f.prop);
      v.setAttribute("data-type", f.type);
      v.setAttribute("tabindex", "0");
      v.setAttribute("title", "Click to edit");
      renderValue(v, f, val);
      row.append(k, v); view.appendChild(row);
    }
    attachInlineEditors(view);
    attachHeroEditor(heroMount);
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

  // ── Hero image click-to-edit ──
  function attachHeroEditor(container) {
    const target = container.querySelector(".hero") || container.querySelector(".avatar");
    if (!target) return;
    target.addEventListener("click", () => {
      const prop = target.getAttribute("data-prop");
      const current = data[prop] || "";
      if (target.querySelector("input")) return;
      const input = document.createElement("input");
      input.type = "url";
      input.value = current;
      input.className = target.classList.contains("avatar") ? "avatar-edit" : "hero-edit";
      input.placeholder = "Image URL…";
      target.innerHTML = "";
      target.appendChild(input);
      input.focus();
      function save() {
        const val = input.value;
        if (val === "") delete data[prop]; else data[prop] = val;
        writeIsland();
        render();
        syncForm(prop, val);
      }
      input.addEventListener("blur", save);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
        if (ev.key === "Escape") { input.value = current; input.blur(); }
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
})();

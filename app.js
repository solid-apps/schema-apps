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
    // Bare numbers are only prices when the prop says so (numTracks,
    // episodeNumber etc. must NOT render as "47.00")
    if (typeof val === "number") {
      return PRICE_PROPS.includes(prop) ? { amount: val, currency: null } : null;
    }
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

  function formatSalary(val) {
    if (typeof val !== "string") return String(val);
    // "150000 USD" -> "$150,000"
    const m = val.match(/^([\d,]+\.?\d*)\s*([A-Z]{3})$/);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ""));
      return "$" + num.toLocaleString("en-US") + " " + m[2];
    }
    // "$150,000" or bare number
    const m2 = val.match(/^([\$€£¥])\s*([\d,]+\.?\d*)$/);
    if (m2) return m2[1] + parseFloat(m2[2].replace(/,/g, "")).toLocaleString("en-US");
    const m3 = val.match(/^([\d,]+\.?\d*)$/);
    if (m3) return "$" + parseFloat(m3[1].replace(/,/g, "")).toLocaleString("en-US");
    return val;
  }

  function renderValue(v, f, val) {
    const prop = f.prop;
    const ftype = f.type;

    // Nested objects (e.g. author: {"@type":"Person","name":…}) render by
    // their name — never "[object Object]"
    if (val && typeof val === "object" && !Array.isArray(val)) {
      val = val.name || val["@id"] || JSON.stringify(val);
    }

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
          if (item && typeof item === "object") item = item.name || item["@id"] || JSON.stringify(item);
          const li = document.createElement("li"); li.textContent = String(item).trim();
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

    // Per-type bespoke layouts — set of props handled by bespoke rendering
    // so the generic row loop skips them
    const bespokeProps = renderTypeSpecific(view, heroRendered);

    for (const f of cfg.fields) {
      if (f.prop === cfg.titleProp) continue;
      const val = data[f.prop];
      if (val === undefined || val === "") continue;
      // Skip image fields already rendered as hero
      const isImage = f.type === "image" || IMAGE_PROPS.includes(f.prop) || isImageUrl(val);
      if (isImage && heroRendered) continue;
      // Skip props already rendered by bespoke layout
      if (bespokeProps.has(f.prop)) continue;
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

  // ── Per-type bespoke layouts ──
  // Returns a Set of prop names that were handled, so the generic loop can skip them.
  function renderTypeSpecific(view, heroRendered) {
    const handled = new Set();

    // ── RECIPE (recipe-card layout) ──
    if (cfg.type === "Recipe") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("recipe-card");

      const heroMount = document.getElementById("hero-mount");
      const typeLabel = document.getElementById("type-label");

      // Remove generic hero so we can build our own
      heroMount.querySelector(".hero")?.remove();

      // ── Hero: food photo with overlay ──
      const imageData = data["image"];
      if (imageData) {
        const hero = document.createElement("div"); hero.className = "recipe-hero";
        hero.setAttribute("data-prop", "image");
        hero.setAttribute("title", "Click to change image URL");
        hero.setAttribute("tabindex", "0");

        const img = document.createElement("img");
        img.className = "recipe-hero-img";
        img.src = imageData;
        img.alt = data["name"] || "Recipe photo";
        img.loading = "lazy";
        hero.appendChild(img);

        // Warm gradient scrim
        const scrim = document.createElement("div"); scrim.className = "recipe-scrim";
        hero.appendChild(scrim);

        // Overlay content
        const overlay = document.createElement("div"); overlay.className = "recipe-overlay";

        const badge = document.createElement("span"); badge.className = "recipe-badge";
        badge.textContent = "\u{1F374}\u{00A0}" + (typeLabel ? typeLabel.textContent : "Recipe");
        overlay.appendChild(badge);

        const h1 = document.createElement("h1"); h1.className = "recipe-title";
        h1.textContent = data["name"] || "";
        overlay.appendChild(h1);

        const desc = data["description"];
        if (desc) {
          const descEl = document.createElement("p"); descEl.className = "recipe-desc";
          descEl.textContent = desc;
          overlay.appendChild(descEl);
          handled.add("description");
        }

        hero.appendChild(overlay);
        heroMount.appendChild(hero);
      }

      // Hide normal header since title is in the hero
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      handled.add("name");
      handled.add("image");

      // ── Stats strip: prep, cook, yield ──
      const stats = [];
      const prep = data["prepTime"];
      if (prep) { const d = formatDuration(prep); if (d) stats.push({ icon: "\u{23F1}\u{FE0F}", label: "Prep", val: d }); }
      const cook = data["cookTime"];
      if (cook) { const d = formatDuration(cook); if (d) stats.push({ icon: "\u{1F525}", label: "Cook", val: d }); }
      const yield_ = data["recipeYield"];
      if (yield_) stats.push({ icon: "\u{1F37D}\u{FE0F}", label: "Yields", val: yield_ });

      if (stats.length) {
        const strip = document.createElement("div"); strip.className = "recipe-stats";
        stats.forEach((s) => {
          const chip = document.createElement("div"); chip.className = "recipe-stat";
          const iconSpan = document.createElement("span"); iconSpan.className = "recipe-stat-icon"; iconSpan.textContent = s.icon;
          const textSpan = document.createElement("span"); textSpan.className = "recipe-stat-text";
          textSpan.innerHTML = "<small>" + s.label + "</small>" + s.val;
          chip.append(iconSpan, textSpan);
          strip.appendChild(chip);
        });
        view.appendChild(strip);
      }
      if (prep) handled.add("prepTime");
      if (cook) handled.add("cookTime");
      if (yield_) handled.add("recipeYield");

      // ── Ingredients checklist ──
      const ingredients = data["recipeIngredient"];
      if (ingredients) {
        const items = typeof ingredients === "string"
          ? ingredients.split(/,(?=\s)/)
          : (Array.isArray(ingredients) ? ingredients : [ingredients]);
        const section = document.createElement("div"); section.className = "recipe-section";
        const h = document.createElement("div"); h.className = "recipe-section-title";
        h.textContent = "\u{1F4E6} Ingredients";
        section.appendChild(h);
        const ul = document.createElement("ul"); ul.className = "recipe-checklist";
        items.forEach((item) => {
          const li = document.createElement("li"); li.className = "recipe-check-item";
          const cb = document.createElement("span"); cb.className = "recipe-check-box";
          const txt = document.createElement("span"); txt.className = "recipe-check-text"; txt.textContent = item.trim();
          li.append(cb, txt);
          li.addEventListener("click", () => li.classList.toggle("checked"));
          ul.appendChild(li);
        });
        section.appendChild(ul);
        view.appendChild(section);
        handled.add("recipeIngredient");
      }

      // ── Method: numbered steps ──
      const instr = data["recipeInstructions"];
      if (instr) {
        const steps = typeof instr === "string"
          ? instr.split(/\n/).filter((s) => s.trim())
          : (Array.isArray(instr) ? instr : [instr]);
        const section = document.createElement("div"); section.className = "recipe-section";
        const h = document.createElement("div"); h.className = "recipe-section-title";
        h.textContent = "\u{1F4DD} Method";
        section.appendChild(h);
        const ol = document.createElement("ol"); ol.className = "recipe-steps";
        steps.forEach((step) => {
          const li = document.createElement("li"); li.className = "recipe-step";
          const num = document.createElement("span"); num.className = "recipe-step-num";
          const txt = document.createElement("span"); txt.className = "recipe-step-text";
          txt.textContent = step.trim().replace(/^\d+\.\s*/, "");
          li.append(num, txt);
          ol.appendChild(li);
        });
        section.appendChild(ol);
        view.appendChild(section);
        handled.add("recipeInstructions");
      }
    }

    // ── REVIEW ──
    if (cfg.type === "Review") {
      // Large prominent rating near top
      const ratingVal = data["reviewRating"];
      if (ratingVal !== undefined) {
        const r = formatRating(ratingVal, "reviewRating");
        if (r) {
          const ratingBlock = document.createElement("div"); ratingBlock.className = "rating-hero";
          let stars = "";
          for (let i = 0; i < r.full; i++) stars += "\u2605";
          if (r.half) stars += "\u00BD";
          for (let i = 0; i < r.empty; i++) stars += "\u2606";
          const starsSpan = document.createElement("span"); starsSpan.className = "rating-hero-stars"; starsSpan.textContent = stars;
          const numSpan = document.createElement("span"); numSpan.className = "rating-hero-num"; numSpan.textContent = r.raw + "/" + r.max;
          ratingBlock.append(starsSpan, numSpan);
          view.appendChild(ratingBlock);
        }
        handled.add("reviewRating");
      }

      // Review body as blockquote with author byline
      const body = data["reviewBody"];
      if (body) {
        const bq = document.createElement("blockquote"); bq.className = "review-body";
        const p = document.createElement("p"); p.textContent = body;
        bq.appendChild(p);
        const author = data["author"];
        if (author) {
          const cite = document.createElement("cite"); cite.className = "review-byline";
          cite.textContent = "\u2014 " + author;
          bq.appendChild(cite);
        }
        view.appendChild(bq);
        handled.add("reviewBody");
        if (author) handled.add("author");
      }
    }

    // ── MOVIE (cinematic layout) ──
    if (cfg.type === "Movie") {
      // Mark card as cinematic — triggers full CSS override
      const card = document.querySelector(".card");
      if (card) card.classList.add("cinematic");

      // Title is already set by render() in #title — move it into the hero overlay
      const heroMount = document.getElementById("hero-mount");
      const titleEl = document.getElementById("title");
      const typeLabel = document.getElementById("type-label");
      const iconEl = document.getElementById("icon");

      // Build cinematic overlay inside hero
      if (heroMount.querySelector(".hero")) {
        const hero = heroMount.querySelector(".hero");
        hero.classList.add("cinematic-hero");

        // Scrim gradient
        const scrim = document.createElement("div"); scrim.className = "cinematic-scrim";
        hero.appendChild(scrim);

        // Overlay content: type badge + title
        const overlay = document.createElement("div"); overlay.className = "cinematic-overlay";
        const badge = document.createElement("span"); badge.className = "cinematic-type-badge";
        badge.textContent = (iconEl ? iconEl.textContent + " " : "") + (typeLabel ? typeLabel.textContent : "");
        const h1 = document.createElement("h1"); h1.className = "cinematic-title";
        h1.textContent = data[cfg.titleProp] || "";
        overlay.append(badge, h1);

        // Meta chips inside overlay
        const chips = [];
        const year = data["datePublished"];
        if (year) chips.push(new Date(year).getFullYear().toString());
        const genre = data["genre"];
        if (genre) chips.push(genre.split(",")[0].trim());
        const dur = data["duration"];
        if (dur) { const d = formatDuration(dur); if (d) chips.push(d); }
        if (chips.length) {
          const meta = document.createElement("div"); meta.className = "cinematic-meta";
          meta.textContent = chips.join("  ·  ");
          overlay.appendChild(meta);
        }

        // Rating as gold stars inside overlay
        const aggRating = data["aggregateRating"];
        if (aggRating !== undefined) {
          const r = formatRating(aggRating, "aggregateRating");
          if (r) {
            const ratingDiv = document.createElement("div"); ratingDiv.className = "cinematic-rating";
            let stars = "";
            for (let i = 0; i < r.full; i++) stars += "\u2605";
            if (r.half) stars += "\u00BD";
            for (let i = 0; i < r.empty; i++) stars += "\u2606";
            ratingDiv.innerHTML = "<span class=\"cinematic-stars\">" + stars + "</span><span class=\"cinematic-score\">" + r.raw + "<small>/" + r.max + "</small></span>";
            overlay.appendChild(ratingDiv);
          }
          handled.add("aggregateRating");
        }

        hero.appendChild(overlay);
      }

      // Hide normal header since title is now in the hero
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Mark handled
      handled.add("datePublished");
      handled.add("genre");
      handled.add("duration");
      handled.add("name");
      handled.add("image");

      // Director as a prominent credit row
      const director = data["director"];
      if (director) {
        const creditRow = document.createElement("div"); creditRow.className = "cinematic-credit";
        creditRow.innerHTML = "<span class=\"credit-label\">Directed by</span><span class=\"credit-name\">" + director + "</span>";
        view.appendChild(creditRow);
        handled.add("director");
      }

      // Full genre list as tags
      const genreFull = data["genre"];
      if (genreFull) {
        const tags = document.createElement("div"); tags.className = "cinematic-tags";
        genreFull.split(",").forEach(g => {
          const tag = document.createElement("span"); tag.className = "cinematic-tag"; tag.textContent = g.trim();
          tags.appendChild(tag);
        });
        view.appendChild(tags);
      }

      // Description as cinematic synopsis
      const desc = data["description"];
      if (desc) {
        const synopsis = document.createElement("div"); synopsis.className = "cinematic-synopsis";
        synopsis.textContent = desc;
        view.appendChild(synopsis);
        handled.add("description");
      }
    }

    // ── TVSERIES (Netflix-style streaming page) ──
    if (cfg.type === "TVSeries") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("streaming-page");

      const heroMount = document.getElementById("hero-mount");
      const typeLabel = document.getElementById("type-label");
      const iconEl = document.getElementById("icon");

      // Remove generic hero so we can build our own
      heroMount.querySelector(".hero")?.remove();

      // ── Dark immersive hero ──
      const imageData = data["image"];
      const hero = document.createElement("div"); hero.className = "streaming-hero";
      hero.setAttribute("data-prop", "image");
      hero.setAttribute("title", "Click to change image URL");
      hero.setAttribute("tabindex", "0");

      if (imageData) {
        const img = document.createElement("img");
        img.className = "streaming-hero-img";
        img.src = imageData;
        img.alt = data["name"] || "Series art";
        img.loading = "lazy";
        hero.appendChild(img);
      }

      // Dark gradient scrim
      const scrim = document.createElement("div"); scrim.className = "streaming-scrim";
      hero.appendChild(scrim);

      // Overlay content
      const overlay = document.createElement("div"); overlay.className = "streaming-overlay";

      // Type badge
      const badge = document.createElement("span"); badge.className = "streaming-badge";
      badge.textContent = "\u{1F4FA}\u{00A0}" + (typeLabel ? typeLabel.textContent : "TV Series");
      overlay.appendChild(badge);

      // Title — huge
      const h1 = document.createElement("h1"); h1.className = "streaming-title";
      h1.textContent = data["name"] || "";
      overlay.appendChild(h1);

      // Meta row: year · seasons · episodes · genre
      const metaParts = [];
      const start = data["startDate"];
      if (start) { const yr = start.match(/(\d{4})/); if (yr) metaParts.push(yr[1]); }
      const seasons = data["numberOfSeasons"];
      if (seasons) metaParts.push(seasons + " Season" + (seasons !== "1" ? "s" : ""));
      const episodes = data["numberOfEpisodes"];
      if (episodes) metaParts.push(episodes + " Episode" + (episodes !== "1" ? "s" : ""));
      const genre = data["genre"];
      if (genre) metaParts.push(genre.split(",")[0].trim());
      if (metaParts.length) {
        const meta = document.createElement("div"); meta.className = "streaming-meta";
        meta.textContent = metaParts.join("  \u{00B7}  ");
        overlay.appendChild(meta);
      }

      // Play button
      const url = data["url"];
      const playBtn = document.createElement("button");
      playBtn.className = "streaming-play-btn";
      playBtn.innerHTML = "\u{25B6}\u{FE0F} Play";
      if (url) {
        playBtn.addEventListener("click", () => window.open(url, "_blank"));
      }
      overlay.appendChild(playBtn);

      // Synopsis
      const desc = data["description"];
      if (desc) {
        const synopsis = document.createElement("p"); synopsis.className = "streaming-synopsis";
        synopsis.textContent = desc;
        overlay.appendChild(synopsis);
      }

      hero.appendChild(overlay);
      heroMount.appendChild(hero);

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Mark all handled props
      handled.add("name");
      handled.add("image");
      handled.add("description");
      handled.add("genre");
      handled.add("numberOfSeasons");
      handled.add("numberOfEpisodes");
      handled.add("startDate");
      handled.add("url");

      // ── Body: director + genre tags + episodes overview ──

      // Director credit
      const director = data["director"];
      if (director) {
        const credit = document.createElement("div"); credit.className = "streaming-credit";
        credit.innerHTML = "<span class=\"streaming-credit-label\">Directed by</span><span class=\"streaming-credit-name\">" + director + "</span>";
        view.appendChild(credit);
        handled.add("director");
      }

      // Genre tags
      if (genre) {
        const tags = document.createElement("div"); tags.className = "streaming-tags";
        genre.split(",").forEach(function(g) {
          var tag = document.createElement("span");
          tag.className = "streaming-tag";
          tag.textContent = g.trim();
          tags.appendChild(tag);
        });
        view.appendChild(tags);
      }

      // Episodes overview card
      if (seasons || episodes) {
        const infoBar = document.createElement("div");
        infoBar.className = "streaming-info-bar";
        if (seasons) {
          const chip = document.createElement("div"); chip.className = "streaming-info-chip";
          chip.innerHTML = "<span class=\"streaming-info-num\">" + seasons + "</span><span class=\"streaming-info-label\">Season" + (seasons !== "1" ? "s" : "") + "</span>";
          infoBar.appendChild(chip);
        }
        if (episodes) {
          const chip = document.createElement("div"); chip.className = "streaming-info-chip";
          chip.innerHTML = "<span class=\"streaming-info-num\">" + episodes + "</span><span class=\"streaming-info-label\">Episode" + (episodes !== "1" ? "s" : "") + "</span>";
          infoBar.appendChild(chip);
        }
        var endD = data["endDate"];
        if (start) {
          var dateText = formatDate(start);
          if (endD) dateText = dateText + " \u{2013} " + formatDate(endD);
          else dateText = dateText + " \u{2013} Present";
          var dateChip = document.createElement("div");
          dateChip.className = "streaming-info-chip";
          dateChip.innerHTML = "<span class=\"streaming-info-num\" style=\"font-size:.85rem\">" + dateText + "</span>";
          infoBar.appendChild(dateChip);
        }
        view.appendChild(infoBar);
        handled.add("endDate");
      }
    }

    // ── BRAND (bold brand identity hero) ──
    if (cfg.type === "Brand") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("brand-hero");

      const heroMount = document.getElementById("hero-mount");
      const typeLabel = document.getElementById("type-label");

      // Remove generic hero
      heroMount.querySelector(".hero")?.remove();

      // ── Color block using accent as brand color ──
      var brandBlock = document.createElement("div");
      brandBlock.className = "brand-block";

      // Logo/image if present — rendered as a framed mark
      var imageData = data["image"];
      if (imageData) {
        var logoWrap = document.createElement("div");
        logoWrap.className = "brand-logo-wrap";
        logoWrap.setAttribute("data-prop", "image");
        logoWrap.setAttribute("title", "Click to change image URL");
        logoWrap.setAttribute("tabindex", "0");
        var img = document.createElement("img");
        img.className = "brand-logo";
        img.src = imageData;
        img.alt = data["name"] || "Brand logo";
        img.loading = "lazy";
        logoWrap.appendChild(img);
        brandBlock.appendChild(logoWrap);
      }

      // Brand name HUGE
      var nameEl = document.createElement("h1");
      nameEl.className = "brand-name";
      nameEl.textContent = data["name"] || "";
      brandBlock.appendChild(nameEl);

      // Slogan as hero tagline
      var slogan = data["slogan"];
      if (slogan) {
        var sloganEl = document.createElement("p");
        sloganEl.className = "brand-slogan";
        sloganEl.textContent = slogan;
        brandBlock.appendChild(sloganEl);
      }

      // Type badge
      var badge = document.createElement("span");
      badge.className = "brand-type-badge";
      badge.textContent = "\u{2122}\u{00A0}" + (typeLabel ? typeLabel.textContent : "Brand");
      brandBlock.appendChild(badge);

      heroMount.appendChild(brandBlock);

      // Hide normal header
      var hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Mark handled props
      handled.add("name");
      handled.add("image");
      handled.add("slogan");

      // ── Body: description + website CTA ──

      // Description as brand story
      var desc = data["description"];
      if (desc) {
        var story = document.createElement("div");
        story.className = "brand-story";
        story.textContent = desc;
        view.appendChild(story);
        handled.add("description");
      }

      // Website CTA
      var url = data["url"];
      if (url) {
        var ctaWrap = document.createElement("div");
        ctaWrap.className = "brand-cta-wrap";
        var cta = document.createElement("a");
        cta.className = "brand-cta";
        cta.href = url;
        cta.target = "_blank";
        cta.rel = "noopener";
        cta.textContent = "\u{1F310} Visit website";
        ctaWrap.appendChild(cta);
        view.appendChild(ctaWrap);
        handled.add("url");
      }
    }

    // ── PHOTOGRAPH (fine-art gallery print) ──
    if (cfg.type === "Photograph") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("gallery-print");

      const heroMount = document.getElementById("hero-mount");
      const typeLabel = document.getElementById("type-label");

      // Remove generic hero
      heroMount.querySelector(".hero")?.remove();

      // ── Museum-dark gallery field with the photo as centerpiece ──
      var imageData = data["image"];
      var photoName = data["name"] || "Untitled";

      var gallery = document.createElement("div");
      gallery.className = "gallery-stage";

      if (imageData) {
        var photoWrap = document.createElement("div");
        photoWrap.className = "gallery-photo-wrap";
        photoWrap.setAttribute("data-prop", "image");
        photoWrap.setAttribute("title", "Click to change image URL");
        photoWrap.setAttribute("tabindex", "0");
        var img = document.createElement("img");
        img.className = "gallery-photo";
        img.src = imageData;
        img.alt = photoName;
        img.loading = "lazy";
        photoWrap.appendChild(img);
        gallery.appendChild(photoWrap);
      }

      // Print label — like a museum wall card
      var label = document.createElement("div");
      label.className = "gallery-label";

      // Title in italics (fine-art style)
      var titleLabel = document.createElement("div");
      titleLabel.className = "gallery-label-title";
      titleLabel.textContent = photoName;
      label.appendChild(titleLabel);

      // Photographer
      var creator = data["creator"];
      if (creator) {
        var creatorEl = document.createElement("div");
        creatorEl.className = "gallery-label-artist";
        creatorEl.textContent = creator;
        label.appendChild(creatorEl);
      }

      // Meta line: date · location
      var metaParts = [];
      var dateCreated = data["dateCreated"];
      if (dateCreated) {
        var yr = dateCreated.match(/(\d{4})/);
        if (yr) metaParts.push(yr[1]);
      }
      var loc = data["contentLocation"];
      if (loc) metaParts.push(loc);
      if (metaParts.length) {
        var metaEl = document.createElement("div");
        metaEl.className = "gallery-label-meta";
        metaEl.textContent = metaParts.join("  \u{00B7}  ");
        label.appendChild(metaEl);
      }

      gallery.appendChild(label);
      heroMount.appendChild(gallery);

      // Hide normal header
      var hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Mark all handled props
      handled.add("name");
      handled.add("image");
      handled.add("creator");
      handled.add("dateCreated");
      handled.add("contentLocation");

      // Description as artist statement / wall text
      var desc = data["description"];
      if (desc) {
        var wall = document.createElement("div");
        wall.className = "gallery-wall-text";
        wall.textContent = desc;
        view.appendChild(wall);
        handled.add("description");
      }
    }

    // ── PRODUCT (Apple product page) ──
    if (cfg.type === "Product") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("product-showcase");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Convert hero to clean product shot
      const heroMount = document.getElementById("hero-mount");
      if (heroMount.querySelector(".hero")) {
        const hero = heroMount.querySelector(".hero");
        hero.classList.add("product-shot");
        hero.innerHTML = "";
        const img = document.createElement("img"); img.src = data["image"]; img.alt = data[cfg.titleProp] || "";
        img.className = "product-shot-img"; img.loading = "lazy";
        hero.appendChild(img);
      }

      handled.add("name"); handled.add("image");

      // Product info block
      const info = document.createElement("div"); info.className = "product-info";

      // Brand as subtle label
      const brand = data["brand"];
      if (brand) {
        const brandEl = document.createElement("div"); brandEl.className = "product-brand";
        brandEl.textContent = brand;
        info.appendChild(brandEl);
        handled.add("brand");
      }

      // Name large
      const h1 = document.createElement("h1"); h1.className = "product-name";
      h1.textContent = data[cfg.titleProp] || "";
      info.appendChild(h1);

      // Tagline (description as short prose)
      const desc = data["description"];
      if (desc) {
        const tagline = document.createElement("p"); tagline.className = "product-tagline";
        tagline.textContent = desc;
        info.appendChild(tagline);
        handled.add("description");
      }

      view.appendChild(info);

      // HUGE price
      const priceVal = data["price"];
      if (priceVal) {
        const priceBlock = document.createElement("div"); priceBlock.className = "product-price-hero";
        const price = formatPrice(priceVal, "price");
        let priceText = priceVal;
        if (price) {
          const sym = price.symbol || (price.currency ? (CURRENCY_SYMBOLS[price.currency] || price.currency + " ") : "");
          const amt = price.amount || parseFloat(priceVal.replace(/[^0-9.]/g, ""));
          priceText = (isNaN(amt) ? priceVal : amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          priceBlock.innerHTML = "<span class=\"pp-symbol\">" + sym + "</span><span class=\"pp-amount\">" + priceText + "</span>";
        } else {
          priceBlock.textContent = priceText;
        }
        view.appendChild(priceBlock);
        handled.add("price");
      }

      // Spec chips
      const specProps = ["color", "material", "sku"];
      const specItems = [];
      for (const f of cfg.fields) {
        if (!specProps.includes(f.prop)) continue;
        const val = data[f.prop];
        if (!val) continue;
        specItems.push({ label: f.label, val });
        handled.add(f.prop);
      }
      if (specItems.length) {
        const specs = document.createElement("div"); specs.className = "product-specs";
        specItems.forEach(s => {
          const chip = document.createElement("span"); chip.className = "product-spec-chip";
          chip.innerHTML = "<small>" + s.label + "</small>" + s.val;
          specs.appendChild(chip);
        });
        view.appendChild(specs);
      }

      // CTA button
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "product-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.textContent = "Buy Now";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── EVENT (concert poster / event flyer) ──
    if (cfg.type === "Event") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("event-poster");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Build poster hero with gradient + date + name
      const heroMount = document.getElementById("hero-mount");
      const existing = heroMount.querySelector(".hero");
      if (existing) existing.remove();

      const poster = document.createElement("div"); poster.className = "poster-hero";

      // Big date block
      const start = data["startDate"];
      if (start) {
        try {
          const d = new Date(start);
          if (!isNaN(d.getTime())) {
            const dateBlock = document.createElement("div"); dateBlock.className = "poster-date";
            const month = document.createElement("span"); month.className = "poster-month";
            month.textContent = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
            const day = document.createElement("span"); day.className = "poster-day";
            day.textContent = d.getDate();
            const year = document.createElement("span"); year.className = "poster-year";
            year.textContent = d.getFullYear();
            dateBlock.append(month, day, year);
            poster.appendChild(dateBlock);
          }
        } catch(_) {}
        handled.add("startDate");
      }

      // Name huge
      const h1 = document.createElement("h1"); h1.className = "poster-title";
      h1.textContent = data[cfg.titleProp] || "";
      poster.appendChild(h1);
      handled.add("name");

      // End date range
      const end = data["endDate"];
      if (end && end !== start) {
        try {
          const d2 = new Date(end);
          if (!isNaN(d2.getTime())) {
            const range = document.createElement("div"); range.className = "poster-range";
            range.textContent = d2.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d2.getFullYear();
            poster.appendChild(range);
          }
        } catch(_) {}
        handled.add("endDate");
      }

      heroMount.appendChild(poster);

      // Location + organizer
      const loc = data["location"];
      const org = data["organizer"];
      if (loc || org) {
        const meta = document.createElement("div"); meta.className = "poster-meta";
        if (loc) {
          const row = document.createElement("div"); row.className = "poster-meta-row";
          row.innerHTML = "<span class=\"poster-meta-icon\">\u{1F4CD}</span><span>" + loc + "</span>";
          meta.appendChild(row);
          handled.add("location");
        }
        if (org) {
          const row = document.createElement("div"); row.className = "poster-meta-row";
          row.innerHTML = "<span class=\"poster-meta-icon\">\u{1F3AB}</span><span>" + org + "</span>";
          meta.appendChild(row);
          handled.add("organizer");
        }
        view.appendChild(meta);
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const body = document.createElement("div"); body.className = "poster-desc";
        body.textContent = desc;
        view.appendChild(body);
        handled.add("description");
      }

      // Get Tickets CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "poster-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "<span class=\"poster-cta-text\">Get Tickets</span><span class=\"poster-cta-arrow\">\u2192</span>";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── MUSICALBUM (Spotify-style immersive) ──
    if (cfg.type === "MusicAlbum") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("album-immersive");

      // Rebuild hero as square cover art
      const heroMount = document.getElementById("hero-mount");
      const coverUrl = data["image"];
      if (coverUrl && heroMount.querySelector(".hero")) {
        const hero = heroMount.querySelector(".hero");
        hero.classList.add("album-cover-hero");
        // Remove old img, re-add as square
        hero.innerHTML = "";
        const img = document.createElement("img"); img.src = coverUrl; img.alt = data[cfg.titleProp] || "";
        img.className = "album-cover-img"; img.loading = "lazy";
        hero.appendChild(img);
        // Ambient gradient backdrop behind cover
        const backdrop = document.createElement("div"); backdrop.className = "album-backdrop";
        hero.appendChild(backdrop);
      }

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Album info block (beside/below cover)
      const info = document.createElement("div"); info.className = "album-info";
      const typeBadge = document.createElement("span"); typeBadge.className = "album-type-badge";
      typeBadge.textContent = "ALBUM";
      const h1 = document.createElement("h1"); h1.className = "album-title";
      h1.textContent = data[cfg.titleProp] || "";
      const artistLine = document.createElement("div"); artistLine.className = "album-artist-line";
      artistLine.innerHTML = "by <strong>" + (data["byArtist"] || "Unknown") + "</strong>";

      // Meta: year · genre · N tracks
      const metaParts = [];
      const datePub = data["datePublished"];
      if (datePub) metaParts.push(new Date(datePub).getFullYear().toString());
      const genre = data["genre"];
      if (genre) metaParts.push(genre.split(",")[0].trim());
      const numTracks = data["numTracks"];
      if (numTracks) metaParts.push(numTracks + " tracks");
      const meta = document.createElement("div"); meta.className = "album-meta";
      meta.textContent = metaParts.join("  ·  ");

      info.append(typeBadge, h1, artistLine, meta);
      view.appendChild(info);

      handled.add("name"); handled.add("image"); handled.add("byArtist");
      handled.add("datePublished"); handled.add("genre"); handled.add("numTracks");

      // Tracklist
      const trackData = data["track"];
      if (Array.isArray(trackData) && trackData.length) {
        const listWrap = document.createElement("div"); listWrap.className = "tracklist-wrap";
        const listHeader = document.createElement("div"); listHeader.className = "tracklist-header";
        listHeader.innerHTML = "<span class=\"th-num\">#</span><span class=\"th-title\">Title</span><span class=\"th-dur\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><circle cx=\"8\" cy=\"8\" r=\"1.2\"/><circle cx=\"2\" cy=\"8\" r=\"1.2\"/><circle cx=\"14\" cy=\"8\" r=\"1.2\"/></svg></span>";
        listWrap.appendChild(listHeader);

        const ol = document.createElement("ol"); ol.className = "tracklist";
        trackData.forEach((t, i) => {
          const li = document.createElement("li"); li.className = "track-row";
          const num = document.createElement("span"); num.className = "track-num"; num.textContent = i + 1;
          const title = document.createElement("span"); title.className = "track-title"; title.textContent = t.name || "";
          const dur = document.createElement("span"); dur.className = "track-dur";
          if (t.duration) { const d = formatDuration(t.duration); dur.textContent = d || ""; }
          li.append(num, title, dur);
          ol.appendChild(li);
        });
        listWrap.appendChild(ol);
        view.appendChild(listWrap);
        handled.add("track");
      }
    }

        // ── BOOK (book-jacket hero) ──
    if (cfg.type === "Book") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("book-jacket");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Build cover-led layout: cover image on left, info on right
      const heroMount = document.getElementById("hero-mount");
      const existingHero = heroMount.querySelector(".hero");
      if (existingHero) existingHero.remove();

      const layout = document.createElement("div"); layout.className = "book-layout";

      // 3D cover with spine shadow
      const coverUrl = data["image"];
      if (coverUrl) {
        const coverWrap = document.createElement("div"); coverWrap.className = "book-cover-wrap";
        const coverImg = document.createElement("div"); coverImg.className = "book-cover";
        const img = document.createElement("img"); img.src = coverUrl; img.alt = data[cfg.titleProp] || "";
        img.className = "book-cover-img"; img.loading = "lazy";
        coverImg.appendChild(img);
        // Spine edge
        const spine = document.createElement("div"); spine.className = "book-spine";
        coverWrap.append(coverImg, spine);
        layout.appendChild(coverWrap);
        handled.add("image");
      }

      // Info panel
      const info = document.createElement("div"); info.className = "book-info";

      // Title
      const h1 = document.createElement("h1"); h1.className = "book-title";
      h1.textContent = data[cfg.titleProp] || "";
      info.appendChild(h1);
      handled.add("name");

      // Author
      const author = data["author"];
      if (author) {
        const ab = document.createElement("div"); ab.className = "book-by";
        ab.innerHTML = "by <strong>" + author + "</strong>";
        info.appendChild(ab);
        handled.add("author");
      }

      // Meta chips: pages · published · publisher
      const chips = [];
      const pages = data["numberOfPages"];
      if (pages) chips.push(pages + " pages");
      const pub = data["datePublished"];
      if (pub) { const d = formatDate(pub); chips.push(d || pub); }
      const publisher = data["publisher"];
      if (publisher) chips.push(publisher);
      const isbn = data["isbn"];
      if (isbn) chips.push("ISBN " + isbn);

      if (chips.length) {
        const meta = document.createElement("div"); meta.className = "book-meta";
        meta.textContent = chips.join(" \u00b7 ");
        info.appendChild(meta);
      }
      if (pages) handled.add("numberOfPages");
      if (pub) handled.add("datePublished");
      if (publisher) handled.add("publisher");
      if (isbn) handled.add("isbn");

      layout.appendChild(info);
      heroMount.appendChild(layout);

      // Synopsis
      const desc = data["description"];
      if (desc) {
        const synopsis = document.createElement("div"); synopsis.className = "book-synopsis";
        const label = document.createElement("div"); label.className = "book-synopsis-label";
        label.textContent = "Synopsis";
        synopsis.appendChild(label);
        const body = document.createElement("div"); body.className = "prose-body";
        body.textContent = desc;
        synopsis.appendChild(body);
        view.appendChild(synopsis);
        handled.add("description");
      }
    }

    // ── ARTICLE (editorial magazine) ──
    if (cfg.type === "Article") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("magazine");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Build masthead: headline + byline
      const masthead = document.createElement("div"); masthead.className = "article-masthead";

      // Big headline
      const headline = data[cfg.titleProp] || data["headline"];
      if (headline) {
        const h1 = document.createElement("h1"); h1.className = "article-headline";
        h1.textContent = headline;
        masthead.appendChild(h1);
        handled.add(cfg.titleProp);
      }

      // Byline: author · date
      const author = data["author"];
      const datePub = data["datePublished"];
      if (author || datePub) {
        const byline = document.createElement("div"); byline.className = "article-byline";
        const parts = [];
        if (author) {
          parts.push('<span class="article-author">' + author + '</span>');
          handled.add("author");
        }
        if (datePub) {
          const d = formatDate(datePub);
          parts.push('<span class="article-pubdate">' + (d || datePub) + '</span>');
          handled.add("datePublished");
        }
        byline.innerHTML = parts.join(' <span class="article-byline-sep">\u00b7</span> ');
        masthead.appendChild(byline);
      }

      // Description as standfirst (italic intro)
      const desc = data["description"];
      if (desc) {
        const standfirst = document.createElement("div"); standfirst.className = "article-standfirst";
        standfirst.textContent = desc;
        masthead.appendChild(standfirst);
        handled.add("description");
      }

      view.appendChild(masthead);

      // articleBody as flowing prose with drop-cap
      const articleBody = data["articleBody"];
      if (articleBody) {
        const body = document.createElement("div"); body.className = "article-prose";
        const paras = articleBody.split(/\n\n+/);
        paras.forEach((p, i) => {
          if (!p.trim()) return;
          const el = document.createElement("p");
          if (i === 0) el.classList.add("drop-cap");
          el.textContent = p.trim();
          body.appendChild(el);
        });

        // Pull quote from longest paragraph
        const longestPara = paras.reduce((a, b) => (b && b.trim().length > a.trim().length) ? b : a, "");
        if (longestPara.trim().length > 80) {
          const quote = document.createElement("blockquote"); quote.className = "article-pullquote";
          const words = longestPara.trim().split(" ");
          const quoteText = words.slice(0, Math.min(18, words.length)).join(" ");
          quote.textContent = "\u201C" + quoteText + (words.length > 18 ? "\u2026" : "") + "\u201D";
          if (body.children.length >= 2) {
            body.insertBefore(quote, body.children[1]);
          } else {
            body.appendChild(quote);
          }
        }

        view.appendChild(body);
        handled.add("articleBody");
      }
    }
    // ── COURSE (Coursera/Udemy hero) ──
    if (cfg.type === "Course") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("course-hero");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Hero banner with image + gradient overlay
      const heroMount = document.getElementById("hero-mount");
      const existing = heroMount.querySelector(".hero");
      if (existing) existing.remove();

      const banner = document.createElement("div"); banner.className = "course-banner";
      const imgUrl = data["image"];
      if (imgUrl) {
        const img = document.createElement("div"); img.className = "course-banner-img";
        img.style.backgroundImage = "url(" + imgUrl + ")";
        banner.appendChild(img);
        handled.add("image");
      }
      const scrim = document.createElement("div"); scrim.className = "course-banner-scrim";
      banner.appendChild(scrim);

      const overlay = document.createElement("div"); overlay.className = "course-banner-overlay";
      // Provider badge
      const provider = data["provider"];
      if (provider) {
        const pb = document.createElement("div"); pb.className = "course-provider-badge";
        pb.textContent = provider;
        overlay.appendChild(pb);
        handled.add("provider");
      }
      // Title
      const h1 = document.createElement("h1"); h1.className = "course-title";
      h1.textContent = data[cfg.titleProp] || "";
      overlay.appendChild(h1);
      handled.add("name");
      banner.appendChild(overlay);
      heroMount.appendChild(banner);

      // Info bar: level + code chips
      const level = data["educationalLevel"];
      const code = data["courseCode"];
      if (level || code) {
        const bar = document.createElement("div"); bar.className = "course-info-bar";
        if (code) {
          const chip = document.createElement("span"); chip.className = "course-chip";
          chip.textContent = code;
          bar.appendChild(chip);
          handled.add("courseCode");
        }
        if (level) {
          const chip = document.createElement("span"); chip.className = "course-chip";
          chip.textContent = level;
          bar.appendChild(chip);
          handled.add("educationalLevel");
        }
        view.appendChild(bar);
      }

      // About this course
      const desc = data["description"];
      if (desc) {
        const section = document.createElement("div"); section.className = "course-about";
        const label = document.createElement("div"); label.className = "course-about-label";
        label.textContent = "About this course";
        section.appendChild(label);
        const body = document.createElement("div"); body.className = "prose-body";
        body.textContent = desc;
        section.appendChild(body);
        view.appendChild(section);
        handled.add("description");
      }

      // Enroll CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "course-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "<span class=\"course-cta-text\">Start Learning</span><span class=\"course-cta-arrow\">\u2192</span>";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── ORGANIZATION ──
    if (cfg.type === "Organization") {
      // Legal name + founding year as meta chips
      const chips = [];
      const legal = data["legalName"];
      if (legal && legal !== data[cfg.titleProp]) chips.push({ label: "Legal name", val: legal });
      const founded = data["foundingDate"];
      if (founded) { const d = formatDate(founded); chips.push({ label: "Founded", val: d || founded }); }
      if (chips.length) {
        const strip = document.createElement("div"); strip.className = "stats-strip org-chips";
        chips.forEach((s, i) => {
          if (i > 0) { const sep = document.createElement("span"); sep.className = "stats-sep"; strip.appendChild(sep); }
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>" + s.label + "</small>" + s.val;
          strip.appendChild(chip);
        });
        view.appendChild(strip);
      }
      if (legal) handled.add("legalName");
      if (founded) handled.add("foundingDate");

      // Contact block: address, phone, email, website
      const contacts = [];
      const addr = data["address"];
      if (addr) contacts.push({ label: "Address", val: addr, icon: "📍" });
      const phone = data["telephone"];
      if (phone) contacts.push({ label: "Phone", val: phone, icon: "📞" });
      const email = data["email"];
      if (email) contacts.push({ label: "Email", val: email, icon: "✉️" });
      const web = data["url"];
      if (web) contacts.push({ label: "Web", val: web, icon: "🌐" });

      if (contacts.length) {
        const block = document.createElement("div"); block.className = "contact-block";
        contacts.forEach(c => {
          const row = document.createElement("div"); row.className = "contact-row";
          const icon = document.createElement("span"); icon.className = "contact-icon"; icon.textContent = c.icon;
          const txt = document.createElement("span"); txt.className = "contact-text";
          if (c.label === "Email") {
            const a = document.createElement("a"); a.href = "mailto:" + c.val; a.textContent = c.val;
            txt.appendChild(a);
          } else if (c.label === "Web") {
            const a = document.createElement("a"); a.href = c.val; a.textContent = c.val; a.target = "_blank"; a.rel = "noopener";
            txt.appendChild(a);
          } else {
            txt.textContent = c.val;
          }
          row.append(icon, txt);
          block.appendChild(row);
        });
        view.appendChild(block);
        contacts.forEach(c => {
          if (c.label === "Address") handled.add("address");
          if (c.label === "Phone") handled.add("telephone");
          if (c.label === "Email") handled.add("email");
          if (c.label === "Web") handled.add("url");
        });
      }
    }

    // ── RESTAURANT (premium dining landing) ──
    if (cfg.type === "Restaurant") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("restaurant-hero");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Convert hero to immersive food photo
      const heroMount = document.getElementById("hero-mount");
      if (heroMount.querySelector(".hero")) {
        const hero = heroMount.querySelector(".hero");
        hero.classList.add("rest-hero-img");
        hero.innerHTML = "";
        const img = document.createElement("img"); img.src = data["image"]; img.alt = data[cfg.titleProp] || "";
        img.className = "rest-photo"; img.loading = "lazy";
        hero.appendChild(img);
        // Dark scrim for text overlay
        const scrim = document.createElement("div"); scrim.className = "rest-scrim";
        hero.appendChild(scrim);
        // Overlay: name + badges
        const overlay = document.createElement("div"); overlay.className = "rest-overlay";
        const h1 = document.createElement("h1"); h1.className = "rest-name";
        h1.textContent = data[cfg.titleProp] || "";
        overlay.appendChild(h1);
        // Cuisine + price badges
        const badgeRow = document.createElement("div"); badgeRow.className = "rest-badges";
        const cuisine = data["servesCuisine"];
        if (cuisine) {
          const badge = document.createElement("span"); badge.className = "rest-cuisine-badge";
          badge.textContent = cuisine.split(",")[0].trim();
          badgeRow.appendChild(badge);
          handled.add("servesCuisine");
        }
        const price = data["priceRange"];
        if (price) {
          const badge = document.createElement("span"); badge.className = "rest-price-badge";
          badge.textContent = price;
          badgeRow.appendChild(badge);
          handled.add("priceRange");
        }
        overlay.appendChild(badgeRow);
        hero.appendChild(overlay);
      }

      handled.add("name"); handled.add("image");

      // Contact block in warm tones
      const contacts = [];
      const addr = data["address"];
      if (addr) contacts.push({ icon: "\u{1F4CD}", text: addr });
      const phone = data["telephone"];
      if (phone) contacts.push({ icon: "\u{1F4DE}", text: phone });

      if (contacts.length) {
        const block = document.createElement("div"); block.className = "rest-contact";
        contacts.forEach(c => {
          const row = document.createElement("div"); row.className = "rest-contact-row";
          const icon = document.createElement("span"); icon.className = "rest-contact-icon"; icon.textContent = c.icon;
          const txt = document.createElement("span"); txt.className = "rest-contact-text"; txt.textContent = c.text;
          row.append(icon, txt);
          block.appendChild(row);
        });
        view.appendChild(block);
        if (addr) handled.add("address");
        if (phone) handled.add("telephone");
      }

      // Reserve CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "rest-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "<span class=\"rest-cta-text\">Reserve a Table</span><span class=\"rest-cta-arrow\">→</span>";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── PERSON (premium portfolio) ──
    if (cfg.type === "Person") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("portfolio");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Convert avatar to portfolio hero
      const heroMount = document.getElementById("hero-mount");
      const avatarDiv = heroMount.querySelector(".avatar");
      if (avatarDiv) {
        // Wrap avatar in a banner area
        const banner = document.createElement("div"); banner.className = "portfolio-banner";
        // Create a decorative gradient band
        const band = document.createElement("div"); band.className = "portfolio-band";
        banner.appendChild(band);
        // Move avatar into banner
        avatarDiv.classList.add("portfolio-avatar");
        banner.appendChild(avatarDiv);
        // Name + title below avatar
        const nameEl = document.createElement("h1"); nameEl.className = "portfolio-name";
        nameEl.textContent = data[cfg.titleProp] || "";
        banner.appendChild(nameEl);
        const job = data["jobTitle"];
        if (job) {
          const titleEl = document.createElement("div"); titleEl.className = "portfolio-role";
          titleEl.textContent = job;
          banner.appendChild(titleEl);
          handled.add("jobTitle");
        }
        heroMount.innerHTML = "";
        heroMount.appendChild(banner);
      }

      handled.add("name"); handled.add("image");

      // Contact action row
      const contacts = [];
      const email = data["email"];
      if (email) contacts.push({ icon: "\u2709", label: "Email", href: "mailto:" + email, text: email });
      const phone = data["telephone"];
      if (phone) contacts.push({ icon: "\u260E", label: "Phone", href: "tel:" + phone.replace(/\s/g, ""), text: phone });
      const url = data["url"];
      if (url) contacts.push({ icon: "\u{1F310}", label: "Web", href: url, text: url.replace(/^https?:\/\//, "") });

      if (contacts.length) {
        const row = document.createElement("div"); row.className = "portfolio-contact";
        contacts.forEach(c => {
          const a = document.createElement("a"); a.className = "portfolio-contact-btn";
          a.href = c.href; a.target = "_blank"; a.rel = "noopener";
          a.title = c.label;
          const iconSpan = document.createElement("span"); iconSpan.className = "contact-icon-emoji"; iconSpan.textContent = c.icon;
          const textSpan = document.createElement("span"); textSpan.className = "contact-btn-text"; textSpan.textContent = c.text;
          a.append(iconSpan, textSpan);
          row.appendChild(a);
        });
        view.appendChild(row);
        if (email) handled.add("email");
        if (phone) handled.add("telephone");
        if (url) handled.add("url");
      }

      // Bio as refined prose
      const desc = data["description"];
      if (desc) {
        const bio = document.createElement("div"); bio.className = "portfolio-bio";
        bio.textContent = desc;
        view.appendChild(bio);
        handled.add("description");
      }
    }

    // ── JOBPOSTING (LinkedIn/Greenhouse job board) ──
    if (cfg.type === "JobPosting") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("job-board");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Company header bar
      const header = document.createElement("div"); header.className = "job-header";

      // Company avatar circle
      const company = data["hiringOrganization"];
      const avatar = document.createElement("div"); avatar.className = "job-company-avatar";
      if (company) {
        avatar.textContent = company.charAt(0).toUpperCase();
        header.appendChild(avatar);
        handled.add("hiringOrganization");
      }

      const headerInfo = document.createElement("div"); headerInfo.className = "job-header-info";
      // Company name
      if (company) {
        const companyEl = document.createElement("div"); companyEl.className = "job-company-name";
        companyEl.textContent = company;
        headerInfo.appendChild(companyEl);
      }
      // Posted date
      const datePosted = data["datePosted"];
      if (datePosted) {
        const d = formatDate(datePosted);
        const postedEl = document.createElement("div"); postedEl.className = "job-posted";
        postedEl.textContent = "Posted " + (d || datePosted);
        headerInfo.appendChild(postedEl);
        handled.add("datePosted");
      }
      header.appendChild(headerInfo);
      view.appendChild(header);

      // Role title (big)
      const title = data[cfg.titleProp];
      if (title) {
        const h1 = document.createElement("h1"); h1.className = "job-role-title";
        h1.textContent = title;
        view.appendChild(h1);
        handled.add(cfg.titleProp);
      }

      // Chips: location · type · salary
      const chips = [];
      const loc = data["jobLocation"];
      if (loc) chips.push({ icon: "\u{1F4CD}", val: loc, prop: "jobLocation" });
      const empType = data["employmentType"];
      if (empType) chips.push({ icon: "\u{1F4CA}", val: empType, prop: "employmentType" });
      const salary = data["baseSalary"];
      if (salary) chips.push({ icon: "\u{1F4B0}", val: formatSalary(salary), prop: "baseSalary" });

      if (chips.length) {
        const strip = document.createElement("div"); strip.className = "job-chips";
        chips.forEach((c, i) => {
          if (i > 0) {
            const sep = document.createElement("span"); sep.className = "job-chip-sep";
            sep.textContent = "\u00b7";
            strip.appendChild(sep);
          }
          const chip = document.createElement("span"); chip.className = "job-chip";
          chip.textContent = c.icon + " " + c.val;
          strip.appendChild(chip);
          handled.add(c.prop);
        });
        view.appendChild(strip);
      }

      // Description as job details
      const desc = data["description"];
      if (desc) {
        const section = document.createElement("div"); section.className = "job-details";
        const label = document.createElement("div"); label.className = "job-details-label";
        label.textContent = "About this role";
        section.appendChild(label);
        const body = document.createElement("div"); body.className = "prose-body";
        body.textContent = desc;
        section.appendChild(body);
        view.appendChild(section);
        handled.add("description");
      }

      // Apply Now CTA
      const cta = document.createElement("button"); cta.className = "job-cta";
      cta.innerHTML = "<span class=\"job-cta-text\">Apply Now</span><span class=\"job-cta-arrow\">\u2192</span>";
      cta.type = "button";
      view.appendChild(cta);

      // Also handle image if present (used by generic hero, skip here)
      if (data["image"]) handled.add("image");
    }

    // ── SOFTWAREAPPLICATION (App Store card) ──
    if (cfg.type === "SoftwareApplication") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("app-store");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove hero — we'll use the image as a compact app icon
      const heroMount = document.getElementById("hero-mount");
      if (heroMount.querySelector(".hero")) heroMount.querySelector(".hero").remove();

      // App Store header: icon + name + developer + category
      const appHeader = document.createElement("div"); appHeader.className = "app-store-header";

      const iconUrl = data["image"];
      if (iconUrl) {
        const iconEl = document.createElement("img"); iconEl.className = "app-store-icon";
        iconEl.src = iconUrl; iconEl.alt = data[cfg.titleProp] || "";
        iconEl.loading = "lazy";
        appHeader.appendChild(iconEl);
        handled.add("image");
      }

      const appMeta = document.createElement("div"); appMeta.className = "app-store-meta";
      const h1 = document.createElement("h1"); h1.className = "app-store-name";
      h1.textContent = data[cfg.titleProp] || "";
      appMeta.appendChild(h1);
      handled.add("name");

      const developer = data["author"];
      if (developer) {
        const devEl = document.createElement("div"); devEl.className = "app-store-developer";
        devEl.textContent = developer;
        appMeta.appendChild(devEl);
        handled.add("author");
      }

      const category = data["applicationCategory"];
      if (category) {
        const catEl = document.createElement("div"); catEl.className = "app-store-category";
        catEl.textContent = category;
        appMeta.appendChild(catEl);
        handled.add("applicationCategory");
      }

      appHeader.appendChild(appMeta);
      heroMount.appendChild(appHeader);

      // Rating + GET row
      const actionRow = document.createElement("div"); actionRow.className = "app-store-action-row";

      const aggRating = data["aggregateRating"];
      if (aggRating !== undefined) {
        const rval = typeof aggRating === "object" ? aggRating.ratingValue : aggRating;
        const rcnt = typeof aggRating === "object" ? aggRating.reviewCount : null;
        const r = formatRating(rval, "aggregateRating");
        if (r) {
          const ratingEl = document.createElement("div"); ratingEl.className = "app-store-rating";
          let stars = "";
          for (let i = 0; i < r.full; i++) stars += "★";
          if (r.half) stars += "½";
          for (let i = 0; i < r.empty; i++) stars += "☆";
          const starsSpan = document.createElement("span"); starsSpan.className = "app-store-stars"; starsSpan.textContent = stars;
          const scoreSpan = document.createElement("span"); scoreSpan.className = "app-store-score"; scoreSpan.textContent = parseFloat(rval).toFixed(1);
          ratingEl.append(starsSpan, scoreSpan);
          if (rcnt) {
            const countSpan = document.createElement("span"); countSpan.className = "app-store-review-count";
            const n = parseInt(rcnt);
            countSpan.textContent = isNaN(n) ? rcnt : (n >= 1000 ? Math.round(n / 1000) + "K" : n) + " ratings";
            ratingEl.appendChild(countSpan);
          }
          actionRow.appendChild(ratingEl);
        }
        handled.add("aggregateRating");
      }

      // GET button
      const offerPrice = data["offers"] && data["offers"].price;
      const isFree = offerPrice === "0" || offerPrice === 0 || String(offerPrice) === "0";
      const getBtn = document.createElement("button"); getBtn.className = "app-store-get-btn";
      getBtn.textContent = isFree ? "GET" : (offerPrice ? "$" + offerPrice : "GET");
      if (isFree) {
        const freeLabel = document.createElement("span"); freeLabel.className = "app-store-get-sub"; freeLabel.textContent = "Free";
        getBtn.innerHTML = ""; getBtn.appendChild(document.createTextNode("GET"));
        getBtn.insertAdjacentHTML("beforeend", '<span class="app-store-get-sub">Free</span>');
      }
      getBtn.type = "button";
      actionRow.appendChild(getBtn);
      handled.add("offers");

      view.appendChild(actionRow);

      // OS + version + size chips
      const chipItems = [];
      const os = data["operatingSystem"];
      if (os) chipItems.push({ icon: "\u{1F4F1}", val: os, prop: "operatingSystem" });
      const ver = data["version"];
      if (ver) chipItems.push({ icon: "v", val: ver, prop: "version" });
      const size = data["fileSize"];
      if (size) chipItems.push({ icon: "\u{1F4BE}", val: size, prop: "fileSize" });

      if (chipItems.length) {
        const chips = document.createElement("div"); chips.className = "app-store-chips";
        chipItems.forEach(c => {
          const chip = document.createElement("span"); chip.className = "app-store-chip";
          chip.innerHTML = "<span class=\"app-chip-icon\">" + c.icon + "</span>" + c.val;
          chips.appendChild(chip);
          handled.add(c.prop);
        });
        view.appendChild(chips);
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const descEl = document.createElement("div"); descEl.className = "app-store-desc";
        descEl.textContent = desc;
        view.appendChild(descEl);
        handled.add("description");
      }

      // Store link CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "app-store-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "View in App Store <span>↗</span>";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── VIDEOOBJECT (YouTube-style video card) ──
    if (cfg.type === "VideoObject") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("video-card");

      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Rebuild hero as video thumbnail with play overlay
      const heroMount = document.getElementById("hero-mount");
      if (heroMount.querySelector(".hero")) heroMount.querySelector(".hero").remove();

      const thumbWrap = document.createElement("div"); thumbWrap.className = "video-thumb";
      const imgUrl = data["image"];
      if (imgUrl) {
        const img = document.createElement("img"); img.src = imgUrl; img.alt = data[cfg.titleProp] || "";
        img.className = "video-thumb-img"; img.loading = "lazy";
        thumbWrap.appendChild(img);
        handled.add("image");
      }

      // Dark scrim
      const scrim = document.createElement("div"); scrim.className = "video-scrim";
      thumbWrap.appendChild(scrim);

      // Play button
      const play = document.createElement("div"); play.className = "video-play";
      play.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      thumbWrap.appendChild(play);

      // Duration badge
      const dur = data["duration"];
      if (dur) {
        const d = formatDuration(dur);
        if (d) {
          const badge = document.createElement("span"); badge.className = "video-duration";
          badge.textContent = d;
          thumbWrap.appendChild(badge);
        }
        handled.add("duration");
      }

      heroMount.appendChild(thumbWrap);

      // Title
      const h1 = document.createElement("h1"); h1.className = "video-title";
      h1.textContent = data[cfg.titleProp] || "";
      view.appendChild(h1);
      handled.add("name");

      // Meta: upload date
      const uploadDate = data["uploadDate"];
      if (uploadDate) {
        const d = formatDate(uploadDate);
        const meta = document.createElement("div"); meta.className = "video-meta";
        meta.textContent = d || uploadDate;
        view.appendChild(meta);
        handled.add("uploadDate");
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const descEl = document.createElement("div"); descEl.className = "video-desc";
        descEl.textContent = desc;
        view.appendChild(descEl);
        handled.add("description");
      }

      // Watch CTA
      const url = data["contentUrl"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "video-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg> Watch Now';
        view.appendChild(cta);
        handled.add("contentUrl");
      }
    }

    // ── TOURISTATTRACTION (Tripadvisor-style travel card) ──
    if (cfg.type === "TouristAttraction") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("travel-card");

      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Full-bleed hero with overlay
      const heroMount = document.getElementById("hero-mount");
      if (heroMount.querySelector(".hero")) heroMount.querySelector(".hero").remove();

      const hero = document.createElement("div"); hero.className = "travel-hero";
      const imgUrl = data["image"];
      if (imgUrl) {
        const img = document.createElement("img"); img.src = imgUrl; img.alt = data[cfg.titleProp] || "";
        img.className = "travel-hero-img"; img.loading = "lazy";
        hero.appendChild(img);
        handled.add("image");
      }

      const scrim = document.createElement("div"); scrim.className = "travel-scrim";
      hero.appendChild(scrim);

      const overlay = document.createElement("div"); overlay.className = "travel-overlay";
      const h1 = document.createElement("h1"); h1.className = "travel-name";
      h1.textContent = data[cfg.titleProp] || "";
      overlay.appendChild(h1);
      handled.add("name");

      const addr = data["address"];
      if (addr) {
        const loc = document.createElement("div"); loc.className = "travel-location";
        loc.innerHTML = "📍 " + addr;
        overlay.appendChild(loc);
        handled.add("address");
      }

      hero.appendChild(overlay);
      heroMount.appendChild(hero);

      // "Best for" tag chips
      const bestFor = data["touristType"];
      if (bestFor) {
        const tags = document.createElement("div"); tags.className = "travel-tags";
        bestFor.split(/,\s*/).forEach(t => {
          const chip = document.createElement("span"); chip.className = "travel-tag";
          chip.textContent = t.trim();
          tags.appendChild(chip);
        });
        view.appendChild(tags);
        handled.add("touristType");
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const descEl = document.createElement("div"); descEl.className = "travel-desc";
        descEl.textContent = desc;
        view.appendChild(descEl);
        handled.add("description");
      }

      // Directions CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "travel-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "🗺️ Plan Your Visit →";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── HOWTO (developer tutorial card) ──
    if (cfg.type === "HowTo") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("howto-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Skip hero for HowTo — clean tutorial card

      // Title
      const title = data[cfg.titleProp];
      if (title) {
        const h1 = document.createElement("h1"); h1.className = "howto-title";
        h1.textContent = title;
        view.appendChild(h1);
        handled.add(cfg.titleProp);
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const d = document.createElement("p"); d.className = "howto-desc";
        d.textContent = desc;
        view.appendChild(d);
        handled.add("description");
      }

      // Stats strip: time + tools
      const strip = document.createElement("div"); strip.className = "howto-stats";
      const total = data["totalTime"];
      if (total) {
        const chip = document.createElement("span"); chip.className = "howto-stat-chip";
        chip.innerHTML = "\u{23F1}\uFE0F " + (formatDuration(total) || total);
        strip.appendChild(chip);
        handled.add("totalTime");
      }
      const tools = data["tool"];
      if (tools) {
        tools.split(",").forEach(t => {
          t = t.trim();
          if (!t) return;
          const chip = document.createElement("span"); chip.className = "howto-stat-chip howto-tool-chip";
          chip.textContent = "\u{1F527} " + t;
          strip.appendChild(chip);
        });
        handled.add("tool");
      }
      if (strip.children.length) view.appendChild(strip);

      // Steps (split on ·)
      const steps = data["step"];
      if (steps) {
        const section = document.createElement("div"); section.className = "howto-steps-section";
        const label = document.createElement("div"); label.className = "howto-section-label";
        label.textContent = "Steps";
        section.appendChild(label);
        const ol = document.createElement("ol"); ol.className = "step-list";
        steps.split("\u00b7").forEach(s => {
          s = s.trim();
          if (!s) return;
          const li = document.createElement("li"); li.className = "step-item";
          li.textContent = s;
          ol.appendChild(li);
        });
        section.appendChild(ol);
        view.appendChild(section);
        handled.add("step");
      }
    }

    // ── HOTEL (Booking.com card) ──
    if (cfg.type === "Hotel") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("hotel-card");

      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Hero with name + stars overlay
      const hm = document.getElementById("hero-mount");
      const oldHotelHero = hm && hm.querySelector(".hero");
      if (oldHotelHero) oldHotelHero.remove();
      const img = data["image"];
      if (img && hm) {
        const heroImg = document.createElement("img");
        heroImg.src = img; heroImg.alt = ""; heroImg.className = "hero hotel-hero";
        hm.appendChild(heroImg);
        // Scrim + overlay
        const scrim = document.createElement("div"); scrim.className = "hotel-hero-scrim";
        const overlay = document.createElement("div"); overlay.className = "hotel-hero-overlay";
        const title = data[cfg.titleProp];
        if (title) {
          const h1 = document.createElement("h1"); h1.className = "hotel-name";
          h1.textContent = title;
          overlay.appendChild(h1);
          handled.add(cfg.titleProp);
        }
        const stars = data["starRating"];
        if (stars) {
          const badge = document.createElement("span"); badge.className = "hotel-stars-badge";
          badge.innerHTML = "\u2B50".repeat(parseInt(stars) || 0) + " " + stars + "/5";
          overlay.appendChild(badge);
          handled.add("starRating");
        }
        scrim.appendChild(overlay);
        hm.appendChild(scrim);
      }
      handled.add("image");

      // Price range badge
      const price = data["priceRange"];
      if (price) {
        const strip = document.createElement("div"); strip.className = "hotel-meta-strip";
        const chip = document.createElement("span"); chip.className = "hotel-price-badge";
        chip.textContent = price;
        strip.appendChild(chip);
        // Check-in / Check-out chips
        const ci = data["checkinTime"];
        const co = data["checkoutTime"];
        if (ci) {
          const c = document.createElement("span"); c.className = "hotel-time-chip";
          c.innerHTML = "\u{1F3E6} Check-in " + ci;
          strip.appendChild(c);
          handled.add("checkinTime");
        }
        if (co) {
          const c = document.createElement("span"); c.className = "hotel-time-chip";
          c.innerHTML = "\u{1F513} Check-out " + co;
          strip.appendChild(c);
          handled.add("checkoutTime");
        }
        view.appendChild(strip);
        handled.add("priceRange");
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const d = document.createElement("p"); d.className = "hotel-desc";
        d.textContent = desc;
        view.appendChild(d);
        handled.add("description");
      }

      // Contact row: address + phone + url
      const contact = document.createElement("div"); contact.className = "hotel-contact";
      const addr = data["address"];
      if (addr) {
        const r = document.createElement("span"); r.className = "hotel-contact-row";
        r.innerHTML = "\u{1F4CD} " + addr;
        contact.appendChild(r);
        handled.add("address");
      }
      const phone = data["telephone"];
      if (phone) {
        const r = document.createElement("span"); r.className = "hotel-contact-row";
        r.innerHTML = "\u{1F4DE} " + phone;
        contact.appendChild(r);
        handled.add("telephone");
      }
      if (contact.children.length) view.appendChild(contact);

      // Website link
      const url = data["url"];
      if (url) {
        const r = document.createElement("span"); r.className = "hotel-contact-row";
        r.innerHTML = "\u{1F517} " + url;
        contact.appendChild(r);
        handled.add("url");
      }

      // Book Now CTA
      const cta = document.createElement("a"); cta.className = "hotel-cta";
      cta.href = url || "#"; cta.target = "_blank"; cta.rel = "noopener";
      cta.textContent = "Book Now \u2192";
      view.appendChild(cta);
    }

    // ── LOCALBUSINESS (Google Maps card) ──
    if (cfg.type === "LocalBusiness") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("local-biz");

      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Hero
      const hm = document.getElementById("hero-mount");
      const oldBizHero = hm && hm.querySelector(".hero");
      if (oldBizHero) oldBizHero.remove();
      const img = data["image"];
      if (img && hm) {
        const heroImg = document.createElement("img");
        heroImg.src = img; heroImg.alt = ""; heroImg.className = "hero";
        hm.appendChild(heroImg);
      }
      handled.add("image");

      // Name
      const title = data[cfg.titleProp];
      if (title) {
        const h1 = document.createElement("h1"); h1.className = "biz-name";
        h1.textContent = title;
        view.appendChild(h1);
        handled.add(cfg.titleProp);
      }

      // Opening hours badge
      const hours = data["openingHours"];
      if (hours) {
        const badge = document.createElement("div"); badge.className = "biz-hours-badge";
        badge.innerHTML = "\u{1F552} " + hours;
        view.appendChild(badge);
        handled.add("openingHours");
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const d = document.createElement("p"); d.className = "biz-desc";
        d.textContent = desc;
        view.appendChild(d);
        handled.add("description");
      }

      // Info chips: price range + phone + address
      const info = document.createElement("div"); info.className = "biz-info";
      const price = data["priceRange"];
      if (price) {
        const chip = document.createElement("span"); chip.className = "biz-chip";
        chip.textContent = price;
        info.appendChild(chip);
        handled.add("priceRange");
      }
      const phone = data["telephone"];
      if (phone) {
        const row = document.createElement("div"); row.className = "biz-contact-row";
        row.innerHTML = "\u{1F4DE} " + phone;
        info.appendChild(row);
        handled.add("telephone");
      }
      const addr = data["address"];
      if (addr) {
        const row = document.createElement("div"); row.className = "biz-contact-row";
        row.innerHTML = "\u{1F4CD} " + addr;
        info.appendChild(row);
        handled.add("address");
      }
      if (info.children.length) view.appendChild(info);

      // CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "biz-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.textContent = "Visit Website \u2192";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── PODCASTSERIES (Spotify podcast card) ──
    if (cfg.type === "PodcastSeries") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("podcast-card");

      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Cover art — no hero, use a dedicated square cover
      const podHm = document.getElementById("hero-mount");
      const oldPodHero = podHm && podHm.querySelector(".hero");
      if (oldPodHero) oldPodHero.remove();
      const img = data["image"];
      if (img) {
        const wrap = document.createElement("div"); wrap.className = "podcast-cover-wrap";
        const cover = document.createElement("img"); cover.src = img; cover.alt = ""; cover.className = "podcast-cover";
        wrap.appendChild(cover);
        view.appendChild(wrap);
        handled.add("image");
      }

      // Name
      const title = data[cfg.titleProp];
      if (title) {
        const h1 = document.createElement("h1"); h1.className = "podcast-title";
        h1.textContent = title;
        view.appendChild(h1);
        handled.add(cfg.titleProp);
      }

      // Host
      const author = data["author"];
      if (author) {
        const host = document.createElement("div"); host.className = "podcast-host";
        host.innerHTML = "Hosted by <strong>" + author + "</strong>";
        view.appendChild(host);
        handled.add("author");
      }

      // Genre chips
      const genre = data["genre"];
      if (genre) {
        const chips = document.createElement("div"); chips.className = "podcast-genres";
        genre.split(",").forEach(g => {
          const chip = document.createElement("span"); chip.className = "podcast-genre-chip";
          chip.textContent = g.trim();
          chips.appendChild(chip);
        });
        view.appendChild(chips);
        handled.add("genre");
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const d = document.createElement("p"); d.className = "podcast-desc";
        d.textContent = desc;
        view.appendChild(d);
        handled.add("description");
      }

      // Since
      const since = data["startDate"];
      if (since) {
        const s = document.createElement("div"); s.className = "podcast-since";
        s.textContent = "Since " + since;
        view.appendChild(s);
        handled.add("startDate");
      }

      // Listen CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "podcast-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.textContent = "\u{1F3A4} Listen Now";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── FAQPAGE (Accordion card) ──
    if (cfg.type === "FAQPage") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("faq-card");

      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Title
      const title = data[cfg.titleProp];
      if (title) {
        const h1 = document.createElement("h1"); h1.className = "faq-title";
        h1.textContent = title;
        view.appendChild(h1);
        handled.add(cfg.titleProp);
      }

      // Description
      const desc = data["description"];
      if (desc) {
        const d = document.createElement("p"); d.className = "faq-desc";
        d.textContent = desc;
        view.appendChild(d);
        handled.add("description");
      }

      // Accordion from mainEntity
      const entities = data["mainEntity"];
      if (Array.isArray(entities)) {
        const section = document.createElement("div"); section.className = "faq-accordion";
        entities.forEach((q, i) => {
          const details = document.createElement("details"); details.className = "faq-item";
          if (i === 0) details.setAttribute("open", "");
          const summary = document.createElement("summary"); summary.className = "faq-question";
          summary.textContent = q.name || "";
          details.appendChild(summary);
          const answer = document.createElement("div"); answer.className = "faq-answer";
          const text = (q.acceptedAnswer && q.acceptedAnswer.text) || "";
          answer.textContent = text;
          details.appendChild(answer);
          section.appendChild(details);
        });
        view.appendChild(section);
      }
      handled.add("mainEntity");
    }

    // ── TICKET (tear-off stub) ──
    if (cfg.type === "Ticket") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("ticket-stub");

      // Hide normal header — we build our own
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector(".hero")?.remove();

      // ── Stub layout ──
      const stub = document.createElement("div"); stub.className = "ticket-layout";

      // Left: main ticket body
      const main = document.createElement("div"); main.className = "ticket-main";

      // Event name as big title
      const eventName = data["name"] || "";
      if (eventName) {
        const h1 = document.createElement("h1"); h1.className = "ticket-event";
        h1.textContent = eventName;
        main.appendChild(h1);
      }

      // Description as subtitle
      const desc = data["description"];
      if (desc) {
        const p = document.createElement("p"); p.className = "ticket-desc";
        p.textContent = desc;
        main.appendChild(p);
      }

      // Meta grid: attendee + issued date
      const metaGrid = document.createElement("div"); metaGrid.className = "ticket-meta-grid";
      const underName = data["underName"];
      if (underName) {
        const cell = document.createElement("div"); cell.className = "ticket-meta-cell";
        cell.innerHTML = "<small>Attendee</small><span>" + underName + "</span>";
        metaGrid.appendChild(cell);
      }
      const dateIssued = data["dateIssued"];
      if (dateIssued) {
        const cell = document.createElement("div"); cell.className = "ticket-meta-cell";
        const d = new Date(dateIssued);
        const formatted = isNaN(d.getTime()) ? dateIssued : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        cell.innerHTML = "<small>Issued</small><span>" + formatted + "</span>";
        metaGrid.appendChild(cell);
      }
      if (metaGrid.children.length) main.appendChild(metaGrid);

      // ── Perforation divider ──
      const perf = document.createElement("div"); perf.className = "ticket-perf";
      const notchL = document.createElement("span"); notchL.className = "ticket-notch";
      const notchR = document.createElement("span"); notchR.className = "ticket-notch";
      perf.append(notchL, notchR);

      // ── Right: stub side ──
      const side = document.createElement("div"); side.className = "ticket-side";

      // Ticket number in monospace
      const ticketNum = data["ticketNumber"];
      if (ticketNum) {
        const numEl = document.createElement("div"); numEl.className = "ticket-number";
        numEl.textContent = ticketNum;
        side.appendChild(numEl);
      }

      // Price badge
      const totalPrice = data["totalPrice"];
      const priceCurrency = data["priceCurrency"];
      if (totalPrice) {
        const priceEl = document.createElement("div"); priceEl.className = "ticket-price-badge";
        const currencySymbol = priceCurrency === "CZK" ? "Kč" : (priceCurrency || "");
        priceEl.innerHTML = "<span class=\"ticket-price-val\">" + totalPrice + "</span><span class=\"ticket-price-cur\"> " + currencySymbol + "</span>";
        side.appendChild(priceEl);
      }

      // ADMIT ONE label
      const admit = document.createElement("div"); admit.className = "ticket-admit";
      admit.textContent = "ADMIT ONE";
      side.appendChild(admit);

      // Icon watermark
      const watermark = document.createElement("div"); watermark.className = "ticket-watermark";
      watermark.textContent = cfg.icon || "🎟️";
      side.appendChild(watermark);

      stub.append(main, perf, side);
      view.appendChild(stub);

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("ticketNumber"); handled.add("underName"); handled.add("totalPrice");
      handled.add("priceCurrency"); handled.add("dateIssued");
    }

    // ── SOCIAL MEDIA POSTING (tweet card) ──
    if (cfg.type === "SocialMediaPosting") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("tweet-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector(".hero")?.remove();

      // Author header row: avatar + name/handle
      const header = document.createElement("div"); header.className = "tweet-header";

      // Avatar circle with initial
      const authorRaw = data["author"];
      const authorName = (typeof authorRaw === "object" && authorRaw !== null) ? (authorRaw.name || "") : (authorRaw || "");
      const initial = authorName ? authorName.charAt(0).toUpperCase() : "?";
      const avatar = document.createElement("div"); avatar.className = "tweet-avatar";
      avatar.textContent = initial;
      header.appendChild(avatar);

      // Name + handle
      const nameBlock = document.createElement("div"); nameBlock.className = "tweet-name-block";
      const nameEl = document.createElement("span"); nameEl.className = "tweet-author-name";
      nameEl.textContent = authorName;
      const handle = document.createElement("span"); handle.className = "tweet-handle";
      // Derive a pseudo-handle from the name
      const pseudoHandle = authorName ? "@" + authorName.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "") : "@unknown";
      handle.textContent = pseudoHandle;
      nameBlock.append(nameEl, handle);
      header.appendChild(nameBlock);

      // Icon badge top-right
      const iconBadge = document.createElement("span"); iconBadge.className = "tweet-icon-badge";
      iconBadge.textContent = cfg.icon || "💬";
      header.appendChild(iconBadge);

      view.appendChild(header);

      // Post body — large, tweet-style
      const body = data["articleBody"];
      if (body) {
        const postText = document.createElement("div"); postText.className = "tweet-body";
        postText.textContent = body;
        view.appendChild(postText);
      }

      // Image (if present) as inline media
      const imgUrl = data["image"];
      if (imgUrl) {
        const mediaWrap = document.createElement("div"); mediaWrap.className = "tweet-media";
        const img = document.createElement("img"); img.src = imgUrl; img.alt = data["name"] || "";
        img.loading = "lazy";
        mediaWrap.appendChild(img);
        view.appendChild(mediaWrap);
      }

      // Timestamp
      const datePub = data["datePublished"];
      if (datePub) {
        const d = new Date(datePub);
        const formatted = isNaN(d.getTime()) ? datePub : d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", year: "numeric" });
        const timeEl = document.createElement("div"); timeEl.className = "tweet-time";
        timeEl.textContent = formatted;
        view.appendChild(timeEl);
      }

      // Action icons row (non-functional, decorative)
      const actions = document.createElement("div"); actions.className = "tweet-actions";
      const acts = [
        { icon: "\u{1F4AC}", label: "Reply" },
        { icon: "\u{1F504}", label: "Repost" },
        { icon: "\u2764\uFE0F", label: "Like" },
        { icon: "\u{1F4E4}", label: "Share" }
      ];
      acts.forEach(a => {
        const btn = document.createElement("span"); btn.className = "tweet-action";
        btn.innerHTML = "<span class=\"tweet-action-icon\">" + a.icon + "</span>";
        btn.setAttribute("title", a.label);
        actions.appendChild(btn);
      });
      view.appendChild(actions);

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("articleBody"); handled.add("author"); handled.add("datePublished"); handled.add("url");
    }

    // ── QUOTATION (typographic quote poster) ──
    if (cfg.type === "Quotation") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("quote-poster");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector(".hero")?.remove();

      // Huge opening quotation mark
      const mark = document.createElement("div"); mark.className = "quote-mark";
      mark.textContent = "\u201C";
      view.appendChild(mark);

      // The quotation text — large serif italic
      const text = data["text"];
      if (text) {
        const q = document.createElement("blockquote"); q.className = "quote-text";
        q.textContent = text;
        view.appendChild(q);
      }

      // Attribution line: em-dash + author in small-caps
      const authorRaw = data["author"];
      const authorName = (typeof authorRaw === "object" && authorRaw !== null) ? (authorRaw.name || "") : (authorRaw || "");
      if (authorName) {
        const attr = document.createElement("div"); attr.className = "quote-attribution";
        attr.textContent = "\u2014 " + authorName;
        view.appendChild(attr);
      }

      // Subtle date below attribution
      const dateCreated = data["dateCreated"];
      if (dateCreated) {
        const d = new Date(dateCreated);
        const year = isNaN(d.getTime()) ? dateCreated : d.getFullYear().toString();
        const dateEl = document.createElement("div"); dateEl.className = "quote-date";
        dateEl.textContent = year;
        view.appendChild(dateEl);
      }

      // Description as a small footnote
      const desc = data["description"];
      if (desc) {
        const fn = document.createElement("p"); fn.className = "quote-footnote";
        fn.textContent = desc;
        view.appendChild(fn);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("text"); handled.add("author"); handled.add("dateCreated");
    }

    // ── FLIGHT (boarding pass) ──
    if (cfg.type === "Flight") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("boarding-pass");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector(".hero")?.remove();

      // Helper: extract IATA code from string like "Name (CODE)"
      const extractCode = (s) => { const m = (s || "").match(/\(([A-Z]{3})\)/); return m ? m[1] : s; };
      const extractCity = (s) => { const m = (s || "").match(/^(.+?)\s*\([A-Z]{3}\)/); return m ? m[1].trim() : s; };

      // Top strip: airline + flight number
      const strip = document.createElement("div"); strip.className = "bp-strip";
      const airline = data["provider"] || "";
      const flightNum = data["flightNumber"] || "";
      strip.innerHTML = "<span class=\"bp-airline\">" + airline + "</span><span class=\"bp-flight-num\">" + flightNum + "</span>";
      view.appendChild(strip);

      // Route section: DEPARTURE → ARRIVAL
      const route = document.createElement("div"); route.className = "bp-route";

      const depCode = extractCode(data["departureAirport"]);
      const depCity = extractCity(data["departureAirport"]);
      const depTime = data["departureTime"] || "";

      const arrCode = extractCode(data["arrivalAirport"]);
      const arrCity = extractCity(data["arrivalAirport"]);
      const arrTime = data["arrivalTime"] || "";

      // Departure column
      const depCol = document.createElement("div"); depCol.className = "bp-airport-col";
      depCol.innerHTML = "<div class=\"bp-code\">" + depCode + "</div><div class=\"bp-city\">" + depCity + "</div><div class=\"bp-time\">" + depTime + "</div>";
      route.appendChild(depCol);

      // Plane arrow in the middle
      const arrow = document.createElement("div"); arrow.className = "bp-arrow";
      arrow.innerHTML = "<span class=\"bp-plane\">\u2708\uFE0F</span><div class=\"bp-dots\"></div>";
      route.appendChild(arrow);

      // Arrival column
      const arrCol = document.createElement("div"); arrCol.className = "bp-airport-col";
      arrCol.innerHTML = "<div class=\"bp-code\">" + arrCode + "</div><div class=\"bp-city\">" + arrCity + "</div><div class=\"bp-time\">" + arrTime + "</div>";
      route.appendChild(arrCol);

      view.appendChild(route);

      // Dashed tear line
      const tear = document.createElement("div"); tear.className = "bp-tear";
      const notchL = document.createElement("span"); notchL.className = "bp-notch";
      const notchR = document.createElement("span"); notchR.className = "bp-notch";
      tear.append(notchL, notchR);
      view.appendChild(tear);

      // Bottom: barcode strip + description
      const bottom = document.createElement("div"); bottom.className = "bp-bottom";

      // Fake barcode via CSS
      const barcode = document.createElement("div"); barcode.className = "bp-barcode";
      bottom.appendChild(barcode);

      // Description as small text
      const desc = data["description"];
      if (desc) {
        const descEl = document.createElement("p"); descEl.className = "bp-desc";
        descEl.textContent = desc;
        bottom.appendChild(descEl);
      }

      view.appendChild(bottom);

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("flightNumber"); handled.add("provider");
      handled.add("departureAirport"); handled.add("arrivalAirport");
      handled.add("departureTime"); handled.add("arrivalTime");
    }

    // ── PARCEL DELIVERY (tracking card) ──
    if (cfg.type === "ParcelDelivery") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("tracking-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector(".hero")?.remove();

      // Tracking number header
      const trackHead = document.createElement("div"); trackHead.className = "trk-head";
      const trackNum = data["trackingNumber"] || "";
      const courier = data["provider"] || "";
      trackHead.innerHTML = "<div class=\"trk-label\">Tracking Number</div><div class=\"trk-number\">" + trackNum + "</div><div class=\"trk-courier\">" + courier + "</div>";
      view.appendChild(trackHead);

      // Expected arrival — big date
      const expected = data["expectedArrivalUntil"];
      if (expected) {
        const d = new Date(expected);
        const formatted = isNaN(d.getTime()) ? expected : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
        const timeStr = isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const expEl = document.createElement("div"); expEl.className = "trk-expected";
        expEl.innerHTML = "<span class=\"trk-exp-label\">Estimated Delivery</span><span class=\"trk-exp-date\">" + formatted + "</span><span class=\"trk-exp-time\">by " + timeStr + "</span>";
        view.appendChild(expEl);
      }

      // Vertical progress timeline
      const timeline = document.createElement("div"); timeline.className = "trk-timeline";
      const steps = [
        { label: "Dispatched", icon: "\u{1F4E6}", detail: "Alza.cz, Jirny" },
        { label: "In Transit", icon: "\u{1F69A}", detail: "Sorting hub, Plze\u0148" },
        { label: "Out for Delivery", icon: "\u{1F4EC}", detail: "Prague 2" },
        { label: "Delivered", icon: "\u2705", detail: "" }
      ];
      const currentStep = 2; // "Out for delivery"
      steps.forEach((step, i) => {
        const row = document.createElement("div"); row.className = "trk-step";
        if (i <= currentStep) row.classList.add("trk-done");
        if (i === currentStep) row.classList.add("trk-current");
        // Dot / check
        const dot = document.createElement("div"); dot.className = "trk-dot";
        if (i < currentStep) dot.innerHTML = "\u2705";
        else if (i === currentStep) dot.innerHTML = step.icon;
        else dot.textContent = (i + 1);
        // Content
        const content = document.createElement("div"); content.className = "trk-step-content";
        content.innerHTML = "<div class=\"trk-step-label\">" + step.label + "</div>" + (step.detail ? "<div class=\"trk-step-detail\">" + step.detail + "</div>" : "");
        // Line connector (not on last)
        row.append(dot, content);
        if (i < steps.length - 1) {
          const line = document.createElement("div"); line.className = "trk-line";
          if (i < currentStep) line.classList.add("trk-line-done");
          row.appendChild(line);
        }
        timeline.appendChild(row);
      });
      view.appendChild(timeline);

      // Bottom info: item + destination
      const info = document.createElement("div"); info.className = "trk-info";
      const item = data["itemShipped"] || "";
      const addr = data["deliveryAddress"] || "";
      if (item) info.innerHTML += "<div class=\"trk-info-row\"><span class=\"trk-info-label\">Item</span><span>" + item + "</span></div>";
      if (addr) info.innerHTML += "<div class=\"trk-info-row\"><span class=\"trk-info-label\">Deliver to</span><span>" + addr + "</span></div>";
      view.appendChild(info);

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("trackingNumber"); handled.add("provider");
      handled.add("expectedArrivalUntil"); handled.add("itemShipped"); handled.add("deliveryAddress");
    }

    // ── MENU (elegant restaurant menu typography) ──
    if (cfg.type === "Menu") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("menu-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Centered restaurant name in serif ──
      const provider = data["provider"];
      const providerName = (typeof provider === "object" && provider !== null) ? (provider.name || "") : (provider || "");

      if (providerName) {
        const restName = document.createElement("div"); restName.className = "menu-rest-name";
        restName.textContent = providerName;
        view.appendChild(restName);
      }

      // Thin double rule
      const rule = document.createElement("div"); rule.className = "menu-rule";
      view.appendChild(rule);

      // Menu title in elegant serif italic
      const title = data[cfg.titleProp];
      if (title) {
        const menuTitle = document.createElement("div"); menuTitle.className = "menu-title";
        menuTitle.textContent = title;
        view.appendChild(menuTitle);
      }

      // Description as intro paragraph in italic
      const desc = data["description"];
      if (desc) {
        const intro = document.createElement("div"); intro.className = "menu-intro";
        intro.textContent = desc;
        view.appendChild(intro);
      }

      // ── Menu sections as centered small-caps headings with dot-leader feel ──
      const sections = data["hasMenuSection"];
      if (sections) {
        const items = typeof sections === "string" ? sections.split(/,\s*/) : (Array.isArray(sections) ? sections : [sections]);
        const sectionsWrap = document.createElement("div"); sectionsWrap.className = "menu-sections";
        items.forEach(s => {
          s = (typeof s === "object" ? (s.name || "") : String(s)).trim();
          if (!s) return;
          const divider = document.createElement("div"); divider.className = "menu-section-divider";
          const heading = document.createElement("div"); heading.className = "menu-section-heading";
          heading.textContent = s;
          // Decorative dots
          const dots = document.createElement("div"); dots.className = "menu-section-dots";
          divider.appendChild(heading);
          divider.appendChild(dots);
          sectionsWrap.appendChild(divider);
        });
        view.appendChild(sectionsWrap);
      }

      // Second rule
      const rule2 = document.createElement("div"); rule2.className = "menu-rule";
      view.appendChild(rule2);

      // View Full Menu CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "menu-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.textContent = "View Full Menu →";
        view.appendChild(cta);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("hasMenuSection"); handled.add("provider"); handled.add("url");
    }

    // ── MEDICALCONDITION (trustworthy patient-info page) ──
    if (cfg.type === "MedicalCondition") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("health-info");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Calm header with soft teal ──
      const hiHeader = document.createElement("div"); hiHeader.className = "hi-header";
      const hiIcon = document.createElement("div"); hiIcon.className = "hi-icon";
      hiIcon.textContent = "\u2695";
      hiHeader.appendChild(hiIcon);
      const title = data[cfg.titleProp];
      if (title) {
        const nameEl = document.createElement("div"); nameEl.className = "hi-title";
        nameEl.textContent = title;
        hiHeader.appendChild(nameEl);
      }
      view.appendChild(hiHeader);

      // ── Informational-only notice banner ──
      const notice = document.createElement("div"); notice.className = "hi-notice";
      notice.innerHTML = "<span class=\"hi-notice-icon\">\u2139\uFE0F</span> <span>This is informational only — not medical advice. Consult a physician.</span>";
      view.appendChild(notice);

      // ── Section helper ──
      const addSection = (label, text) => {
        if (!text) return;
        const sec = document.createElement("div"); sec.className = "hi-section";
        sec.innerHTML = "<div class=\"hi-section-label\">" + label + "</div><div class=\"hi-section-body\">" + text + "</div>";
        view.appendChild(sec);
      };

      // Symptoms
      addSection("Signs & Symptoms", data["signOrSymptom"]);
      // Anatomy
      addSection("Associated Anatomy", data["associatedAnatomy"]);
      // Treatment
      addSection("Possible Treatment", data["possibleTreatment"]);
      // Risk factors
      addSection("Risk Factors", data["riskFactor"]);

      // ── Description as overview ──
      const desc = data["description"];
      if (desc) {
        const overview = document.createElement("div"); overview.className = "hi-overview";
        overview.textContent = desc;
        view.appendChild(overview);
      }

      // ── Reviewed-date footer feel ──
      const footer = document.createElement("div"); footer.className = "hi-footer";
      footer.textContent = "For informational purposes only \u00b7 Not a substitute for professional medical advice";
      view.appendChild(footer);

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("associatedAnatomy"); handled.add("possibleTreatment");
      handled.add("riskFactor"); handled.add("signOrSymptom");
    }

    // ── EMAILMESSAGE (email client reading pane) ──
    if (cfg.type === "EmailMessage") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("email-pane");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Subject line big at top, date right-aligned ──
      const header = document.createElement("div"); header.className = "em-header";
      const subject = data[cfg.titleProp];
      if (subject) {
        const subjEl = document.createElement("div"); subjEl.className = "em-subject";
        subjEl.textContent = subject;
        header.appendChild(subjEl);
      }
      const dateSent = data["dateSent"];
      if (dateSent) {
        const d = formatDate(dateSent);
        const dateEl = document.createElement("div"); dateEl.className = "em-date";
        dateEl.textContent = d || dateSent;
        header.appendChild(dateEl);
      }
      view.appendChild(header);

      // ── From row with avatar initial circle ──
      const sender = data["sender"];
      const senderName = (typeof sender === "object" && sender !== null) ? (sender.name || "") : (sender || "");
      if (senderName) {
        const row = document.createElement("div"); row.className = "em-participant";
        const avatar = document.createElement("div"); avatar.className = "em-avatar";
        avatar.textContent = senderName.charAt(0).toUpperCase();
        const info = document.createElement("div"); info.className = "em-participant-info";
        info.innerHTML = "<div class=\"em-participant-role\">From</div><div class=\"em-participant-name\">" + senderName + "</div>";
        row.appendChild(avatar);
        row.appendChild(info);
        view.appendChild(row);
      }

      // ── To row ──
      const toRecipient = data["toRecipient"];
      const toName = (typeof toRecipient === "object" && toRecipient !== null) ? (toRecipient.name || "") : (toRecipient || "");
      if (toName) {
        const row = document.createElement("div"); row.className = "em-participant";
        const avatar = document.createElement("div"); avatar.className = "em-avatar em-avatar-to";
        avatar.textContent = toName.charAt(0).toUpperCase();
        const info = document.createElement("div"); info.className = "em-participant-info";
        info.innerHTML = "<div class=\"em-participant-role\">To</div><div class=\"em-participant-name\">" + toName + "</div>";
        row.appendChild(avatar);
        row.appendChild(info);
        view.appendChild(row);
      }

      // ── Divider ──
      const divider = document.createElement("div"); divider.className = "em-divider";
      view.appendChild(divider);

      // ── Email body (description) ──
      const desc = data["description"];
      if (desc) {
        const body = document.createElement("div"); body.className = "em-body";
        body.textContent = desc;
        view.appendChild(body);
      }

      // Excerpt as preview text
      const text = data["text"];
      if (text) {
        const excerpt = document.createElement("div"); excerpt.className = "em-excerpt";
        excerpt.textContent = text;
        view.appendChild(excerpt);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("sender"); handled.add("toRecipient"); handled.add("dateSent");
      handled.add("text");
    }

    // ── DATASET (open-data portal card) ──
    if (cfg.type === "Dataset") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("dataset-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Dataset name big ──
      const title = data[cfg.titleProp];
      if (title) {
        const nameEl = document.createElement("div"); nameEl.className = "ds-title";
        nameEl.textContent = title;
        view.appendChild(nameEl);
      }

      // ── Keyword chips ──
      const kw = data["keywords"];
      if (kw) {
        const tags = typeof kw === "string" ? kw.split(/,\s*/) : (Array.isArray(kw) ? kw : [kw]);
        const tagWrap = document.createElement("div"); tagWrap.className = "ds-tags";
        tags.forEach(t => {
          t = String(t).trim();
          if (!t) return;
          const chip = document.createElement("span"); chip.className = "ds-tag";
          chip.textContent = t;
          tagWrap.appendChild(chip);
        });
        view.appendChild(tagWrap);
      }

      // ── Metadata grid ──
      const metaGrid = document.createElement("div"); metaGrid.className = "ds-meta-grid";

      const creator = data["creator"];
      if (creator) {
        const cell = document.createElement("div"); cell.className = "ds-meta-cell";
        cell.innerHTML = "<div class=\"ds-meta-label\">Creator</div><div class=\"ds-meta-value\">" + creator + "</div>";
        metaGrid.appendChild(cell);
      }

      const datePub = data["datePublished"];
      if (datePub) {
        const d = formatDate(datePub);
        const cell = document.createElement("div"); cell.className = "ds-meta-cell";
        cell.innerHTML = "<div class=\"ds-meta-label\">Published</div><div class=\"ds-meta-value\">" + (d || datePub) + "</div>";
        metaGrid.appendChild(cell);
      }

      const lic = data["license"];
      if (lic) {
        const cell = document.createElement("div"); cell.className = "ds-meta-cell";
        const shortLic = lic.split("/").filter(Boolean).pop() || lic;
        cell.innerHTML = "<div class=\"ds-meta-label\">License</div><a class=\"ds-license-badge\" href=\"" + lic + "\" target=\"_blank\" rel=\"noopener\">" + shortLic + "</a>";
        metaGrid.appendChild(cell);
      }

      if (metaGrid.children.length) view.appendChild(metaGrid);

      // ── Description ──
      const desc = data["description"];
      if (desc) {
        const descEl = document.createElement("div"); descEl.className = "ds-desc";
        descEl.textContent = desc;
        view.appendChild(descEl);
      }

      // ── Download / API CTA ──
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "ds-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "<span class=\"ds-cta-icon\">\u2B07</span><span>Download Dataset</span>";
        view.appendChild(cta);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("creator"); handled.add("datePublished"); handled.add("license");
      handled.add("keywords"); handled.add("url");
    }

    // ── CAR (premium car listing) ──
    if (cfg.type === "Car") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("car-listing");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present, we'll build our own
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Photo hero ──
      const img = data["image"];
      if (img) {
        const hero = document.createElement("div"); hero.className = "car-hero";
        const imgEl = document.createElement("img"); imgEl.className = "car-hero-img";
        imgEl.src = img; imgEl.alt = data[cfg.titleProp] || "Car photo";
        imgEl.loading = "lazy";
        hero.appendChild(imgEl);
        // Brand badge overlay
        const brand = data["brand"];
        if (brand) {
          const badge = document.createElement("div"); badge.className = "car-brand-badge";
          badge.textContent = brand;
          hero.appendChild(badge);
        }
        view.appendChild(hero);
      }

      // ── Name big over price-style banner ──
      const title = data[cfg.titleProp];
      if (title) {
        const nameEl = document.createElement("div"); nameEl.className = "car-title";
        nameEl.textContent = title;
        view.appendChild(nameEl);
      }

      // ── Spec grid of labeled boxes ──
      const specItems = [];
      const year = data["vehicleModelDate"];
      if (year) specItems.push({ label: "Year", value: year });
      const fuel = data["fuelType"];
      if (fuel) specItems.push({ label: "Fuel", value: fuel });
      const colour = data["color"];
      if (colour) specItems.push({ label: "Colour", value: colour });
      const model = data["model"];
      if (model) specItems.push({ label: "Model", value: model });

      if (specItems.length) {
        const grid = document.createElement("div"); grid.className = "car-spec-grid";
        specItems.forEach(s => {
          const chip = document.createElement("div"); chip.className = "car-spec-chip";
          chip.innerHTML = "<div class=\"car-spec-label\">" + s.label + "</div><div class=\"car-spec-value\">" + s.value + "</div>";
          grid.appendChild(chip);
        });
        view.appendChild(grid);
      }

      // ── Description ──
      const desc = data["description"];
      if (desc) {
        const descEl = document.createElement("div"); descEl.className = "car-desc";
        descEl.textContent = desc;
        view.appendChild(descEl);
      }

      // ── View Advert CTA ──
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "car-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.textContent = "View Advert →";
        view.appendChild(cta);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("brand"); handled.add("model"); handled.add("vehicleModelDate");
      handled.add("fuelType"); handled.add("color"); handled.add("url");
    }

    // ── NEWSARTICLE (newspaper front page) ──
    if (cfg.type === "NewsArticle") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("front-page");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Masthead rule with dateline ──
      const masthead = document.createElement("div"); masthead.className = "fp-masthead";
      const rule = document.createElement("div"); rule.className = "fp-rule-top";
      masthead.appendChild(rule);

      const dateline = data["dateline"];
      const datePub = data["datePublished"];
      const author = data["author"];
      const metaParts = [];
      if (dateline) metaParts.push(dateline);
      if (datePub) { const d = formatDate(datePub); metaParts.push(d || datePub); }
      if (author) metaParts.push(author);
      if (metaParts.length) {
        const meta = document.createElement("div"); meta.className = "fp-dateline";
        meta.textContent = metaParts.join(" \u00b7 ");
        masthead.appendChild(meta);
      }
      const rule2 = document.createElement("div"); rule2.className = "fp-rule-bottom";
      masthead.appendChild(rule2);
      view.appendChild(masthead);

      // ── Huge serif headline ──
      const headline = data[cfg.titleProp];
      if (headline) {
        const h1 = document.createElement("h1"); h1.className = "fp-headline";
        h1.textContent = headline;
        view.appendChild(h1);
      }

      // ── Standfirst / lead in larger text ──
      const standfirst = data["description"];
      if (standfirst) {
        const lead = document.createElement("div"); lead.className = "fp-standfirst";
        lead.textContent = standfirst;
        view.appendChild(lead);
      }

      // ── Body in two CSS columns ──
      const body = data["articleBody"];
      if (body) {
        const bodyEl = document.createElement("div"); bodyEl.className = "fp-body";
        const paras = body.split(/\n\n+/);
        paras.forEach(p => {
          if (!p.trim()) return;
          const el = document.createElement("p");
          el.textContent = p.trim();
          bodyEl.appendChild(el);
        });
        view.appendChild(bodyEl);
      }

      // ── Byline in small caps ──
      if (author) {
        const byline = document.createElement("div"); byline.className = "fp-byline";
        byline.textContent = author;
        view.appendChild(byline);
      }

      // Source CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "fp-source";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.textContent = "Read Full Article \u2192";
        view.appendChild(cta);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("articleBody"); handled.add("author"); handled.add("datePublished");
      handled.add("dateline"); handled.add("url");
    }

    // ── INVOICE (real invoice document) ──
    if (cfg.type === "Invoice") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("invoice-doc");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── INVOICE header: big spaced caps + invoice number ──
      const invHeader = document.createElement("div"); invHeader.className = "inv-header";
      const invLabel = document.createElement("div"); invLabel.className = "inv-label";
      invLabel.textContent = "INVOICE";
      invHeader.appendChild(invLabel);

      const invNum = data["name"];
      if (invNum) {
        const numEl = document.createElement("div"); numEl.className = "inv-number";
        numEl.textContent = invNum;
        invHeader.appendChild(numEl);
      }
      view.appendChild(invHeader);

      // ── From / To two-column block ──
      const partiesRow = document.createElement("div"); partiesRow.className = "inv-parties";

      const provider = data["provider"];
      if (provider) {
        const from = document.createElement("div"); from.className = "inv-party";
        from.innerHTML = "<div class=\"inv-party-label\">From</div><div class=\"inv-party-name\">" + provider + "</div>";
        partiesRow.appendChild(from);
      }

      const customer = data["customer"];
      if (customer) {
        const to = document.createElement("div"); to.className = "inv-party";
        to.innerHTML = "<div class=\"inv-party-label\">To</div><div class=\"inv-party-name\">" + customer + "</div>";
        partiesRow.appendChild(to);
      }

      if (partiesRow.children.length) view.appendChild(partiesRow);

      // ── Amount due — HUGE ──
      const totalDue = data["totalPaymentDue"];
      if (totalDue) {
        const amountBlock = document.createElement("div"); amountBlock.className = "inv-amount-block";
        const amountLabel = document.createElement("div"); amountLabel.className = "inv-amount-label";
        amountLabel.textContent = "Amount Due";
        const amountVal = document.createElement("div"); amountVal.className = "inv-amount-val";
        amountVal.textContent = totalDue;
        amountBlock.appendChild(amountLabel);
        amountBlock.appendChild(amountVal);

        // Due date underneath
        const dueDate = data["paymentDueDate"];
        if (dueDate) {
          const d = formatDate(dueDate);
          const dueEl = document.createElement("div"); dueEl.className = "inv-due-date";
          dueEl.textContent = "Due " + (d || dueDate);
          amountBlock.appendChild(dueEl);
        }

        view.appendChild(amountBlock);
      }

      // ── Payment status — stamped pill ──
      const status = data["paymentStatus"];
      if (status) {
        const pill = document.createElement("div"); pill.className = "inv-status-stamp";
        const shortStatus = status.split("/").pop().replace("Payment", "");
        pill.textContent = shortStatus.toUpperCase();
        if (status.includes("Paid") || status.includes("Complete")) pill.classList.add("inv-status-paid");
        else if (status.includes("Due") || status.includes("Pending")) pill.classList.add("inv-status-due");
        else if (status.includes("Overdue") || status.includes("Cancelled")) pill.classList.add("inv-status-overdue");
        else pill.classList.add("inv-status-due");
        view.appendChild(pill);
      }

      // ── Description as notes ──
      const desc = data["description"];
      if (desc) {
        const notes = document.createElement("div"); notes.className = "inv-notes";
        const notesLabel = document.createElement("div"); notesLabel.className = "inv-notes-label";
        notesLabel.textContent = "Notes";
        const notesBody = document.createElement("div"); notesBody.className = "inv-notes-body";
        notesBody.textContent = desc;
        notes.appendChild(notesLabel);
        notes.appendChild(notesBody);
        view.appendChild(notes);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("totalPaymentDue"); handled.add("paymentDueDate");
      handled.add("paymentStatus");
      handled.add("provider"); handled.add("customer");
    }

    // ── ORDER (confirmation email card) ──
    if (cfg.type === "Order") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("order-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Confirmation header: big checkmark + title ──
      const confHeader = document.createElement("div"); confHeader.className = "order-conf-header";

      // Animated checkmark circle
      const checkCircle = document.createElement("div"); checkCircle.className = "order-check";
      checkCircle.innerHTML = "\u2713";
      confHeader.appendChild(checkCircle);

      // "Order Confirmed" label
      const confLabel = document.createElement("div"); confLabel.className = "order-conf-label";
      confLabel.textContent = "Order Confirmed";
      confHeader.appendChild(confLabel);

      // Order name as subtitle
      const orderName = data["name"];
      if (orderName) {
        const nameEl = document.createElement("div"); nameEl.className = "order-conf-name";
        nameEl.textContent = orderName;
        confHeader.appendChild(nameEl);
      }

      view.appendChild(confHeader);

      // ── Order number chip (monospace) ──
      const orderNum = data["orderNumber"];
      if (orderNum) {
        const chip = document.createElement("div"); chip.className = "order-number-chip";
        chip.textContent = orderNum;
        view.appendChild(chip);
      }

      // ── Status pill ──
      const status = data["orderStatus"];
      if (status) {
        const pill = document.createElement("div"); pill.className = "order-status-pill";
        // Extract short label from URL like https://schema.org/OrderProcessing
        const shortStatus = status.split("/").pop().replace("Order", "");
        pill.textContent = shortStatus;
        // Color by status
        if (status.includes("Delivered") || status.includes("Complete")) pill.classList.add("order-status-green");
        else if (status.includes("Cancelled")) pill.classList.add("order-status-red");
        else pill.classList.add("order-status-amber");
        view.appendChild(pill);
      }

      // ── Summary box: seller + date ──
      const summaryBox = document.createElement("div"); summaryBox.className = "order-summary-box";

      const seller = data["seller"];
      if (seller) {
        const row = document.createElement("div"); row.className = "order-summary-row";
        row.innerHTML = "<span class=\"order-summary-label\">Seller</span><span class=\"order-summary-value\">" + seller + "</span>";
        summaryBox.appendChild(row);
      }

      const orderDate = data["orderDate"];
      if (orderDate) {
        const d = formatDate(orderDate);
        const row = document.createElement("div"); row.className = "order-summary-row";
        row.innerHTML = "<span class=\"order-summary-label\">Date</span><span class=\"order-summary-value\">" + (d || orderDate) + "</span>";
        summaryBox.appendChild(row);
      }

      if (summaryBox.children.length) view.appendChild(summaryBox);

      // Description as a note
      const desc = data["description"];
      if (desc) {
        const note = document.createElement("div"); note.className = "order-note";
        note.textContent = desc;
        view.appendChild(note);
      }

      // Track Order CTA
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "order-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "<span class=\"order-cta-text\">Track Order</span><span class=\"order-cta-arrow\">\u2192</span>";
        view.appendChild(cta);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("orderNumber"); handled.add("orderStatus"); handled.add("orderDate");
      handled.add("seller"); handled.add("url");
    }

    // ── QUESTION (Stack Overflow Q&A card) ──
    if (cfg.type === "Question") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("qa-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero if present
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector(".hero")?.remove();

      // Stat chips row
      const stats = document.createElement("div"); stats.className = "qa-stats";
      const answers = data["answerCount"] || "0";
      const hasAccepted = !!data["acceptedAnswer"];
      stats.innerHTML = "<div class=\"qa-chip\"><span class=\"qa-chip-num\">" + answers + "</span><span class=\"qa-chip-label\">answers</span></div>" + (hasAccepted ? "<div class=\"qa-chip qa-chip-accepted\"><span class=\"qa-chip-num\">\u2713</span><span class=\"qa-chip-label\">accepted</span></div>" : "");
      view.appendChild(stats);

      // Question title
      const qTitle = data["name"];
      if (qTitle) {
        const h = document.createElement("h2"); h.className = "qa-title";
        h.textContent = qTitle;
        view.appendChild(h);
      }

      // Question body
      const qBody = data["text"];
      if (qBody) {
        const body = document.createElement("div"); body.className = "qa-body";
        body.textContent = qBody;
        view.appendChild(body);
      }

      // Author + date meta line
      const authorRaw = data["author"];
      const authorName = (typeof authorRaw === "object" && authorRaw !== null) ? (authorRaw.name || "") : (authorRaw || "");
      const dateCreated = data["dateCreated"];
      let dateStr = "";
      if (dateCreated) {
        const d = new Date(dateCreated);
        dateStr = isNaN(d.getTime()) ? dateCreated : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      }
      const meta = document.createElement("div"); meta.className = "qa-meta";
      meta.innerHTML = (authorName ? "asked by <strong>" + authorName + "</strong>" : "") + (dateStr ? " on " + dateStr : "");
      view.appendChild(meta);

      // Accepted answer panel
      const accepted = data["acceptedAnswer"];
      if (accepted) {
        const panel = document.createElement("div"); panel.className = "qa-accepted";
        panel.innerHTML = "<div class=\"qa-accepted-head\">\u2705 Accepted Answer</div><div class=\"qa-accepted-body\">" + accepted + "</div>";
        view.appendChild(panel);
      }

      handled.add("name"); handled.add("image"); handled.add("description");
      handled.add("text"); handled.add("author"); handled.add("dateCreated");
      handled.add("answerCount"); handled.add("acceptedAnswer");
    }

    // ── VIDEOGAME (Steam store page) ──
    if (cfg.type === "VideoGame") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("game-store");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero — we build our own banner
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Game art banner with title overlay ──
      const imgUrl = data["image"];
      if (imgUrl) {
        const banner = document.createElement("div"); banner.className = "gs-banner";
        const img = document.createElement("img"); img.className = "gs-banner-img";
        img.src = imgUrl; img.alt = data[cfg.titleProp] || "";
        img.loading = "lazy";
        banner.appendChild(img);

        // Scrim for legibility
        const scrim = document.createElement("div"); scrim.className = "gs-scrim";
        banner.appendChild(scrim);

        // Title overlay
        const titleOverlay = document.createElement("div"); titleOverlay.className = "gs-banner-overlay";
        const h1 = document.createElement("h1"); h1.className = "gs-title";
        h1.textContent = data[cfg.titleProp] || "";
        titleOverlay.appendChild(h1);

        // Release year + publisher as small meta inside banner
        const metaParts = [];
        const pub = data["publisher"];
        if (pub) metaParts.push(pub);
        const rel = data["datePublished"];
        if (rel) {
          const d = new Date(rel);
          const yr = isNaN(d.getTime()) ? rel : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
          metaParts.push(yr);
        }
        if (metaParts.length) {
          const meta = document.createElement("div"); meta.className = "gs-banner-meta";
          meta.textContent = metaParts.join("  ·  ");
          titleOverlay.appendChild(meta);
        }

        banner.appendChild(titleOverlay);
        heroMount.appendChild(banner);
        handled.add("image");
        handled.add("name");
        handled.add("publisher");
        handled.add("datePublished");
      }

      // ── Tag chips: genre + platform ──
      const tagItems = [];
      const genre = data["genre"];
      if (genre) {
        genre.split(",").forEach(g => tagItems.push({ label: g.trim(), cls: "gs-tag-genre" }));
      }
      const platform = data["gamePlatform"];
      if (platform) {
        platform.split(",").forEach(p => tagItems.push({ label: p.trim(), cls: "gs-tag-platform" }));
      }
      if (tagItems.length) {
        const tags = document.createElement("div"); tags.className = "gs-tags";
        tagItems.forEach(t => {
          const tag = document.createElement("span"); tag.className = "gs-tag " + t.cls;
          tag.textContent = t.label;
          tags.appendChild(tag);
        });
        view.appendChild(tags);
        handled.add("genre");
        handled.add("gamePlatform");
      }

      // ── Price box + Add to Cart ──
      const priceBox = document.createElement("div"); priceBox.className = "gs-price-box";
      const url = data["url"];
      // Use the URL as a link wrapper if available
      const cartBtn = document.createElement("button"); cartBtn.className = "gs-cart-btn";
      cartBtn.type = "button";
      cartBtn.innerHTML = "<span class=\"gs-cart-icon\">🛒</span> Add to Cart";
      priceBox.appendChild(cartBtn);
      view.appendChild(priceBox);
      if (url) {
        // Make the whole price box clickable
        priceBox.style.cursor = "pointer";
        priceBox.addEventListener("click", () => window.open(url, "_blank"));
        handled.add("url");
      }

      // ── Description as store blurb ──
      const desc = data["description"];
      if (desc) {
        const blurb = document.createElement("div"); blurb.className = "gs-blurb";
        const label = document.createElement("div"); label.className = "gs-blurb-label";
        label.textContent = "About This Game";
        blurb.appendChild(label);
        const body = document.createElement("p"); body.className = "gs-blurb-body";
        body.textContent = desc;
        blurb.appendChild(body);
        view.appendChild(blurb);
        handled.add("description");
      }
    }

    // ── SPORTSEVENT (Matchday Scoreboard) ──
    if (cfg.type === "SportsEvent") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("scoreboard");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero — we build our own
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Bold header band with competition name ──
      const eventName = data[cfg.titleProp] || "";
      const headerBand = document.createElement("div"); headerBand.className = "sb-header-band";
      const iconSpan = document.createElement("span"); iconSpan.className = "sb-header-icon";
      iconSpan.textContent = (cfg.icon || "⚽") + " ";
      headerBand.appendChild(iconSpan);
      const bandTitle = document.createElement("span"); bandTitle.className = "sb-header-title";
      bandTitle.textContent = eventName;
      headerBand.appendChild(bandTitle);
      heroMount.appendChild(headerBand);
      handled.add("name"); handled.add("image");

      // ── Big centered VS row ──
      // Try to infer home vs away from the name (e.g. "Team A vs Team B")
      let homeName = "", awayName = "";
      const vsMatch = eventName.match(/(.+?)\s+(?:vs?\.?|[:–\-])\s+(.+)/i);
      if (vsMatch) {
        homeName = vsMatch[1].trim();
        awayName = vsMatch[2].trim();
      }
      const vsRow = document.createElement("div"); vsRow.className = "sb-vs-row";
      if (homeName && awayName) {
        const homeEl = document.createElement("div"); homeEl.className = "sb-team sb-team-home";
        homeEl.textContent = homeName;
        const vsBadge = document.createElement("div"); vsBadge.className = "sb-vs-badge";
        vsBadge.textContent = "VS";
        const awayEl = document.createElement("div"); awayEl.className = "sb-team sb-team-away";
        awayEl.textContent = awayName;
        vsRow.append(homeEl, vsBadge, awayEl);
      } else {
        // No VS pattern — show event name large with ball icon above
        const ballIcon = document.createElement("div"); ballIcon.className = "sb-event-ball";
        ballIcon.textContent = "\u26bd";
        const eventEl = document.createElement("div"); eventEl.className = "sb-event-big";
        eventEl.textContent = eventName;
        vsRow.appendChild(ballIcon);
        vsRow.appendChild(eventEl);
      }
      view.appendChild(vsRow);

      // ── Fixture info strip: date + venue + organizer ──
      const fixtureStrip = document.createElement("div"); fixtureStrip.className = "sb-fixture-strip";

      const startDate = data["startDate"];
      if (startDate) {
        const d = new Date(startDate);
        const dateStr = isNaN(d.getTime()) ? startDate : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
        const timeStr = isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const dateRow = document.createElement("div"); dateRow.className = "sb-fixture-row";
        dateRow.innerHTML = "<span class=\"sb-fixture-icon\">\u{1F4C5}</span> <span>" + dateStr + (timeStr ? " · " + timeStr : "") + "</span>";
        fixtureStrip.appendChild(dateRow);
        handled.add("startDate");
      }
      const endDate = data["endDate"];
      if (endDate) handled.add("endDate");

      const loc = data["location"];
      if (loc) {
        const locRow = document.createElement("div"); locRow.className = "sb-fixture-row";
        locRow.innerHTML = "<span class=\"sb-fixture-icon\">📍</span> <span>" + loc + "</span>";
        fixtureStrip.appendChild(locRow);
        handled.add("location");
      }

      const org = data["organizer"];
      if (org) {
        const orgRow = document.createElement("div"); orgRow.className = "sb-fixture-row";
        orgRow.innerHTML = "<span class=\"sb-fixture-icon\">🎫</span> <span>" + org + "</span>";
        fixtureStrip.appendChild(orgRow);
        handled.add("organizer");
      }
      if (fixtureStrip.children.length) view.appendChild(fixtureStrip);

      // ── Get Tickets CTA ──
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "sb-tickets-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "Get Tickets <span>→</span>";
        view.appendChild(cta);
        handled.add("url");
      }

      // ── Description as match overview ──
      const desc = data["description"];
      if (desc) {
        const overview = document.createElement("div"); overview.className = "sb-overview";
        const label = document.createElement("div"); label.className = "sb-overview-label";
        label.textContent = "Match Overview";
        overview.appendChild(label);
        const body = document.createElement("p"); body.className = "sb-overview-body";
        body.textContent = desc;
        overview.appendChild(body);
        view.appendChild(overview);
        handled.add("description");
      }
    }

    // ── PAINTING (Museum Gallery Placard) ──
    if (cfg.type === "Painting") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("museum-placard");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero — we build our own gallery wall
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Gallery wall with painting centered as if hung ──
      const wall = document.createElement("div"); wall.className = "mp-wall";
      const imgUrl = data["image"];
      if (imgUrl) {
        const frame = document.createElement("div"); frame.className = "mp-frame";
        const img = document.createElement("img"); img.className = "mp-painting";
        img.src = imgUrl; img.alt = data[cfg.titleProp] || "";
        img.loading = "lazy";
        frame.appendChild(img);
        wall.appendChild(frame);
      }
      heroMount.appendChild(wall);
      handled.add("image");
      handled.add("name");

      // ── Museum plaque below the painting ──
      const plaque = document.createElement("div"); plaque.className = "mp-plaque";

      // Artist name in bold
      const artist = data["artist"];
      if (artist) {
        const artistEl = document.createElement("div"); artistEl.className = "mp-artist";
        artistEl.textContent = artist;
        plaque.appendChild(artistEl);
        handled.add("artist");
      }

      // Title in italic
      const title = data[cfg.titleProp];
      if (title) {
        const titleEl = document.createElement("div"); titleEl.className = "mp-title";
        titleEl.textContent = title;
        plaque.appendChild(titleEl);
      }

      // Date created + medium in small caps muted text
      const metaParts = [];
      const dateCreated = data["dateCreated"];
      if (dateCreated) {
        metaParts.push(dateCreated);
        handled.add("dateCreated");
      }
      const medium = data["artMedium"];
      if (medium) {
        metaParts.push(medium);
        handled.add("artMedium");
      }
      if (metaParts.length) {
        const meta = document.createElement("div"); meta.className = "mp-meta";
        meta.textContent = metaParts.join(", ");
        plaque.appendChild(meta);
      }

      view.appendChild(plaque);

      // ── Description as curator's notes ──
      const desc = data["description"];
      if (desc) {
        const notes = document.createElement("div"); notes.className = "mp-curatorial";
        const label = document.createElement("div"); label.className = "mp-curatorial-label";
        label.textContent = "About the Work";
        notes.appendChild(label);
        const body = document.createElement("p"); body.className = "mp-curatorial-body";
        body.textContent = desc;
        notes.appendChild(body);
        view.appendChild(notes);
        handled.add("description");
      }
    }

    // ── DRUG (Medication Information Leaflet) ──
    if (cfg.type === "Drug") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("med-leaflet");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Clean clinical header: drug name + active ingredient subtitle ──
      const mlHeader = document.createElement("div"); mlHeader.className = "ml-header";
      const mlIcon = document.createElement("div"); mlIcon.className = "ml-icon";
      mlIcon.textContent = "\u{1F48A}";
      mlHeader.appendChild(mlIcon);
      const mlHeaderText = document.createElement("div"); mlHeaderText.className = "ml-header-text";
      const drugName = data[cfg.titleProp] || "";
      const h1 = document.createElement("h1"); h1.className = "ml-name";
      h1.textContent = drugName;
      mlHeaderText.appendChild(h1);
      const activeIng = data["activeIngredient"];
      if (activeIng) {
        const sub = document.createElement("div"); sub.className = "ml-active";
        sub.textContent = activeIng;
        mlHeaderText.appendChild(sub);
        handled.add("activeIngredient");
      }
      mlHeader.appendChild(mlHeaderText);
      heroMount.appendChild(mlHeader);
      handled.add("name"); handled.add("image");

      // ── Spec strip: dosage form, prescription status, drug class as outlined boxes ──
      const specItems = [];
      const dosageForm = data["dosageForm"];
      if (dosageForm) specItems.push({ label: "Dosage Form", val: dosageForm, prop: "dosageForm" });
      const rxStatus = data["prescriptionStatus"];
      if (rxStatus) specItems.push({ label: "Prescription", val: rxStatus, prop: "prescriptionStatus" });
      const drugClass = data["drugClass"];
      if (drugClass) specItems.push({ label: "Drug Class", val: drugClass, prop: "drugClass" });

      if (specItems.length) {
        const specStrip = document.createElement("div"); specStrip.className = "ml-spec-strip";
        specItems.forEach(s => {
          const box = document.createElement("div"); box.className = "ml-spec-box";
          box.innerHTML = "<div class=\"ml-spec-label\">" + s.label + "</div><div class=\"ml-spec-val\">" + s.val + "</div>";
          specStrip.appendChild(box);
          handled.add(s.prop);
        });
        view.appendChild(specStrip);
      }

      // ── Informational-only notice ──
      const notice = document.createElement("div"); notice.className = "ml-notice";
      notice.innerHTML = "<span class=\"ml-notice-icon\">\u2139\uFE0F</span> <span>Informational only \u2014 always read the patient information leaflet. Consult a pharmacist or physician if unsure.</span>";
      view.appendChild(notice);

      // ── Description as patient-info body ──
      const desc = data["description"];
      if (desc) {
        const body = document.createElement("div"); body.className = "ml-body";
        const label = document.createElement("div"); label.className = "ml-body-label";
        label.textContent = "Patient Information";
        body.appendChild(label);
        const text = document.createElement("p"); text.className = "ml-body-text";
        text.textContent = desc;
        body.appendChild(text);
        view.appendChild(body);
        handled.add("description");
      }
    }

    // ── OCCUPATION (Career Profile card) ──
    if (cfg.type === "Occupation") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("career-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Header: job title big + category chip ──
      const ccHeader = document.createElement("div"); ccHeader.className = "cc-header";
      const ccIcon = document.createElement("div"); ccIcon.className = "cc-icon";
      ccIcon.textContent = "\u{1F4BC}";
      ccHeader.appendChild(ccIcon);
      const ccHeaderText = document.createElement("div"); ccHeaderText.className = "cc-header-text";
      const h1 = document.createElement("h1"); h1.className = "cc-title";
      h1.textContent = data[cfg.titleProp] || "";
      ccHeaderText.appendChild(h1);
      const occCat = data["occupationalCategory"];
      if (occCat) {
        const catChip = document.createElement("span"); catChip.className = "cc-cat-chip";
        catChip.textContent = occCat;
        ccHeaderText.appendChild(catChip);
        handled.add("occupationalCategory");
      }
      ccHeader.appendChild(ccHeaderText);
      heroMount.appendChild(ccHeader);
      handled.add("name"); handled.add("image");

      // ── Prominent salary band ──
      const salary = data["estimatedSalary"];
      if (salary) {
        const salaryBox = document.createElement("div"); salaryBox.className = "cc-salary-box";
        salaryBox.innerHTML = "<div class=\"cc-salary-label\">\u{1F4B0} Estimated Salary</div><div class=\"cc-salary-val\">" + salary + "</div>";
        view.appendChild(salaryBox);
        handled.add("estimatedSalary");
      }

      // ── Skills as tag chips ──
      const skills = data["skills"];
      if (skills) {
        const skillSection = document.createElement("div"); skillSection.className = "cc-skill-section";
        const label = document.createElement("div"); label.className = "cc-section-label";
        label.textContent = "Key Skills";
        skillSection.appendChild(label);
        const chipRow = document.createElement("div"); chipRow.className = "cc-skill-chips";
        skills.split(",").forEach(s => {
          const chip = document.createElement("span"); chip.className = "cc-skill-chip";
          chip.textContent = s.trim();
          chipRow.appendChild(chip);
        });
        skillSection.appendChild(chipRow);
        view.appendChild(skillSection);
        handled.add("skills");
      }

      // ── Qualifications as a bulleted list ──
      const quals = data["qualifications"];
      if (quals) {
        const qualSection = document.createElement("div"); qualSection.className = "cc-qual-section";
        const label = document.createElement("div"); label.className = "cc-section-label";
        label.textContent = "Qualifications";
        qualSection.appendChild(label);
        const ul = document.createElement("ul"); ul.className = "cc-qual-list";
        quals.split(";").forEach(q => {
          const li = document.createElement("li"); li.textContent = q.trim();
          ul.appendChild(li);
        });
        qualSection.appendChild(ul);
        view.appendChild(qualSection);
        handled.add("qualifications");
      }

      // ── Description as role overview ──
      const desc = data["description"];
      if (desc) {
        const overview = document.createElement("div"); overview.className = "cc-overview";
        const label = document.createElement("div"); label.className = "cc-section-label";
        label.textContent = "Role Overview";
        overview.appendChild(label);
        const body = document.createElement("p"); body.className = "cc-overview-body";
        body.textContent = desc;
        overview.appendChild(body);
        view.appendChild(overview);
        handled.add("description");
      }
    }

    // ── TOURISTTRIP (Travel Itinerary) ──
    if (cfg.type === "TouristTrip") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("itinerary-card");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Hero header with trip name + image ──
      const tiHeader = document.createElement("div"); tiHeader.className = "ti-hero";
      const imgUrl = data["image"];
      if (imgUrl) {
        const img = document.createElement("img"); img.className = "ti-hero-img";
        img.src = imgUrl; img.alt = data[cfg.titleProp] || "";
        img.loading = "lazy";
        tiHeader.appendChild(img);
        const scrim = document.createElement("div"); scrim.className = "ti-hero-scrim";
        tiHeader.appendChild(scrim);
        handled.add("image");
      }
      const tiOverlay = document.createElement("div"); tiOverlay.className = "ti-hero-overlay";
      const tiIcon = document.createElement("span"); tiIcon.className = "ti-hero-icon";
      tiIcon.textContent = "\u{1F9C3}";
      tiOverlay.appendChild(tiIcon);
      const h1 = document.createElement("h1"); h1.className = "ti-hero-title";
      h1.textContent = data[cfg.titleProp] || "";
      tiOverlay.appendChild(h1);
      tiHeader.appendChild(tiOverlay);
      heroMount.appendChild(tiHeader);
      handled.add("name");

      // ── Trip-style chips from touristType ──
      const touristType = data["touristType"];
      if (touristType) {
        const chipRow = document.createElement("div"); chipRow.className = "ti-trip-chips";
        touristType.split(",").forEach(t => {
          const chip = document.createElement("span"); chip.className = "ti-trip-chip";
          chip.innerHTML = "<span class=\"ti-chip-icon\">\u{1F6E9}\uFE0F</span> " + t.trim();
          chipRow.appendChild(chip);
        });
        view.appendChild(chipRow);
        handled.add("touristType");
      }

      // ── Day-by-day timeline from description ──
      const desc = data["description"];
      if (desc) {
        // Parse "Day one: ... Day two: ..." or "Day 1: ... Day 2: ..." patterns
        const dayParts = desc.split(/\s*Day\s+(?:one|two|three|four|five|six|seven|eight|1|2|3|4|5|6|7|8)[:.]?\s*/i)
          .filter(s => s.trim());
        const dayLabels = desc.match(/Day\s+(?:one|two|three|four|five|six|seven|eight|1|2|3|4|5|6|7|8)[:.]?/gi);

        if (dayParts.length >= 2 && dayLabels && dayLabels.length >= 2) {
          // Render as vertical timeline
          const timeline = document.createElement("div"); timeline.className = "ti-timeline";
          dayParts.forEach((text, i) => {
            const stop = document.createElement("div"); stop.className = "ti-timeline-stop";
            const dot = document.createElement("div"); dot.className = "ti-timeline-dot";
            dot.textContent = String(i + 1);
            stop.appendChild(dot);
            const content = document.createElement("div"); content.className = "ti-timeline-content";
            const label = document.createElement("div"); label.className = "ti-timeline-label";
            label.textContent = dayLabels[i] ? dayLabels[i].replace(/[:.]?$/, "") : ("Day " + (i + 1));
            content.appendChild(label);
            const body = document.createElement("p"); body.className = "ti-timeline-body";
            body.textContent = text.trim();
            content.appendChild(body);
            stop.appendChild(content);
            timeline.appendChild(stop);
          });
          view.appendChild(timeline);
        } else {
          // No day pattern — show as overview
          const overview = document.createElement("div"); overview.className = "ti-overview";
          const label = document.createElement("div"); label.className = "ti-section-label";
          label.textContent = "Trip Overview";
          overview.appendChild(label);
          const body = document.createElement("p"); body.className = "ti-overview-body";
          body.textContent = desc;
          overview.appendChild(body);
          view.appendChild(overview);
        }
        handled.add("description");
      }

      // ── Book This Trip CTA ──
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "ti-book-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "\u2708\uFE0F Book This Trip <span>\u2192</span>";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    // ── MUSICPLAYLIST (Spotify Playlist page) ──
    if (cfg.type === "MusicPlaylist") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("playlist-page");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Banner with cover art + overlay ──
      const plBanner = document.createElement("div"); plBanner.className = "pl-banner";
      const imgUrl = data["image"];
      if (imgUrl) {
        const img = document.createElement("img"); img.className = "pl-cover";
        img.src = imgUrl; img.alt = data[cfg.titleProp] || "";
        img.loading = "lazy";
        plBanner.appendChild(img);
        const scrim = document.createElement("div"); scrim.className = "pl-scrim";
        plBanner.appendChild(scrim);
        handled.add("image");
      }

      const plOverlay = document.createElement("div"); plOverlay.className = "pl-overlay";
      const plBadge = document.createElement("div"); plBadge.className = "pl-badge";
      plBadge.textContent = "\u{1F3B5} Playlist";
      plOverlay.appendChild(plBadge);
      const h1 = document.createElement("h1"); h1.className = "pl-title";
      h1.textContent = data[cfg.titleProp] || "";
      plOverlay.appendChild(h1);

      // Meta line: track count + curator
      const metaParts = [];
      const numTracks = data["numTracks"];
      if (numTracks != null) {
        metaParts.push(numTracks + " track" + (numTracks !== 1 ? "s" : ""));
        handled.add("numTracks");
      }
      const author = data["author"];
      if (author) {
        metaParts.push("by " + author);
        handled.add("author");
      }
      if (metaParts.length) {
        const meta = document.createElement("div"); meta.className = "pl-meta";
        meta.textContent = metaParts.join("  \u00b7  ");
        plOverlay.appendChild(meta);
      }
      plBanner.appendChild(plOverlay);
      heroMount.appendChild(plBanner);
      handled.add("name");

      // ── Green circular play button ──
      const url = data["url"];
      const playRow = document.createElement("div"); playRow.className = "pl-play-row";
      const playBtn = document.createElement("button"); playBtn.className = "pl-play-btn";
      playBtn.type = "button";
      playBtn.setAttribute("aria-label", "Play");
      playBtn.innerHTML = "<span class=\"pl-play-icon\">\u25B6</span>";
      playRow.appendChild(playBtn);
      if (url) {
        playBtn.style.cursor = "pointer";
        playBtn.addEventListener("click", () => window.open(url, "_blank"));
        const link = document.createElement("a"); link.className = "pl-listen-link";
        link.href = url; link.target = "_blank"; link.rel = "noopener";
        link.textContent = "Open in player \u2192";
        playRow.appendChild(link);
        handled.add("url");
      }
      view.appendChild(playRow);

      // ── Description as playlist blurb ──
      const desc = data["description"];
      if (desc) {
        const blurb = document.createElement("div"); blurb.className = "pl-blurb";
        const label = document.createElement("div"); label.className = "pl-blurb-label";
        label.textContent = "About this playlist";
        blurb.appendChild(label);
        const body = document.createElement("p"); body.className = "pl-blurb-body";
        body.textContent = desc;
        blurb.appendChild(body);
        view.appendChild(blurb);
        handled.add("description");
      }
    }

    // ── AGGREGATEOFFER (Price-Comparison card) ──
    if (cfg.type === "AggregateOffer") {
      const card = document.querySelector(".card");
      if (card) card.classList.add("price-compare");

      // Hide normal header
      const hd = document.querySelector(".hd");
      if (hd) hd.classList.add("hidden");

      // Remove generic hero
      const heroMount = document.getElementById("hero-mount");
      if (heroMount) heroMount.querySelector('.hero')?.remove();

      // ── Clean retail header ──
      const pcHeader = document.createElement("div"); pcHeader.className = "pc-header";
      const pcIcon = document.createElement("div"); pcIcon.className = "pc-icon";
      pcIcon.textContent = "\u{1F4B0}";
      pcHeader.appendChild(pcIcon);
      const pcHeaderText = document.createElement("div"); pcHeaderText.className = "pc-header-text";
      const h1 = document.createElement("h1"); h1.className = "pc-title";
      h1.textContent = data[cfg.titleProp] || "";
      pcHeaderText.appendChild(h1);
      // Seller as subtitle if available
      const seller = data["seller"];
      let sellerName = "";
      if (seller) {
        if (typeof seller === "object" && seller.name) sellerName = seller.name;
        else if (typeof seller === "string") sellerName = seller;
      }
      if (sellerName) {
        const sub = document.createElement("div"); sub.className = "pc-seller";
        sub.textContent = sellerName;
        pcHeaderText.appendChild(sub);
        handled.add("seller");
      }
      pcHeader.appendChild(pcHeaderText);
      heroMount.appendChild(pcHeader);
      handled.add("name"); handled.add("image");

      // ── Big price range box ──
      const lowPrice = data["lowPrice"];
      const highPrice = data["highPrice"];
      const currency = data["priceCurrency"];
      if (lowPrice || highPrice) {
        const priceBox = document.createElement("div"); priceBox.className = "pc-price-box";

        if (lowPrice) {
          const lowEl = document.createElement("div"); lowEl.className = "pc-price-low";
          const lowLabel = document.createElement("span"); lowLabel.className = "pc-price-label";
          lowLabel.textContent = "FROM";
          const lowVal = document.createElement("span"); lowVal.className = "pc-price-val";
          lowVal.textContent = lowPrice;
          lowEl.append(lowLabel, lowVal);
          priceBox.appendChild(lowEl);
          handled.add("lowPrice");
        }

        if (highPrice) {
          const highEl = document.createElement("div"); highEl.className = "pc-price-high";
          const highLabel = document.createElement("span"); highLabel.className = "pc-price-label";
          highLabel.textContent = "UP TO";
          const highVal = document.createElement("span"); highVal.className = "pc-price-val-high";
          highVal.textContent = highPrice;
          highEl.append(highLabel, highVal);
          priceBox.appendChild(highEl);
          handled.add("highPrice");
        }

        view.appendChild(priceBox);
      }
      if (currency) handled.add("priceCurrency");

      // ── Offer count chip ──
      const offerCount = data["offerCount"];
      if (offerCount != null) {
        const chip = document.createElement("div"); chip.className = "pc-offer-chip";
        chip.innerHTML = "<span class=\"pc-offer-icon\">\u{1F4C4}</span> " + offerCount + " seller" + (offerCount !== 1 ? "s" : "");
        view.appendChild(chip);
        handled.add("offerCount");
      }

      // ── Description as price insights ──
      const desc = data["description"];
      if (desc) {
        const insights = document.createElement("div"); insights.className = "pc-insights";
        const label = document.createElement("div"); label.className = "pc-section-label";
        label.textContent = "Price Insights";
        insights.appendChild(label);
        const body = document.createElement("p"); body.className = "pc-insights-body";
        body.textContent = desc;
        insights.appendChild(body);
        view.appendChild(insights);
        handled.add("description");
      }

      // ── See All Deals CTA ──
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "pc-cta";
        cta.href = url; cta.target = "_blank"; cta.rel = "noopener";
        cta.innerHTML = "See All Deals <span>\u2192</span>";
        view.appendChild(cta);
        handled.add("url");
      }
    }

    return handled;
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

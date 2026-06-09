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

    // ── RECIPE ──
    if (cfg.type === "Recipe") {
      // Stats strip: prep, cook, yield
      const stats = [];
      const prep = data["prepTime"];
      if (prep) { const d = formatDuration(prep); if (d) stats.push({ label: "Prep", val: d }); }
      const cook = data["cookTime"];
      if (cook) { const d = formatDuration(cook); if (d) stats.push({ label: "Cook", val: d }); }
      const yield_ = data["recipeYield"];
      if (yield_) stats.push({ label: "Yield", val: yield_ });

      if (stats.length) {
        const strip = document.createElement("div"); strip.className = "stats-strip";
        stats.forEach((s, i) => {
          if (i > 0) { const sep = document.createElement("span"); sep.className = "stats-sep"; strip.appendChild(sep); }
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>" + s.label + "</small>" + s.val;
          strip.appendChild(chip);
        });
        view.appendChild(strip);
      }
      if (prep) handled.add("prepTime");
      if (cook) handled.add("cookTime");
      if (yield_) handled.add("recipeYield");

      // Ingredients checklist
      const ingredients = data["recipeIngredient"];
      if (ingredients) {
        const items = typeof ingredients === "string" ? ingredients.split(/,(?=[\s])/) : (Array.isArray(ingredients) ? ingredients : [ingredients]);
        const section = document.createElement("div"); section.className = "section-block";
        const h = document.createElement("div"); h.className = "section-label"; h.textContent = "Ingredients";
        section.appendChild(h);
        const ul = document.createElement("ul"); ul.className = "checklist";
        items.forEach((item) => {
          const li = document.createElement("li");
          const cb = document.createElement("span"); cb.className = "check-box";
          const txt = document.createElement("span"); txt.className = "check-text"; txt.textContent = item.trim();
          li.append(cb, txt);
          li.addEventListener("click", () => li.classList.toggle("checked"));
          ul.appendChild(li);
        });
        section.appendChild(ul);
        view.appendChild(section);
        handled.add("recipeIngredient");
      }

      // Instructions numbered list
      const instr = data["recipeInstructions"];
      if (instr) {
        const steps = typeof instr === "string" ? instr.split(/\n|\.\s+(?=[A-Z])/).filter(s => s.trim()) : (Array.isArray(instr) ? instr : [instr]);
        const section = document.createElement("div"); section.className = "section-block";
        const h = document.createElement("div"); h.className = "section-label"; h.textContent = "Instructions";
        section.appendChild(h);
        const ol = document.createElement("ol"); ol.className = "step-list";
        steps.forEach((step) => {
          const li = document.createElement("li"); li.textContent = step.trim().replace(/^\d+\.\s*/, "");
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

    // ── MOVIE ──
    if (cfg.type === "Movie") {
      // Meta chip row: year · genre · duration
      const chips = [];
      const year = data["datePublished"];
      if (year) { const d = formatDate(year); chips.push({ label: "Year", val: d ? new Date(year).getFullYear().toString() : year }); }
      const genre = data["genre"];
      if (genre) { const first = genre.split(",")[0].trim(); chips.push({ label: "Genre", val: first }); }
      const dur = data["duration"];
      if (dur) { const d = formatDuration(dur); if (d) chips.push({ label: "Runtime", val: d }); }

      if (chips.length) {
        const strip = document.createElement("div"); strip.className = "stats-strip film-chips";
        chips.forEach((s, i) => {
          if (i > 0) { const sep = document.createElement("span"); sep.className = "stats-sep"; strip.appendChild(sep); }
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>" + s.label + "</small>" + s.val;
          strip.appendChild(chip);
        });
        view.appendChild(strip);
      }
      if (year) handled.add("datePublished");
      if (genre) handled.add("genre");
      if (dur) handled.add("duration");

      // Rating stars
      const aggRating = data["aggregateRating"];
      if (aggRating !== undefined) {
        const r = formatRating(aggRating, "aggregateRating");
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
        handled.add("aggregateRating");
      }
    }

    // ── PRODUCT ──
    if (cfg.type === "Product") {
      // Big prominent price
      const priceVal = data["price"];
      if (priceVal) {
        const priceBlock = document.createElement("div"); priceBlock.className = "price-hero";
        const price = formatPrice(priceVal, "price");
        if (price) {
          const sym = price.symbol || (price.currency ? (CURRENCY_SYMBOLS[price.currency] || price.currency + " ") : "");
          const amt = price.amount || parseFloat(priceVal.replace(/[^0-9.]/g, ""));
          priceBlock.innerHTML = "<span class=\"price-symbol\">" + sym + "</span><span class=\"price-amount\">" + (isNaN(amt) ? priceVal : amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + "</span>";
        } else {
          priceBlock.textContent = priceVal;
        }
        view.appendChild(priceBlock);
        handled.add("price");
      }

      // Specs as compact rows (brand, sku, color, material — all short values)
      const specProps = ["brand", "sku", "color", "material"];
      const specs = [];
      for (const f of cfg.fields) {
        if (!specProps.includes(f.prop)) continue;
        const val = data[f.prop];
        if (!val) continue;
        specs.push({ label: f.label, val });
        handled.add(f.prop);
      }
      if (specs.length) {
        const grid = document.createElement("div"); grid.className = "spec-grid";
        specs.forEach((s) => {
          const cell = document.createElement("div"); cell.className = "spec-cell";
          cell.innerHTML = "<small>" + s.label + "</small><span>" + s.val + "</span>";
          grid.appendChild(cell);
        });
        view.appendChild(grid);
      }
    }

    // ── EVENT ──
    if (cfg.type === "Event") {
      // Bold date block
      const start = data["startDate"];
      if (start) {
        try {
          const d = new Date(start);
          if (!isNaN(d.getTime())) {
            const dateBlock = document.createElement("div"); dateBlock.className = "event-date-hero";
            const day = document.createElement("span"); day.className = "event-day"; day.textContent = d.getDate();
            const month = document.createElement("span"); month.className = "event-month"; month.textContent = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
            const year = document.createElement("span"); year.className = "event-year"; year.textContent = d.getFullYear();
            dateBlock.append(day, month, year);
            view.appendChild(dateBlock);
          }
        } catch(_) {}
        handled.add("startDate");
      }

      // End date as range
      const end = data["endDate"];
      if (end && end !== start) {
        try {
          const d2 = new Date(end);
          if (!isNaN(d2.getTime())) {
            const range = document.createElement("div"); range.className = "event-range";
            range.textContent = "\u2192 " + d2.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            view.appendChild(range);
          }
        } catch(_) {}
        handled.add("endDate");
      }

      // Location + organizer chips
      const loc = data["location"];
      const org = data["organizer"];
      if (loc || org) {
        const strip = document.createElement("div"); strip.className = "stats-strip event-chips";
        if (loc) {
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>Location</small>" + loc;
          strip.appendChild(chip);
          handled.add("location");
        }
        if (org) {
          if (loc) { const sep = document.createElement("span"); sep.className = "stats-sep"; strip.appendChild(sep); }
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>Organizer</small>" + org;
          strip.appendChild(chip);
          handled.add("organizer");
        }
        view.appendChild(strip);
      }
    }

    // ── MUSICALBUM ──
    if (cfg.type === "MusicAlbum") {
      // Prominent 'by Artist'
      const artist = data["byArtist"];
      if (artist) {
        const artistBlock = document.createElement("div"); artistBlock.className = "album-artist";
        artistBlock.innerHTML = "by <strong>" + artist + "</strong>";
        view.appendChild(artistBlock);
        handled.add("byArtist");
      }

      // Meta chips: genre, year, tracks
      const chips = [];
      const genre = data["genre"];
      if (genre) chips.push({ label: "Genre", val: genre.split(",")[0].trim() });
      const datePub = data["datePublished"];
      if (datePub) { const d = formatDate(datePub); chips.push({ label: "Released", val: d || datePub }); }
      const tracks = data["numTracks"];
      if (tracks) chips.push({ label: "Tracks", val: tracks });

      if (chips.length) {
        const strip = document.createElement("div"); strip.className = "stats-strip";
        chips.forEach((s, i) => {
          if (i > 0) { const sep = document.createElement("span"); sep.className = "stats-sep"; strip.appendChild(sep); }
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>" + s.label + "</small>" + s.val;
          strip.appendChild(chip);
        });
        view.appendChild(strip);
      }
      if (genre) handled.add("genre");
      if (datePub) handled.add("datePublished");
      if (tracks) handled.add("numTracks");
    }

    // ── BOOK ──
    if (cfg.type === "Book") {
      // 'by Author' prominent
      const author = data["author"];
      if (author) {
        const ab = document.createElement("div"); ab.className = "book-author";
        ab.innerHTML = "by <strong>" + author + "</strong>";
        view.appendChild(ab);
        handled.add("author");
      }

      // Meta row: pages · published · publisher
      const chips = [];
      const pages = data["numberOfPages"];
      if (pages) chips.push({ label: "Pages", val: pages });
      const pub = data["datePublished"];
      if (pub) { const d = formatDate(pub); chips.push({ label: "Published", val: d || pub }); }
      const publisher = data["publisher"];
      if (publisher) chips.push({ label: "Publisher", val: publisher });
      const isbn = data["isbn"];
      if (isbn) chips.push({ label: "ISBN", val: isbn });

      if (chips.length) {
        const strip = document.createElement("div"); strip.className = "stats-strip book-chips";
        chips.forEach((s, i) => {
          if (i > 0) { const sep = document.createElement("span"); sep.className = "stats-sep"; strip.appendChild(sep); }
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>" + s.label + "</small>" + s.val;
          strip.appendChild(chip);
        });
        view.appendChild(strip);
      }
      if (pages) handled.add("numberOfPages");
      if (pub) handled.add("datePublished");
      if (publisher) handled.add("publisher");
      if (isbn) handled.add("isbn");

      // Description as body prose
      const desc = data["description"];
      if (desc) {
        const body = document.createElement("div"); body.className = "prose-body";
        body.textContent = desc;
        view.appendChild(body);
        handled.add("description");
      }
    }

    // ── ARTICLE ──
    if (cfg.type === "Article") {
      // Author + date byline
      const author = data["author"];
      const datePub = data["datePublished"];
      if (author || datePub) {
        const byline = document.createElement("div"); byline.className = "article-byline";
        const parts = [];
        if (author) parts.push("<strong>" + author + "</strong>");
        if (datePub) {
          const d = formatDate(datePub);
          parts.push("<span class=\"article-date\">" + (d || datePub) + "</span>");
        }
        byline.innerHTML = parts.join(" · ");
        view.appendChild(byline);
        if (author) handled.add("author");
        if (datePub) handled.add("datePublished");
      }

      // articleBody as flowing prose
      const articleBody = data["articleBody"];
      if (articleBody) {
        const body = document.createElement("div"); body.className = "prose-body";
        // Split on double newlines for paragraphs
        const paras = articleBody.split(/\n\n+/);
        paras.forEach(p => {
          if (!p.trim()) return;
          const el = document.createElement("p");
          el.textContent = p.trim();
          body.appendChild(el);
        });
        view.appendChild(body);
        handled.add("articleBody");
      } else {
        // Fallback to description
        const desc = data["description"];
        if (desc) {
          const body = document.createElement("div"); body.className = "prose-body";
          body.textContent = desc;
          view.appendChild(body);
          handled.add("description");
        }
      }
    }

    // ── COURSE ──
    if (cfg.type === "Course") {
      // Provider prominent
      const provider = data["provider"];
      if (provider) {
        const pb = document.createElement("div"); pb.className = "course-provider";
        pb.innerHTML = "<span class=\"provider-badge\">Provider</span> <strong>" + provider + "</strong>";
        view.appendChild(pb);
        handled.add("provider");
      }

      // Level + code as chips
      const chips = [];
      const level = data["educationalLevel"];
      if (level) chips.push({ label: "Level", val: level });
      const code = data["courseCode"];
      if (code) chips.push({ label: "Code", val: code });

      if (chips.length) {
        const strip = document.createElement("div"); strip.className = "stats-strip";
        chips.forEach((s, i) => {
          if (i > 0) { const sep = document.createElement("span"); sep.className = "stats-sep"; strip.appendChild(sep); }
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>" + s.label + "</small>" + s.val;
          strip.appendChild(chip);
        });
        view.appendChild(strip);
      }
      if (level) handled.add("educationalLevel");
      if (code) handled.add("courseCode");

      // Description as body
      const desc = data["description"];
      if (desc) {
        const body = document.createElement("div"); body.className = "prose-body";
        body.textContent = desc;
        view.appendChild(body);
        handled.add("description");
      }

      // CTA link
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "course-cta";
        cta.href = url; cta.textContent = "View Course →";
        cta.target = "_blank"; cta.rel = "noopener";
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

    // ── RESTAURANT ──
    if (cfg.type === "Restaurant") {
      // Cuisine + price range as prominent badges
      const badges = [];
      const cuisine = data["servesCuisine"];
      if (cuisine) badges.push({ label: "Cuisine", val: cuisine });
      const price = data["priceRange"];
      if (price) badges.push({ label: "Price", val: price });

      if (badges.length) {
        const strip = document.createElement("div"); strip.className = "stats-strip restaurant-chips";
        badges.forEach((s, i) => {
          if (i > 0) { const sep = document.createElement("span"); sep.className = "stats-sep"; strip.appendChild(sep); }
          const chip = document.createElement("span"); chip.className = "stat-chip";
          chip.innerHTML = "<small>" + s.label + "</small>" + s.val;
          strip.appendChild(chip);
        });
        view.appendChild(strip);
      }
      if (cuisine) handled.add("servesCuisine");
      if (price) handled.add("priceRange");

      // Contact block: address, phone
      const contacts = [];
      const addr = data["address"];
      if (addr) contacts.push({ label: "Address", val: addr, icon: "📍" });
      const phone = data["telephone"];
      if (phone) contacts.push({ label: "Phone", val: phone, icon: "📞" });

      if (contacts.length) {
        const block = document.createElement("div"); block.className = "contact-block";
        contacts.forEach(c => {
          const row = document.createElement("div"); row.className = "contact-row";
          const icon = document.createElement("span"); icon.className = "contact-icon"; icon.textContent = c.icon;
          const txt = document.createElement("span"); txt.className = "contact-text"; txt.textContent = c.val;
          row.append(icon, txt);
          block.appendChild(row);
        });
        view.appendChild(block);
        if (addr) handled.add("address");
        if (phone) handled.add("telephone");
      }

      // Visit link
      const url = data["url"];
      if (url) {
        const cta = document.createElement("a"); cta.className = "course-cta";
        cta.href = url; cta.textContent = "Visit Restaurant →";
        cta.target = "_blank"; cta.rel = "noopener";
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

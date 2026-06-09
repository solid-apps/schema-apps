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

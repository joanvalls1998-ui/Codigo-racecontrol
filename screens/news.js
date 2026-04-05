/* ===== FASE 5 · NOTICIAS CONTEXTUALES ===== */

function getNewsWeekendPhase() {
  return state.weekendContext?.phase || "pre_weekend";
}

function getNewsPhaseCopy(phase) {
  const map = {
    pre_weekend: {
      title: "Antes de que empiece el GP",
      sub: "Ahora pesan más mejoras, fiabilidad, setup y referencias previas que el resultado puro."
    },
    friday: {
      title: "Viernes de referencias",
      sub: "Ahora pesan más ritmo, tandas largas, degradación y primeras señales reales del coche."
    },
    saturday: {
      title: "Sábado decisivo",
      sub: "Ahora pesan más qualy, sprint, parrilla, tráfico y posición en pista."
    },
    sunday: {
      title: "Domingo de carrera",
      sub: "Ahora pesan más estrategia, salida, Safety Car, aire sucio y ritmo útil de carrera."
    },
    post_race: {
      title: "Post GP",
      sub: "Ahora pesan más análisis, balance, conclusiones y lectura de lo que dejó el fin de semana."
    }
  };
  return map[phase] || map.pre_weekend;
}

function getNewsPhaseTerms(phase) {
  const map = {
    pre_weekend: [
      "upgrade", "upgrades", "mejora", "mejoras", "package", "floor", "aero", "aerodynamic",
      "setup", "preview", "prepar", "expect", "fiabilidad", "reliability", "practice",
      "simulation", "race sim", "long run"
    ],
    friday: [
      "fp1", "fp2", "practice", "free practice", "viernes", "pace", "ritmo", "long run",
      "race sim", "quali sim", "degradation", "degradacion", "tyre", "neumatic",
      "balance", "setup", "data"
    ],
    saturday: [
      "qualifying", "qualy", "grid", "pole", "q1", "q2", "q3", "sprint", "shootout",
      "track position", "traffic", "one lap", "a una vuelta", "parc ferme"
    ],
    sunday: [
      "race", "grand prix", "strategy", "pit stop", "pit window", "undercut", "overcut",
      "safety car", "vsc", "start", "opening lap", "stint", "dirty air", "traffic",
      "tyre", "degradation", "podium", "win"
    ],
    post_race: [
      "analysis", "review", "debrief", "verdict", "lessons", "balance", "rating", "what we learned",
      "conclusion", "post-race", "after the race", "summary"
    ]
  };
  return map[phase] || map.pre_weekend;
}

function getNewsPhaseWeight(item, phase) {
  const text = normalizeText(`${item?.title || ""} ${item?.source || ""}`);
  const terms = getNewsPhaseTerms(phase);

  let score = 0;
  const matches = terms.filter(term => term && text.includes(normalizeText(term)));
  score += Math.min(18, matches.length * 4);

  if (phase === "pre_weekend" && containsAny(text, ["upgrade", "mejora", "floor", "package", "setup", "preview"])) score += 8;
  if (phase === "friday" && containsAny(text, ["fp1", "fp2", "practice", "pace", "ritmo", "long run", "race sim", "degradation"])) score += 9;
  if (phase === "saturday" && containsAny(text, ["qualifying", "qualy", "grid", "pole", "sprint", "shootout", "traffic"])) score += 10;
  if (phase === "sunday" && containsAny(text, ["race", "strategy", "undercut", "overcut", "safety car", "vsc", "stint", "podium", "win"])) score += 10;
  if (phase === "post_race" && containsAny(text, ["analysis", "review", "verdict", "debrief", "lessons", "summary"])) score += 8;

  return score;
}

function buildNewsFilterPresets() {
  const favorite = getFavorite();
  return [
    { key: "favorite", label: favorite.name, favoritePayload: favorite },
    { key: "aston", label: "Aston", favoritePayload: { type: "team", name: "Aston Martin", colorClass: "aston" } },
    { key: "alonso", label: "Alonso", favoritePayload: getDefaultFavorite() },
    { key: "grid", label: "Parrilla", favoritePayload: { type: "team", name: "Formula 1", colorClass: "ferrari" } }
  ];
}

function getActiveNewsFilter() {
  const filters = buildNewsFilterPresets();
  return filters.find(filter => filter.key === state.currentNewsFilterKey) || filters[0];
}


function categorizeNewsItem(item) {
  const text = `${item?.title || ""} ${item?.source || ""}`.toLowerCase();

  if (text.includes("upgrade") || text.includes("mejora") || text.includes("aerodin") || text.includes("suelo") || text.includes("floor") || text.includes("package")) {
    return { key: "technical", label: "Técnica" };
  }

  if (text.includes("reliability") || text.includes("fiabilidad") || text.includes("engine") || text.includes("power unit") || text.includes("gearbox") || text.includes("avería") || text.includes("problema")) {
    return { key: "reliability", label: "Fiabilidad" };
  }

  if (text.includes("contract") || text.includes("mercado") || text.includes("seat") || text.includes("driver market") || text.includes("fich") || text.includes("replace")) {
    return { key: "market", label: "Mercado" };
  }

  if (text.includes("said") || text.includes("dice") || text.includes("claims") || text.includes("cree") || text.includes("declara") || text.includes("speaks")) {
    return { key: "statement", label: "Declaración" };
  }

  if (text.includes("pace") || text.includes("ritmo") || text.includes("qualy") || text.includes("qualifying") || text.includes("podium") || text.includes("race result") || text.includes("rendimiento")) {
    return { key: "general", label: "Rendimiento" };
  }

  return { key: "general", label: "General" };
}

function getNewsFilterTerms(filter) {
  const payload = filter?.favoritePayload || {};
  const base = [];

  if (payload.name) {
    base.push(normalizeText(payload.name));
    base.push(...normalizeText(payload.name).split(" ").filter(part => part.length > 2));
  }

  if (payload.type === "driver" && payload.team) {
    base.push(normalizeText(payload.team));
    base.push(...normalizeText(payload.team).split(" ").filter(part => part.length > 2));
  }

  if (filter?.key === "alonso") {
    base.push("alonso", "fernando", "aston martin");
  }

  if (filter?.key === "aston") {
    base.push("aston martin", "aston", "alonso", "stroll");
  }

  if (filter?.key === "grid") {
    base.push(
      "formula 1",
      "f1",
      "mercedes",
      "ferrari",
      "mclaren",
      "red bull",
      "verstappen",
      "norris",
      "piastri",
      "leclerc",
      "hamilton",
      "russell"
    );
  }

  return unique(base);
}

function getNewsRecencyScore(pubDate) {
  if (!pubDate) return 0;
  const time = new Date(pubDate).getTime();
  if (Number.isNaN(time)) return 0;

  const ageDays = (Date.now() - time) / 86400000;

  if (ageDays <= 1) return 8;
  if (ageDays <= 3) return 6;
  if (ageDays <= 7) return 4;
  if (ageDays <= 14) return 2;
  return 0;
}

function getNewsCategoryWeight(categoryKey) {
  if (categoryKey === "technical") return 18;
  if (categoryKey === "reliability") return 17;
  if (categoryKey === "market") return 15;
  if (categoryKey === "statement") return 11;
  return 9;
}

function scoreNewsItem(item, filter, phase = getNewsWeekendPhase()) {
  const text = normalizeText(`${item?.title || ""} ${item?.source || ""}`);
  const category = categorizeNewsItem(item);
  const filterTerms = getNewsFilterTerms(filter);

  let score = getNewsCategoryWeight(category.key);

  const matchedTerms = filterTerms.filter(term => term && text.includes(term));
  score += Math.min(
    22,
    matchedTerms.reduce((acc, term) => acc + (term.includes(" ") ? 8 : 4), 0)
  );

  if (filter?.key === "favorite" && filter?.favoritePayload?.type === "driver" && filter.favoritePayload.team) {
    if (text.includes(normalizeText(filter.favoritePayload.team))) score += 6;
  }

  if (filter?.key === "grid" && containsAny(text, ["grand prix", "race", "qualifying", "championship", "pace", "podium", "win"])) {
    score += 6;
  }

  if (containsAny(text, ["official", "confirmed", "update", "breaking"])) {
    score += 3;
  }

  if (containsAny(text, ["gallery", "photos", "photo", "watch", "video", "live blog", "liveblog"])) {
    score -= 14;
  }

  if (containsAny(text, ["rumor", "rumour", "speculation"])) {
    score -= 3;
  }

  score += getNewsRecencyScore(item?.pubDate);
  score += getNewsPhaseWeight(item, phase);

  return score;
}

function getNewsImportanceLabel(item, filter, phase = getNewsWeekendPhase()) {
  const score = scoreNewsItem(item, filter, phase);

  if (score >= 34) return "Alta prioridad";
  if (score >= 24) return "Muy relevante";
  if (score >= 16) return "Seguimiento";
  return "Contexto";
}

function getNewsImportanceClass(item, filter, phase = getNewsWeekendPhase()) {
  const score = scoreNewsItem(item, filter, phase);

  if (score >= 34) return "statement";
  if (score >= 24) return "market";
  if (score >= 16) return "general";
  return "general";
}

function getNewsImpactText(item, filter, phase = getNewsWeekendPhase()) {
  const category = categorizeNewsItem(item);
  const favorite = filter?.favoritePayload || getFavorite();
  const text = normalizeText(item?.title || "");
  const favoriteName = favorite?.name || "tu favorito";
  const favoriteTeam = favorite?.team || favorite?.name || "";

  if (phase === "friday" && containsAny(text, ["fp1", "fp2", "practice", "pace", "ritmo", "long run", "race sim"])) {
    return "Importa porque puede cambiar la lectura real de ritmo del viernes y separar ruido de tabla.";
  }

  if (phase === "saturday" && containsAny(text, ["qualifying", "qualy", "grid", "pole", "sprint", "shootout"])) {
    return "Importa porque puede cambiar directamente la posición en pista y el techo real del domingo.";
  }

  if (phase === "sunday" && containsAny(text, ["strategy", "race", "pit", "undercut", "overcut", "safety car", "vsc"])) {
    return "Importa porque puede alterar el guion de carrera, la estrategia y el resultado final.";
  }

  if (phase === "post_race" && containsAny(text, ["analysis", "review", "verdict", "debrief", "summary"])) {
    return "Importa porque ayuda a entender qué dejó realmente el GP y cómo leer mejor el siguiente.";
  }

  if (category.key === "technical") {
    if (favoriteTeam && text.includes(normalizeText(favoriteTeam))) {
      return `Puede cambiar la lectura de ritmo del próximo GP para ${favoriteTeam}.`;
    }
    return "Puede cambiar la lectura de rendimiento del próximo GP si trae mejoras reales.";
  }

  if (category.key === "reliability") {
    return "Importa porque un problema mecánico puede alterar por completo el fin de semana.";
  }

  if (category.key === "market") {
    if (favorite.type === "driver") {
      return `Aporta contexto sobre el futuro del equipo y del entorno competitivo de ${favoriteName}.`;
    }
    return "Puede afectar al proyecto deportivo y al contexto futuro del equipo.";
  }

  if (category.key === "statement") {
    if (favoriteName && text.includes(normalizeText(favoriteName))) {
      return `Da pistas sobre sensaciones reales alrededor de ${favoriteName}, aunque conviene contrastarlo con el ritmo en pista.`;
    }
    return "Da pistas sobre sensaciones y narrativa interna, aunque no siempre se traduce en rendimiento real.";
  }

  if (containsAny(text, ["pace", "ritmo", "qualy", "qualifying", "race", "podium", "result"])) {
    return "Sirve para entender quién llega mejor y qué esperar del fin de semana.";
  }

  if (favoriteTeam && text.includes(normalizeText(favoriteTeam))) {
    return `Afecta directamente al seguimiento de ${favoriteTeam} en el próximo GP.`;
  }

  return "Aporta contexto general útil para no llegar a ciegas al próximo Gran Premio.";
}

function sortNewsItems(items, filter, phase = getNewsWeekendPhase()) {
  const list = Array.isArray(items) ? [...items] : [];

  return list.sort((a, b) => {
    const scoreDiff = scoreNewsItem(b, filter, phase) - scoreNewsItem(a, filter, phase);
    if (scoreDiff !== 0) return scoreDiff;

    const dateA = new Date(a?.pubDate || 0).getTime();
    const dateB = new Date(b?.pubDate || 0).getTime();
    return dateB - dateA;
  });
}

function renderNewsKeyLines(items, filter, phase = getNewsWeekendPhase()) {
  const top = sortNewsItems(items, filter, phase).slice(0, 3);

  if (!top.length) {
    return `<div class="empty-line">No hay claves destacadas disponibles ahora mismo.</div>`;
  }

  return `
    <div class="insight-list">
      ${top.map(item => `
        <div class="insight-item">
          <strong>${escapeHtml(getNewsImportanceLabel(item, filter, phase))}</strong> · ${escapeHtml(item.title)}<br>
          ${escapeHtml(getNewsImpactText(item, filter, phase))}
        </div>
      `).join("")}
    </div>
  `;
}

function renderNewsFilters() {
  const filters = buildNewsFilterPresets();
  return `
    <div class="filters-row">
      ${filters.map(filter => `
        <button class="chip ${state.currentNewsFilterKey === filter.key ? "active" : ""}" onclick="switchNewsFilter('${filter.key}')">${escapeHtml(filter.label)}</button>
      `).join("")}
    </div>
  `;
}

function truncateSecondaryCopy(text, max = 110) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (!isCasualMode() || raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}…`;
}

function renderFeaturedNews(item, filter, phase = getNewsWeekendPhase()) {
  if (!item) return "";
  const category = categorizeNewsItem(item);
  const importance = getNewsImportanceLabel(item, filter, phase);
  const importanceClass = getNewsImportanceClass(item, filter, phase);
  const impactText = truncateSecondaryCopy(getNewsImpactText(item, filter, phase), 115);

  return `
    <div class="news-hero">
      <div class="mini-pill">DESTACADA</div>
      <div class="news-hero-title">${escapeHtml(item.title)}</div>
      <div class="news-hero-sub">${escapeHtml(item.source || "Noticias")}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
      <div class="news-meta-row">
        <span class="tag ${category.key}">${escapeHtml(category.label)}</span>
        <span class="tag ${importanceClass}">${escapeHtml(importance)}</span>
        <a class="btn-secondary" href="${item.link}" target="_blank" rel="noopener noreferrer" style="width:auto; padding:10px 14px;">Abrir noticia</a>
      </div>
      <div class="info-line" style="margin-top:12px;">${escapeHtml(impactText)}</div>
    </div>
  `;
}

function renderNewsListItem(item, filter, phase = getNewsWeekendPhase()) {
  const category = categorizeNewsItem(item);
  const importance = getNewsImportanceLabel(item, filter, phase);
  const importanceClass = getNewsImportanceClass(item, filter, phase);
  const impactText = truncateSecondaryCopy(getNewsImpactText(item, filter, phase), 95);

  return `
    <div class="news-item">
      <div class="news-meta-row" style="margin-top:0; margin-bottom:8px;">
        <span class="tag ${category.key}">${escapeHtml(category.label)}</span>
        <span class="tag ${importanceClass}">${escapeHtml(importance)}</span>
      </div>
      <a class="news-link" href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
      <div class="news-source">${escapeHtml(item.source || "Noticias")}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
      <div class="info-line" style="margin-top:8px;">${escapeHtml(impactText)}</div>
    </div>
  `;
}

function renderNewsPhaseCard(phase) {
  const copy = getNewsPhaseCopy(phase);

  return `
    <div class="card">
      <div class="card-title">${escapeHtml(copy.title)}</div>
      <div class="news-meta-row" style="margin-top:10px;">
        <span class="tag ${getWeekendPhaseTagClass(phase)}">${escapeHtml(getWeekendPhaseLabel(phase))}</span>
      </div>
    </div>
  `;
}

async function refreshCurrentNews() {
  const filter = getActiveNewsFilter();
  if (!filter) return;
  const key = getNewsCacheKey(filter.favoritePayload);
  delete state.homeNewsCache[key];
  showNews();
}

async function showNews() {
  setActiveNav("nav-news");
  updateSubtitle();

  const filter = getActiveNewsFilter();
  const phase = getNewsWeekendPhase();

  contentEl().innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">NOTICIAS</div>
        </div>
        <div class="card-head-actions">
          <button class="icon-btn" onclick="refreshCurrentNews()">Refrescar</button>
        </div>
      </div>
      ${renderNewsFilters()}
    </div>
    ${renderLoadingCard(`Noticias · ${filter.label}`, "Priorizando noticias útiles, portada destacada y claves del día…")}
  `;

  try {
    const data = await fetchNewsDataForFavorite(filter.favoritePayload, false);
    const sortedItems = sortNewsItems(Array.isArray(data?.items) ? data.items : [], filter, phase).slice(0, 10);
    const featured = sortedItems[0] || null;
    const rest = sortedItems.slice(1);

    contentEl().innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">NOTICIAS</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshCurrentNews()">Refrescar</button>
          </div>
        </div>
        ${renderNewsFilters()}
      </div>

      ${renderNewsPhaseCard(phase)}

      <div class="card highlight-card">
        <div class="card-title">Portada · ${escapeHtml(filter.label)}</div>
        ${featured ? renderFeaturedNews(featured, filter, phase) : `<div class="empty-line">No hay una noticia destacada disponible ahora mismo.</div>`}
      </div>

      ${isExpertMode() ? renderContextGlossaryCard("news", phase) : ""}

      <div class="card">
        <div class="card-title">3 claves del día</div>
        ${renderNewsKeyLines(sortedItems, filter, phase)}
      </div>

      <div class="card">
        <div class="card-title">Más noticias</div>
        ${rest.length
          ? rest.map(item => renderNewsListItem(item, filter, phase)).join("")
          : `<div class="empty-line">No se han encontrado noticias adicionales ahora mismo.</div>`}
      </div>
    `;
  } catch (error) {
    contentEl().innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">NOTICIAS</div>
            <div class="card-sub">Error al cargar el panel de noticias.</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshCurrentNews()">Reintentar</button>
          </div>
        </div>
        ${renderNewsFilters()}
        <pre class="ai-output">${escapeHtml(error.message)}</pre>
      </div>
    `;
  }
}


window.refreshCurrentNews = refreshCurrentNews;
window.showNews = showNews;
window.switchNewsFilter = switchNewsFilter;

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
    { key: "general", label: "General", favoritePayload: { type: "team", name: "Formula 1", colorClass: "ferrari" } },
    { key: "aston", label: "Aston", favoritePayload: { type: "team", name: "Aston Martin", colorClass: "aston" } },
    { key: "alonso", label: "Alonso", favoritePayload: getDefaultFavorite() },
    { key: "grid", label: "Parrilla", favoritePayload: { type: "team", name: "Formula 1", colorClass: "ferrari" } },
    { key: "technical", label: "Técnica", favoritePayload: { type: "team", name: "Formula 1", colorClass: "mercedes" } },
    { key: "market", label: "Mercado", favoritePayload: { type: "team", name: "Formula 1", colorClass: "ferrari" } },
    { key: "performance", label: "Rendimiento", favoritePayload: { type: "team", name: "Formula 1", colorClass: "mclaren" } }
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
    return { key: "performance", label: "Rendimiento" };
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

  if (filter?.key === "general") {
    base.push("grand prix", "formula 1", "f1", "championship", "qualifying", "race");
  }

  if (filter?.key === "technical") {
    base.push("upgrade", "package", "floor", "aero", "set-up", "setup", "wind tunnel", "simulator", "degradation");
  }

  if (filter?.key === "market") {
    base.push("contract", "seat", "driver market", "renewal", "fich", "mercado", "replace", "line-up");
  }

  if (filter?.key === "performance") {
    base.push("pace", "ritmo", "qualy", "qualifying", "race pace", "stint", "degradation", "podium");
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
  if (categoryKey === "performance") return 14;
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

  if (filter?.key === "technical" && category.key === "technical") score += 12;
  if (filter?.key === "market" && category.key === "market") score += 12;
  if (filter?.key === "performance" && category.key === "performance") score += 12;
  if (filter?.key === "general") score += 2;

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

  if (score >= 34) return "priority-high";
  if (score >= 24) return "relevance-high";
  if (score >= 16) return "tracking";
  return "context";
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

function getNewsImpactTier(item, filter, phase = getNewsWeekendPhase()) {
  const lens = getNewsEditorialLens(item, filter, phase);
  const score = scoreNewsItem(item, filter, phase);

  if (lens.isPerformanceLed && score >= 24) {
    return {
      label: "Impacto real",
      className: "statement",
      text: "Hay señales operativas para el GP: no es solo narrativa."
    };
  }

  if (lens.isNarrative && !lens.isPerformanceLed) {
    return {
      label: "Humo narrativo",
      className: "market",
      text: "Úsalo como contexto de paddock; necesita confirmación en pista."
    };
  }

  return {
    label: "Contexto útil",
    className: "general",
    text: "Aporta lectura de entorno, con impacto indirecto."
  };
}

function getNewsEditorialLens(item, filter, phase = getNewsWeekendPhase()) {
  const text = normalizeText(`${item?.title || ""} ${item?.source || ""}`);
  const category = categorizeNewsItem(item);
  const favorite = filter?.favoritePayload || getFavorite();
  const favoriteName = normalizeText(favorite?.name || "");
  const favoriteTeam = normalizeText(favorite?.team || favorite?.name || "");

  const affectsFavorite = Boolean(
    favoriteName && text.includes(favoriteName)
  ) || Boolean(
    favoriteTeam && text.includes(favoriteTeam)
  );

  const affectsGp = containsAny(text, [
    "grand prix", "race", "qualifying", "qualy", "grid", "strategy", "pace", "ritmo", "degradation", "sprint", "fp1", "fp2"
  ]) || ["friday", "saturday", "sunday"].includes(phase);

  const isPerformanceLed = ["technical", "reliability", "performance"].includes(category.key)
    || containsAny(text, ["pace", "ritmo", "setup", "degradation", "tyre", "strategy", "data", "upgrade"]);

  const isNarrative = category.key === "statement"
    || containsAny(text, ["said", "dice", "claims", "rumor", "rumour", "speculation", "declar"]);

  return {
    affectsFavorite,
    affectsGp,
    isPerformanceLed,
    isNarrative
  };
}

function getNewsEditorialSignals(item, filter, phase = getNewsWeekendPhase()) {
  const lens = getNewsEditorialLens(item, filter, phase);
  const signals = [];

  if (lens.affectsFavorite) signals.push("Afecta al favorito");
  if (lens.affectsGp) signals.push("Afecta al GP");
  if (lens.isPerformanceLed) signals.push("Impacto de rendimiento real");
  if (lens.isNarrative && !lens.isPerformanceLed) signals.push("Más narrativa que ritmo");

  return signals;
}

function getNewsQuickPriorityText(item, filter, phase = getNewsWeekendPhase()) {
  const importance = getNewsImportanceLabel(item, filter, phase);
  const lens = getNewsEditorialLens(item, filter, phase);

  if (importance === "Alta prioridad") return "Míralo primero";
  if (lens.affectsFavorite) return "Prioridad para tu favorito";
  if (lens.affectsGp) return "Importante para seguir el GP";
  return "Útil como contexto";
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
  const maxLines = isExpertMode() ? 3 : 2;
  const top = sortNewsItems(items, filter, phase).slice(0, maxLines);

  if (!top.length) {
    return `<div class="empty-line">No hay claves destacadas disponibles ahora mismo.</div>`;
  }

  return `
    <div class="insight-list">
      ${top.map(item => `
        <div class="insight-item">
          <div class="news-meta-row" style="margin-bottom:8px;">
            <span class="tag ${getNewsImportanceClass(item, filter, phase)}">${escapeHtml(getNewsImportanceLabel(item, filter, phase))}</span>
            <span class="tag ${categorizeNewsItem(item).key}">${escapeHtml(categorizeNewsItem(item).label)}</span>
          </div>
          <strong>${escapeHtml(item.title)}</strong><br>
          ${escapeHtml(isExpertMode() ? getNewsImpactText(item, filter, phase) : getNewsQuickPriorityText(item, filter, phase))}
          ${isExpertMode()
            ? `<div class="news-meta-row" style="margin-top:8px;">
                ${getNewsEditorialSignals(item, filter, phase).slice(0, 3).map(signal => `<span class="tag context">${escapeHtml(signal)}</span>`).join("")}
              </div>`
            : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderNewsFilters() {
  const filters = buildNewsFilterPresets();
  return `
    <div class="news-filters-v2 filters-row">
      ${filters.map(filter => `
        <button class="chip ${state.currentNewsFilterKey === filter.key ? "active" : ""}" onclick="switchNewsFilter('${filter.key}')">
          ${escapeHtml(filter.label)}
          ${state.currentNewsFilterKey === filter.key ? `<span class="news-filter-dot"></span>` : ""}
        </button>
      `).join("")}
    </div>
  `;
}

function getNewsSecondaryFilter() {
  if (!window.__racecontrolNewsSecondaryFilter) {
    window.__racecontrolNewsSecondaryFilter = "all";
  }
  return window.__racecontrolNewsSecondaryFilter;
}

function setNewsSecondaryFilter(key = "all") {
  window.__racecontrolNewsSecondaryFilter = key || "all";
  showNews();
}

function applyNewsSecondaryFilter(items, filter, phase) {
  const mode = getNewsSecondaryFilter();
  if (!Array.isArray(items) || mode === "all") return items || [];

  if (mode.startsWith("cat:")) {
    const target = mode.replace("cat:", "");
    return items.filter(item => categorizeNewsItem(item).key === target);
  }

  if (mode.startsWith("prio:")) {
    const target = mode.replace("prio:", "");
    return items.filter(item => getNewsImportanceClass(item, filter, phase) === target);
  }

  if (mode.startsWith("impact:")) {
    const target = mode.replace("impact:", "");
    return items.filter(item => {
      const tier = getNewsImpactTier(item, filter, phase);
      if (target === "real") return tier.label === "Impacto real";
      if (target === "narrative") return tier.label === "Humo narrativo";
      return true;
    });
  }

  return items;
}

function renderNewsSecondaryFilters() {
  const active = getNewsSecondaryFilter();
  const chips = [
    { key: "all", label: "Todo" },
    { key: "impact:real", label: "Impacto real" },
    { key: "impact:narrative", label: "Humo narrativo" },
    { key: "cat:technical", label: "Técnica" },
    { key: "cat:reliability", label: "Fiabilidad" },
    { key: "cat:market", label: "Mercado" },
    { key: "cat:statement", label: "Declaración" },
    { key: "cat:performance", label: "Rendimiento" },
    { key: "prio:priority-high", label: "Alta prioridad" },
    { key: "prio:relevance-high", label: "Muy relevante" }
  ];

  return `
    <div class="news-filters-v2 filters-row">
      ${chips.map(chip => `
        <button class="chip ${active === chip.key ? "active" : ""}" onclick="setNewsSecondaryFilter('${chip.key}')">
          ${escapeHtml(chip.label)}
        </button>
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

function getNewsWhoIsAffected(item, filter, phase = getNewsWeekendPhase()) {
  const lens = getNewsEditorialLens(item, filter, phase);
  if (lens.affectsFavorite) return "Afecta directamente al favorito.";
  if (lens.affectsGp) return "Afecta al guion competitivo del GP.";
  if (categorizeNewsItem(item).key === "market") return "Afecta al paddock y a la lectura de mercado.";
  return "Afecta sobre todo a la lectura global de la parrilla.";
}

function renderNewsPortadaBrief(item, filter, phase = getNewsWeekendPhase()) {
  if (!item) return "";
  const impactTier = getNewsImpactTier(item, filter, phase);

  return `
    <div class="insight-list news-portada-brief">
      <div class="insight-item"><strong>Qué pasa:</strong> ${escapeHtml(item.title || "Sin titular disponible.")}</div>
      <div class="insight-item"><strong>Por qué importa:</strong> ${escapeHtml(getNewsImpactText(item, filter, phase))}</div>
      <div class="insight-item"><strong>A quién afecta:</strong> ${escapeHtml(getNewsWhoIsAffected(item, filter, phase))}</div>
      ${isExpertMode() ? `<div class="insight-item"><strong>Lectura editorial:</strong> ${escapeHtml(impactTier.text)}</div>` : ""}
    </div>
  `;
}

function renderFeaturedNews(item, filter, phase = getNewsWeekendPhase()) {
  if (!item) return "";
  const category = categorizeNewsItem(item);
  const importance = getNewsImportanceLabel(item, filter, phase);
  const importanceClass = getNewsImportanceClass(item, filter, phase);
  const impactText = truncateSecondaryCopy(getNewsImpactText(item, filter, phase), 115);
  const signals = getNewsEditorialSignals(item, filter, phase);
  const impactTier = getNewsImpactTier(item, filter, phase);

  return `
    <div class="news-hero news-hero-v2">
      <div class="mini-pill">PORTADA</div>
      <div class="news-hero-title">${escapeHtml(item.title)}</div>
      <div class="news-hero-sub">${escapeHtml(item.source || "Noticias")}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
      <div class="news-meta-row">
        <span class="tag ${category.key}">${escapeHtml(category.label)}</span>
        <span class="tag ${importanceClass}">${escapeHtml(importance)}</span>
        <span class="tag ${impactTier.className}">${escapeHtml(impactTier.label)}</span>
        <span class="tag context">${escapeHtml(getNewsQuickPriorityText(item, filter, phase))}</span>
        <a class="btn-secondary" href="${item.link}" target="_blank" rel="noopener noreferrer" style="width:auto; padding:10px 14px;">Abrir noticia</a>
      </div>
      ${renderNewsPortadaBrief(item, filter, phase)}
      <div class="news-why-block">
        <div class="news-why-title">Por qué importa</div>
        <div class="info-line" style="margin-top:8px;">${escapeHtml(impactText)}</div>
        <div class="news-meta-row" style="margin-top:8px;">
          <span class="tag ${impactTier.className}">${escapeHtml(impactTier.text)}</span>
        </div>
      </div>
      ${isExpertMode() ? `
        <div class="news-meta-row" style="margin-top:10px;">
          ${signals.map(signal => `<span class="tag context">${escapeHtml(signal)}</span>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderNewsListItem(item, filter, phase = getNewsWeekendPhase()) {
  const category = categorizeNewsItem(item);
  const importance = getNewsImportanceLabel(item, filter, phase);
  const importanceClass = getNewsImportanceClass(item, filter, phase);
  const impactText = truncateSecondaryCopy(getNewsImpactText(item, filter, phase), isExpertMode() ? 132 : 88);
  const signals = getNewsEditorialSignals(item, filter, phase);
  const impactTier = getNewsImpactTier(item, filter, phase);

  return `
    <div class="news-item news-item-v2 ${isExpertMode() ? "expert" : "casual"}">
      <div class="news-meta-row" style="margin-top:0; margin-bottom:8px;">
        <span class="tag ${category.key}">${escapeHtml(category.label)}</span>
        <span class="tag ${importanceClass}">${escapeHtml(importance)}</span>
        ${isExpertMode() ? `<span class="tag ${impactTier.className}">${escapeHtml(impactTier.label)}</span>` : ""}
      </div>
      <a class="news-link" href="${item.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
      <div class="news-source">${escapeHtml(item.source || "Noticias")}${formatNewsDate(item.pubDate) ? ` · ${formatNewsDate(item.pubDate)}` : ""}</div>
      <div class="info-line" style="margin-top:8px;">${escapeHtml(impactText)}</div>
      ${isExpertMode() && signals.length
        ? `<div class="news-meta-row" style="margin-top:8px;">${signals.slice(0, 3).map(signal => `<span class="tag context">${escapeHtml(signal)}</span>`).join("")}</div>`
        : ""}
    </div>
  `;
}

function renderNewsPhaseCard(phase) {
  const copy = getNewsPhaseCopy(phase);

  return `
    <div class="card news-phase-v2">
      <div class="card-title">${escapeHtml(copy.title)}</div>
      <div class="card-sub">${escapeHtml(copy.sub)}</div>
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
  rememberScreen("news");
  updateSubtitle();

  const filter = getActiveNewsFilter();
  const phase = getNewsWeekendPhase();
  const favorite = getFavorite();
  const raceName = getSelectedRace();
  const predictData = getActivePredictDataForRace(favorite, raceName);

  contentEl().innerHTML = `
    <div class="card news-header-v2">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">NOTICIAS</div>
          <div class="card-sub">${isExpertMode() ? "Lectura editorial con impacto real, prioridad y contexto de GP." : "Portada rápida para entender qué pasa y qué mirar primero."}</div>
        </div>
        <div class="card-head-actions">
          <button class="icon-btn" onclick="refreshCurrentNews()">Refrescar</button>
        </div>
      </div>
      ${renderNewsFilters()}
      ${renderNewsSecondaryFilters()}
    </div>
    ${renderLoadingCard(`Noticias · ${filter.label}`, "Priorizando noticias útiles, portada destacada y claves del día…")}
  `;

  try {
    const data = await fetchNewsDataForFavorite(filter.favoritePayload, false);
    const sorted = sortNewsItems(Array.isArray(data?.items) ? data.items : [], filter, phase);
    const sortedItems = applyNewsSecondaryFilter(sorted, filter, phase).slice(0, 10);
    const featured = sortedItems[0] || null;
    const rest = sortedItems.slice(1);
    const importantRest = rest.filter(item => ["priority-high", "relevance-high"].includes(getNewsImportanceClass(item, filter, phase)));
    const contextRest = rest.filter(item => !["priority-high", "relevance-high"].includes(getNewsImportanceClass(item, filter, phase)));

    contentEl().innerHTML = `
      <div class="card news-header-v2">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">NOTICIAS</div>
            <div class="card-sub">${isExpertMode() ? "Lectura editorial con impacto real, prioridad y contexto de GP." : "Portada rápida para entender qué pasa y qué mirar primero."}</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshCurrentNews()">Refrescar</button>
          </div>
        </div>
        ${renderNewsFilters()}
        ${renderNewsSecondaryFilters()}
      </div>

      ${renderFavoriteQuickSelectorCard({
        title: "Favorito editorial",
        subtitle: "Cámbialo para rehacer portada y prioridad en un toque.",
        returnView: "showNews",
        compact: true
      })}
      ${renderFavoritePersonalPulseCard({
        favorite,
        raceName,
        predictData,
        context: state.weekendContext,
        title: "Contexto del favorito en noticias",
        expert: isExpertMode()
      })}

      ${renderNewsPhaseCard(phase)}

      <div class="card highlight-card news-portada-v2">
        <div class="card-title">Portada · ${escapeHtml(filter.label)}</div>
        ${featured ? renderFeaturedNews(featured, filter, phase) : `<div class="empty-line">No hay una noticia destacada disponible ahora mismo.</div>`}
      </div>

      <div class="card news-keys-v2">
        <div class="card-title">${isExpertMode() ? "Claves editoriales del día" : "3 claves del día"}</div>
        <div class="card-sub">${isExpertMode() ? "Qué merece seguimiento inmediato y qué es más contexto." : "Lectura rápida para saber qué mirar primero."}</div>
        ${renderNewsKeyLines(sortedItems, filter, phase)}
      </div>

      <div class="card news-list-v2">
        <div class="card-title">${isExpertMode() ? "Seguimiento y contexto" : "Más noticias"}</div>
        <div class="card-sub">${isExpertMode() ? "Separación editorial: primero lo importante, luego contexto de paddock." : "Resto de titulares ordenados por relevancia."}</div>
        ${isExpertMode() ? `
          <div class="mini-pill" style="margin-top:10px;">Importantes ahora</div>
          ${importantRest.length
            ? importantRest.map(item => renderNewsListItem(item, filter, phase)).join("")
            : `<div class="empty-line">No hay noticias de alta prioridad adicionales.</div>`}
          <div class="mini-pill" style="margin-top:12px;">Contexto y seguimiento</div>
          ${contextRest.length
            ? contextRest.map(item => renderNewsListItem(item, filter, phase)).join("")
            : `<div class="empty-line">No hay noticias de contexto adicionales.</div>`}
        ` : rest.length
          ? rest.map(item => renderNewsListItem(item, filter, phase)).join("")
          : `<div class="empty-line">No se han encontrado noticias adicionales ahora mismo.</div>`}
      </div>

      ${renderContextGlossaryCard("news", phase)}
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
window.setNewsSecondaryFilter = setNewsSecondaryFilter;

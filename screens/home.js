/* ===== HOME · MODO EXPERIENCIA ===== */

function getHomeSimpleNewsPreview() {
  const favorite = getFavorite();
  const filter = { key: "favorite", favoritePayload: favorite };
  const cacheKey = getNewsCacheKey(filter.favoritePayload);
  const cached = state.homeNewsCache?.[cacheKey];
  const items = Array.isArray(cached?.items) ? cached.items : [];
  const phase = getNewsWeekendPhase();
  const top = sortNewsItems(items, filter, phase)[0] || null;
  const safeUrl = sanitizeExternalUrl(top?.link);

  if (!top) {
    return `
      <div class="card">
        <div class="card-title">Noticias</div>
        <div class="empty-line">Carga Noticias para ver la portada destacada del día.</div>
      </div>
    `;
  }

  return `
    <div class="card home-news-preview-card">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">Noticias</div>
          
        </div>
        <div class="card-head-actions">
          <a href="#" class="home-news-cta" onclick="showNews(); return false;">Ver noticias</a>
        </div>
      </div>
      <div class="news-item" style="margin-top:10px;">
        ${safeUrl
      ? `<a class="news-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(top.title)}</a>`
      : `<span class="news-link">${escapeHtml(top.title)}</span>`}
        <div class="news-source">${escapeHtml(top.source || "Noticias")}${formatNewsDate(top.pubDate) ? ` · ${formatNewsDate(top.pubDate)}` : ""}</div>
      </div>
    </div>
  `;
}

function renderHomeWhatToWatchCard(context) {
  const items = rc10Take(context?.whatToWatch || [], 3);

  return `
    <div class="card home-expert-card home-compact-card home-expert-tight">
      <div class="card-title">Qué mirar</div>
      <div class="insight-list">
        ${(items.length ? items : ["Sin claves activas ahora mismo."]).map(item => `<div class="insight-item">${escapeHtml(item)}</div>`).join("")}
      </div>
    </div>
  `;
}

function renderHomePhaseSummaryCard(context) {
  if (!context) return "";

  return `
    <div class="card home-expert-card home-compact-card home-expert-tight">
      <div class="card-title">Resumen de fase</div>
      <div class="info-line">${escapeHtml(context.focusDescription || "Sin resumen disponible.")}</div>
      <div class="news-meta-row home-compact-tags">
        <span class="tag ${getWeekendPhaseTagClass(context.phase)}">${escapeHtml(context.phaseLabel || "Previa")}</span>
        <span class="tag general">${context.isSprint ? "Sprint weekend" : "Formato normal"}</span>
      </div>
    </div>
  `;
}

function renderHomeHierarchy(context, favorite) {
  const target = context?.currentSession || context?.nextSession || context?.lastCompletedSession;
  if (!target) return "";

  return `
    <div class="card home-expert-card home-compact-card home-hierarchy-card home-expert-tight">
      <div class="card-title">Jerarquía rápida</div>
      <div class="insight-list home-hierarchy-list">
        <div class="insight-item home-hierarchy-item"><strong>1) Sesión clave</strong><br>${escapeHtml(target.label)} · ${escapeHtml(getSessionStatusLabel(target.status))}</div>
        <div class="insight-item home-hierarchy-item"><strong>2) Impacto favorito</strong><br>${escapeHtml(getSessionImpactOnFavorite(target.key, favorite))}</div>
        <div class="insight-item home-hierarchy-item"><strong>3) Siguiente paso</strong><br>${escapeHtml(context?.nextSessionCountdown || "Esperando nueva referencia")}</div>
      </div>
    </div>
  `;
}

function renderHomeTeamStatus(favorite) {
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const team = getTeamData(teamName);
  if (!team) return "";

  return `
    <div class="card home-expert-card home-team-status-card home-expert-tight">
      <div class="card-title">Estado del equipo</div>
      <div class="meta-grid home-team-status-grid">
        <div class="meta-tile home-team-status-tile">
          <div class="meta-kicker">Carrera</div>
          <div class="meta-value home-team-status-value">${team.racePace}%</div>
          <div class="meta-caption">Ritmo</div>
        </div>
        <div class="meta-tile home-team-status-tile">
          <div class="meta-kicker">Qualy</div>
          <div class="meta-value home-team-status-value">${team.qualyPace}%</div>
          <div class="meta-caption">1 vuelta</div>
        </div>
        <div class="meta-tile home-team-status-tile">
          <div class="meta-kicker">Fiabilidad</div>
          <div class="meta-value home-team-status-value">${team.reliability}%</div>
          <div class="meta-caption">Base</div>
        </div>
      </div>
    </div>
  `;
}

function renderHomeCompetitivePulse(favorite, raceName, predictData) {
  const snapshot = getFavoriteComparativeSnapshot(favorite, raceName, predictData);
  if (!snapshot) return "";

  const rivalName = snapshot.championship?.type === "driver"
    ? snapshot.championship?.directRival?.name
    : snapshot.championship?.directRival?.team;
  const rivalGap = snapshot.championship?.rivalGap;

  if (isCasualMode()) {
    return `
      <div class="card home-expert-card home-compact-card home-expert-tight">
        <div class="card-title">Pulso competitivo</div>
        <div class="info-line">
          ${escapeHtml(snapshot.metrics.trendInfo.label)} · objetivo ${escapeHtml(snapshot.objective.realistic)} ·
          rival ${escapeHtml(rivalName || "sin referencia")} ${rivalGap != null ? `(${rivalGap} pts)` : ""}.
        </div>
      </div>
    `;
  }

  return `
    <div class="card home-expert-card home-compact-card home-expert-tight">
      <div class="card-title">Pulso competitivo</div>
      <div class="meta-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Tendencia</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(snapshot.metrics.trendInfo.label)}</div>
          <div class="meta-caption">${escapeHtml(snapshot.metrics.trendInfo.description)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Objetivo razonable</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(snapshot.objective.realistic)}</div>
          <div class="meta-caption">Mín ${escapeHtml(snapshot.objective.minimum)} · Techo ${escapeHtml(snapshot.objective.high)}</div>
        </div>
      </div>
      <div class="info-line" style="margin-top:10px;">${escapeHtml(snapshot.rivalRead)}</div>
    </div>
  `;
}

function renderHomeDynamicBlocks(context, favorite) {
  const expert = isExpertMode();
  const phase = context?.phase || "pre_weekend";
  const raceName = context?.raceName || getSelectedRace();
  const predictData = getActivePredictDataForRace(favorite, raceName);

  return `
    ${renderHomePhaseHero(context)}
    ${renderHomeNowCard(context, favorite, { compact: true })}
    ${renderHomeCompetitivePulse(favorite, raceName, predictData)}
    ${renderHomeQuickLinks(context)}
    ${expert ? renderHomeWhatToWatchCard(context) : ""}
    ${getHomeSimpleNewsPreview()}
    ${expert ? renderHomeTeamStatus(favorite) : ""}
    ${expert ? renderContextGlossaryCard("home", phase) : ""}
  `;
}

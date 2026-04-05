/* ===== FASE 10 · CIERRE VISUAL FINAL ===== */
/* Favorito + Calendario + Modo carrera */
/* Overrides de render/UI al final para no tocar la base */

function rc10Take(items, max = 2) {
  return (Array.isArray(items) ? items : []).slice(0, max);
}

function rc10PickBestWorstArea(map, labels = {}) {
  const rows = Object.entries(map || {})
    .map(([key, value]) => ({
      key,
      value: Number(value || 0),
      label: labels[key] || key
    }))
    .sort((a, b) => b.value - a.value);

  return {
    best: rows[0] || { label: "—", value: 0 },
    worst: rows[rows.length - 1] || { label: "—", value: 0 }
  };
}

function rc10GetTeamAreaEdges(teamData) {
  return rc10PickBestWorstArea(
    {
      aero: teamData?.aero,
      traction: teamData?.traction,
      topSpeed: teamData?.topSpeed,
      tyreManagement: teamData?.tyreManagement
    },
    {
      aero: "Aero",
      traction: "Tracción",
      topSpeed: "Vel. punta",
      tyreManagement: "Neumáticos"
    }
  );
}
/* ===== FAVORITO · versión más limpia ===== */

function renderFavoritoComparisonAdvancedCard(favorite) {
  const breakdown = getFavoriteComparisonBreakdown(favorite);

  return `
    <div class="card">
      <div class="card-title">${escapeHtml(breakdown.title)}</div>

      <div class="meta-grid" style="margin-top:14px;">
        ${breakdown.items.map(item => `
          <div class="meta-tile">
            <div class="meta-kicker">${escapeHtml(item.kicker)}</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(item.value)}</div>
            <div class="meta-caption">${escapeHtml(item.caption)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFavoritoObjectiveCard(favorite, raceName, predictData, context) {
  const objective = getFavoriteWeekendObjective(favorite, raceName, predictData, context);

  return `
    <div class="card">
      <div class="card-title">Objetivo</div>

      <div class="grid-stats" style="margin-top:14px;">
        <div class="stat-tile">
          <div class="stat-kicker">Mínimo</div>
          <div class="stat-value" style="font-size:22px;">${escapeHtml(objective.minimum)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Razonable</div>
          <div class="stat-value" style="font-size:22px;">${escapeHtml(objective.realistic)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Techo</div>
          <div class="stat-value" style="font-size:22px;">${escapeHtml(objective.high)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderFavoritoRadarCard(favorite, raceName, context, predictData) {
  const items = getFavoriteWeekendRadar(favorite, raceName, context, predictData);

  return `
    <div class="card">
      <div class="card-title">Claves</div>

      <div class="insight-list" style="margin-top:12px;">
        ${items.map(item => `
          <div class="insight-item">
            <strong>${escapeHtml(item.title)}</strong>
            ${escapeHtml(item.text)}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFavoritoDirectRivalsCard(favorite, predictData) {
  const rivals = getFavoriteDirectRivals(favorite, state.standingsCache, predictData);

  return `
    <div class="card">
      <div class="card-title">Rivales directos</div>

      ${rivals.length ? rivals.map(rival => `
        <div class="standing-row">
          <div class="row-left">
            <div class="row-stripe ${escapeHtml(rival.colorClass)}"></div>
            <div class="row-info">
              <div class="row-name">${escapeHtml(rival.title)}</div>
              <div class="row-team">${escapeHtml(rival.sub)}</div>
            </div>
          </div>
          <div class="row-badges">
            <div class="row-points">${escapeHtml(rival.meta)}</div>
          </div>
        </div>
      `).join("") : `<div class="empty-line">No hay rivales directos claros cargados ahora mismo.</div>`}
    </div>
  `;
}
/* ===== FAVORITO ===== */

function renderFavoritoTechnicalCard(favorite, teamName, teamData, accent) {
  const edges = rc10GetTeamAreaEdges(teamData);

  return `
    <div class="card">
      <div class="card-title">Panel técnico</div>

      <div class="stat">Ritmo carrera <span>${teamData.racePace}%</span></div>
      <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.racePace}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Qualy <span>${teamData.qualyPace}%</span></div>
      <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.qualyPace}%;"></div></div>

      <div class="stat" style="margin-top:14px;">Fiabilidad <span>${teamData.reliability}%</span></div>
      <div class="bar"><div class="bar-fill ferrari" style="width:${teamData.reliability}%;"></div></div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Punto fuerte</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(edges.best.label)}</div>
          <div class="meta-caption">${edges.best.value}%</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">A vigilar</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(edges.worst.label)}</div>
          <div class="meta-caption">${edges.worst.value}%</div>
        </div>
      </div>
    </div>
  `;
}

function renderFavoritoCircuitFitCard(favorite, raceName) {
  const fit = getFavoriteCircuitFit(favorite, raceName);
  const areas = rc10PickBestWorstArea(
    fit.fit,
    {
      aero: "Aero",
      traction: "Tracción",
      topSpeed: "Vel. punta",
      tyreManagement: "Neumáticos"
    }
  );

  return `
    <div class="card">
      <div class="card-title">Encaje circuito</div>

      ${renderCircuitThumb(raceName, 76)}

      <div class="news-meta-row" style="margin-top:2px; margin-bottom:14px;">
        <span class="tag general">${escapeHtml(raceName)}</span>
        <span class="tag ${fit.overall >= 78 ? "statement" : fit.overall >= 66 ? "market" : "reliability"}">${escapeHtml(fit.label)}</span>
      </div>

      <div class="meta-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Encaje</div>
          <div class="meta-value" style="font-size:18px;">${fit.overall}%</div>
          <div class="meta-caption">Global</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Mejor área</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(areas.best.label)}</div>
          <div class="meta-caption">${areas.best.value}%</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">A vigilar</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(areas.worst.label)}</div>
          <div class="meta-caption">${areas.worst.value}%</div>
        </div>
      </div>

      <div class="info-line" style="margin-top:14px;">${escapeHtml(fit.demand.note)}</div>
    </div>
  `;
}

function showFavorito() {
  setActiveNav("nav-favorito");
  updateSubtitle();

  const favorite = getFavorite();
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const accent = favorite.colorClass;
  const teamData = getTeamData(teamName);
  const context = getHomeWeekendContext() || state.weekendContext;
  const raceName = context?.raceName || getSelectedRace();
  const predictData = getActivePredictDataForRace(favorite, raceName);

  const expert = isExpertMode();

  contentEl().innerHTML = `
    ${renderFavoriteCard()}
    ${renderFavoritoHeroContextCard(favorite, raceName, predictData, context)}
    ${renderFavoritoObjectiveCard(favorite, raceName, predictData, context)}
    ${renderFavoritoTechnicalCard(favorite, teamName, teamData, accent)}
    ${renderFavoritoCircuitFitCard(favorite, raceName)}
    ${expert ? renderFavoritoRadarCard(favorite, raceName, context, predictData) : ""}
    ${expert ? renderFavoritoComparisonAdvancedCard(favorite) : ""}
    ${renderFavoritoDirectRivalsCard(favorite, predictData)}
  `;
}

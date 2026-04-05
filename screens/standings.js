function getStandingsOverviewData() {
  const favorite = getFavorite();
  const data = state.standingsCache;
  if (!data) return null;

  if (favorite.type === "driver") {
    const favoriteDriver = data.drivers?.find(d => d.name === favorite.name);
    const leader = data.drivers?.[0];
    const ahead = favoriteDriver ? data.drivers?.find(d => d.pos === favoriteDriver.pos - 1) : null;
    const behind = favoriteDriver ? data.drivers?.find(d => d.pos === favoriteDriver.pos + 1) : null;
    return { leader, favoriteDriver, ahead, behind, type: "drivers" };
  }

  const favoriteTeam = data.teams?.find(t => t.team === favorite.name);
  const leader = data.teams?.[0];
  const ahead = favoriteTeam ? data.teams?.find(t => t.pos === favoriteTeam.pos - 1) : null;
  const behind = favoriteTeam ? data.teams?.find(t => t.pos === favoriteTeam.pos + 1) : null;
  return { leader, favoriteTeam, ahead, behind, type: "teams" };
}

function renderStandingsOverviewCard() {
  const overview = getStandingsOverviewData();
  if (!overview) return "";

  if (overview.type === "drivers") {
    return `
      <div class="card">
        <div class="card-title">Campeonato</div>

        <div class="meta-grid" style="margin-top:14px;">
          <div class="meta-tile">
            <div class="meta-kicker">Líder</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(overview.leader?.name || "—")}</div>
            <div class="meta-caption">${overview.leader ? `${overview.leader.points} pts` : "Sin datos"}</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Favorito</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(overview.favoriteDriver ? `P${overview.favoriteDriver.pos}` : "—")}</div>
            <div class="meta-caption">${escapeHtml(overview.favoriteDriver?.name || "No cargado")}</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Pelea directa</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(overview.ahead?.name || overview.behind?.name || "—")}</div>
            <div class="meta-caption">Rival más cercano</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-title">Campeonato</div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Líder</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(overview.leader?.team || "—")}</div>
          <div class="meta-caption">${overview.leader ? `${overview.leader.points} pts` : "Sin datos"}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Equipo fav.</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(overview.favoriteTeam ? `P${overview.favoriteTeam.pos}` : "—")}</div>
          <div class="meta-caption">${escapeHtml(overview.favoriteTeam?.team || "No cargado")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Pelea directa</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(overview.ahead?.team || overview.behind?.team || "—")}</div>
          <div class="meta-caption">Rival más cercano</div>
        </div>
      </div>
    </div>
  `;
}

function renderStandingsBattleCard() {
  const overview = getStandingsOverviewData();
  if (!overview) return "";

  const items = [overview.ahead, overview.behind].filter(Boolean);

  return `
    <div class="card">
      <div class="card-title">Batalla directa</div>

      ${items.length ? items.map(item => `
        <div class="standing-row">
          <div class="row-left">
            <div class="row-pos-wrap"><div class="row-pos">${item.pos}</div></div>
            <div class="row-stripe ${escapeHtml(item.colorClass || getTeamColorClass(item.team))}"></div>
            <div class="row-info">
              <div class="row-name">${escapeHtml(item.name || item.team)}</div>
              <div class="row-team">${escapeHtml(item.team || item.drivers)}</div>
            </div>
          </div>
          <div class="row-badges">
            <div class="row-points">${escapeHtml(String(item.points))}<small>pts</small></div>
          </div>
        </div>
      `).join("") : `<div class="empty-line">No hay rivales inmediatos detectados.</div>`}
    </div>
  `;
}

function renderStandingsSummaryBlock() {
  const el = document.getElementById("standingsSummaryContent");
  if (!el) return;
  el.innerHTML = `${renderStandingsOverviewCard()}${isExpertMode() ? renderStandingsBattleCard() : ""}`;
}

async function showStandings(force = false) {
  setActiveNav("nav-more");
  updateSubtitle();

  contentEl().innerHTML = `
    ${renderFavoriteCard()}
    ${renderLoadingCard("Clasificación", "Cargando clasificación real, cambios y resaltados…", true)}
  `;

  try {
    await fetchStandingsData(force);

    contentEl().innerHTML = `
      ${renderFavoriteCard()}
      <div id="standingsSummaryContent"></div>

      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">Clasificación</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshStandings()">Refrescar</button>
          </div>
        </div>

        <div class="standings-toggle">
          <button class="toggle-btn ${state.standingsViewType === "drivers" ? "active" : ""}" onclick="setStandingsView('drivers')">Pilotos</button>
          <button class="toggle-btn ${state.standingsViewType === "teams" ? "active" : ""}" onclick="setStandingsView('teams')">Equipos</button>
        </div>

        <div class="standings-toggle">
          <button class="toggle-btn ${state.standingsScope === "top10" ? "active" : ""}" onclick="setStandingsScope('top10')">Top 10</button>
          <button class="toggle-btn ${state.standingsScope === "all" ? "active" : ""}" onclick="setStandingsScope('all')">Todos</button>
        </div>
      </div>

      <div id="standingsContent"></div>
    `;

    renderStandingsSummaryBlock();

    if (state.standingsViewType === "teams") showTeamsStandings();
    else showDriversStandings();
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Clasificación", "Error al cargar la clasificación", error.message);
  }
}


window.showStandings = showStandings;
window.renderStandingsSummaryBlock = renderStandingsSummaryBlock;

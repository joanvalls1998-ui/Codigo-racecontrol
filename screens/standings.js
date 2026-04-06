function getStandingsOverviewData() {
  const favorite = getFavorite();
  const data = state.standingsCache;
  if (!data) return null;

  if (favorite.type === "driver") {
    const favoriteDriver = data.drivers?.find(d => d.name === favorite.name);
    const leader = data.drivers?.[0];
    const ahead = favoriteDriver ? data.drivers?.find(d => d.pos === favoriteDriver.pos - 1) : null;
    const behind = favoriteDriver ? data.drivers?.find(d => d.pos === favoriteDriver.pos + 1) : null;
    const teammate = favoriteDriver ? data.drivers?.find(d => d.team === favoriteDriver.team && d.name !== favoriteDriver.name) : null;
    const directRival = [ahead, behind].filter(Boolean).sort((a, b) => Math.abs((a?.points || 0) - (favoriteDriver?.points || 0)) - Math.abs((b?.points || 0) - (favoriteDriver?.points || 0)))[0] || null;
    return { leader, favoriteDriver, ahead, behind, teammate, directRival, type: "drivers" };
  }

  const favoriteTeam = data.teams?.find(t => t.team === favorite.name);
  const leader = data.teams?.[0];
  const ahead = favoriteTeam ? data.teams?.find(t => t.pos === favoriteTeam.pos - 1) : null;
  const behind = favoriteTeam ? data.teams?.find(t => t.pos === favoriteTeam.pos + 1) : null;
  const directRival = [ahead, behind].filter(Boolean).sort((a, b) => Math.abs((a?.points || 0) - (favoriteTeam?.points || 0)) - Math.abs((b?.points || 0) - (favoriteTeam?.points || 0)))[0] || null;
  return { leader, favoriteTeam, ahead, behind, directRival, type: "teams" };
}

function getStandingsGapLabel(referencePoints, contenderPoints) {
  if (typeof referencePoints !== "number" || typeof contenderPoints !== "number") return "Sin referencia";
  const gap = Math.abs(referencePoints - contenderPoints);
  if (gap === 0) return "Empate de puntos";
  return `${gap} pts de diferencia`;
}

function renderBattleSlot(label, item, favoritePoints, type) {
  if (!item) {
    return `
      <div class="standings-battle-slot">
        <div class="standings-battle-label">${label}</div>
        <div class="standings-battle-empty">—</div>
      </div>
    `;
  }

  const entityName = type === "drivers" ? item.name : item.team;
  const entitySub = type === "drivers" ? item.team : item.drivers;
  const stripeClass = escapeHtml(item.colorClass || getTeamColorClass(item.team || item.team));

  return `
    <div class="standings-battle-slot">
      <div class="standings-battle-label">${label}</div>
      <div class="standings-battle-row">
        ${type === "drivers" ? renderDriverAvatar(entityName, item.image, "row-avatar tiny-avatar") : ""}
        <div class="row-stripe ${stripeClass}"></div>
        <div class="standings-battle-main">
          <div class="standings-battle-name">${escapeHtml(entityName)}</div>
          <div class="standings-battle-sub">${escapeHtml(entitySub || "Sin datos")}</div>
        </div>
        <div class="standings-battle-metrics">
          <div class="standings-battle-pos">P${escapeHtml(String(item.pos))}</div>
          <div class="standings-battle-gap">${escapeHtml(getStandingsGapLabel(favoritePoints, item.points))}</div>
        </div>
      </div>
    </div>
  `;
}

function renderStandingsExpertContextCard() {
  if (!isExpertMode()) return "";
  const overview = getStandingsOverviewData();
  if (!overview) return "";

  if (overview.type === "drivers" && overview.favoriteDriver) {
    const deltas = state.standingsDelta?.drivers || {};
    const movers = Object.entries(deltas)
      .filter(([, delta]) => delta !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const topMover = movers[0];
    const battleFocus = overview.directRival
      ? `La pelea inmediata de ${overview.favoriteDriver.name} está con ${overview.directRival.name} (${getStandingsGapLabel(overview.favoriteDriver.points, overview.directRival.points)}).`
      : `${overview.favoriteDriver.name} está sin rival directo inmediato en su zona.`;
    const teammateRead = overview.teammate
      ? `Dentro del equipo, ${overview.teammate.name} está en P${overview.teammate.pos}.`
      : "No hay referencia de compañero cargada.";

    return `
      <div class="card standings-expert-context">
        <div class="card-title">Lectura experta</div>
        <div class="insight-list">
          <div class="insight-item"><strong>Pelea real:</strong> ${escapeHtml(battleFocus)}</div>
          <div class="insight-item"><strong>Equipo del favorito:</strong> ${escapeHtml(teammateRead)}</div>
          <div class="insight-item"><strong>Movimiento relevante:</strong> ${escapeHtml(topMover ? `${topMover[0]} ${topMover[1] > 0 ? `sube +${topMover[1]}` : `baja ${topMover[1]}`}.` : "No hay cambios de posición desde la última actualización.")}</div>
        </div>
      </div>
    `;
  }

  if (overview.type === "teams" && overview.favoriteTeam) {
    const deltas = state.standingsDelta?.teams || {};
    const movers = Object.entries(deltas)
      .filter(([, delta]) => delta !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const topMover = movers[0];
    const battleFocus = overview.directRival
      ? `La pelea inmediata de ${overview.favoriteTeam.team} está con ${overview.directRival.team} (${getStandingsGapLabel(overview.favoriteTeam.points, overview.directRival.points)}).`
      : `${overview.favoriteTeam.team} está sin pelea inmediata en puntos.`;

    return `
      <div class="card standings-expert-context">
        <div class="card-title">Lectura experta</div>
        <div class="insight-list">
          <div class="insight-item"><strong>Pelea real:</strong> ${escapeHtml(battleFocus)}</div>
          <div class="insight-item"><strong>Brecha con líder:</strong> ${escapeHtml(getStandingsGapLabel(overview.favoriteTeam.points, overview.leader?.points))}</div>
          <div class="insight-item"><strong>Movimiento relevante:</strong> ${escapeHtml(topMover ? `${topMover[0]} ${topMover[1] > 0 ? `sube +${topMover[1]}` : `baja ${topMover[1]}`}.` : "No hay cambios de posición desde la última actualización.")}</div>
        </div>
      </div>
    `;
  }

  return "";
}

function renderStandingsOverviewCard() {
  const overview = getStandingsOverviewData();
  if (!overview) return "";

  if (overview.type === "drivers") {
    return `
      <div class="card standings-overview-v2">
        <div class="card-title">Campeonato</div>

        <div class="meta-grid" style="margin-top:14px;">
          <div class="meta-tile">
            <div class="meta-kicker">Líder</div>
            <div class="meta-value" style="font-size:18px; display:flex; align-items:center; gap:8px;">
              ${overview.leader?.name ? renderDriverAvatar(overview.leader.name, overview.leader.image, "row-avatar tiny-avatar") : ""}
              <span>${escapeHtml(overview.leader?.name || "—")}</span>
            </div>
            <div class="meta-caption">${overview.leader ? `${overview.leader.points} pts` : "Sin datos"}</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Favorito</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(overview.favoriteDriver ? `P${overview.favoriteDriver.pos}` : "—")}</div>
            <div class="meta-caption">${escapeHtml(overview.favoriteDriver?.name || "No cargado")}</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Pelea directa</div>
            <div class="meta-value" style="font-size:18px; display:flex; align-items:center; gap:8px;">
              ${overview.directRival?.name ? renderDriverAvatar(overview.directRival.name, overview.directRival.image, "row-avatar tiny-avatar") : ""}
              <span>${escapeHtml(overview.directRival?.name || "—")}</span>
            </div>
            <div class="meta-caption">${escapeHtml(overview.favoriteDriver && overview.directRival ? getStandingsGapLabel(overview.favoriteDriver.points, overview.directRival.points) : "Rival más cercano")}</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card standings-overview-v2">
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
          <div class="meta-value" style="font-size:18px;">${escapeHtml(overview.directRival?.team || "—")}</div>
          <div class="meta-caption">${escapeHtml(overview.favoriteTeam && overview.directRival ? getStandingsGapLabel(overview.favoriteTeam.points, overview.directRival.points) : "Rival más cercano")}</div>
        </div>
      </div>
    </div>
  `;
}

function renderStandingsBattleCard() {
  const overview = getStandingsOverviewData();
  if (!overview) return "";

  const favoriteName = overview.type === "drivers" ? overview.favoriteDriver?.name : overview.favoriteTeam?.team;
  const favoritePoints = overview.type === "drivers" ? overview.favoriteDriver?.points : overview.favoriteTeam?.points;
  const teammateLine = overview.type === "drivers" && overview.teammate
    ? `<div class="standings-battle-footnote">Compañero clave: ${escapeHtml(overview.teammate.name)} (P${escapeHtml(String(overview.teammate.pos))}).</div>`
    : "";

  return `
    <div class="card standings-battle-v2">
      <div class="card-title">Pelea del favorito</div>
      ${isCasualMode() && favoriteName ? `<div class="info-line">${escapeHtml(`Batalla alrededor de ${favoriteName}.`)}</div>` : ""}
      <div class="standings-battle-grid">
        ${renderBattleSlot("Justo delante", overview.ahead, favoritePoints, overview.type)}
        ${renderBattleSlot("Justo detrás", overview.behind, favoritePoints, overview.type)}
      </div>
      ${teammateLine}
    </div>
  `;
}

function renderStandingsFavoriteContextCard() {
  const favorite = getFavorite();
  const raceName = getSelectedRace();
  const predictData = getActivePredictDataForRace(favorite, raceName);
  const snapshot = getFavoriteComparativeSnapshot(favorite, raceName, predictData);
  if (!snapshot || !snapshot.championship) return "";

  const battleName = snapshot.championship.type === "driver"
    ? snapshot.championship.directRival?.name
    : snapshot.championship.directRival?.team;

  return `
    <div class="card standings-overview-v2">
      <div class="card-title">Lectura fina del campeonato</div>
      
      <div class="meta-grid" style="margin-top:12px;">
        <div class="meta-tile">
          <div class="meta-kicker">Objetivo razonable</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(snapshot.objective.realistic)}</div>
          <div class="meta-caption">Mín ${escapeHtml(snapshot.objective.minimum)} · Techo ${escapeHtml(snapshot.objective.high)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Rival directo</div>
          <div class="meta-value" style="font-size:18px; display:flex; align-items:center; gap:8px;">
            ${snapshot.championship.type === "driver" && battleName ? renderDriverAvatar(battleName, snapshot.championship.directRival?.image, "row-avatar tiny-avatar") : ""}
            <span>${escapeHtml(battleName || "—")}</span>
          </div>
          <div class="meta-caption">${escapeHtml(snapshot.championship.rivalGap != null ? `${snapshot.championship.rivalGap} pts de margen` : "Sin brecha definida")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Brecha con líder</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(`${snapshot.championship.leaderGap} pts`)}</div>
          <div class="meta-caption">${escapeHtml(snapshot.metrics.trendInfo.label)}</div>
        </div>
      </div>
      ${isExpertMode() ? `<div class="info-line" style="margin-top:10px;">${escapeHtml(snapshot.internalCompare)}</div>` : ""}
    </div>
  `;
}

function renderStandingsSummaryBlock() {
  const el = document.getElementById("standingsSummaryContent");
  if (!el) return;
  el.innerHTML = `${renderStandingsOverviewCard()}${renderStandingsBattleCard()}${renderStandingsFavoriteContextCard()}${renderStandingsExpertContextCard()}`;
}

async function showStandings(force = false) {
  setActiveNav("nav-standings");
  rememberScreen("standings");
  updateSubtitle();

  contentEl().innerHTML = `${renderLoadingCard("Clasificación", "Cargando tabla del campeonato…", true)}`;

  try {
    await fetchStandingsData(force);

    contentEl().innerHTML = `
      <div id="standingsSummaryContent"></div>
      <div class="card app-panel-card">
        <div class="card-head">
          <div class="card-head-left"><div class="card-title">Clasificación</div></div>
          <div class="card-head-actions"><button class="icon-btn" onclick="refreshStandings()">Refrescar</button></div>
        </div>
        <div id="standingsControls" class="standings-toggle">
          <button class="toggle-btn ${state.standingsViewType === "drivers" ? "active" : ""}" data-standings-view="drivers" onclick="setStandingsView('drivers')" aria-pressed="${state.standingsViewType === "drivers"}">Pilotos</button>
          <button class="toggle-btn ${state.standingsViewType === "teams" ? "active" : ""}" data-standings-view="teams" onclick="setStandingsView('teams')" aria-pressed="${state.standingsViewType === "teams"}">Equipos</button>
          <button class="toggle-btn ${state.standingsScope === "top10" ? "active" : ""}" data-standings-scope="top10" onclick="setStandingsScope('top10')" aria-pressed="${state.standingsScope === "top10"}">Top 10</button>
          <button class="toggle-btn ${state.standingsScope === "all" ? "active" : ""}" data-standings-scope="all" onclick="setStandingsScope('all')" aria-pressed="${state.standingsScope === "all"}">Todos</button>
        </div>
        <div class="control-status-line">
          Vista activa: <strong>${state.standingsViewType === "teams" ? "Equipos" : "Pilotos"}</strong> · Alcance: <strong>${state.standingsScope === "all" ? "Todos" : "Top 10"}</strong>.
        </div>
      </div>
      <div id="standingsContent"></div>
    `;

    renderStandingsSummaryBlock();
    if (typeof syncStandingsToggleControls === "function") {
      syncStandingsToggleControls();
    }
    if (state.standingsViewType === "teams") showTeamsStandings();
    else showDriversStandings();
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Clasificación", "Error al cargar la clasificación", error.message);
  }
}



window.showStandings = showStandings;
window.renderStandingsSummaryBlock = renderStandingsSummaryBlock;

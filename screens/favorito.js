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

function rc10GetSignalTagClass(signal) {
  if (!signal) return "general";
  if (signal.label === "Favorable") return "statement";
  if (signal.label === "Difícil") return "reliability";
  return "market";
}

function rc10GetFavoriteCompetitiveRead(favorite, raceName, context, predictData) {
  const objective = getFavoriteWeekendObjective(favorite, raceName, predictData, context);
  const signal = getWeekendSignal(favorite, raceName);
  const radar = getFavoriteWeekendRadar(favorite, raceName, context, predictData);
  const metrics = getFavoriteMetrics(favorite);

  const status =
    metrics.pointsProbability >= 72 ? "Zona de ataque" :
    metrics.pointsProbability >= 56 ? "Zona de pelea" :
    "Zona de supervivencia";

  return {
    objective,
    signal,
    status,
    need: radar.find(item => item.title === "Qué necesita")?.text || "Necesita ejecutar limpio.",
    danger: radar.find(item => item.title === "Qué le puede hundir")?.text || "El margen es corto si pierde ritmo base.",
    watch: radar.find(item => item.title === "Qué mirar primero")?.text || "La primera señal útil llegará en la siguiente sesión."
  };
}

function rc10GetFavoriteSnapshot(favorite, raceName, predictData, context) {
  const objective = getFavoriteWeekendObjective(favorite, raceName, predictData, context);
  const signal = getWeekendSignal(favorite, raceName);
  const teamName = favorite.type === "driver" ? favorite.team : favorite.name;
  const teamData = getTeamData(teamName);

  const role = favorite.type === "driver" ? "Piloto" : "Equipo";
  const headerSub = favorite.type === "driver"
    ? `${favorite.team} · ${role}`
    : `${favorite.drivers || "Alineación"} · ${role}`;

  return { objective, signal, teamData, headerSub };
}

/* ===== FAVORITO · versión v2 ===== */

function renderFavoritoHeroContextCard(favorite, raceName, predictData, context) {
  const { objective, signal, headerSub } = rc10GetFavoriteSnapshot(favorite, raceName, predictData, context);

  return `
    <div class="card highlight-card favorito-v2-hero">
      <div class="mini-pill">FAVORITO V2.5</div>
      <div class="card-head" style="margin-bottom:6px;">
        <div class="card-head-left">
          <div class="card-title">${escapeHtml(favorite.name)}</div>
          <div class="card-sub">${escapeHtml(headerSub)} · ${escapeHtml(raceName)}</div>
        </div>
        <div class="trend-pill ${signal.className}">${escapeHtml(signal.label)}</div>
      </div>

      <div class="news-meta-row" style="margin-top:10px;">
        <span class="tag ${context?.phase === "sunday" ? "statement" : context?.phase === "saturday" ? "market" : "general"}">${escapeHtml(context?.phaseLabel || "Previa")}</span>
        <span class="tag ${rc10GetSignalTagClass(signal)}">Señal ${escapeHtml(signal.label.toLowerCase())}</span>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Objetivo razonable</div>
          <div class="meta-value" style="font-size:20px;">${escapeHtml(objective.realistic)}</div>
          <div class="meta-caption">Meta principal del fin de semana</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Riesgo principal</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(objective.risk)}</div>
          <div class="meta-caption">Factor que más condiciona el resultado</div>
        </div>
      </div>

      <div class="info-line" style="margin-top:14px;">${escapeHtml(signal.description)}</div>
    </div>
  `;
}

function renderFavoritoObjectiveCard(favorite, raceName, predictData, context) {
  const objective = getFavoriteWeekendObjective(favorite, raceName, predictData, context);

  return `
    <div class="card favorito-v2-objective">
      <div class="mini-pill">Objetivo del fin de semana</div>
      <div class="card-title">Plan competitivo</div>

      <div class="grid-stats" style="margin-top:14px;">
        <div class="stat-tile">
          <div class="stat-kicker">Mínimo</div>
          <div class="stat-value" style="font-size:22px;">${escapeHtml(objective.minimum)}</div>
          <div class="stat-caption">No comprometer el fin de semana</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Razonable</div>
          <div class="stat-value" style="font-size:22px;">${escapeHtml(objective.realistic)}</div>
          <div class="stat-caption">Resultado objetivo real</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Techo</div>
          <div class="stat-value" style="font-size:22px;">${escapeHtml(objective.high)}</div>
          <div class="stat-caption">Escenario más alto</div>
        </div>
      </div>

      <div class="news-meta-row" style="margin-top:14px;">
        <span class="tag technical">Riesgo: ${escapeHtml(objective.risk)}</span>
        <span class="tag context">Fase: ${escapeHtml(objective.phase)}</span>
      </div>
    </div>
  `;
}

function renderFavoritoTechnicalCard(favorite, teamData, accent, raceName, context, predictData, expert) {
  const edges = rc10GetTeamAreaEdges(teamData);
  const read = rc10GetFavoriteCompetitiveRead(favorite, raceName, context, predictData);

  return `
    <div class="card favorito-v2-competitive">
      <div class="mini-pill">Lectura competitiva</div>
      <div class="card-title">Dónde está y qué necesita</div>

      <div class="news-meta-row" style="margin-top:10px; margin-bottom:8px;">
        <span class="tag performance">${escapeHtml(read.status)}</span>
        <span class="tag ${rc10GetSignalTagClass(read.signal)}">Señal ${escapeHtml(read.signal.label.toLowerCase())}</span>
      </div>

      <div class="insight-list" style="margin-top:10px;">
        <div class="insight-item"><strong>Dónde está realmente:</strong> objetivo base ${escapeHtml(read.objective.realistic)}.</div>
        <div class="insight-item"><strong>Qué necesita:</strong> ${escapeHtml(read.need)}</div>
        <div class="insight-item"><strong>Qué le puede hundir:</strong> ${escapeHtml(read.danger)}</div>
      </div>

      ${expert ? `
        <div class="stat" style="margin-top:14px;">Ritmo carrera <span>${teamData.racePace}%</span></div>
        <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.racePace}%;"></div></div>

        <div class="stat" style="margin-top:14px;">Qualy <span>${teamData.qualyPace}%</span></div>
        <div class="bar"><div class="bar-fill ${accent}" style="width:${teamData.qualyPace}%;"></div></div>

        <div class="stat" style="margin-top:14px;">Fiabilidad <span>${teamData.reliability}%</span></div>
        <div class="bar"><div class="bar-fill ferrari" style="width:${teamData.reliability}%;"></div></div>

        <div class="meta-grid" style="margin-top:14px;">
          <div class="meta-tile">
            <div class="meta-kicker">Fortaleza base</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(edges.best.label)}</div>
            <div class="meta-caption">${edges.best.value}%</div>
          </div>
          <div class="meta-tile">
            <div class="meta-kicker">Debilidad principal</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(edges.worst.label)}</div>
            <div class="meta-caption">${edges.worst.value}%</div>
          </div>
        </div>
      ` : `
        <div class="news-meta-row" style="margin-top:14px;">
          <span class="tag context">Fortaleza: ${escapeHtml(edges.best.label)}</span>
          <span class="tag reliability">Vigilar: ${escapeHtml(edges.worst.label)}</span>
        </div>
      `}
    </div>
  `;
}

function renderFavoritoCircuitFitCard(favorite, raceName, expert) {
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
      <div class="mini-pill">Encaje con el circuito</div>
      <div class="card-title">Compatibilidad del favorito</div>

      ${renderCircuitThumb(raceName, 76)}

      <div class="news-meta-row" style="margin-top:4px; margin-bottom:12px;">
        <span class="tag general">${escapeHtml(raceName)}</span>
        <span class="tag ${fit.overall >= 78 ? "statement" : fit.overall >= 66 ? "market" : "reliability"}">${escapeHtml(fit.label)}</span>
      </div>

      <div class="meta-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Encaje global</div>
          <div class="meta-value" style="font-size:20px;">${fit.overall}%</div>
          <div class="meta-caption">Nivel total esperado</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Mejor área</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(areas.best.label)}</div>
          <div class="meta-caption">${areas.best.value}%</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Área a vigilar</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(areas.worst.label)}</div>
          <div class="meta-caption">${areas.worst.value}%</div>
        </div>
      </div>

      <div class="info-line" style="margin-top:14px;">${escapeHtml(fit.demand.note)}</div>

      ${expert ? `
        <div class="meta-grid" style="margin-top:14px;">
          ${Object.entries(fit.fit).map(([key, value]) => {
            const labelMap = { aero: "Aero", traction: "Tracción", topSpeed: "Vel. punta", tyreManagement: "Neumáticos" };
            return `
              <div class="meta-tile">
                <div class="meta-kicker">${escapeHtml(labelMap[key] || key)}</div>
                <div class="meta-value" style="font-size:18px;">${value}%</div>
                <div class="meta-caption">Encaje específico</div>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderFavoritoComparisonAdvancedCard(favorite, expert) {
  const breakdown = getFavoriteComparisonBreakdown(favorite);
  const items = expert ? breakdown.items : rc10Take(breakdown.items, 2);

  return `
    <div class="card">
      <div class="mini-pill">Comparación clave</div>
      <div class="card-title">${escapeHtml(breakdown.title)}</div>

      <div class="meta-grid" style="margin-top:14px;">
        ${items.map(item => `
          <div class="meta-tile">
            <div class="meta-kicker">${escapeHtml(item.kicker)}</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(item.value)}</div>
            <div class="meta-caption">${escapeHtml(item.caption)}</div>
          </div>
        `).join("")}
      </div>

      ${expert ? "" : `<div class="info-line" style="margin-top:12px;">Lectura directa de la referencia interna más importante.</div>`}
    </div>
  `;
}

function renderFavoritoDirectRivalsCard(favorite, predictData, expert) {
  const rivals = getFavoriteDirectRivals(favorite, state.standingsCache, predictData);

  return `
    <div class="card">
      <div class="mini-pill">Rivales directos</div>
      <div class="card-title">Quién condiciona su resultado</div>

      ${rivals.length ? rivals.map((rival, idx) => `
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
        <div class="info-line" style="margin-top:8px; margin-bottom:${idx === rivals.length - 1 ? 0 : 12}px;">
          ${expert
            ? `Importa por referencia directa de ritmo y puntos en la pelea inmediata.`
            : `Rival directo en la misma ventana de objetivo.`}
        </div>
      `).join("") : `<div class="empty-line">No hay rivales directos claros cargados ahora mismo.</div>`}
    </div>
  `;
}

function renderFavoritoInsightsCard(favorite, raceName, context, predictData, expert) {
  const read = rc10GetFavoriteCompetitiveRead(favorite, raceName, context, predictData);
  const bullets = expert
    ? [
        `Objetivo real: ${read.objective.realistic}; techo: ${read.objective.high}.`,
        `El punto de control inmediato es: ${read.watch}`,
        `El principal limitador competitivo hoy es: ${read.objective.risk}.`
      ]
    : [
        `Objetivo: ${read.objective.realistic}.`,
        `Riesgo principal: ${read.objective.risk}.`,
        `Señal general: ${read.signal.label}.`
      ];

  return `
    <div class="card">
      <div class="mini-pill">Lectura rápida final</div>
      <div class="card-title">Resumen del favorito</div>

      <div class="insight-list" style="margin-top:12px;">
        ${bullets.map(text => `<div class="insight-item">${escapeHtml(text)}</div>`).join("")}
      </div>
    </div>
  `;
}

function renderFavoritoChampionshipCard(favorite, raceName, predictData, expert) {
  const snapshot = getFavoriteComparativeSnapshot(favorite, raceName, predictData);
  if (!snapshot?.championship) return "";

  const currentName = snapshot.championship.type === "driver"
    ? snapshot.championship.current?.name
    : snapshot.championship.current?.team;
  const rivalName = snapshot.championship.type === "driver"
    ? snapshot.championship.directRival?.name
    : snapshot.championship.directRival?.team;

  return `
    <div class="card">
      <div class="mini-pill">Campeonato</div>
      <div class="card-title">Dónde está la pelea real</div>
      <div class="meta-grid" style="margin-top:12px;">
        <div class="meta-tile">
          <div class="meta-kicker">Posición actual</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(`P${snapshot.championship.current?.pos || "—"}`)}</div>
          <div class="meta-caption">${escapeHtml(currentName || favorite.name)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Rival directo</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(rivalName || "—")}</div>
          <div class="meta-caption">${escapeHtml(snapshot.championship.rivalGap != null ? `${snapshot.championship.rivalGap} pts de diferencia` : "Sin brecha definida")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Líder del mundial</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(snapshot.championship.type === "driver" ? (snapshot.championship.leader?.name || "—") : (snapshot.championship.leader?.team || "—"))}</div>
          <div class="meta-caption">${escapeHtml(`${snapshot.championship.leaderGap} pts de brecha`)}</div>
        </div>
      </div>
      ${expert ? `<div class="info-line" style="margin-top:10px;">${escapeHtml(snapshot.rivalRead)}</div>` : ""}
    </div>
  `;
}

function showFavorito() {
  setActiveNav("nav-favorito");
  rememberScreen("favorito");
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
    ${renderFavoriteQuickSelectorCard({
      title: "Cambiar favorito",
      subtitle: "",
      returnView: "showFavorito",
      compact: true
    })}
    ${renderFavoritoHeroContextCard(favorite, raceName, predictData, context)}
    ${renderFavoritoTechnicalCard(favorite, teamData, accent, raceName, context, predictData, expert)}
    ${expert ? renderFavoritoObjectiveCard(favorite, raceName, predictData, context) : ""}
    ${expert ? renderFavoritoCircuitFitCard(favorite, raceName, expert) : ""}
    ${renderFavoritoComparisonAdvancedCard(favorite, expert)}
    ${expert ? renderFavoritoDirectRivalsCard(favorite, predictData, expert) : ""}
    ${renderFavoritoChampionshipCard(favorite, raceName, predictData, expert)}
    ${renderFavoritoInsightsCard(favorite, raceName, context, predictData, expert)}
  `;
}

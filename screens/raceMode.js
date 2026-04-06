function getRaceModeOperationalSignals(favorite, raceName, predictData, stage) {
  const signal = getWeekendSignal(favorite, raceName);
  const strategy = getStrategyNarrative(favorite, raceName, predictData);
  const balance = getQualyRaceBalance(favorite, raceName, predictData);
  const metrics = getFavoriteMetrics(favorite);
  const heuristics = getRaceHeuristics(raceName);
  const grid = getPredictGridRead(favorite, raceName, predictData);
  const favoriteLabel = favorite.type === "driver" ? favorite.name : `el equipo ${favorite.name}`;

  let needs = `Debe sostener su ventana ${metrics.expectedWindow} con una ejecución limpia desde el primer stint.`;
  if (metrics.dnfRisk >= 28) {
    needs = "Debe priorizar fiabilidad y no exponerse en stint largo para evitar que el domingo se caiga por riesgo mecánico.";
  } else if (balance.label === "Mejor a una vuelta") {
    needs = "Debe convertir una buena qualy en aire limpio y controlar reinicios para no perder track position.";
  } else if (balance.label === "Mejor en carrera") {
    needs = "Debe mantenerse vivo en el primer stint para que su ritmo largo empuje el resultado en la segunda mitad.";
  } else if (strategy.factor === "Safety Car") {
    needs = "Debe proteger neumático y ritmo para reaccionar rápido si aparece un Safety Car que rompa el guion.";
  }

  let stageRead = "Previa de GP: la lectura base todavía pesa más que una sesión aislada.";
  if (stage?.key === "friday") stageRead = "Viernes: filtra tabla y mira consistencia real de stint.";
  if (stage?.key === "saturday") stageRead = "Sábado: la salida del domingo puede quedar casi definida en qualy.";
  if (stage?.key === "sunday") stageRead = "Domingo: salida y primera parada condicionan gran parte del resultado.";

  const qualyRaceWeight =
    balance.label === "Mejor a una vuelta"
      ? "Este GP depende más de qualy y posición en pista."
      : balance.label === "Mejor en carrera"
        ? "Este GP abre más margen en ritmo de carrera y ejecución de stint."
        : "Este GP se decide por ejecución global: sábado y domingo pesan parecido.";

  const majorRisk = metrics.dnfRisk >= 28
    ? "Fiabilidad bajo presión"
    : strategy.factor === "Safety Car"
      ? "Neutralización fuera de ventana"
      : heuristics.tag === "urbano"
        ? "Tráfico y pérdida de posición en pista"
        : "Degradación fuera de plan";

  return {
    signal,
    strategy,
    balance,
    metrics,
    heuristics,
    grid,
    favoriteLabel,
    needs,
    stageRead,
    qualyRaceWeight,
    majorRisk
  };
}

function renderRaceModeHero(favorite, raceName, nextRaceEvent, predictData) {
  const stage = getRaceWeekendStage(nextRaceEvent);
  const expert = isExpertMode();
  const operational = getRaceModeOperationalSignals(favorite, raceName, predictData, stage);
  const contextOperational = getWeekendOperationalFocus(getHomeWeekendContext() || state.weekendContext);

  return `
    <div class="card highlight-card predict-hero-v2 race-mode-v2-hero">
      <div class="mini-pill">MODO CARRERA V2.5</div>
      <div class="card-title">${escapeHtml(raceName)}</div>
      ${isCasualMode() ? `<div class="card-sub">${escapeHtml(stage.description)}</div>` : ""}

      ${renderCircuitThumb(raceName, 84)}

      <div class="predict-hero-tags">
        <span class="tag general">${escapeHtml(stage.label)}</span>
        <span class="trend-pill ${operational.signal.className}">${escapeHtml(operational.signal.label)}</span>
        <span class="tag technical">Factor GP: ${escapeHtml(operational.strategy.factor)}</span>
        <span class="tag ${escapeHtml(contextOperational.tagClass)}">Ahora manda: ${escapeHtml(contextOperational.label)}</span>
      </div>

      <div class="meta-grid race-mode-v2-hero-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Señal general</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(operational.signal.label)}</div>
          <div class="meta-caption">${escapeHtml(operational.signal.description)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Qué define este GP</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(operational.strategy.factor)}</div>
          <div class="meta-caption">${escapeHtml(operational.qualyRaceWeight)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(operational.heuristics.tag)}</div>
          <div class="meta-caption">${nextRaceEvent ? escapeHtml(nextRaceEvent.venue || "—") : "—"}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Riesgo principal</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(operational.majorRisk)}</div>
          <div class="meta-caption">Punto de vigilancia del fin de semana</div>
        </div>
      </div>

      ${expert ? `
        <div class="info-line race-mode-v2-hero-note">
          Lectura experta: ${escapeHtml(operational.stageRead)} Relación qualy/carrera: ${escapeHtml(operational.balance.label)}.
        </div>
      ` : ""}
      <div class="info-line">${escapeHtml(contextOperational.detail)}</div>
    </div>
  `;
}

function renderRaceModeQuickRead(favorite, raceName, predictData, stage) {
  const expert = isExpertMode();
  const operational = getRaceModeOperationalSignals(favorite, raceName, predictData, stage);
  const items = [
    {
      title: "Quién llega mejor",
      text: `${operational.grid.winner} lidera la lectura previa, con ${operational.grid.topTeams} en la zona alta esperada.`
    },
    {
      title: "Qué define este GP",
      text: `${operational.stageRead} Factor dominante: ${operational.strategy.factor}.`
    },
    {
      title: `Qué necesita ${operational.favoriteLabel}`,
      text: operational.needs
    }
  ];

  if (expert) {
    items.push({
      title: "Lectura técnica",
      text: `${operational.qualyRaceWeight} Plan base: ${operational.strategy.label} (${operational.strategy.stops} paradas, ${operational.strategy.window}).`
    });
  }

  return `
    <div class="card race-mode-v2-primary">
      <div class="card-title">Lectura rápida de carrera</div>
      
      <div class="insight-list">
        ${items.map(item => `
          <div class="insight-item">
            <strong>${escapeHtml(item.title)}</strong><br>
            ${escapeHtml(item.text)}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderRaceModeFavoriteSummary(favorite, raceName, predictData) {
  const expert = isExpertMode();
  const favoritePrediction = formatFavoritePredictionText(predictData?.favoritePrediction);
  const metrics = getFavoriteMetrics(favorite);
  const balance = getQualyRaceBalance(favorite, raceName, predictData);

  return `
    <div class="card race-mode-v2-primary">
      <div class="card-title">Resumen del favorito</div>
      

      <div class="predict-grid">
        <div class="stat-tile">
          <div class="stat-kicker">Qualy esperada</div>
          <div class="stat-value">${favoritePrediction.qualy}</div>
          <div class="stat-caption">${escapeHtml(favorite.name)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Carrera esperada</div>
          <div class="stat-value">${favoritePrediction.race}</div>
          <div class="stat-caption">Objetivo de domingo</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Puntos</div>
          <div class="stat-value">${favoritePrediction.points}</div>
          <div class="stat-caption">Probabilidad de puntuar</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Abandono</div>
          <div class="stat-value">${favoritePrediction.dnf}</div>
          <div class="stat-caption">Riesgo base</div>
        </div>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Ventana competitiva</div>
          <div class="meta-value">${escapeHtml(metrics.expectedWindow)}</div>
          <div class="meta-caption">Rango estimado</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Tendencia</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(metrics.trendInfo.label)}</div>
          <div class="meta-caption">${escapeHtml(metrics.trendInfo.description)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Balance</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(balance.label)}</div>
          <div class="meta-caption">Qualy vs carrera</div>
        </div>
        ${expert ? `
          <div class="meta-tile">
            <div class="meta-kicker">Lectura experta</div>
            <div class="meta-value" style="font-size:17px;">${escapeHtml(balance.qualy)} → ${escapeHtml(balance.race)}</div>
            <div class="meta-caption">${escapeHtml(balance.description)}</div>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function renderRaceModeTop10(predictData, favorite) {
  const top10 = Array.isArray(predictData?.raceOrder) ? predictData.raceOrder.slice(0, 10) : [];
  const favoriteTeam = favorite.type === "driver" ? favorite.team : favorite.name;
  const favoriteName = favorite.type === "driver" ? favorite.name : null;

  return `
    <div class="card race-mode-v2-primary">
      <div class="card-title">Top estimado</div>
      
      <div class="mode-race-top10">
        ${top10.length ? top10.map(driver => {
          const badges = [];
          if (driver.position === 1) badges.push(`<span class="tag statement">Favorito GP</span>`);
          if (favoriteName && sameDriverName(driver.name, favoriteName)) badges.push(`<span class="tag market">Tu favorito</span>`);
          if (!favoriteName && driver.team === favoriteTeam) badges.push(`<span class="tag market">Equipo fav.</span>`);

          return `
            <div class="mode-race-line">
              <div class="mode-race-left">
                <div class="mode-race-pos">${driver.position}</div>
                <div class="row-stripe ${getTeamColorClass(driver.team)}"></div>
                <div>
                  <div class="mode-race-name">${escapeHtml(driver.name)}</div>
                  <div class="mode-race-team">${escapeHtml(driver.team)}</div>
                </div>
              </div>
              <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                ${badges.length ? `<div class="news-meta-row" style="justify-content:flex-end;">${badges.join("")}</div>` : ""}
                <div class="mode-race-team">${driver.pointsProbability != null ? `${driver.pointsProbability}% pts` : ""}</div>
              </div>
            </div>
          `;
        }).join("") : `<div class="empty-line">No hay top 10 disponible.</div>`}
      </div>
    </div>
  `;
}

function renderRaceModeExecutionPanel(favorite, raceName, predictData, stage) {
  const expert = isExpertMode();
  const operational = getRaceModeOperationalSignals(favorite, raceName, predictData, stage);
  const rival = Array.isArray(predictData?.raceOrder)
    ? predictData.raceOrder.find(driver =>
      favorite.type === "driver"
        ? !sameDriverName(driver.name, favorite.name)
        : driver.team !== favorite.name
    )
    : null;

  const saturdayText = stage?.key === "sunday"
    ? "La qualy ya dejó la base; ahora importa cómo se convierte en ritmo real."
    : "Sábado define salida, tráfico y margen estratégico del domingo.";
  const sundayText = "Domingo manda por ejecución: primera vuelta, ventana de parada y gestión de riesgo.";

  return `
    <div class="card race-mode-v2-primary">
      <div class="card-title">Panel operativo</div>
      
      <div class="meta-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Sábado</div>
          <div class="meta-value" style="font-size:18px;">Qualy / Sprint</div>
          <div class="meta-caption">${escapeHtml(saturdayText)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Domingo</div>
          <div class="meta-value" style="font-size:18px;">Carrera</div>
          <div class="meta-caption">${escapeHtml(sundayText)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Rival directo</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(rival?.name || "Zona media")}</div>
          <div class="meta-caption">${escapeHtml(rival ? `${rival.team} · referencia inmediata` : "Sin rival claro cargado")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Qué necesita el favorito</div>
          <div class="meta-value" style="font-size:17px;">Ejecución limpia</div>
          <div class="meta-caption">${escapeHtml(operational.needs)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderRaceModeComparativeCard(favorite, raceName, predictData) {
  const snapshot = getFavoriteComparativeSnapshot(favorite, raceName, predictData);
  if (!snapshot) return "";

  const rivalName = snapshot.championship?.type === "driver"
    ? snapshot.championship?.directRival?.name
    : snapshot.championship?.directRival?.team;

  return `
    <div class="card race-mode-v2-primary">
      <div class="card-title">Comparativa útil del GP</div>
      
      <div class="meta-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Rival directo</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(rivalName || "—")}</div>
          <div class="meta-caption">${escapeHtml(snapshot.championship?.rivalGap != null ? `${snapshot.championship.rivalGap} pts` : "Sin brecha definida")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Tendencia favorita</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(snapshot.metrics.trendInfo.label)}</div>
          <div class="meta-caption">${escapeHtml(snapshot.metrics.trendInfo.description)}</div>
        </div>
      </div>
      ${isExpertMode() ? `<div class="info-line" style="margin-top:10px;">${escapeHtml(snapshot.internalCompare)}</div>` : ""}
    </div>
  `;
}

function renderRaceModeObjectiveCard(favorite, raceName, predictData) {
  const objective = getFavoriteWeekendObjective(favorite, raceName, predictData, state.weekendContext);
  return `
    <div class="card race-mode-v2-primary">
      <div class="card-title">Objetivo realista del fin de semana</div>
      
      <div class="predict-grid">
        <div class="stat-tile">
          <div class="stat-kicker">Mínimo</div>
          <div class="stat-value">${escapeHtml(objective.minimum)}</div>
          <div class="stat-caption">Evitar daño</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Razonable</div>
          <div class="stat-value">${escapeHtml(objective.realistic)}</div>
          <div class="stat-caption">Objetivo operativo</div>
        </div>
        <div class="stat-tile">
          <div class="stat-kicker">Techo</div>
          <div class="stat-value">${escapeHtml(objective.high)}</div>
          <div class="stat-caption">Escenario alto</div>
        </div>
      </div>
    </div>
  `;
}

async function showRaceMode() {
  setActiveNav("nav-more");
  rememberScreen("raceMode");
  updateSubtitle();

  contentEl().innerHTML = renderLoadingCard("Modo carrera", "Preparando panel operativo…", true);

  try {
    const favorite = getFavorite();
    const calendarData = await fetchCalendarData();
    const nextRaceEvent = getNextRaceFromCalendar(calendarData?.events || []);
    const raceName = mapCalendarEventToPredictRace(nextRaceEvent) || getSelectedRace();
    const predictData = await fetchPredictData(favorite, raceName);
    const stage = getRaceWeekendStage(nextRaceEvent);
    const phase = state.weekendContext?.phase || "pre_weekend";
    const expert = isExpertMode();

    contentEl().innerHTML = `
      ${renderRaceModeHero(favorite, raceName, nextRaceEvent, predictData)}
      <div class="card app-panel-card">
        <div class="card-title">Panel de ejecución</div>
        ${renderRaceModeExecutionPanel(favorite, raceName, predictData, stage)}
        ${renderRaceModeQuickRead(favorite, raceName, predictData, stage)}
      </div>
      <div class="card app-panel-card">
        <div class="card-title">Riesgo · rival · estrategia</div>
        ${renderRaceModeComparativeCard(favorite, raceName, predictData)}
        ${renderPredictScenarioCards(favorite, raceName, predictData)}
        <div style="margin-top:10px;">${renderPredictStrategyDetail(favorite, raceName, predictData)}</div>
      </div>
      ${expert ? renderRaceModeFavoriteSummary(favorite, raceName, predictData) : ""}
      ${renderRaceModeTop10(predictData, favorite)}
      ${expert ? renderContextGlossaryCard("raceMode", phase) : ""}
    `;
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Modo carrera", "Error al preparar esta pantalla", error.message);
  }
}

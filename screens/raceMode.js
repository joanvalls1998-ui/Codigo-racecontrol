function renderRaceModeHero(favorite, raceName, nextRaceEvent, predictData) {
  const stage = getRaceWeekendStage(nextRaceEvent);
  const signal = getWeekendSignal(favorite, raceName);
  const strategy = getStrategyNarrative(favorite, raceName, predictData);
  const heuristics = getRaceHeuristics(raceName);

  return `
    <div class="card highlight-card">
      <div class="mini-pill">MODO CARRERA</div>
      <div class="card-title">${escapeHtml(raceName)}</div>

      ${renderCircuitThumb(raceName, 80)}

      <div class="news-meta-row" style="margin-top:2px;">
        <span class="tag general">${escapeHtml(stage.label)}</span>
        <span class="trend-pill ${signal.className}">${escapeHtml(signal.label)}</span>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(heuristics.tag)}</div>
          <div class="meta-caption">${nextRaceEvent ? escapeHtml(nextRaceEvent.venue || "—") : "—"}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Safety Car</div>
          <div class="meta-value">${heuristics.safetyCar}%</div>
          <div class="meta-caption">Base</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Lluvia</div>
          <div class="meta-value">${heuristics.rain}%</div>
          <div class="meta-caption">Base</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Factor clave</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(strategy.factor)}</div>
          <div class="meta-caption">Impacto</div>
        </div>
      </div>
    </div>
  `;
}
/* ===== MODO CARRERA ===== */

function renderRaceModeQuickRead(favorite, raceName, predictData, stage) {
  const items = rc10Take(getRaceModeQuickRead(favorite, raceName, predictData, stage), isCasualMode() ? 1 : 2);

  return `
    <div class="card">
      <div class="card-title">Claves rápidas</div>
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

async function showRaceMode() {
  setActiveNav("nav-more");
  updateSubtitle();

  contentEl().innerHTML = renderLoadingCard("Modo carrera", "Preparando modo carrera…", true);

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
      ${renderRaceModeQuickRead(favorite, raceName, predictData, stage)}
      ${renderRaceModeFavoriteSummary(favorite, raceName, predictData)}

      <div class="card">
        <div class="card-title">Escenarios</div>
        ${renderPredictScenarioCards(favorite, raceName, predictData)}
      </div>

      <div class="card">
        <div class="card-title">3 claves</div>
        ${renderPredictKeyFactors(favorite, raceName, predictData)}
      </div>

      <div class="card">
        <div class="card-title">Estrategia</div>
        ${renderPredictStrategyDetail(favorite, raceName, predictData)}
      </div>

      ${renderRaceModeTop10(predictData, favorite)}
      ${expert ? renderContextGlossaryCard("raceMode", phase) : ""}
    `;
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Modo carrera", "Error al preparar esta pantalla", error.message);
  }
}

function getPredictionHistory() {
  const history = storageReadJson(STORAGE_KEYS.predictionHistory, []);
  return Array.isArray(history) ? history : [];
}

function savePredictionHistory(history) {
  storageWriteJson(STORAGE_KEYS.predictionHistory, history);
}

function pushPredictionHistory(data, favorite, raceName) {
  const entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    raceName,
    favoriteType: favorite.type,
    favoriteName: favorite.name,
    favoriteTeam: favorite.team || favorite.name,
    summary: {
      winner: data?.summary?.predictedWinner || null,
      favoritePrediction: formatFavoritePredictionText(data?.favoritePrediction),
      strategy: data?.summary?.strategy?.label || null
    },
    text: formatPredictResponse(data)
  };

  const history = getPredictionHistory();
  const next = [entry, ...history].slice(0, 8);
  savePredictionHistory(next);
}

function renderPredictionHistory() {
  const history = getPredictionHistory();
  if (!history.length) return `<div class="empty-line">Todavía no hay predicciones guardadas.</div>`;

  return `
    <div class="history-list">
      ${history.map(item => `
        <div class="history-item" onclick="openPredictionHistoryItem(${item.id})">
          <div class="history-head">
            <div>
              <div class="history-title">${escapeHtml(item.raceName)} · ${escapeHtml(item.favoriteName)}</div>
              <div class="history-sub">Clasificación: ${escapeHtml(item.summary.favoritePrediction.qualy)} · Carrera: ${escapeHtml(item.summary.favoritePrediction.race)}</div>
            </div>
            <div class="history-meta">${escapeHtml(formatDateTimeShort(item.createdAt))}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function clearPredictionHistory() {
  storageRemove(STORAGE_KEYS.predictionHistory);
  document.getElementById("predictionHistoryBox")?.replaceChildren();
  const box = document.getElementById("predictionHistoryBox");
  if (box) box.innerHTML = renderPredictionHistory();
}

function openPredictionHistoryItem(id) {
  const item = getPredictionHistory().find(entry => entry.id === id);
  if (!item) return;
  openDetailModal(`
    <div class="card" style="margin-bottom:0;">
      <div class="card-title">${escapeHtml(item.raceName)} · ${escapeHtml(item.favoriteName)}</div>
      <div class="card-sub">${escapeHtml(formatDateTimeShort(item.createdAt))}</div>
      <pre class="ai-output">${escapeHtml(item.text)}</pre>
    </div>
  `);
}


function getActivePredictionSharePayload() {
  const favorite = getFavorite();
  const raceName = getSelectedRace();
  const data = getActivePredictDataForRace(favorite, raceName);
  const text = data ? formatPredictResponse(data) : (document.getElementById("predictOutput")?.innerText || "").trim();

  return {
    title: `RaceControl · ${raceName}`,
    text,
    raceName,
    hasData: Boolean(data && text)
  };
}

async function sharePrediction() {
  const payload = getActivePredictionSharePayload();
  if (!payload.text || !payload.hasData) {
    openDetailModal(`
      <div class="card" style="margin-bottom:0;">
        <div class="card-title">Compartir predicción</div>
        <div class="empty-line">Primero genera una predicción para poder compartirla.</div>
      </div>
    `);
    return;
  }

  const shareData = {
    title: payload.title,
    text: payload.text
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.text);
      openDetailModal(`
        <div class="card" style="margin-bottom:0;">
          <div class="card-title">Predicción copiada</div>
          <div class="card-sub">Tu dispositivo no soporta compartir nativo, pero ya tienes el texto en el portapapeles.</div>
        </div>
      `);
      return;
    }

    throw new Error("No hay soporte de compartir ni portapapeles.");
  } catch (error) {
    openDetailModal(`
      <div class="card" style="margin-bottom:0;">
        <div class="card-title">No se pudo compartir</div>
        <div class="card-sub">${escapeHtml(error?.message || "Inténtalo de nuevo.")}</div>
      </div>
    `);
  }
}

function setPredictSectionPlaceholders({
  summary = "",
  scenarios = "",
  factors = "",
  qualyRace = "",
  strategy = "",
  grid = ""
}) {
  const sections = {
    predictSummaryCards: summary,
    predictScenarioCards: scenarios,
    predictKeyFactors: factors,
    predictQualyRace: qualyRace,
    predictStrategyDetail: strategy,
    predictGridRead: grid
  };

  Object.entries(sections).forEach(([id, html]) => {
    const el = document.getElementById(id);
    if (el && html) el.innerHTML = html;
  });
}

function getPredictMainFocus(favorite, raceName, data = null) {
  const strategy = getStrategyNarrative(favorite, raceName, data);
  const factors = getPredictKeyFactors(favorite, raceName, data);
  const signal = getWeekendSignal(favorite, raceName);
  const sprint = isSprintRaceName(raceName);
  const riskFactor = factors.find(item => item.title === "Fiabilidad") || factors[1] || factors[0];
  const needText = getWeekendKeyPoints(favorite, raceName)[0] || "Convertir bien el ritmo en resultado.";

  return {
    sprint,
    signal,
    strategy,
    riskFactor,
    needText,
    focus: sprint
      ? "Gestionar bien sábado y domingo sin perder track position."
      : "Ejecutar un domingo limpio con estrategia estable."
  };
}

function renderPredictHeroV2({ predict, favorite, raceName, expert, activePredictData }) {
  const mainFocus = getPredictMainFocus(favorite, raceName, activePredictData);
  const signalClass =
    mainFocus.signal.className === "up" ? "statement" :
    mainFocus.signal.className === "down" ? "critical" :
    "general";

  return `
    <div class="card highlight-card predict-hero-v2">
      <div class="pill">PREDICT V2.5</div>
      <div class="card-title" style="color: var(--${predict.accent}); margin-bottom:4px;">${escapeHtml(predict.title)}</div>
      ${!expert ? `<div class="card-sub">${escapeHtml(mainFocus.focus)}</div>` : ""}

      <div class="predict-hero-tags">
        <span class="tag ${predict.copy.phaseTagClass}">${escapeHtml(predict.copy.phaseLabel)}</span>
        <span class="tag ${mainFocus.sprint ? "statement" : "general"}">${mainFocus.sprint ? "Sprint weekend" : "Formato normal"}</span>
        <span class="tag ${signalClass}">Señal: ${escapeHtml(mainFocus.signal.label)}</span>
      </div>

      <div class="predict-hero-grid">
        <div class="predict-hero-tile">
          <div class="meta-kicker">Favorito</div>
          <div class="meta-value predict-hero-favorite">${escapeHtml(favorite.name)}</div>
          ${expert ? "" : `<div class="meta-caption">Referencia principal</div>`}
        </div>
        <div class="predict-hero-tile">
          <div class="meta-kicker">GP seleccionado</div>
          <div class="meta-value predict-hero-race">${escapeHtml(raceName)}</div>
          ${expert ? "" : `<div class="meta-caption">Puedes cambiarlo y regenerar</div>`}
        </div>
      </div>
      
      <select id="predictRace" class="select-input predict-hero-select" onchange="saveSelectedRace(this.value)">
        ${getPredictRaceOptions().map(race => `
          <option value="${race}" ${race === raceName ? "selected" : ""}>${race}</option>
        `).join("")}
      </select>

      <div class="action-row">
        <button class="btn" onclick="runPredict()">Generar</button>
        <button class="icon-btn" onclick="refreshPredict()">Actualizar</button>
      </div>

      ${expert ? "" : `<div class="info-line predict-hero-note">Separa sábado y domingo para no perder foco.</div>`}
    </div>
  `;
}

function renderPredictWeekendKeyCard(favorite, raceName, data = null, expert = false) {
  const factors = getPredictKeyFactors(favorite, raceName, data);
  const strategy = getStrategyNarrative(favorite, raceName, data);
  const signal = getWeekendSignal(favorite, raceName);
  const needText = getWeekendKeyPoints(favorite, raceName)[0] || "Necesita un fin de semana limpio.";
  const risk = factors.find(item => item.title === "Fiabilidad") || factors[1] || factors[0];
  const sprint = isSprintRaceName(raceName);
  const balance = getQualyRaceBalance(favorite, raceName, data);

  return `
    <div class="predict-key-grid">
      <div class="meta-tile">
        <div class="meta-kicker">Factor crítico</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(strategy.factor)}</div>
        <div class="meta-caption">${escapeHtml(factors[0]?.text || signal.description)}</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Riesgo principal</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(risk?.title || "Ejecución")}</div>
        <div class="meta-caption">${escapeHtml(risk?.text || "Un detalle puede romper el escenario base.")}</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Qué necesita el favorito</div>
        <div class="meta-value" style="font-size:18px;">Ejecución limpia</div>
        <div class="meta-caption">${escapeHtml(needText)}</div>
      </div>
      ${expert ? `
        <div class="meta-tile">
          <div class="meta-kicker">Lectura técnica</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(balance.label)}</div>
          <div class="meta-caption">${escapeHtml(sprint ? "Con sprint, el sábado condiciona más el domingo." : balance.description)}</div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderPredictExecutionSplitCard(favorite, raceName, data = null, expert = false) {
  const strategy = getStrategyNarrative(favorite, raceName, data);
  const balance = getQualyRaceBalance(favorite, raceName, data);
  const sprint = isSprintRaceName(raceName);
  const saturdayFocus = sprint
    ? "Sábado muy pesado: Shootout + Sprint condicionan más la salida y el riesgo de tráfico."
    : "Sábado clave: la qualy define aire limpio, ventana estratégica y techo de carrera.";
  const sundayFocus = balance.label === "Mejor en carrera"
    ? "Domingo con margen real en stint largo si se mantiene en ventana en el primer relevo."
    : "Domingo más dependiente de ejecución limpia, paradas y gestión de tráfico.";

  return `
    <div class="meta-grid">
      <div class="meta-tile">
        <div class="meta-kicker">Sábado</div>
        <div class="meta-value" style="font-size:18px;">Qualy / Sprint</div>
        <div class="meta-caption">${escapeHtml(saturdayFocus)}</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Domingo</div>
        <div class="meta-value" style="font-size:18px;">Carrera</div>
        <div class="meta-caption">${escapeHtml(sundayFocus)}</div>
      </div>
      <div class="meta-tile">
        <div class="meta-kicker">Factor crítico GP</div>
        <div class="meta-value" style="font-size:18px;">${escapeHtml(strategy.factor)}</div>
        <div class="meta-caption">${escapeHtml(balance.description)}</div>
      </div>
      ${expert ? `
        <div class="meta-tile">
          <div class="meta-kicker">Ejecución experta</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(strategy.label)}</div>
          <div class="meta-caption">Paradas ${strategy.stops} · ${escapeHtml(strategy.window)}</div>
        </div>
      ` : ""}
    </div>
  `;
}

async function runPredict() {
  const output = document.getElementById("predictOutput");
  const favorite = getFavorite();
  const raceSelect = document.getElementById("predictRace");
  const raceName = raceSelect?.value || getSelectedRace();

  saveSelectedRace(raceName);

  if (output) output.innerText = "Generando predicción...";

  setPredictSectionPlaceholders({
    summary: renderPredictLoadingState(),
    scenarios: `<div class="empty-line">Recalculando escenarios del fin de semana…</div>`,
    factors: `<div class="empty-line">Releyendo fortalezas, riesgos y contexto…</div>`,
      qualyRace: `<div class="empty-line">Comparando comportamiento a una vuelta y ritmo largo…</div>`,
    strategy: `<div class="empty-line">Actualizando estrategia prevista…</div>`,
    grid: `<div class="empty-line">Reordenando lectura global de la parrilla…</div>`
  });

  try {
    const data = await fetchPredictData(favorite, raceName);
    state.lastPredictData = data;
    state.lastPredictContext = {
      raceName,
      favoriteKey: `${favorite.type}:${favorite.name}`
    };

    pushPredictionHistory(data, favorite, raceName);

    setPredictSectionPlaceholders({
      summary: renderPredictSummaryCards(data),
      scenarios: renderPredictScenarioCards(favorite, raceName, data),
      factors: renderPredictKeyFactors(favorite, raceName, data),
      qualyRace: renderPredictExecutionSplitCard(favorite, raceName, data, isExpertMode()),
      strategy: renderPredictStrategyDetail(favorite, raceName, data),
      grid: renderPredictGridRead(favorite, raceName, data)
    });
    if (output) output.innerText = formatPredictResponse(data);

    const historyBox = document.getElementById("predictionHistoryBox");
    if (historyBox) historyBox.innerHTML = renderPredictionHistory();
  } catch (error) {
    if (output) output.innerText = `Error: ${error.message}`;
    setPredictSectionPlaceholders({
      summary: `<div class="empty-line">No se ha podido generar el resumen predictivo.</div>`,
      scenarios: renderPredictScenarioCards(favorite, raceName, null),
      factors: renderPredictKeyFactors(favorite, raceName, null),
      qualyRace: renderPredictExecutionSplitCard(favorite, raceName, null, isExpertMode()),
      strategy: renderPredictStrategyDetail(favorite, raceName, null),
      grid: renderPredictGridRead(favorite, raceName, null)
    });
  }
}

function refreshPredict() {
  runPredict();
}

function shouldAutoGeneratePredict(favorite, raceName) {
  if (!state.lastPredictData || !state.lastPredictContext) return true;

  return (
    state.lastPredictContext.raceName !== raceName ||
    state.lastPredictContext.favoriteKey !== `${favorite.type}:${favorite.name}`
  );
}

function renderPredictPrimaryFocusCard(favorite, raceName, activePredictData) {
  const mainFocus = getPredictMainFocus(favorite, raceName, activePredictData);
  const scenarios = getPredictScenarios(favorite, raceName, activePredictData);
  const baseScenario = scenarios[1] || scenarios[0] || { title: "Escenario base", text: "Sin escenario base cargado." };
  const riskLabel = mainFocus.riskFactor?.title || "Riesgo principal";
  const riskText = mainFocus.riskFactor?.text || "Escenario sensible a la ejecución.";
  const keyData = activePredictData?.favoritePrediction?.race || activePredictData?.summary?.predictedWinner || mainFocus.strategy.label;

  return `
    <div class="card app-panel-card">
      <div class="card-title">Lectura principal</div>
      <div class="meta-grid" style="margin-top:12px;">
        <div class="meta-tile">
          <div class="meta-kicker">Base</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(mainFocus.strategy.label)}</div>
          <div class="meta-caption">${escapeHtml(mainFocus.focus)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Suelo</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(scenarios[0]?.value || "—")}</div>
          <div class="meta-caption">${escapeHtml(scenarios[0]?.text || "Escenario mínimo")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Techo</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(scenarios[2]?.value || baseScenario.value || "—")}</div>
          <div class="meta-caption">${escapeHtml(scenarios[2]?.text || "Escenario alto")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">${escapeHtml(riskLabel)}</div>
          <div class="meta-value" style="font-size:18px;">Riesgo</div>
          <div class="meta-caption">${escapeHtml(riskText)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Factor crítico</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(keyData)}</div>
          <div class="meta-caption">${escapeHtml(baseScenario.title)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Sábado</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(isSprintRaceName(raceName) ? "Sprint" : "Qualy")}</div>
          <div class="meta-caption">Bloque de entrada al domingo</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Domingo</div>
          <div class="meta-value" style="font-size:18px;">Carrera</div>
          <div class="meta-caption">${escapeHtml(mainFocus.needText)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderEngineerTelemetryCompactHeader(telemetry, selector = {}, context = {}) {
  const meeting = (context.meetings || []).find(item => String(item.meeting_key) === String(telemetry.gp));
  const session = (context.sessions || []).find(item => String(item.type_key) === String(telemetry.sessionType));
  const driver = (context.drivers || []).find(item => String(item.id || "") === String(telemetry.driver));
  return `
    <div class="telemetry-compact-header">
      <div><span>GP</span><strong>${escapeHtml(meeting?.gp_label || "—")}</strong></div>
      <div><span>Sesión</span><strong>${escapeHtml(session?.type_label || telemetry.sessionType || "—")}</strong></div>
      <div><span>Piloto</span><strong>${escapeHtml(driver?.name || "—")}</strong></div>
      <div><span>Modo vuelta</span><strong>${escapeHtml(telemetry.lapMode === "manual" ? "Manual" : telemetry.lapMode === "latest" ? "Última" : "Referencia")}</strong></div>
      <div><span>Vuelta activa</span><strong>${selector?.selectedLapNumber ? `L${selector.selectedLapNumber}` : "—"}</strong></div>
      <div><span>Estado</span><strong>${telemetry.status === "loading" ? "Cargando" : telemetry.status === "ready" ? "Ready" : "Idle"}</strong></div>
    </div>
  `;
}

function renderEngineerPredictionPanel(favorite, raceName, activePredictData, expert) {
  const scenarios = getPredictScenarios(favorite, raceName, activePredictData);
  const base = scenarios[1] || scenarios[0] || { value: "—", text: "Escenario base pendiente." };
  const ceiling = scenarios[2] || scenarios[1] || { value: "—", text: "Escenario techo pendiente." };
  const mainFocus = getPredictMainFocus(favorite, raceName, activePredictData);
  const risk = mainFocus.riskFactor || { title: "Riesgo principal", text: "Lectura pendiente" };
  const needText = getWeekendKeyPoints(favorite, raceName)[0] || "Convertir ritmo en resultado sin errores.";
  const favoritePrediction = formatFavoritePredictionText(activePredictData?.favoritePrediction);
  const strategy = getStrategyNarrative(favorite, raceName, activePredictData);
  const balance = getQualyRaceBalance(favorite, raceName, activePredictData);
  const summary = activePredictData?.summary || {};

  return `
    <section class="card engineer-card engineer-wall-panel engineer-prediction-shell">
      <div class="engineer-panel-heading">
        <div>
          <div class="engineer-panel-title">Predicción táctica</div>
          <div class="engineer-panel-subtitle">Mismo lenguaje de muro · capa estratégica</div>
        </div>
        <div class="card-head-actions">
          <button class="icon-btn" onclick="sharePrediction()">Compartir</button>
        </div>
      </div>
      <div class="engineer-prediction-grid">
        <article class="engineer-prediction-main">
          <div class="engineer-console-line">
            <div><span>GP</span><strong>${escapeHtml(raceName)}</strong></div>
            <div><span>Piloto</span><strong>${escapeHtml(favorite.name)}</strong></div>
            <div><span>Fase</span><strong>${escapeHtml(mainFocus.sprint ? "Sprint" : "Race")}</strong></div>
            <div><span>Modo</span><strong>${expert ? "Experto" : "Casual"}</strong></div>
          </div>
          <div class="engineer-compact-grid" style="margin-top:10px;">
            <div class="meta-tile"><div class="meta-kicker">1 · Lectura principal</div><div class="meta-value" style="font-size:18px;">${escapeHtml(mainFocus.strategy.label)}</div><div class="meta-caption">${escapeHtml(mainFocus.focus)}</div></div>
            <div class="meta-tile"><div class="meta-kicker">2 · Suelo</div><div class="meta-value" style="font-size:17px;">${escapeHtml(scenarios[0]?.value || "—")}</div><div class="meta-caption">${escapeHtml(scenarios[0]?.text || "Escenario conservador")}</div></div>
            <div class="meta-tile"><div class="meta-kicker">2 · Base</div><div class="meta-value" style="font-size:17px;">${escapeHtml(base.value || "—")}</div><div class="meta-caption">${escapeHtml(base.text || "Escenario base")}</div></div>
            <div class="meta-tile"><div class="meta-kicker">2 · Techo</div><div class="meta-value" style="font-size:17px;">${escapeHtml(ceiling.value || "—")}</div><div class="meta-caption">${escapeHtml(ceiling.text || "Escenario alto")}</div></div>
            <div class="meta-tile"><div class="meta-kicker">3 · Riesgo principal</div><div class="meta-value" style="font-size:17px;">${escapeHtml(risk.title)}</div><div class="meta-caption">${escapeHtml(risk.text)}</div></div>
            <div class="meta-tile"><div class="meta-kicker">4 · Factor crítico</div><div class="meta-value" style="font-size:17px;">${escapeHtml(mainFocus.strategy.factor)}</div><div class="meta-caption">${escapeHtml(mainFocus.signal.description)}</div></div>
            <div class="meta-tile"><div class="meta-kicker">5 · Qué necesita el favorito</div><div class="meta-value" style="font-size:17px;">Ejecución limpia</div><div class="meta-caption">${escapeHtml(needText)}</div></div>
          </div>
          <div style="margin-top:10px;"><div class="meta-kicker" style="margin-bottom:7px;">6 · Sábado / Domingo</div><div id="predictQualyRace">${renderPredictExecutionSplitCard(favorite, raceName, activePredictData, expert)}</div></div>
        </article>
        <aside class="engineer-prediction-side">
          <section><h4>Tiempos</h4><div class="engineer-side-list"><div><span>Qualy</span><strong>${escapeHtml(favoritePrediction.qualy)}</strong></div><div><span>Carrera</span><strong>${escapeHtml(favoritePrediction.race)}</strong></div><div><span>Puntos</span><strong>${escapeHtml(favoritePrediction.points)}</strong></div><div><span>DNF</span><strong>${escapeHtml(favoritePrediction.dnf)}</strong></div></div></section>
          <section><h4>Stint / plan</h4><div class="engineer-side-list"><div><span>Estrategia</span><strong>${escapeHtml(strategy.label)}</strong></div><div><span>Paradas</span><strong>${escapeHtml(strategy.stops)}</strong></div><div><span>Ventana</span><strong>${escapeHtml(strategy.window)}</strong></div><div><span>Balance</span><strong>${escapeHtml(balance.label)}</strong></div></div></section>
          <section><h4>Estado sesión</h4><div class="engineer-side-list"><div><span>Ganador esperado</span><strong>${escapeHtml(summary.predictedWinner || "—")}</strong></div><div><span>Neumático base</span><strong>${escapeHtml(summary.strategy?.baseCompound || "—")}</strong></div><div><span>Meteo impacto</span><strong>${escapeHtml(summary.weatherImpact?.label || "Normal")}</strong></div><div><span>Riesgo GP</span><strong>${escapeHtml(risk.title)}</strong></div></div></section>
        </aside>
      </div>
    </section>
    <section class="card engineer-card engineer-wall-panel"><details><summary style="cursor:pointer; font-weight:700;">7 · Análisis ampliado</summary><div id="predictSummaryCards" style="margin-top:12px;">${activePredictData ? renderPredictSummaryCards(activePredictData) : renderPredictPreviewCards(favorite, raceName)}</div><div id="predictScenarioCards" style="margin-top:10px;">${renderPredictScenarioCards(favorite, raceName, activePredictData)}</div><div id="predictKeyFactors" style="margin-top:10px;">${renderPredictKeyFactors(favorite, raceName, activePredictData)}</div><div id="predictStrategyDetail" style="margin-top:10px;">${renderPredictStrategyDetail(favorite, raceName, activePredictData)}</div><div id="predictGridRead" style="margin-top:10px;">${renderPredictGridRead(favorite, raceName, activePredictData)}</div><pre id="predictOutput" class="ai-output predict-v2-raw-output">${activePredictData ? escapeHtml(formatPredictResponse(activePredictData)) : "Preparando predicción…"}</pre><div id="predictionHistoryBox" style="margin-top:10px;">${renderPredictionHistory()}</div></details></section>
  `;
}

const TELEMETRY_SEASON_YEAR = 2026;

const engineerState = {
  submode: state.engineerSubmode === "telemetry" ? "telemetry" : "prediction",
  telemetry: {
    status: "idle",
    error: "",
    userMessage: "",
    gp: "",
    sessionIntent: "",
    sessionType: "",
    sessionKey: "",
    driver: "",
    lapMode: "reference",
    manualLap: "",
    rangeStartPct: 0,
    rangeEndPct: 100,
    cursorPct: 0,
    accordionState: {
      secondaryCharts: false,
      secondarySignals: false,
      secondaryMetrics: false
    },
    context: null,
    payload: null
  }
};

const engineerCache = { context: new Map() };
let telemetryRequestId = 0;
const TELEMETRY_CACHE_TTL_MS = 1000 * 60 * 8;
const TELEMETRY_LAP_MODES = Object.freeze(["reference", "latest", "manual"]);
const TELEMETRY_UI_STORAGE_KEY = "racecontrolEngineerTelemetryUi";
const LEGACY_TELEMETRY_FAVORITE_KEYS = Object.freeze([
  "racecontrolEngineerTelemetryFavorite",
  "racecontrolEngineerFavoriteTelemetryDriver",
  "racecontrolTelemetryFavoriteDriver",
  "racecontrolPredictTelemetryFavorite",
  "racecontrolTelemetryFavoriteState"
]);

function logTelemetryDriverEvent(event, details = {}) {
  console.log(JSON.stringify({
    scope: "engineer.telemetry.driver_selection",
    event,
    ...details
  }));
}

function cacheGet(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(map, key, value, ttlMs = TELEMETRY_CACHE_TTL_MS) {
  map.set(key, { value, expiresAt: Date.now() + Math.max(2000, ttlMs) });
  return value;
}

function telemetryContextKey() {
  const t = engineerState.telemetry;
  return `${TELEMETRY_SEASON_YEAR}:${t.gp || "auto"}:${t.sessionIntent || t.sessionType || "auto"}`;
}

function readTelemetryUiState() {
  const raw = storageReadJson(TELEMETRY_UI_STORAGE_KEY, null);
  const accordion = raw?.accordionState && typeof raw.accordionState === "object" ? raw.accordionState : {};
  return {
    gp: String(raw?.gp || ""),
    sessionType: String(raw?.sessionType || ""),
    driver: String(raw?.driver || ""),
    accordionState: {
      secondaryCharts: accordion.secondaryCharts === true,
      secondarySignals: accordion.secondarySignals === true,
      secondaryMetrics: accordion.secondaryMetrics === true
    }
  };
}

function persistTelemetryUiState() {
  const t = engineerState.telemetry;
  storageWriteJson(TELEMETRY_UI_STORAGE_KEY, {
    gp: t.gp || "",
    sessionType: t.sessionType || "",
    driver: t.driver || "",
    accordionState: {
      secondaryCharts: t.accordionState.secondaryCharts === true,
      secondarySignals: t.accordionState.secondarySignals === true,
      secondaryMetrics: t.accordionState.secondaryMetrics === true
    }
  });
}

function applyStoredTelemetryUiState() {
  purgeLegacyTelemetryFavoriteState();
  const saved = readTelemetryUiState();
  engineerState.telemetry.gp = saved.gp;
  engineerState.telemetry.sessionIntent = saved.sessionType;
  engineerState.telemetry.sessionType = saved.sessionType;
  engineerState.telemetry.driver = saved.driver;
  engineerState.telemetry.accordionState = saved.accordionState;
}

function matchTelemetryDriver(drivers = [], value = "") {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  return drivers.find(item => (
    String(item?.id || "").trim() === candidate
    || String(item?.code || "").trim() === candidate
    || String(item?.number || "").trim() === candidate
  )) || null;
}

function resolveTelemetryDriverSelection(context, priorDriver = "") {
  const drivers = Array.isArray(context?.drivers) ? context.drivers : [];
  const cleanPrior = String(priorDriver || "").trim();
  const explicitDriver = matchTelemetryDriver(drivers, cleanPrior);
  if (explicitDriver) {
    logTelemetryDriverEvent("telemetry_selected_driver_kept", {
      requested: cleanPrior,
      selected: String(explicitDriver?.id || ""),
      gp: String(context?.selections?.meeting_key || ""),
      session_type: String(context?.selections?.session_type || "")
    });
    return {
      driverId: String(explicitDriver?.id || "")
    };
  }
  if (cleanPrior) {
    logTelemetryDriverEvent("telemetry_selected_driver_invalidated", {
      invalid_driver: cleanPrior,
      gp: String(context?.selections?.meeting_key || ""),
      session_type: String(context?.selections?.session_type || "")
    });
  }
  const fallbackDriver = drivers[0] || null;
  logTelemetryDriverEvent("telemetry_selected_driver_fallback_used", {
    selected: String(fallbackDriver?.id || ""),
    gp: String(context?.selections?.meeting_key || ""),
    session_type: String(context?.selections?.session_type || "")
  });
  return {
    driverId: String(fallbackDriver?.id || "")
  };
}

function purgeLegacyTelemetryFavoriteState() {
  let removed = 0;
  LEGACY_TELEMETRY_FAVORITE_KEYS.forEach(key => {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      removed += 1;
    }
    if (sessionStorage.getItem(key) !== null) {
      sessionStorage.removeItem(key);
      removed += 1;
    }
  });
  if (removed > 0) {
    logTelemetryDriverEvent("telemetry_driver_persisted_value_invalidated", {
      reason: "legacy_favorite_keys_removed",
      removed
    });
  }
}

function resolveTelemetrySessionSelection(context, priorSessionType = "") {
  const sessions = Array.isArray(context?.sessions) ? context.sessions : [];
  const normalizeSessionToken = (value = "") => {
    const clean = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (!clean) return "";
    if (["practice1", "fp1", "p1"].includes(clean)) return "fp1";
    if (["practice2", "fp2", "p2"].includes(clean)) return "fp2";
    if (["practice3", "fp3", "p3"].includes(clean)) return "fp3";
    if (["qualifying", "qualy", "q"].includes(clean)) return "qualy";
    if (["sprintqualifying", "sprintshootout", "sprintqualy", "sq"].includes(clean)) return "sprint_qualy";
    if (["sprintrace", "sprint", "sr"].includes(clean)) return "sprint_race";
    if (["race", "grandprix", "r"].includes(clean)) return "race";
    return clean;
  };
  const findSession = (candidate = "") => {
    const normalized = normalizeSessionToken(candidate);
    if (!normalized) return null;
    return sessions.find(item => {
      const tokens = [
        item?.type_key,
        item?.type_label,
        item?.folder,
        item?.session_key
      ];
      return tokens.some(token => normalizeSessionToken(token) === normalized);
    }) || null;
  };

  const requested = String(priorSessionType || "");
  const requestedMatch = findSession(requested);
  if (requestedMatch) {
    logTelemetryDriverEvent("telemetry_session_kept", {
      requested_session: requested,
      selected_session: String(requestedMatch?.type_key || ""),
      gp: String(context?.selections?.meeting_key || "")
    });
    return {
      sessionType: String(requestedMatch?.type_key || ""),
      sessionKey: String(requestedMatch?.session_key || ""),
      fallbackUsed: false
    };
  }

  if (requested.trim()) {
    logTelemetryDriverEvent("telemetry_session_invalidated", {
      invalid_session: requested,
      gp: String(context?.selections?.meeting_key || "")
    });
  }

  const serverChoice = findSession(context?.selections?.session_type) || findSession(context?.selections?.session_key);
  const fallback = serverChoice || sessions[0] || null;
  logTelemetryDriverEvent("telemetry_session_fallback_used", {
    requested_session: requested,
    selected_session: String(fallback?.type_key || ""),
    gp: String(context?.selections?.meeting_key || "")
  });
  return {
    sessionType: String(fallback?.type_key || ""),
    sessionKey: String(fallback?.session_key || ""),
    fallbackUsed: true
  };
}

function formatTelemetrySeconds(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 60) {
    const minutes = Math.floor(value / 60);
    const seconds = value - (minutes * 60);
    return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
  }
  return value.toFixed(3);
}

function formatTelemetrySpeed(value) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)} km/h`;
}

function renderTelemetrySelector(options, current) {
  return options.map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(current) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function buildSpark(values = [], className = "") {
  const clean = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (!clean.length) return '<div class="empty-line">Sin traza útil.</div>';
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = Math.max(1, max - min);
  const sampled = clean.length > 250 ? clean.filter((_, idx) => idx % Math.ceil(clean.length / 250) === 0) : clean;
  const points = sampled.map((item, idx) => {
    const x = (idx / Math.max(1, sampled.length - 1)) * 100;
    const y = 100 - (((item - min) / span) * 100);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `<svg class="${className}" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points.join(" ")}"></polyline></svg>`;
}

function normalizeTrace(values = []) {
  return (Array.isArray(values) ? values : []).filter(Number.isFinite);
}

function sampleTrace(values = [], maxPoints = 320) {
  const clean = normalizeTrace(values);
  if (clean.length <= maxPoints) return clean;
  const stride = Math.ceil(clean.length / maxPoints);
  return clean.filter((_, idx) => idx % stride === 0);
}

function telemetryRangeWindow(values = [], rangeStartPct = 0, rangeEndPct = 100) {
  const clean = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (!clean.length) return { clean: [], startIndex: 0, endIndex: 0, segment: [] };
  const maxIndex = clean.length - 1;
  const startIndex = Math.max(0, Math.min(maxIndex, Math.round((Math.max(0, Math.min(100, rangeStartPct)) / 100) * maxIndex)));
  const endIndex = Math.max(startIndex + 1, Math.min(maxIndex, Math.round((Math.max(0, Math.min(100, rangeEndPct)) / 100) * maxIndex)));
  return {
    clean,
    startIndex,
    endIndex,
    segment: clean.slice(startIndex, endIndex + 1)
  };
}

function valueAtCursor(values = [], cursorPct = 0) {
  const clean = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (!clean.length) return null;
  const index = Math.max(0, Math.min(clean.length - 1, Math.round((Math.max(0, Math.min(100, cursorPct)) / 100) * (clean.length - 1))));
  return clean[index];
}

function formatTraceValue(kind, value) {
  if (!Number.isFinite(value)) return "—";
  if (kind === "speed") return formatTelemetrySpeed(value);
  if (kind === "pct") return `${Math.round(value)}%`;
  if (kind === "gear") return `G${Math.round(value)}`;
  if (kind === "rpm") return `${Math.round(value)} rpm`;
  if (kind === "drs") return value > 0 ? "Open" : "Off";
  if (kind === "meters") return `${value.toFixed(1)} m`;
  if (kind === "gforce") return `${value.toFixed(2)} g`;
  return String(Math.round(value));
}

function renderTraceBand(label, values, variant = "", rangeStartPct = 0, rangeEndPct = 100, kind = "pct", cursorPct = 0) {
  const clean = normalizeTrace(values);
  const sampled = sampleTrace(clean, 280);
  if (!sampled.length) {
    return `
      <div class="telemetry-work-trace ${variant}">
        <div class="telemetry-work-trace-head"><span>${escapeHtml(label)}</span><strong>—</strong></div>
        <div class="empty-line">Sin traza útil.</div>
      </div>
    `;
  }
  const readout = formatTraceValue(kind, valueAtCursor(clean, cursorPct));
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = Math.max(1, max - min);
  const points = sampled.map((item, idx) => {
    const x = (idx / Math.max(1, sampled.length - 1)) * 100;
    const y = 100 - (((item - min) / span) * 100);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const cursorX = Math.max(0, Math.min(100, cursorPct));
  const rangeX = Math.max(0, Math.min(100, rangeStartPct));
  const rangeW = Math.max(1, Math.min(100, rangeEndPct) - rangeX);
  return `
    <div class="telemetry-work-trace ${variant}">
      <div class="telemetry-work-trace-head"><span>${escapeHtml(label)}</span><strong>${escapeHtml(readout)}</strong></div>      
      <svg class="telemetry-work-spark" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="${rangeX.toFixed(2)}" y="0" width="${rangeW.toFixed(2)}" height="100" class="telemetry-work-window"></rect>
        <line x1="${cursorX.toFixed(2)}" y1="0" x2="${cursorX.toFixed(2)}" y2="100" class="telemetry-work-cursor"></line>
        <polyline points="${points}" class="telemetry-work-line"></polyline>
      </svg>
    </div>
  `;
}

function pickTelemetryOverviewTrace(traces = {}) {
  const candidates = [traces.speed, traces.throttle, traces.brake, traces.rpm, traces.gear];
  for (const series of candidates) {
    const clean = normalizeTrace(series || []);
    if (clean.length >= 12) return clean;
  }
  return [];
}

function renderTelemetryRangeScrubber(traces = {}, rangeStartPct = 0, rangeEndPct = 100, cursorPct = 0) {
  const sampled = sampleTrace(pickTelemetryOverviewTrace(traces), 220);
  const min = sampled.length ? Math.min(...sampled) : 0;
  const max = sampled.length ? Math.max(...sampled) : 1;
  const span = Math.max(1, max - min);
  const points = sampled.map((item, idx) => {
    const x = (idx / Math.max(1, sampled.length - 1)) * 100;
    const y = 100 - (((item - min) / span) * 100);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const start = Math.max(0, Math.min(99, rangeStartPct));
  const end = Math.max(start + 1, Math.min(100, rangeEndPct));
  const width = Math.max(1, end - start);
  const cursor = Math.max(start, Math.min(end, cursorPct));
  return `
    <div class="telemetry-range-scrubber telemetry-range-scrubber--inline" onpointerdown="handleTelemetryScrubberPointerDown(event)">
      <div class="telemetry-range-scrubber-map">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${points}" class="telemetry-range-overview-line"></polyline>
          <rect x="${start.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="100" class="telemetry-range-overview-window"></rect>
          <line x1="${cursor.toFixed(2)}" y1="0" x2="${cursor.toFixed(2)}" y2="100" class="telemetry-range-overview-cursor"></line>
        </svg>
        <button class="telemetry-range-window-hit" style="left:${start.toFixed(2)}%; width:${width.toFixed(2)}%;" data-drag="window" aria-label="Mover tramo"></button>
        <button class="telemetry-range-handle start" style="left:${start.toFixed(2)}%;" data-drag="start" aria-label="Mover inicio tramo"></button>
        <button class="telemetry-range-handle end" style="left:${end.toFixed(2)}%;" data-drag="end" aria-label="Mover fin tramo"></button>
        <button class="telemetry-range-cursor-knob" style="left:${cursor.toFixed(2)}%;" data-drag="cursor" aria-label="Mover inspección"></button>
      </div>
    </div>
  `;
}

function hasRobustData(values = [], min = 8) {
  return (Array.isArray(values) ? values : []).filter(Number.isFinite).length >= min;
}

function telemetryErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("No hay telemetría histórica")) return "No hay telemetría histórica para esta combinación.";
  if (message.includes("Piloto no disponible")) return "El piloto no está disponible en la sesión elegida.";
  if (message.includes("Sesión no disponible")) return "La sesión no está disponible para este GP.";
  return "No fue posible cargar telemetría desde TracingInsights/2026.";
}

async function fetchEngineerApi(endpoint, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const response = await fetch(`/api/engineer/${endpoint}?${query.toString()}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Engineer API ${endpoint} (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadTelemetryContext() {
  const key = telemetryContextKey();
  const cached = cacheGet(engineerCache.context, key);
  if (cached) return cached;
  const t = engineerState.telemetry;
  const payload = await fetchEngineerApi("context", {
    year: TELEMETRY_SEASON_YEAR,
    meeting_key: t.gp,
    session_type: t.sessionIntent || t.sessionType
  });
  return cacheSet(engineerCache.context, key, payload);
}

function hasTelemetryPayloadData(payload) {
  if (!payload) return false;
  const selector = payload?.lap_selector || payload?.selector || {};
  const laps = Array.isArray(selector?.laps) ? selector.laps : [];
  const selectedLapNumber = Number(selector?.selectedLapNumber);
  const selectedLap = laps.find(item => Number(item?.lapNumber) === selectedLapNumber) || null;
  return Array.isArray(payload?.traces?.speed)
    && payload.traces.speed.length > 0
    && Number.isFinite(selectedLapNumber)
    && !!selectedLap;
}

function telemetrySelectionKey() {
  const t = engineerState.telemetry;
  return `${TELEMETRY_SEASON_YEAR}:${t.gp || ""}:${t.sessionKey || ""}:${t.driver || ""}:${t.lapMode || ""}:${t.manualLap || ""}`;
}

function invalidateTelemetryPayload(reason = "unknown") {
  const telemetry = engineerState.telemetry;
  telemetry.payload = null;
  telemetry.status = "loading";
  telemetry.error = "";
  telemetry.userMessage = "";
  if (reason !== "submode_reentry") {
    telemetry.rangeStartPct = 0;
    telemetry.rangeEndPct = 100;
    telemetry.cursorPct = 0;
  }
  logTelemetryDriverEvent("telemetry_payload_invalidated", {
    reason,
    selection_key: telemetrySelectionKey()
  });
}

function normalizeTelemetryPayload(payload) {
  const selector = payload?.lap_selector || payload?.selector || { laps: [] };
  const laps = Array.isArray(selector.laps) ? selector.laps : [];
  const selectedLapNumber = Number(selector.selectedLapNumber);
  const selectedLap = laps.find(item => Number(item?.lapNumber) === selectedLapNumber) || null;
  const traces = payload?.traces || {};
  const hasSpeedTrace = Array.isArray(traces.speed) && traces.speed.length > 0;
  const hasTimeline = hasSpeedTrace && (Array.isArray(traces.relativeDistance) || Array.isArray(traces.distance));
  const hasTrackView = hasRobustData(traces.trackX || []) && hasRobustData(traces.trackY || []);
  const hasLapMeta = selectedLap && (Number.isFinite(selectedLap.lapTime) || !!selectedLap.compound);
  const ready = !!(selectedLap && hasTimeline && hasTrackView);
  const blockedReason = ready ? "" : (
    !selectedLap ? "unresolved_lap"
      : !hasTimeline ? "timeline_unavailable"
        : !hasTrackView ? "trackview_unavailable"
          : !hasLapMeta ? "lap_metadata_unavailable"
            : "payload_incomplete"
  );
  logTelemetryDriverEvent("telemetry_ready_state_set", {
    selection_key: telemetrySelectionKey(),
    selected_lap: selectedLapNumber,
    ready
  });
  if (!ready) {
    logTelemetryDriverEvent("telemetry_ready_state_blocked_reason", {
      selection_key: telemetrySelectionKey(),
      selected_lap: selectedLapNumber,
      reason: blockedReason
    });
  }
  return {
    ...payload,
    selector,
    status: {
      ...(payload?.status || {}),
      ready,
      blockedReason,
      hasTimeline,
      hasTrackView,
      hasLapMeta
    }
  };
}

function renderLapOption(item = {}) {
  const chunks = [`L${Math.round(item.lapNumber || 0)}`];
  if (Number.isFinite(item.lapTime)) chunks.push(formatTelemetrySeconds(item.lapTime));
  else if (item.isPitIn || item.isPitOut || item.status === "pit") chunks.push("Pit");
  else if (item.status === "invalid") chunks.push("invalid");
  if (item.isBest) chunks.push("PB");
  if (item.compound) chunks.push(item.compound);
  return chunks.join(" · ");
}

function renderTelemetryWorkspace(payload) {
  const summary = payload.summary || {};
  const traces = payload.traces || {};
  const selector = payload.selector || payload.lap_selector || { laps: [] };
  const laps = Array.isArray(selector.laps) ? selector.laps : [];
  const selectedLapNumber = Number(selector.selectedLapNumber);
  const selectedLap = laps.find(item => Number(item?.lapNumber) === selectedLapNumber) || null;
  const rangeStartPct = engineerState.telemetry.rangeStartPct;
  const rangeEndPct = engineerState.telemetry.rangeEndPct;
  const cursorPct = engineerState.telemetry.cursorPct;
  const relativeDistance = traces.relativeDistance || [];
  const distance = traces.distance || [];
  const lapPct = valueAtCursor(relativeDistance, cursorPct);
  const lapMeters = valueAtCursor(distance, cursorPct);
  const rangeLabel = `${Math.round(rangeStartPct)}-${Math.round(rangeEndPct)}%`;

  const sectors = [
    { label: "S1", value: summary.sector1 },
    { label: "S2", value: summary.sector2 },
    { label: "S3", value: summary.sector3 }
  ].filter(item => Number.isFinite(item.value));
  const stintRows = (payload.stints || []).filter(item => item.lapCount >= 3);
  const weather = payload.context?.weather || {};
  const gapAhead = traces.gapAhead || [];
  const hasGap = hasRobustData(gapAhead) && payload.context?.driverAhead;
  const hasWeather = ["airTemp", "trackTemp", "humidity", "pressure", "rainfall", "windSpeed"].some(key => Number.isFinite(weather[key]));
  const hasGForces = hasRobustData(traces.gForceX || []) || hasRobustData(traces.gForceY || []);
  const hasTrackMap = hasRobustData(traces.trackX || []) && hasRobustData(traces.trackY || []);
  const xSeries = normalizeTrace(traces.trackX || []);
  const ySeries = normalizeTrace(traces.trackY || []);
  const speedSeries = normalizeTrace(traces.speed || []);
  let mapSegments = "";
  let mapCursor = "";
  if (hasTrackMap) {
    logTelemetryDriverEvent("telemetry_trackview_built_for_lap", {
      selection_key: telemetrySelectionKey(),
      lap_number: Number(selector.selectedLapNumber) || null
    });
    const length = Math.min(xSeries.length, ySeries.length);
    const from = 0;
    const to = Math.max(2, length - 1);
    const selectedX = xSeries.slice(from, to + 1);
    const selectedY = ySeries.slice(from, to + 1);
    const selectedSpeed = speedSeries.slice(from, to + 1);
    const minX = Math.min(...selectedX);
    const maxX = Math.max(...selectedX);
    const minY = Math.min(...selectedY);
    const maxY = Math.max(...selectedY);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const maxSpeed = selectedSpeed.length ? Math.max(...selectedSpeed, 1) : 1;
    const rangeFrom = Math.round((Math.max(0, Math.min(100, rangeStartPct)) / 100) * Math.max(0, selectedX.length - 1));
    const rangeTo = Math.round((Math.max(0, Math.min(100, rangeEndPct)) / 100) * Math.max(0, selectedX.length - 1));
    const focusFrom = Math.max(0, Math.min(rangeFrom, rangeTo));
    const focusTo = Math.max(focusFrom + 1, Math.min(selectedX.length - 1, Math.max(rangeFrom, rangeTo)));
    for (let idx = 0; idx < selectedX.length - 1; idx += 1) {
      const x1 = ((selectedX[idx] - minX) / spanX) * 100;
      const y1 = 100 - (((selectedY[idx] - minY) / spanY) * 100);
      const x2 = ((selectedX[idx + 1] - minX) / spanX) * 100;
      const y2 = 100 - (((selectedY[idx + 1] - minY) / spanY) * 100);
      const speedRatio = Math.max(0, Math.min(1, (selectedSpeed[idx] || 0) / maxSpeed));
      const hue = 14 + (speedRatio * 142);
      const isInWindow = idx >= focusFrom && idx <= focusTo;
      mapSegments += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="hsl(${hue.toFixed(0)} 88% ${isInWindow ? "63" : "36"}%)" opacity="${isInWindow ? "0.95" : "0.42"}"></line>`;
    }
    const cursorIndex = Math.round((Math.max(0, Math.min(100, cursorPct)) / 100) * Math.max(0, selectedX.length - 1));
    const cursorXPos = ((selectedX[cursorIndex] - minX) / spanX) * 100;
    const cursorYPos = 100 - (((selectedY[cursorIndex] - minY) / spanY) * 100);
    mapCursor = `<circle cx="${cursorXPos.toFixed(2)}" cy="${cursorYPos.toFixed(2)}" r="3.2"></circle>`;
  }

  const sessionLaps = laps.length;
  const weatherLabel = Number.isFinite(weather.airTemp) ? `${weather.airTemp.toFixed(1)}°C aire` : "Aire n/d";
  const weatherExtended = [
    Number.isFinite(weather.trackTemp) ? `${weather.trackTemp.toFixed(1)}°C pista` : "",
    Number.isFinite(weather.humidity) ? `${Math.round(weather.humidity)}% H` : "",
    Number.isFinite(weather.windSpeed) ? `${weather.windSpeed.toFixed(1)} m/s viento` : ""
  ].filter(Boolean).join(" · ");

  const compactReadout = [
    `<div><span>Lap</span><strong>${selectedLap ? `L${selectedLap.lapNumber}` : "—"}</strong></div>`,
    `<div><span>Sector</span><strong>${escapeHtml(summary.currentSector || "S—")}</strong></div>`,
    `<div><span>Speed</span><strong>${escapeHtml(formatTraceValue("speed", valueAtCursor(traces.speed || [], cursorPct)))}</strong></div>`,
    `<div><span>Throttle</span><strong>${escapeHtml(formatTraceValue("pct", valueAtCursor(traces.throttle || [], cursorPct)))}</strong></div>`,
    `<div><span>Brake</span><strong>${escapeHtml(formatTraceValue("pct", valueAtCursor(traces.brake || [], cursorPct)))}</strong></div>`,
    `<div><span>Gear</span><strong>${escapeHtml(formatTraceValue("gear", valueAtCursor(traces.gear || [], cursorPct)))}</strong></div>`,
    `<div><span>RPM</span><strong>${escapeHtml(formatTraceValue("rpm", valueAtCursor(traces.rpm || [], cursorPct)))}</strong></div>`,
    `<div><span>DRS</span><strong>${escapeHtml(formatTraceValue("drs", valueAtCursor(traces.drs || [], cursorPct)))}</strong></div>`
  ].join("");

  const secondarySignalTiles = [];
  if (hasGap) secondarySignalTiles.push(`<div><span>Driver ahead</span><strong>${escapeHtml(payload.context.driverAhead)}</strong><em>${escapeHtml(formatTraceValue("meters", valueAtCursor(gapAhead, cursorPct)))}</em></div>`);
  if (hasWeather) secondarySignalTiles.push(`<div><span>Weather ampliado</span><strong>${escapeHtml(weatherLabel)}</strong><em>${escapeHtml(weatherExtended)}</em></div>`);
  if (hasGForces) secondarySignalTiles.push(`<div><span>G-forces</span><strong>${escapeHtml(formatTraceValue("gforce", valueAtCursor(traces.gForceX || [], cursorPct)))} / ${escapeHtml(formatTraceValue("gforce", valueAtCursor(traces.gForceY || [], cursorPct)))}</strong><em>${escapeHtml(formatTraceValue("gforce", valueAtCursor(traces.gForceZ || [], cursorPct)))}</em></div>`);

  const secondaryTraceRows = [
    hasRobustData(traces.drs || []) ? renderTraceBand("DRS", traces.drs || [], "drs", rangeStartPct, rangeEndPct, "drs", cursorPct) : ""
  ].filter(Boolean).join("");
  logTelemetryDriverEvent("telemetry_track_range_built_for_lap", {
    selection_key: telemetrySelectionKey(),
    lap_number: Number(selector.selectedLapNumber) || null,
    has_timeline: Array.isArray(traces.speed) && traces.speed.length > 0
  });

  return `
    <section class="card engineer-card telemetry-workspace">
      <div class="telemetry-work-topbar">
        <div class="telemetry-work-topbar-main">
          <div><span>Vuelta activa</span><strong>${selectedLap ? `L${selectedLap.lapNumber}` : "—"}</strong></div>
          <div><span>Tiempo</span><strong>${escapeHtml(formatTelemetrySeconds(selectedLap?.lapTime))}</strong></div>
          <div><span>Compuesto</span><strong>${escapeHtml(selectedLap?.compound || "—")}</strong></div>
          <div><span>Telemetría</span><strong>${payload?.status?.ready ? "Disponible" : "No lista"}</strong></div>
        </div>
        <div class="telemetry-work-source">TracingInsights/2026</div>
      </div>

      <div class="telemetry-work-grid">
        <article class="telemetry-work-main">
          ${hasTrackMap ? `<div class="telemetry-track-focus">
            <div class="telemetry-track-focus-head">
              <span>Track view · inspección</span>
              <strong>${escapeHtml(`${Math.round(rangeStartPct)}–${Math.round(rangeEndPct)}% · ${Math.round(cursorPct)}%`)}</strong>
            </div>
            <div class="telemetry-track-focus-meta">
              <div><span>Distancia</span><strong>${escapeHtml(formatTraceValue("meters", lapMeters))}</strong></div>
              <div><span>Ritmo sesión</span><strong>${escapeHtml(formatTelemetrySeconds(summary.averagePace))}</strong></div>
              <div><span>Top / Trap</span><strong>${escapeHtml(formatTelemetrySpeed(summary.topSpeed))} · ${escapeHtml(formatTelemetrySpeed(summary.speedTrap))}</strong></div>
              <button class="btn-secondary" onclick="resetEngineerTelemetryRange()">Reset tramo</button>
            </div>
            ${renderTelemetryRangeScrubber(traces, rangeStartPct, rangeEndPct, cursorPct)}
            <div class="telemetry-track-map telemetry-track-map--focus">
              <svg viewBox="0 0 100 100">${mapSegments}${mapCursor}</svg>
            </div>
          </div>` : `
            <div class="telemetry-track-focus telemetry-track-focus--no-map">
              <div class="telemetry-track-focus-head">
                <span>Track view · inspección</span>
                <strong>${escapeHtml(`${Math.round(rangeStartPct)}–${Math.round(rangeEndPct)}% · ${Math.round(cursorPct)}%`)}</strong>
              </div>
              <div class="telemetry-track-focus-meta">
                <div><span>Distancia</span><strong>${escapeHtml(formatTraceValue("meters", lapMeters))}</strong></div>
                <div><span>Ritmo sesión</span><strong>${escapeHtml(formatTelemetrySeconds(summary.averagePace))}</strong></div>
                <div><span>Top / Trap</span><strong>${escapeHtml(formatTelemetrySpeed(summary.topSpeed))} · ${escapeHtml(formatTelemetrySpeed(summary.speedTrap))}</strong></div>
                <button class="btn-secondary" onclick="resetEngineerTelemetryRange()">Reset tramo</button>
              </div>
              ${renderTelemetryRangeScrubber(traces, rangeStartPct, rangeEndPct, cursorPct)}
            </div>
          `}

          <div class="telemetry-readout-rack">${compactReadout}</div>
          <div class="telemetry-readout-subline">
            <span>Sector</span><strong>${escapeHtml(summary.currentSector || "S—")}</strong>
            <span>% vuelta</span><strong>${escapeHtml(formatTraceValue("pct", lapPct))}</strong>
            <span>Distancia</span><strong>${escapeHtml(formatTraceValue("meters", lapMeters))}</strong>
            <span>Referencia</span><strong>${escapeHtml(formatTelemetrySeconds(summary.referenceLap))}</strong>
          </div>

          <div class="telemetry-work-traces telemetry-work-traces--primary telemetry-work-traces-grid">
            ${renderTraceBand("Speed", traces.speed || [], "speed", rangeStartPct, rangeEndPct, "speed", cursorPct)}
            ${renderTraceBand("Throttle", traces.throttle || [], "throttle", rangeStartPct, rangeEndPct, "pct", cursorPct)}
            ${renderTraceBand("Brake", traces.brake || [], "brake", rangeStartPct, rangeEndPct, "pct", cursorPct)}
            ${hasRobustData(traces.gear || []) ? renderTraceBand("Gear", traces.gear || [], "gear", rangeStartPct, rangeEndPct, "gear", cursorPct) : ""}
            ${hasRobustData(traces.rpm || []) ? renderTraceBand("RPM", traces.rpm || [], "rpm", rangeStartPct, rangeEndPct, "rpm", cursorPct) : ""}
          </div>

          ${secondaryTraceRows ? renderTelemetryAccordion({
            key: "secondaryCharts",
            title: "Señales de apoyo",
            subtitle: "DRS + trazas auxiliares",
            summary: `${sessionLaps} vueltas`,
            body: `<div class="telemetry-work-traces">${secondaryTraceRows}</div>`
          }) : ""}
          ${secondarySignalTiles.length ? renderTelemetryAccordion({
            key: "secondarySignals",
            title: "Contexto técnico",
            subtitle: "Gap · G-forces · Weather",
            summary: `${secondarySignalTiles.length} bloques`,
            body: `<div class="telemetry-tech-strip">${secondarySignalTiles.join("")}</div>`
          }) : ""}
          ${(sectors.length || stintRows.length) ? renderTelemetryAccordion({
            key: "secondaryMetrics",
            title: "Métricas secundarias",
            subtitle: "Sectores · stints",
            summary: `${sectors.length + stintRows.length} bloques`,
            body: `
              ${sectors.length ? `<div class="telemetry-sectors">${sectors.map(item => `<div><span>${item.label}</span><strong>${escapeHtml(formatTelemetrySeconds(item.value))}</strong></div>`).join("")}</div>` : ""}
              ${stintRows.length ? `<div class="telemetry-stint-mini">${stintRows.map(item => `<div><span>S${item.number} · ${escapeHtml(item.compound || "-")}</span><strong>${escapeHtml(formatTelemetrySeconds(item.avgLap))}</strong></div>`).join("")}</div>` : ""}
            `
          }) : ""}
        </article>
        <aside class="telemetry-work-side">
          <section class="telemetry-side-block">
            <h4>Tiempos</h4>
            <div class="telemetry-side-list">
              <div><span>Actual</span><strong>${escapeHtml(formatTelemetrySeconds(selectedLap?.lapTime))}</strong></div>
              <div><span>Referencia</span><strong>${escapeHtml(formatTelemetrySeconds(summary.referenceLap))}</strong></div>
              <div><span>S1</span><strong>${escapeHtml(formatTelemetrySeconds(summary.sector1))}</strong></div>
              <div><span>S2</span><strong>${escapeHtml(formatTelemetrySeconds(summary.sector2))}</strong></div>
              <div><span>S3</span><strong>${escapeHtml(formatTelemetrySeconds(summary.sector3))}</strong></div>
            </div>
          </section>

          <section class="telemetry-side-block">
            <h4>Stint</h4>
            <div class="telemetry-side-list">
              <div><span>Compuesto</span><strong>${escapeHtml(selectedLap?.compound || "—")}</strong></div>
              <div><span>Vueltas sesión</span><strong>${sessionLaps}</strong></div>
              <div><span>Ritmo medio</span><strong>${escapeHtml(formatTelemetrySeconds(summary.averagePace))}</strong></div>
              <div><span>Top speed</span><strong>${escapeHtml(formatTelemetrySpeed(summary.topSpeed))}</strong></div>
            </div>
          </section>

          <section class="telemetry-side-block">
            <h4>Meteo</h4>
            <div class="telemetry-side-list">
              <div><span>Aire</span><strong>${Number.isFinite(weather.airTemp) ? `${weather.airTemp.toFixed(1)}°C` : "—"}</strong></div>
              <div><span>Pista</span><strong>${Number.isFinite(weather.trackTemp) ? `${weather.trackTemp.toFixed(1)}°C` : "—"}</strong></div>
              <div><span>Humedad</span><strong>${Number.isFinite(weather.humidity) ? `${Math.round(weather.humidity)}%` : "—"}</strong></div>
              <div><span>Viento</span><strong>${Number.isFinite(weather.windSpeed) ? `${weather.windSpeed.toFixed(1)} m/s` : "—"}</strong></div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  `;
}

function renderTelemetryPanelBody() {
  const telemetry = engineerState.telemetry;
  if (telemetry.status === "loading" && !telemetry.payload) return `<div class="card engineer-card"><div class="empty-line">Cargando workspace técnico 2026…</div></div>`;
  if (telemetry.status === "error") return `<div class="card engineer-card"><div class="card-title">Telemetría no disponible</div><div class="empty-line">${escapeHtml(telemetry.userMessage)}</div></div>`;
  if (!telemetry.payload) return `<div class="card engineer-card"><div class="empty-line">Selecciona GP, sesión y piloto para comenzar.</div></div>`;
  if (telemetry.payload?.status?.ready !== true) {
    const reason = telemetry.payload?.status?.blockedReason || "unresolved_lap";
    return `<div class="card engineer-card"><div class="card-title">Telemetría no lista</div><div class="empty-line">No se pudo resolver una vuelta activa válida (${escapeHtml(reason)}).</div></div>`;
  }
  return renderTelemetryWorkspace(telemetry.payload);
}

function renderTelemetryPanel() {
  const telemetry = engineerState.telemetry;
  const context = telemetry.context || { meetings: [], sessions: [], drivers: [] };
  const gpOptions = (context.meetings || []).map(item => ({ value: String(item.meeting_key), label: item.gp_label }));
  const sessionOptions = (context.sessions || []).map(item => ({ value: item.type_key, label: item.type_label }));
  const driverOptions = (context.drivers || []).map(item => ({ value: String(item.id || ""), label: item.team ? `${item.name} · ${item.team}` : item.name }));
  const payload = telemetry.payload || {};
  const selector = payload.selector || payload.lap_selector || { laps: [] };
  const laps = Array.isArray(selector.laps) ? selector.laps : [];
  const manualEligibleLaps = laps.filter(item => item?.hasManualEligibility !== false);
  const manualOptions = manualEligibleLaps.map(item => ({ value: String(item.lapNumber), label: renderLapOption(item) }));

  return `
    <section class="card engineer-card telemetry-work-controls telemetry-work-controls--bar">
      ${renderEngineerTelemetryCompactHeader(telemetry, selector, context)}
      <div class="telemetry-work-controls-row telemetry-work-controls-row--topbar">
        <label><span>GP</span><select class="select-input" onchange="setEngineerTelemetryGp(this.value)">${renderTelemetrySelector(gpOptions, telemetry.gp)}</select></label>
        <label><span>Sesión</span><select class="select-input" onchange="setEngineerTelemetrySessionType(this.value)">${renderTelemetrySelector(sessionOptions, telemetry.sessionType)}</select></label>
        <label><span>Piloto</span><select class="select-input" onchange="setEngineerTelemetryDriver(this.value)">${renderTelemetrySelector(driverOptions, telemetry.driver)}</select></label>
        <label><span>Modo vuelta</span><select class="select-input" onchange="setEngineerTelemetryLapMode(this.value)">${renderTelemetrySelector([
          { value: "reference", label: "Referencia" },
          { value: "latest", label: "Última" },
          { value: "manual", label: "Manual" }
        ], telemetry.lapMode)}</select></label>
        ${telemetry.lapMode === "manual"
      ? `<label><span>Vuelta</span><select class="select-input" onchange="setEngineerTelemetryManualLap(this.value)">${renderTelemetrySelector(manualOptions, telemetry.manualLap || String(selector.selectedLapNumber || ""))}</select></label>`
      : ""}
      </div>
      ${telemetry.lapMode === "manual" && manualOptions.length === 0
      ? `<div class="empty-line">No hay vueltas manuales elegibles para esta combinación.</div>`
      : ""}
    </section>
    ${renderTelemetryPanelBody()}
  `;
}

async function loadTelemetryData() {
  const telemetry = engineerState.telemetry;
  const requestId = ++telemetryRequestId;
  const requestedGp = telemetry.gp || "";
  const requestedSessionType = telemetry.sessionIntent || telemetry.sessionType || "";
  const requestedDriver = telemetry.driver || "";
  logTelemetryDriverEvent("telemetry_context_changed", {
    request_id: requestId,
    gp: requestedGp,
    session_type: requestedSessionType,
    prior_driver: requestedDriver,
    lap_mode: telemetry.lapMode,
    manual_lap: telemetry.manualLap || ""
  });
  invalidateTelemetryPayload("context_or_lap_change");
  renderEngineerScreen();

  try {
    logTelemetryDriverEvent("telemetry_lap_list_resolve_started", {
      request_id: requestId,
      gp: requestedGp,
      session_type: requestedSessionType
    });
    const context = await loadTelemetryContext();
    if (requestId !== telemetryRequestId) {
      logTelemetryDriverEvent("telemetry_session_ignored_stale_update", {
        request_id: requestId,
        active_request_id: telemetryRequestId,
        stage: "context"
      });
      return;
    }

    telemetry.context = context;
    telemetry.gp = context.selections?.meeting_key || telemetry.gp || "";
    logTelemetryDriverEvent("telemetry_lap_list_resolved", {
      request_id: requestId,
      gp: telemetry.gp || "",
      requested_session: requestedSessionType,
      available_sessions: (context.sessions || []).map(item => String(item?.type_key || "")).filter(Boolean)
    });
    const resolvedSession = resolveTelemetrySessionSelection(context, requestedSessionType);
    telemetry.sessionType = resolvedSession.sessionType;
    telemetry.sessionKey = resolvedSession.sessionKey;
    telemetry.sessionIntent = telemetry.sessionType;
    const resolvedDriver = resolveTelemetryDriverSelection(context, requestedDriver);
    telemetry.driver = resolvedDriver.driverId;
    logTelemetryDriverEvent("telemetry_session_final", {
      request_id: requestId,
      gp: telemetry.gp || "",
      session_type: telemetry.sessionType || "",
      session_key: telemetry.sessionKey || "",
      fallback_used: resolvedSession.fallbackUsed === true
    });
    persistTelemetryUiState();

    if (!telemetry.sessionKey || !telemetry.driver) {
      telemetry.status = "error";
      telemetry.userMessage = "No hay combinación válida GP/sesión/piloto con datos.";
      telemetry.payload = null;
      renderEngineerScreen();
      return;
    }

    logTelemetryDriverEvent("telemetry_driver_list_loaded", {
      request_id: requestId,
      gp: telemetry.gp || "",
      session_type: telemetry.sessionType || "",
      drivers: Array.isArray(context?.drivers) ? context.drivers.length : 0
    });
    logTelemetryDriverEvent("telemetry_active_lap_resolve_started", {
      request_id: requestId,
      selection_key: telemetrySelectionKey(),
      lap_mode: telemetry.lapMode,
      manual_lap: telemetry.manualLap || ""
    });
    const loadedPayload = await fetchEngineerApi("telemetry", {
      year: TELEMETRY_SEASON_YEAR,
      meeting_key: telemetry.gp,
      session_key: telemetry.sessionKey,
      driver_number: telemetry.driver,
      lap_mode: telemetry.lapMode,
      manual_lap: telemetry.manualLap
    });

    if (requestId !== telemetryRequestId) {
      logTelemetryDriverEvent("telemetry_session_ignored_stale_update", {
        request_id: requestId,
        active_request_id: telemetryRequestId,
        stage: "payload"
      });
      return;
    }
    const normalizedPayload = normalizeTelemetryPayload(loadedPayload);
    if (!hasTelemetryPayloadData(normalizedPayload) || normalizedPayload?.status?.ready !== true) {
      telemetry.status = "error";
      telemetry.userMessage = "La sesión no trae una vuelta activa válida para telemetría.";
      telemetry.payload = normalizedPayload;
      logTelemetryDriverEvent("telemetry_active_lap_failed", {
        request_id: requestId,
        selection_key: telemetrySelectionKey(),
        reason: normalizedPayload?.status?.blockedReason || "invalid_payload"
      });
      renderEngineerScreen();
      return;
    }

    telemetry.payload = normalizedPayload;
    telemetry.status = "ready";
    logTelemetryDriverEvent("telemetry_active_lap_resolved", {
      request_id: requestId,
      selection_key: telemetrySelectionKey(),
      lap_number: Number(normalizedPayload?.selector?.selectedLapNumber) || null
    });
    logTelemetryDriverEvent("telemetry_selected_driver_final", {
      request_id: requestId,
      selected: telemetry.driver || "",
      gp: telemetry.gp || "",
      session_type: telemetry.sessionType || "",
      session_key: telemetry.sessionKey || ""
    });
    renderEngineerScreen();
  } catch (error) {
    if (requestId !== telemetryRequestId) {
      logTelemetryDriverEvent("telemetry_session_ignored_stale_update", {
        request_id: requestId,
        active_request_id: telemetryRequestId,
        stage: "error"
      });
      return;
    }
    telemetry.status = "error";
    telemetry.error = String(error?.message || "");
    telemetry.userMessage = telemetryErrorMessage(error);
    telemetry.payload = null;
    renderEngineerScreen();
  }
}

function setEngineerSubmode(mode) {
  const prevSubmode = engineerState.submode;
  engineerState.submode = mode === "telemetry" ? "telemetry" : "prediction";
  persistEngineerSubmode(engineerState.submode);
  renderEngineerScreen();
  if (engineerState.submode === "telemetry") {
    const telemetry = engineerState.telemetry;
    const shouldReloadTelemetry = prevSubmode !== "telemetry"
      && (!telemetry.payload || telemetry.status === "error" || telemetry.status === "idle");
    if (shouldReloadTelemetry) loadTelemetryData();
  }
}

function resetTelemetrySelection() {
  invalidateTelemetryPayload("selection_reset");
  engineerState.telemetry.manualLap = "";
  engineerState.telemetry.lapMode = "reference";
}

function setEngineerTelemetryGp(value) {
  engineerState.telemetry.gp = value || "";
  engineerState.telemetry.context = null;
  engineerState.telemetry.sessionKey = "";
  persistTelemetryUiState();
  resetTelemetrySelection();
  loadTelemetryData();
}

function setEngineerTelemetrySessionType(value) {
  const selected = value || "";
  engineerState.telemetry.sessionIntent = selected;
  engineerState.telemetry.sessionType = selected;
  engineerState.telemetry.context = null;
  engineerState.telemetry.sessionKey = "";
  logTelemetryDriverEvent("telemetry_session_user_choice", {
    selected_session: selected,
    gp: engineerState.telemetry.gp || ""
  });
  persistTelemetryUiState();
  resetTelemetrySelection();
  loadTelemetryData();
}

function setEngineerTelemetryDriver(value) {
  engineerState.telemetry.driver = value || "";
  engineerState.telemetry.sessionKey = "";
  logTelemetryDriverEvent("telemetry_selected_driver_user_choice", {
    selected: engineerState.telemetry.driver || "",
    gp: engineerState.telemetry.gp || "",
    session_type: engineerState.telemetry.sessionType || ""
  });
  persistTelemetryUiState();
  resetTelemetrySelection();
  loadTelemetryData();
}

function toggleTelemetryAccordion(key) {
  if (!key || !engineerState.telemetry.accordionState || !(key in engineerState.telemetry.accordionState)) return;
  engineerState.telemetry.accordionState[key] = !engineerState.telemetry.accordionState[key];
  persistTelemetryUiState();
  renderEngineerScreen();
}

function renderTelemetryAccordion({ key, title, subtitle = "", summary = "", body = "" }) {
  const isOpen = engineerState.telemetry.accordionState?.[key] === true;
  return `
    <section class="telemetry-accordion ${isOpen ? "open" : ""}">
      <button class="telemetry-accordion-toggle" onclick="toggleTelemetryAccordion('${escapeHtml(key)}')" aria-expanded="${isOpen ? "true" : "false"}">
        <div class="telemetry-accordion-meta">
          <strong>${escapeHtml(title)}</strong>
          ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
        </div>
        <div class="telemetry-accordion-state">
          ${summary ? `<span>${escapeHtml(summary)}</span>` : ""}
          <em>${isOpen ? "−" : "+"}</em>
        </div>
      </button>
      ${isOpen ? `<div class="telemetry-accordion-body">${body}</div>` : ""}
    </section>
  `;
}

function setEngineerTelemetryLapMode(mode) {
  if (!TELEMETRY_LAP_MODES.includes(mode)) return;
  logTelemetryDriverEvent("telemetry_context_changed", {
    reason: "lap_mode_changed",
    lap_mode: mode,
    manual_lap: engineerState.telemetry.manualLap || ""
  });
  engineerState.telemetry.lapMode = mode;
  if (mode !== "manual") engineerState.telemetry.manualLap = "";
  invalidateTelemetryPayload("lap_mode_changed");
  loadTelemetryData();
}

function setEngineerTelemetryManualLap(value) {
  engineerState.telemetry.lapMode = "manual";
  engineerState.telemetry.manualLap = String(value || "");
  logTelemetryDriverEvent("telemetry_manual_lap_selected", {
    lap_number: Number(engineerState.telemetry.manualLap) || null,
    selection_key: telemetrySelectionKey()
  });
  invalidateTelemetryPayload("manual_lap_changed");
  loadTelemetryData();
}

function setEngineerTelemetryRangeStart(value) {
  const start = Math.max(0, Math.min(99, Number(value) || 0));
  engineerState.telemetry.rangeStartPct = Math.min(start, engineerState.telemetry.rangeEndPct - 1);
  engineerState.telemetry.cursorPct = Math.max(engineerState.telemetry.rangeStartPct, Math.min(engineerState.telemetry.cursorPct, engineerState.telemetry.rangeEndPct));
  renderEngineerScreen();
}

function setEngineerTelemetryRangeEnd(value) {
  const end = Math.max(1, Math.min(100, Number(value) || 100));
  engineerState.telemetry.rangeEndPct = Math.max(end, engineerState.telemetry.rangeStartPct + 1);
  engineerState.telemetry.cursorPct = Math.min(engineerState.telemetry.rangeEndPct, Math.max(engineerState.telemetry.cursorPct, engineerState.telemetry.rangeStartPct));
  renderEngineerScreen();
}

function setEngineerTelemetryCursor(value) {
  const cursor = Number(value) || 0;
  engineerState.telemetry.cursorPct = Math.max(engineerState.telemetry.rangeStartPct, Math.min(engineerState.telemetry.rangeEndPct, cursor));
  renderEngineerScreen();
}

function resetEngineerTelemetryRange() {
  engineerState.telemetry.rangeStartPct = 0;
  engineerState.telemetry.rangeEndPct = 100;
  engineerState.telemetry.cursorPct = 0;
  renderEngineerScreen();
}

const telemetryRangeDrag = {
  active: false,
  mode: "",
  pointerId: null,
  rect: null,
  anchorPct: 0,
  startPct: 0,
  endPct: 100,
  cursorPct: 0
};

function telemetryPctFromPointer(clientX) {
  const rect = telemetryRangeDrag.rect;
  if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) return 0;
  const raw = ((clientX - rect.left) / rect.width) * 100;
  return Math.max(0, Math.min(100, raw));
}

function applyTelemetryDrag(pct) {
  const t = engineerState.telemetry;
  const current = Math.max(0, Math.min(100, pct));
  if (telemetryRangeDrag.mode === "start") {
    t.rangeStartPct = Math.min(current, t.rangeEndPct - 1);
    t.cursorPct = Math.max(t.rangeStartPct, Math.min(t.cursorPct, t.rangeEndPct));
  } else if (telemetryRangeDrag.mode === "end") {
    t.rangeEndPct = Math.max(current, t.rangeStartPct + 1);
    t.cursorPct = Math.max(t.rangeStartPct, Math.min(t.cursorPct, t.rangeEndPct));
  } else if (telemetryRangeDrag.mode === "cursor") {
    t.cursorPct = Math.max(t.rangeStartPct, Math.min(t.rangeEndPct, current));
  } else if (telemetryRangeDrag.mode === "window") {
    const width = Math.max(1, telemetryRangeDrag.endPct - telemetryRangeDrag.startPct);
    const delta = current - telemetryRangeDrag.anchorPct;
    const nextStart = Math.max(0, Math.min(100 - width, telemetryRangeDrag.startPct + delta));
    const nextEnd = nextStart + width;
    const cursorDelta = t.cursorPct - telemetryRangeDrag.startPct;
    t.rangeStartPct = nextStart;
    t.rangeEndPct = nextEnd;
    t.cursorPct = Math.max(nextStart, Math.min(nextEnd, nextStart + cursorDelta));
  }
  renderEngineerScreen();
}

function handleTelemetryScrubberPointerMove(event) {
  if (!telemetryRangeDrag.active || event.pointerId !== telemetryRangeDrag.pointerId) return;
  applyTelemetryDrag(telemetryPctFromPointer(event.clientX));
}

function handleTelemetryScrubberPointerUp(event) {
  if (!telemetryRangeDrag.active || event.pointerId !== telemetryRangeDrag.pointerId) return;
  telemetryRangeDrag.active = false;
  telemetryRangeDrag.mode = "";
  telemetryRangeDrag.pointerId = null;
  telemetryRangeDrag.rect = null;
  document.removeEventListener("pointermove", handleTelemetryScrubberPointerMove);
  document.removeEventListener("pointerup", handleTelemetryScrubberPointerUp);
  document.removeEventListener("pointercancel", handleTelemetryScrubberPointerUp);
}

function handleTelemetryScrubberPointerDown(event) {
  const map = event.currentTarget?.querySelector(".telemetry-range-scrubber-map");
  if (!map) return;
  const targetMode = event.target?.dataset?.drag || "";
  telemetryRangeDrag.active = true;
  telemetryRangeDrag.mode = targetMode || "cursor";
  telemetryRangeDrag.pointerId = event.pointerId;
  telemetryRangeDrag.rect = map.getBoundingClientRect();
  telemetryRangeDrag.anchorPct = telemetryPctFromPointer(event.clientX);
  telemetryRangeDrag.startPct = engineerState.telemetry.rangeStartPct;
  telemetryRangeDrag.endPct = engineerState.telemetry.rangeEndPct;
  telemetryRangeDrag.cursorPct = engineerState.telemetry.cursorPct;
  if (!targetMode) {
    const pct = telemetryRangeDrag.anchorPct;
    engineerState.telemetry.cursorPct = Math.max(engineerState.telemetry.rangeStartPct, Math.min(engineerState.telemetry.rangeEndPct, pct));
    renderEngineerScreen();
  } else {
    applyTelemetryDrag(telemetryRangeDrag.anchorPct);
  }
  document.addEventListener("pointermove", handleTelemetryScrubberPointerMove);
  document.addEventListener("pointerup", handleTelemetryScrubberPointerUp);
  document.addEventListener("pointercancel", handleTelemetryScrubberPointerUp);
}

function renderEngineerScreen() {
  const selectedRace = getSelectedRace();
  const isPrediction = engineerState.submode === "prediction";
  const favorite = isPrediction ? getFavorite() : null;
  const needFreshPredict = isPrediction ? shouldAutoGeneratePredict(favorite, selectedRace) : false;
  const activePredictData = !needFreshPredict ? state.lastPredictData : null;
  const expert = isExpertMode();

  contentEl().innerHTML = `
    <div class="card engineer-card engineer-top-card engineer-wall-header">
      <div class="engineer-topline">
        <div class="engineer-brand-line">
          <div class="card-title">Ingeniero</div>
          <div class="card-sub">Control Wall · predicción y telemetría integradas</div>
        </div>
        <div class="engineer-submode-switch" role="tablist" aria-label="Submodo ingeniero">
          <button class="toggle-btn ${engineerState.submode === "prediction" ? "active" : ""}" onclick="setEngineerSubmode('prediction')">Predicción</button>
          <button class="toggle-btn ${engineerState.submode === "telemetry" ? "active" : ""}" onclick="setEngineerSubmode('telemetry')">Telemetría</button>
        </div>
      </div>
    </div>

    ${engineerState.submode === "prediction"
      ? renderEngineerPredictionPanel(favorite, selectedRace, activePredictData, expert)
      : renderTelemetryPanel()}
  `;

  if (engineerState.submode === "prediction" && needFreshPredict) {
    setTimeout(() => runPredict(), 80);
  }
}

function showPredict() {
  setActiveNav("nav-predict");
  rememberScreen("predict");
  updateSubtitle();

  engineerState.submode = state.engineerSubmode === "telemetry" ? "telemetry" : "prediction";
  renderEngineerScreen();
  if (engineerState.submode === "telemetry" && !engineerState.telemetry.payload && engineerState.telemetry.status !== "loading") {
    loadTelemetryData();
  }
}

window.runPredict = runPredict;
window.refreshPredict = refreshPredict;
window.showPredict = showPredict;
window.clearPredictionHistory = clearPredictionHistory;
window.openPredictionHistoryItem = openPredictionHistoryItem;
window.sharePrediction = sharePrediction;
window.setEngineerSubmode = setEngineerSubmode;
window.setEngineerTelemetryGp = setEngineerTelemetryGp;
window.setEngineerTelemetrySessionType = setEngineerTelemetrySessionType;
window.setEngineerTelemetryDriver = setEngineerTelemetryDriver;
window.setEngineerTelemetryLapMode = setEngineerTelemetryLapMode;
window.setEngineerTelemetryManualLap = setEngineerTelemetryManualLap;
window.setEngineerTelemetryRangeStart = setEngineerTelemetryRangeStart;
window.setEngineerTelemetryRangeEnd = setEngineerTelemetryRangeEnd;
window.setEngineerTelemetryCursor = setEngineerTelemetryCursor;
window.resetEngineerTelemetryRange = resetEngineerTelemetryRange;
window.handleTelemetryScrubberPointerDown = handleTelemetryScrubberPointerDown;
window.toggleTelemetryAccordion = toggleTelemetryAccordion;


function persistEngineerSubmode(mode) {
  state.engineerSubmode = mode === "telemetry" ? "telemetry" : "prediction";
  saveUiState();
}

applyStoredTelemetryUiState();

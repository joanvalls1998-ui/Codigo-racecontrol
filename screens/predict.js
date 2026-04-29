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

function renderTelemetryTrackRangeControls(rangeStartPct = 0, rangeEndPct = 100, cursorPct = 0) {
  const start = Math.max(0, Math.min(99, rangeStartPct));
  const end = Math.max(start + 1, Math.min(100, rangeEndPct));
  const width = Math.max(1, end - start);
  const cursor = Math.max(start, Math.min(end, cursorPct));
  return `
    <div class="telemetry-track-range-controls" onpointerdown="handleTelemetryScrubberPointerDown(event)">
      <div class="telemetry-range-scrubber-map">
        <div class="telemetry-track-range-rail" aria-hidden="true"></div>
        <div class="telemetry-track-range-window" style="left:${start.toFixed(2)}%; width:${width.toFixed(2)}%;" aria-hidden="true"></div>
        <div class="telemetry-track-range-cursor" style="left:${cursor.toFixed(2)}%;" aria-hidden="true"></div>
        <button class="telemetry-range-window-hit" style="left:${start.toFixed(2)}%; width:${width.toFixed(2)}%;" data-drag="window" aria-label="Mover tramo"></button>
        <button class="telemetry-range-handle start" style="left:${start.toFixed(2)}%;" data-drag="start" aria-label="Mover inicio tramo"></button>
        <button class="telemetry-range-handle end" style="left:${end.toFixed(2)}%;" data-drag="end" aria-label="Mover fin tramo"></button>
        <button class="telemetry-range-cursor-knob" style="left:${cursor.toFixed(2)}%;" data-drag="cursor" aria-label="Mover inspección"></button>
      </div>
    </div>
  `;
}

/**
 * Playback controls bar rendered below the track map.
 * Hands-off: does NOT render the scrubber (that is the existing range scrubber).
 * The player drives the car dot; user can also drag the playback scrubber.
 */
function renderTelemetryPlaybackControls(relativeDistance = [], speed = [], selectedLap = null) {
  const lapLabel = selectedLap ? `L${selectedLap.lapNumber}` : "—";
  const lapTime  = selectedLap && Number.isFinite(selectedLap.lapTime)
    ? formatTelemetrySeconds(selectedLap.lapTime) : "—";
  return `
    <div class="telemetry-playback-bar">
      <div class="telemetry-playback-head">
        <div class="telemetry-playback-lap-info">
          <span class="telemetry-playback-lap-label">${escapeHtml(lapLabel)}</span>
          <span class="telemetry-playback-lap-time">${escapeHtml(lapTime)}</span>
        </div>
        <div class="telemetry-playback-controls">
          <button id="telemetry-play-btn" class="telemetry-playback-btn" aria-label="Reproducir" title="Reproducir / Pausar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
          <div class="telemetry-speed-group" role="group" aria-label="Velocidad de reproducción">
            <button id="telemetry-speed-025" class="telemetry-speed-btn" data-speed="0.25" aria-pressed="false">0.25×</button>
            <button id="telemetry-speed-05"  class="telemetry-speed-btn" data-speed="0.5"  aria-pressed="false">0.5×</button>
            <button id="telemetry-speed-1"   class="telemetry-speed-btn active" data-speed="1" aria-pressed="true">1×</button>
            <button id="telemetry-speed-2"   class="telemetry-speed-btn" data-speed="2"   aria-pressed="false">2×</button>
          </div>
          <button class="telemetry-playback-btn telemetry-playback-stop-btn" id="telemetry-stop-btn" aria-label="Detener" title="Detener y reiniciar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        </div>
      </div>
      <div class="telemetry-playback-metrics">
        <div class="telemetry-playback-metric">
          <span class="telemetry-playback-metric-label">Live</span>
          <span id="telemetry-playback-live-time" class="telemetry-playback-metric-value telemetry-playback-live-time">—</span>
        </div>
        <div class="telemetry-playback-metric">
          <span class="telemetry-playback-metric-label">Speed</span>
          <span id="telemetry-playback-speed" class="telemetry-playback-metric-value">—</span>
        </div>
        <div class="telemetry-playback-metric">
          <span class="telemetry-playback-metric-label">Throttle</span>
          <span id="telemetry-playback-throttle" class="telemetry-playback-metric-value">—</span>
        </div>
        <div class="telemetry-playback-metric">
          <span class="telemetry-playback-metric-label">Brake</span>
          <span id="telemetry-playback-brake" class="telemetry-playback-metric-value">—</span>
        </div>
        <div class="telemetry-playback-metric">
          <span class="telemetry-playback-metric-label">Sector</span>
          <span id="telemetry-playback-sector-indicator" class="telemetry-playback-sector-indicator">—</span>
        </div>
      </div>
      <div class="telemetry-playback-scrubber-row">
        <input
          type="range"
          id="telemetry-playback-scrubber"
          class="telemetry-playback-scrubber"
          min="0" max="100" value="0" step="0.1"
          aria-label="Progreso de vuelta"
        />
        <span id="telemetry-playback-time" class="telemetry-playback-time">0%</span>
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
  
  // Usar API_BASE_URL si está configurada (Cloudflare Worker)
  const baseUrl = (typeof RACECONTROL_CONFIG !== 'undefined' && RACECONTROL_CONFIG.API_BASE_URL) || '';
  const url = baseUrl ? `${baseUrl}/api/engineer/${endpoint}?${query.toString()}` : `/api/engineer/${endpoint}?${query.toString()}`;
  
  const response = await fetch(url, { cache: "no-store" });
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

/**
 * TelemetryPlayer — animates a car dot along the track path with playback controls.
 *
 * Usage:
 *   const player = new TelemetryPlayer({
 *     containerId: "telemetry-track-map--focus",  // ID of the map div (no #)
 *     trackSvgId:  "telemetry-track-playback-svg", // ID of the <svg> inside container
 *     carDotId:    "telemetry-car-dot",            // ID of the <circle> car element
 *     scrubberId:  "telemetry-playback-scrubber",  // ID of the <input type="range">
 *     playBtnId:   "telemetry-play-btn",           // ID of the play/pause <button>
 *     speedBtnIds: ["telemetry-speed-025","telemetry-speed-05","telemetry-speed-1","telemetry-speed-2"],
 *     onSeek: (pct) => { setEngineerTelemetryCursor(pct); },
 *     onPlayStateChange: (isPlaying) => { ... }
 *   });
 *   player.setData({ trackX, trackY, speed, throttle, brake, relativeDistance, lapTime, sector1, sector2, sector3 });
 *   player.play(); // etc.
 */
class TelemetryPlayer {
  constructor({
    containerId, trackSvgId, carDotId, scrubberId, playBtnId, speedBtnIds = [],
    onSeek, onPlayStateChange
  } = {}) {
    this.containerId = containerId;
    this.trackSvgId  = trackSvgId;
    this.carDotId   = carDotId;
    this.scrubberId = scrubberId;
    this.playBtnId  = playBtnId;
    this.speedBtnIds = speedBtnIds;
    this.onSeek = onSeek || (() => {});
    this.onPlayStateChange = onPlayStateChange || (() => {});

    this.trackX = [];
    this.trackY = [];
    this.speed  = [];
    this.throttle = [];
    this.brake = [];
    this.relativeDistance = [];
    this.lapTime = null;
    this.sector1 = null;
    this.sector2 = null;
    this.sector3 = null;

    this._playing     = false;
    this._animId      = null;
    this._lastTs      = null;
    this._progress    = 0;   // 0–100
    this._speed       = 1;   // 0.25 | 0.5 | 1 | 2
    this._pts         = [];
    this._lapStart    = null; // Date.now() when playback started/resumed
    this._lapElapsed  = 0;    // accumulated ms before current play segment
    this._dataLen     = 0;
    this._dragging    = false;

    this._bindEvents();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setData({
    trackX = [], trackY = [], speed = [], throttle = [], brake = [],
    relativeDistance = [], lapTime = null,
    sector1 = null, sector2 = null, sector3 = null
  } = {}) {
    this.trackX = normalizeTrace(trackX);
    this.trackY = normalizeTrace(trackY);
    this.speed  = normalizeTrace(speed);
    this.throttle = normalizeTrace(throttle);
    this.brake   = normalizeTrace(brake);
    this.relativeDistance = normalizeTrace(relativeDistance);
    this.lapTime = Number.isFinite(lapTime) ? lapTime : null;
    this.sector1 = Number.isFinite(sector1) ? sector1 : null;
    this.sector2 = Number.isFinite(sector2) ? sector2 : null;
    this.sector3 = Number.isFinite(sector3) ? sector3 : null;
    this._progress   = 0;
    this._lapStart   = null;
    this._lapElapsed = 0;
    this._dataLen    = this.trackX.length;
    this._syncCarDot(0);
    this._syncScrubber(0);
    this._syncMetrics(0);
    this._buildPath();
  }

  play() {
    if (this._playing) return;
    if (this._progress >= 100) {
      this._progress  = 0;
      this._lapStart   = null;
      this._lapElapsed = 0;
    }
    this._playing = true;
    this._lastTs  = null;
    this._lapStart = Date.now();
    this._updatePlayBtn(true);
    this.onPlayStateChange(true);
    this._animId = requestAnimationFrame(ts => this._tick(ts));
  }

  pause() {
    if (this._playing) {
      this._lapElapsed += Date.now() - (this._lapStart || Date.now());
    }
    this._playing = false;
    if (this._animId) cancelAnimationFrame(this._animId);
    this._animId = null;
    this._updatePlayBtn(false);
    this.onPlayStateChange(false);
  }

  stop() {
    this.pause();
    this._progress  = 0;
    this._lapStart   = null;
    this._lapElapsed = 0;
    this._syncCarDot(0);
    this._syncScrubber(0);
    this._syncMetrics(0);
    this.onSeek(0);
  }

  setSpeed(s) {
    this._speed = s;
    this.speedBtnIds.forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const isActive = btn.dataset.speed === String(s);
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  seekTo(pct) {
    this._progress = Math.max(0, Math.min(100, pct));
    if (this.lapTime) {
      this._lapElapsed = (this._progress / 100) * this.lapTime * 1000;
    }
    this._syncCarDot(this._progress);
    this._syncScrubber(this._progress);
    this._syncMetrics(this._progress);
    this.onSeek(this._progress);
  }

  destroy() {
    this.pause();
    document.removeEventListener("pointermove", this._onPointerMove);
    document.removeEventListener("pointerup",   this._onPointerUp);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _bindEvents() {
    const playBtn = document.getElementById(this.playBtnId);
    if (playBtn) playBtn.addEventListener("click", () => this._playing ? this.pause() : this.play());

    this.speedBtnIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener("click", () => {
        const s = parseFloat(btn.dataset.speed);
        if (!Number.isFinite(s)) return;
        if (this._playing) {
          this._lapElapsed += Date.now() - (this._lapStart || Date.now());
          this._lapStart = Date.now();
        }
        this.setSpeed(s);
      });
    });

    this._onPointerMove = e => {
      if (!this._dragging) return;
      const pct = this._scrubberPct(e.clientX);
      this.seekTo(pct);
    };
    this._onPointerUp = () => { this._dragging = false; };
    document.addEventListener("pointermove", this._onPointerMove);
    document.addEventListener("pointerup",   this._onPointerUp);

    const scrubber = document.getElementById(this.scrubberId);
    if (scrubber) {
      scrubber.addEventListener("pointerdown", e => {
        this._dragging = true;
        const pct = this._scrubberPct(e.clientX);
        this.seekTo(pct);
        e.preventDefault();
      });
    }
  }

  _scrubberPct(clientX) {
    const scrubber = document.getElementById(this.scrubberId);
    if (!scrubber) return 0;
    const rect = scrubber.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }

  _buildPath() {
    const svg = document.getElementById(this.trackSvgId);
    if (!svg || this.trackX.length < 2) return;

    const minX = Math.min(...this.trackX);
    const maxX = Math.max(...this.trackX);
    const minY = Math.min(...this.trackY);
    const maxY = Math.max(...this.trackY);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const maxSpeed = this.speed.length ? Math.max(...this.speed, 1) : 1;

    const n = this.trackX.length;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = ((this.trackX[i] - minX) / spanX) * 100;
      const y = 100 - (((this.trackY[i] - minY) / spanY) * 100);
      pts.push({ x, y, speedRatio: this.speed[i] / maxSpeed });
    }

    let segmentsHtml = "";
    for (let i = 0; i < pts.length - 1; i++) {
      const hue = 14 + (pts[i].speedRatio * 142);
      segmentsHtml += `<line x1="${pts[i].x.toFixed(2)}" y1="${pts[i].y.toFixed(2)}" x2="${pts[i+1].x.toFixed(2)}" y2="${pts[i+1].y.toFixed(2)}" stroke="hsl(${hue.toFixed(0)} 88% 63%)" opacity="0.42" stroke-width="2.2" stroke-linecap="round"></line>`;
    }

    const existingLines = svg.querySelectorAll("line");
    existingLines.forEach(el => el.remove());
    svg.insertAdjacentHTML("afterbegin", segmentsHtml);

    this._pts = pts;
  }

  /** Interpolated position between track points for smooth dot movement. */
  _interpolatedPos(progressPct) {
    const pts = this._pts;
    if (!pts || pts.length < 2) return { x: 50, y: 50 };
    const n = pts.length;
    const rawIndex = (progressPct / 100) * (n - 1);
    const i = Math.max(0, Math.min(n - 2, Math.floor(rawIndex)));
    const t = rawIndex - i;
    return {
      x: pts[i].x + t * (pts[i + 1].x - pts[i].x),
      y: pts[i].y + t * (pts[i + 1].y - pts[i].y)
    };
  }

  _syncCarDot(pct) {
    const dot = document.getElementById(this.carDotId);
    if (!dot) return;
    const pos = this._interpolatedPos(pct);
    dot.setAttribute("cx", pos.x.toFixed(3));
    dot.setAttribute("cy", pos.y.toFixed(3));
  }

  _syncScrubber(pct) {
    const scrubber = document.getElementById(this.scrubberId);
    if (scrubber) scrubber.value = Math.max(0, Math.min(100, pct));
    const label = document.getElementById("telemetry-playback-time");
    if (label) label.textContent = `${Math.round(pct)}%`;
  }

  _currentMetrics(pct) {
    const idx = Math.round((Math.max(0, Math.min(100, pct)) / 100) * (this.throttle.length - 1));
    return {
      throttle: this.throttle[idx] ?? null,
      brake:    this.brake[idx] ?? null,
      speed:    this.speed[idx] ?? null
    };
  }

  _currentSector(pct) {
    const rd = this.relativeDistance;
    if (!rd || !rd.length) return null;
    const cursor = Math.round((Math.max(0, Math.min(100, pct)) / 100) * (rd.length - 1));
    const dist = rd[cursor] ?? 0;
    const s1End = this.sector1 ? 33.3 : 33.3;
    const s2End = this.sector2 ? 66.6 : 66.6;
    if (dist < s1End) return 1;
    if (dist < s2End) return 2;
    return 3;
  }

  _sectorColor(pct) {
    const sector = this._currentSector(pct);
    if (!sector) return "neutral";
    const refTime = sector === 1 ? this.sector1 : sector === 2 ? this.sector2 : this.sector3;
    if (!Number.isFinite(refTime)) return "neutral";
    const totalSec = this._lapElapsed / 1000;
    const sectorFrac = sector === 1 ? 1/3 : sector === 2 ? 1/3 : 1/3;
    const timeSpent  = totalSec * (pct / 100) * sectorFrac;
    const ratio = timeSpent / refTime;
    if (ratio <= 1.03) return "green";
    if (ratio <= 1.07) return "yellow";
    return "red";
  }

  _syncMetrics(pct) {
    const { throttle, brake, speed } = this._currentMetrics(pct);
    const sectorColor = this._sectorColor(pct);

    const thEl = document.getElementById("telemetry-playback-throttle");
    if (thEl) thEl.textContent = Number.isFinite(throttle) ? `${Math.round(throttle)}%` : "—";

    const brEl = document.getElementById("telemetry-playback-brake");
    if (brEl) brEl.textContent = Number.isFinite(brake) ? `${Math.round(brake)}%` : "—";

    const spEl = document.getElementById("telemetry-playback-speed");
    if (spEl) spEl.textContent = Number.isFinite(speed) ? `${Math.round(speed)} km/h` : "—";

    const sectorEl = document.getElementById("telemetry-playback-sector-indicator");
    if (sectorEl) {
      const s = this._currentSector(pct);
      sectorEl.textContent = s ? `S${s}` : "—";
      sectorEl.className = `telemetry-playback-sector-indicator telemetry-sector-${sectorColor}`;
    }

    const liveEl = document.getElementById("telemetry-playback-live-time");
    if (liveEl && this.lapTime) {
      const elapsedSec = this._lapElapsed / 1000;
      liveEl.textContent = formatTelemetrySeconds(Math.min(elapsedSec, this.lapTime));
    }
  }

  _updatePlayBtn(isPlaying) {
    const btn = document.getElementById(this.playBtnId);
    if (!btn) return;
    btn.innerHTML = isPlaying
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
    btn.setAttribute("aria-label", isPlaying ? "Pausar" : "Reproducir");
    btn.classList.toggle("playing", isPlaying);
  }

  _tick(ts) {
    if (!this._playing) return;

    if (this._lastTs === null) {
      this._lastTs = ts;
      this._animId = requestAnimationFrame(t => this._tick(t));
      return;
    }

    const deltaMs = ts - this._lastTs;
    this._lastTs  = ts;
    const msPerPct = (this.lapTime ? this.lapTime * 1000 : 18000) / 100;
    this._progress += (deltaMs / msPerPct) * this._speed;

    if (this._progress >= 100) {
      this._progress = 100;
      this._lapElapsed = (this.lapTime || 18) * 1000;
      this._syncCarDot(100);
      this._syncScrubber(100);
      this._syncMetrics(100);
      this.onSeek(100);
      this.pause();
      return;
    }

    this._syncCarDot(this._progress);
    this._syncScrubber(this._progress);
    this._syncMetrics(this._progress);
    this.onSeek(this._progress);
    this._animId = requestAnimationFrame(t => this._tick(t));
  }
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
            <div class="telemetry-track-map telemetry-track-map--focus">
              <svg id="telemetry-track-playback-svg" viewBox="0 0 100 100">${mapSegments}${mapCursor}<circle id="telemetry-car-dot" cx="50" cy="50" r="4"></circle></svg>
            </div>
            ${renderTelemetryPlaybackControls(relativeDistance, speedSeries, selectedLap)}
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
              ${renderTelemetryTrackRangeControls(rangeStartPct, rangeEndPct, cursorPct)}
            </div>
          `}

          <div class="telemetry-readout-rack">${compactReadout}</div>
          <div class="telemetry-readout-subline">
            <span>Sector</span><strong>${escapeHtml(summary.currentSector || "S—")}</strong>
            <span>% vuelta</span><strong>${escapeHtml(formatTraceValue("pct", lapPct))}</strong>
            <span>Distancia</span><strong>${escapeHtml(formatTraceValue("meters", lapMeters))}</strong>
            <span>Referencia</span><strong>${escapeHtml(formatTelemetrySeconds(summary.referenceLap))}</strong>
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
  if (telemetryPlayer && telemetryPlayer._playing) return;
  renderEngineerScreen();
}

function setEngineerTelemetryRangeEnd(value) {
  const end = Math.max(1, Math.min(100, Number(value) || 100));
  engineerState.telemetry.rangeEndPct = Math.max(end, engineerState.telemetry.rangeStartPct + 1);
  engineerState.telemetry.cursorPct = Math.min(engineerState.telemetry.rangeEndPct, Math.max(engineerState.telemetry.cursorPct, engineerState.telemetry.rangeStartPct));
  if (telemetryPlayer && telemetryPlayer._playing) return;
  renderEngineerScreen();
}

function setEngineerTelemetryCursor(value) {
  const cursor = Number(value) || 0;
  engineerState.telemetry.cursorPct = Math.max(engineerState.telemetry.rangeStartPct, Math.min(engineerState.telemetry.rangeEndPct, cursor));
  // Skip full re-render if player is already live — just update state
  if (telemetryPlayer && telemetryPlayer._playing) {
    return;
  }
  renderEngineerScreen();
}

function resetEngineerTelemetryRange() {
  if (telemetryPlayer) telemetryPlayer.stop();
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

let telemetryPlayer = null;

function initTelemetryPlayer() {
  // Tear down previous player
  if (telemetryPlayer) {
    telemetryPlayer.destroy();
    telemetryPlayer = null;
  }

  const payload = engineerState.telemetry.payload;
  if (!payload) return;

  const traces  = payload.traces || {};
  const summary = payload.summary || {};
  const sel     = payload.lap_selector || {};
  const laps    = Array.isArray(sel.laps) ? sel.laps : [];
  const selectedLap = laps.find(item => Number(item.lapNumber) === Number(sel.selectedLapNumber)) || null;

  telemetryPlayer = new TelemetryPlayer({
    containerId:  "telemetry-track-map--focus",
    trackSvgId:   "telemetry-track-playback-svg",
    carDotId:     "telemetry-car-dot",
    scrubberId:    "telemetry-playback-scrubber",
    playBtnId:    "telemetry-play-btn",
    speedBtnIds:  ["telemetry-speed-025", "telemetry-speed-05", "telemetry-speed-1", "telemetry-speed-2"],
    onSeek: pct => setEngineerTelemetryCursor(pct),
    onPlayStateChange: isPlaying => {
      // Keep range scrubber and playback scrubber in sync while playing
    }
  });

  telemetryPlayer.setData({
    trackX:           traces.trackX           || [],
    trackY:           traces.trackY           || [],
    speed:            traces.speed            || [],
    throttle:         traces.throttle         || [],
    brake:            traces.brake            || [],
    relativeDistance: traces.relativeDistance || [],
    lapTime:          selectedLap?.lapTime   ?? null,
    sector1:          summary.sector1        ?? null,
    sector2:          summary.sector2        ?? null,
    sector3:          summary.sector3        ?? null
  });

  // Wire stop button
  const stopBtn = document.getElementById("telemetry-stop-btn");
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (telemetryPlayer) telemetryPlayer.stop();
      resetEngineerTelemetryRange();
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F1 Broadcast-style Engineer Dashboard Components
// (prefixed wrapper classes to avoid clashing with app .topbar)
// ─────────────────────────────────────────────────────────────────────────────

const COMPOUND_COLORS = {
  soft:   { dot: "#ff6b35", label: "Soft" },
  medium: { dot: "#ffffff", label: "Medium" },
  hard:   { dot: "#888888", label: "Hard" },
  inter:  { dot: "#8888ff", label: "Inter" },
  wet:    { dot: "#44aaff", label: "Wet" }
};

function getCompoundInfo(compound = "") {
  const c = String(compound || "").toLowerCase().trim();
  return COMPOUND_COLORS[c] || { dot: "#888", label: compound || "—" };
}

/** F1 top bar with brand + live badge */
function renderTopbar() {
  return `
    <div class="f1-topbar">
      <div class="f1-topbar-brand">
        <div class="f1-logo"></div>
        <div>
          <div class="f1-topbar-title">RaceControl</div>
          <div class="f1-topbar-subtitle">Telemetry &amp; Prediction</div>
        </div>
      </div>
      <div class="f1-live-badge">● LIVE</div>
    </div>
  `;
}

/** F1 nav tabs; active tab is 'Ingeniero' */
function renderNavTabs() {
  const tabs = ["Inicio", "Ingeniero", "Favorito", "Calendario", "Clasificación", "Más"];
  return `
    <div class="f1-nav-tabs">
      ${tabs.map((t, i) => `
        <div class="f1-nav-tab${i === 1 ? " active" : ""}" data-tab="${t}">${t}</div>
      `).join("")}
    </div>
  `;
}

/** Session header card: GP name + session info + stats */
function renderSessionHeaderCard({ gpName = "Australian Grand Prix 2026", sessionInfo = "FP3 · Practice 3", totalLaps = 21, airTemp = 22, trackTemp = 5 } = {}) {
  return `
    <div>
      <div class="section-label">Session</div>
      <div class="session-header">
        <div class="gp-info">
          <div class="gp-name">${escapeHtml(gpName)}</div>
          <div class="session-info">${escapeHtml(sessionInfo)}</div>
        </div>
        <div class="session-stats">
          <div class="session-stat">
            <div class="val">${totalLaps}</div>
            <div class="lbl">Vueltas</div>
          </div>
          <div class="session-stat">
            <div class="val">${airTemp}°</div>
            <div class="lbl">Temp</div>
          </div>
          <div class="session-stat">
            <div class="val">${trackTemp}°</div>
            <div class="lbl">Pista</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/** Track card with SVG circuit, driver chip, lap counter, playback bar, stints bar */
function renderTrackCard({ driverCode = "ALB", teamName = "Williams", currentLap = 83, totalLaps = 21, stints = [], laps = [] } = {}) {
  const stintHtml = stints.length
    ? stints.map(s => {
        const compound = s.compound?.toLowerCase() || "medium";
        return `<div class="stint-segment ${compound}"><div class="stint-label">${escapeHtml(s.label || "")}</div></div>`;
      }).join("")
    : `<div class="stint-segment medium"><div class="stint-label">M1 · —</div></div>
       <div class="stint-segment soft"><div class="stint-label">S2 · —</div></div>
       <div class="stint-segment hard"><div class="stint-label">H3 · —</div></div>`;

  return `
    <div>
      <div class="section-label">Track View · Reproducció automàtica</div>
      <div class="track-card">
        <div class="track-header">
          <div class="track-header-left">
            <div class="driver-chip">
              <div class="dot"></div>
              <span>${escapeHtml(driverCode)}</span>
              <span class="team">${escapeHtml(teamName)}</span>
            </div>
          </div>
          <div class="track-header-right">
            <div class="lap-counter">VOLTA <span>${currentLap}</span> / ${totalLaps}</div>
          </div>
        </div>

        <div class="track-view-container">
          <svg class="track-svg" viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
            <path class="track-path-infield"
              d="M 340 380 C 240 380, 160 300, 160 200 C 160 120, 220 60, 320 60
                 C 380 60, 440 80, 480 100 C 520 120, 560 120, 600 100
                 C 660 70, 700 100, 700 160 C 700 240, 640 300, 560 320
                 C 500 335, 440 330, 400 310"
              stroke-dasharray="8 4"/>
            <path class="track-path"
              d="M 340 380 C 240 380, 160 300, 160 200 C 160 120, 220 60, 320 60
                 C 380 60, 440 80, 480 100 C 520 120, 560 120, 600 100
                 C 660 70, 700 100, 700 160 C 700 240, 640 300, 560 320
                 C 500 335, 440 330, 400 310 C 380 302, 365 380, 365 380"/>
            <line class="start-finish" x1="340" y1="370" x2="340" y2="395"/>
            <circle class="car-dot" cx="340" cy="380" r="7"/>
            <circle cx="160" cy="200" r="4" fill="#ff6b35" opacity="0.6"/>
            <circle cx="320" cy="60" r="4" fill="#ff6b35" opacity="0.6"/>
            <circle cx="700" cy="160" r="4" fill="#ff6b35" opacity="0.6"/>
          </svg>
        </div>

        <div class="playback-bar">
          <button class="play-btn paused">
            <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
          </button>
          <div class="timeline-container">
            <div class="timeline-labels">
              <span>0%</span><span>START/FIN</span><span>100%</span>
            </div>
            <div class="timeline-track">
              <div class="timeline-progress"></div>
              <div class="timeline-thumb"></div>
            </div>
          </div>
          <div class="speed-control">
            <button class="speed-btn">0.5×</button>
            <button class="speed-btn active">1×</button>
            <button class="speed-btn">2×</button>
          </div>
        </div>

        <div class="stints-bar">
          ${stintHtml}
        </div>
      </div>
    </div>
  `;
}

/** Horizontal lap selector with chips */
function renderLapSelector({ laps = [], selectedLapNumber = null } = {}) {
  const chips = laps.slice(0, 20).map(lap => {
    const isSelected = Number(lap.lapNumber) === Number(selectedLapNumber);
    const compound = getCompoundInfo(lap.compound);
    const timeStr = Number.isFinite(lap.lapTime) ? formatTelemetrySeconds(lap.lapTime) : "—";
    return `
      <div class="lap-chip${isSelected ? " selected" : ""}" onclick="selectTelemetryLap(${lap.lapNumber})">
        <span class="lnum">L${Math.round(lap.lapNumber || 0)}</span>
        <span class="ltime">${escapeHtml(timeStr)}</span>
        <div class="compound ${lap.compound?.toLowerCase() || ""}">
          <div class="compound-dot" style="background:${compound.dot}"></div>
          ${compound.label}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div>
      <div class="section-label">Selectora volta</div>
      <div class="lap-selector-row">
        ${chips || `<div class="lap-chip"><span class="lnum">—</span><span class="ltime">Sin vueltas</span></div>`}
      </div>
    </div>
  `;
}

/** 4-column metrics grid */
function renderMetricsGrid({ speed = null, throttle = null, brake = null, ers = null, fuel = null, tyreLife = null, lapTime = null, lapTimeDelta = null, gForce = null, maxSpeed = null } = {}) {
  const tile = (label, value, unit = "", delta = null, highlight = false) => {
    const deltaClass = delta
      ? (delta.startsWith("▲") ? "pos" : delta.startsWith("▼") ? "neg" : "neu")
      : "neu";
    const deltaHtml = delta ? `<div class="delta ${deltaClass}">${escapeHtml(delta)}</div>` : "";
    return `
      <div class="metric-tile${highlight ? " highlight" : ""}">
        <div class="lbl">${escapeHtml(label)}</div>
        <div class="val">${escapeHtml(value)}${unit ? `<span class="unit">${escapeHtml(unit)}</span>` : ""}</div>
        ${deltaHtml}
      </div>
    `;
  };

  return `
    <div>
      <div class="section-label">Telemetría · Temps real</div>
      <div class="metrics-grid">
        ${tile("Tiempo volta", lapTime || "—", "s", lapTimeDelta, true)}
        ${tile("Velocidad max", maxSpeed ? String(Math.round(maxSpeed)) : "—", "km/h", null)}
        ${tile("Fuerza G", gForce ? String(gForce.toFixed(1)) : "—", "G", null)}
        ${tile("Throttle", throttle !== null ? String(Math.round(throttle)) : "—", "%", null)}
        ${tile("Brake", brake !== null ? String(Math.round(brake)) : "—", "%", null)}
        ${tile("ERS", ers !== null ? (ers >= 0 ? "+" : "") + ers.toFixed(1) : "—", "MJ/lap", ers !== null ? (ers >= 0 ? "▲" : "▼") : null)}
        ${tile("Fuel", fuel !== null ? String(Math.round(fuel)) : "—", "kg", null)}
        ${tile("Tyre life", tyreLife !== null ? String(tyreLife) : "—", "laps", null)}
      </div>
    </div>
  `;
}

/** Track map + playback (used inside telemetry workspace) */
function renderBroadcastTrackSection(payload) {
  const summary  = payload?.summary  || {};
  const traces   = payload?.traces   || {};
  const selector = payload?.selector || {};
  const laps     = Array.isArray(selector.laps) ? selector.laps : [];
  const selectedLap = laps.find(item => Number(item?.lapNumber) === Number(selector.selectedLapNumber)) || null;
  const selectedLapNumber = Number(selector.selectedLapNumber);
  const currentLap = selectedLap?.lapNumber || "—";

  const stints = (payload.stints || []).filter(s => s.lapCount >= 3);
  const stintHtml = stints.length
    ? stints.map(s => {
        const c = s.compound?.toLowerCase() || "medium";
        return `<div class="stint-segment ${c}"><div class="stint-label">${escapeHtml(s.compound || "?")} ${s.number || ""} · ${s.lapCount || 0} laps</div></div>`;
      }).join("")
    : `<div class="stint-segment medium"><div class="stint-label">M1 · —</div></div>
       <div class="stint-segment soft"><div class="stint-label">S2 · —</div></div>`;

  const hasTrackMap = hasRobustData(traces.trackX) && hasRobustData(traces.trackY);
  const xS = normalizeTrace(traces.trackX || []);
  const yS = normalizeTrace(traces.trackY || []);
  const spS = normalizeTrace(traces.speed  || []);
  let mapSegments = "", mapCursor = "";

  if (hasTrackMap) {
    const minX = Math.min(...xS), maxX = Math.max(...xS);
    const minY = Math.min(...yS), maxY = Math.max(...yS);
    const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
    const maxSp  = spS.length ? Math.max(...spS, 1) : 1;
    const n = Math.min(xS.length, yS.length);
    for (let i = 0; i < n - 1; i++) {
      const x1 = ((xS[i]   - minX) / spanX) * 100;
      const y1 = 100 - (((yS[i]   - minY) / spanY) * 100);
      const x2 = ((xS[i+1] - minX) / spanX) * 100;
      const y2 = 100 - (((yS[i+1] - minY) / spanY) * 100);
      const sr = Math.max(0, Math.min(1, (spS[i] || 0) / maxSp));
      const hue = 14 + sr * 142;
      mapSegments += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="hsl(${hue.toFixed(0)} 88% 63%)" opacity="0.85" stroke-width="2.2" stroke-linecap="round">`;
    }
    const cIdx = Math.round((engineerState.telemetry.cursorPct / 100) * Math.max(0, n - 1));
    const cx = ((xS[cIdx] - minX) / spanX) * 100;
    const cy = 100 - (((yS[cIdx] - minY) / spanY) * 100);
    mapCursor = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="3.2"></circle>`;
  }

  const lapTime = Number.isFinite(selectedLap?.lapTime) ? formatTelemetrySeconds(selectedLap.lapTime) : "—";
  const speed   = valueAtCursor(traces.speed,    engineerState.telemetry.cursorPct);
  const throttle = valueAtCursor(traces.throttle, engineerState.telemetry.cursorPct);
  const brakeVal = valueAtCursor(traces.brake,    engineerState.telemetry.cursorPct);
  const ersVal  = valueAtCursor(traces.ers,       engineerState.telemetry.cursorPct);
  const fuel    = Number.isFinite(summary.fuel) ? summary.fuel : null;
  const tyreLife = selectedLap?.tyreLife || null;
  const gForce  = null;

  return `
    ${renderSessionHeaderCard({
      gpName: payload?.context?.gpLabel || getSelectedRace() || "—",
      sessionInfo: payload?.context?.sessionLabel || "—",
      totalLaps: laps.length,
      airTemp: Number.isFinite(summary.airTemp) ? Math.round(summary.airTemp) : 22,
      trackTemp: Number.isFinite(summary.trackTemp) ? Math.round(summary.trackTemp) : 5
    })}

    <div>
      <div class="section-label">Track View · Reproducció automàtica</div>
      <div class="track-card">
        <div class="track-header">
          <div class="track-header-left">
            <div class="driver-chip">
              <div class="dot"></div>
              <span>${escapeHtml(payload?.context?.driverCode || "—")}</span>
              <span class="team">${escapeHtml(payload?.context?.teamName || "—")}</span>
            </div>
          </div>
          <div class="track-header-right">
            <div class="lap-counter">VOLTA <span>${currentLap}</span> / ${laps.length}</div>
          </div>
        </div>

        <div class="track-view-container">
          <svg class="track-svg" viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
            ${mapSegments}${mapCursor}
            <circle id="telemetry-car-dot" cx="50" cy="50" r="7"></circle>
          </svg>
        </div>

        <div class="playback-bar">
          <button class="play-btn paused" id="telemetry-play-btn">
            <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
          </button>
          <div class="timeline-container">
            <div class="timeline-labels">
              <span>0%</span><span>START/FIN</span><span>100%</span>
            </div>
            <div class="timeline-track">
              <div class="timeline-progress"></div>
              <div class="timeline-thumb"></div>
            </div>
          </div>
          <div class="speed-control">
            <button class="speed-btn" id="telemetry-speed-025" data-speed="0.25">0.25×</button>
            <button class="speed-btn" id="telemetry-speed-05"  data-speed="0.5">0.5×</button>
            <button class="speed-btn active" id="telemetry-speed-1" data-speed="1">1×</button>
            <button class="speed-btn" id="telemetry-speed-2" data-speed="2">2×</button>
          </div>
        </div>

        <div class="stints-bar">${stintHtml}</div>
      </div>
    </div>

    ${renderLapSelector({ laps, selectedLapNumber })}

    ${renderMetricsGrid({
      lapTime,
      lapTimeDelta: null,
      maxSpeed: Number.isFinite(summary.topSpeed) ? summary.topSpeed : (speed ? Math.round(speed) : null),
      gForce,
      throttle: throttle !== null ? throttle : null,
      brake: brakeVal !== null ? brakeVal : null,
      ers: ersVal !== null ? ersVal : null,
      fuel,
      tyreLife
    })}
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// renderEngineerScreen — Full F1 Broadcast Layout
// ─────────────────────────────────────────────────────────────────────────────

function renderEngineerScreen() {
  const selectedRace = getSelectedRace();
  const isPrediction = engineerState.submode === "prediction";
  const isTelemetry   = engineerState.submode === "telemetry";
  const favorite = isPrediction ? getFavorite() : null;
  const needFreshPredict = isPrediction ? shouldAutoGeneratePredict(favorite, selectedRace) : false;
  const activePredictData = !needFreshPredict ? state.lastPredictData : null;
  const expert = isExpertMode();
  const telemetry = engineerState.telemetry;
  const telemetryPayload = telemetry.payload;

  // ── Build the engineer container ─────────────────────────────────────────
  let engineerBody = "";

  if (isTelemetry && telemetryPayload?.status?.ready) {
    // ── Full broadcast dashboard for telemetry ──
    engineerBody = renderBroadcastTrackSection(telemetryPayload);

    // Keep existing prediction/telemetry panels below the broadcast header
    engineerBody += `
      <section class="card engineer-card engineer-wall-panel" style="margin-top:12px;">
        <div class="engineer-panel-heading">
          <div class="engineer-panel-title">Panel de control</div>
          <div class="engineer-panel-subtitle">GP · Sesión · Piloto</div>
        </div>
      </section>
    `;
    // Controls bar (dropped in below)
    engineerBody += renderTelemetryPanel();

  } else if (isTelemetry) {
    // Telemetry mode but no data yet — show controls + loading
    engineerBody = `
      <section class="card engineer-card engineer-wall-panel">
        <div class="engineer-panel-heading">
          <div class="engineer-panel-title">Telemetría</div>
          <div class="engineer-panel-subtitle">Selecciona GP, sesión y piloto</div>
        </div>
      </section>
    `;
    engineerBody += renderTelemetryPanel();

  } else {
    // Prediction mode
    engineerBody = `
      ${renderEngineerPredictionPanel(favorite, selectedRace, activePredictData, expert)}
    `;
  }

  // Wrap everything in the engineer container
  const containerHtml = `
    <div class="engineer-container">
      ${engineerBody}
    </div>
  `;

  // ── Assemble full page ─────────────────────────────────────────────────────
  contentEl().innerHTML = `
    ${renderTopbar()}
    ${renderNavTabs()}
    <div class="card engineer-card engineer-top-card engineer-wall-header">
      <div class="engineer-topline">
        <div class="engineer-brand-line">
          <div class="card-title">Ingeniero</div>
          <div class="card-sub">Control Wall · Predicción y Telemetría</div>
        </div>
        <div class="engineer-submode-switch" role="tablist" aria-label="Submodo ingeniero">
          <button class="toggle-btn ${engineerState.submode === "prediction" ? "active" : ""}" onclick="setEngineerSubmode('prediction')">Predicción</button>
          <button class="toggle-btn ${engineerState.submode === "telemetry" ? "active" : ""}" onclick="setEngineerSubmode('telemetry')">Telemetría</button>
        </div>
      </div>
    </div>
    ${containerHtml}
  `;

  // Bootstrap the playback player once DOM is painted
  setTimeout(() => {
    if (engineerState.submode === "telemetry") initTelemetryPlayer();
  }, 0);

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

window.navigateTab = function(tab) {
  // Stub: handle nav tab clicks — route to existing show* functions
  const tabMap = {
    "Inicio": "home", "Ingeniero": "predict", "Favorito": "favorito",
    "Calendario": "calendar", "Clasificación": "standings"
  };
  const screen = tabMap[tab];
  if (screen && typeof window[`show${screen.charAt(0).toUpperCase() + screen.slice(1)}`] === "function") {
    window[`show${screen.charAt(0).toUpperCase() + screen.slice(1)}`]();
  }
};
window.selectTelemetryLap = function(lapNumber) {
  engineerState.telemetry.manualLap = String(lapNumber);
  engineerState.telemetry.lapMode = "manual";
  invalidateTelemetryPayload("manual_lap_changed");
  loadTelemetryData();
};
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
window.initTelemetryPlayer = initTelemetryPlayer;


function persistEngineerSubmode(mode) {
  state.engineerSubmode = mode === "telemetry" ? "telemetry" : "prediction";
  saveUiState();
}

applyStoredTelemetryUiState();

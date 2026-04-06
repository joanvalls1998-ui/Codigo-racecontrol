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

function renderEngineerPredictionPanel(favorite, raceName, activePredictData, expert) {
  const scenarios = getPredictScenarios(favorite, raceName, activePredictData);
  const base = scenarios[1] || scenarios[0] || { value: "—", text: "Escenario base pendiente." };
  const ceiling = scenarios[2] || scenarios[1] || { value: "—", text: "Escenario techo pendiente." };
  const mainFocus = getPredictMainFocus(favorite, raceName, activePredictData);
  const risk = mainFocus.riskFactor || { title: "Riesgo principal", text: "Lectura pendiente" };
  const needText = getWeekendKeyPoints(favorite, raceName)[0] || "Convertir ritmo en resultado sin errores.";

  return `
    <div class="card engineer-card">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">Predicción</div>
          <div class="card-sub">Lectura compacta del GP</div>
        </div>
        <div class="card-head-actions">
          <button class="icon-btn" onclick="sharePrediction()">Compartir</button>
        </div>
      </div>

      <div class="engineer-compact-grid" style="margin-top:12px;">
        <div class="meta-tile">
          <div class="meta-kicker">1 · Lectura principal</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(mainFocus.strategy.label)}</div>
          <div class="meta-caption">${escapeHtml(mainFocus.focus)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">2 · Suelo</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(scenarios[0]?.value || "—")}</div>
          <div class="meta-caption">${escapeHtml(scenarios[0]?.text || "Escenario conservador")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">2 · Base</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(base.value || "—")}</div>
          <div class="meta-caption">${escapeHtml(base.text || "Escenario base")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">2 · Techo</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(ceiling.value || "—")}</div>
          <div class="meta-caption">${escapeHtml(ceiling.text || "Escenario alto")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">3 · Riesgo principal</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(risk.title)}</div>
          <div class="meta-caption">${escapeHtml(risk.text)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">4 · Factor crítico</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(mainFocus.strategy.factor)}</div>
          <div class="meta-caption">${escapeHtml(mainFocus.signal.description)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">5 · Qué necesita el favorito</div>
          <div class="meta-value" style="font-size:17px;">Ejecución limpia</div>
          <div class="meta-caption">${escapeHtml(needText)}</div>
        </div>
      </div>

      <div style="margin-top:12px;">
        <div class="meta-kicker" style="margin-bottom:8px;">6 · Sábado / Domingo</div>
        <div id="predictQualyRace">${renderPredictExecutionSplitCard(favorite, raceName, activePredictData, expert)}</div>
      </div>
    </div>

    <div class="card engineer-card">
      <details>
        <summary style="cursor:pointer; font-weight:700;">7 · Análisis ampliado</summary>
        <div id="predictSummaryCards" style="margin-top:12px;">${activePredictData ? renderPredictSummaryCards(activePredictData) : renderPredictPreviewCards(favorite, raceName)}</div>
        <div id="predictScenarioCards" style="margin-top:10px;">${renderPredictScenarioCards(favorite, raceName, activePredictData)}</div>
        <div id="predictKeyFactors" style="margin-top:10px;">${renderPredictKeyFactors(favorite, raceName, activePredictData)}</div>
        <div id="predictStrategyDetail" style="margin-top:10px;">${renderPredictStrategyDetail(favorite, raceName, activePredictData)}</div>
        <div id="predictGridRead" style="margin-top:10px;">${renderPredictGridRead(favorite, raceName, activePredictData)}</div>
        <pre id="predictOutput" class="ai-output predict-v2-raw-output">${activePredictData ? escapeHtml(formatPredictResponse(activePredictData)) : "Preparando predicción…"}</pre>
        <div id="predictionHistoryBox" style="margin-top:10px;">${renderPredictionHistory()}</div>
      </details>
    </div>
  `;
}

const TELEMETRY_SEASON_YEAR = 2026;

const engineerState = {
  submode: "prediction",
  telemetry: {
    status: "idle",
    error: "",
    userMessage: "",
    gp: "",
    sessionType: "",
    sessionKey: "",
    driver: "",
    context: null,
    payload: null
  }
};

const engineerCache = {
  context: new Map(),
  telemetry: new Map()
};

let telemetryRequestId = 0;

function isTelemetryMetricReady(value, kind = "default") {
  if (!Number.isFinite(value)) return false;
  if (kind === "lap" || kind === "pace" || kind === "sector" || kind === "speed") return value > 0;
  return true;
}

function hasTelemetryPayloadData(payload) {
  if (!payload) return false;
  const summary = payload.summary || {};
  const hasCoreSummary = isTelemetryMetricReady(summary.referenceLap, "lap")
    || isTelemetryMetricReady(summary.averagePace, "pace")
    || isTelemetryMetricReady(summary.topSpeed, "speed")
    || isTelemetryMetricReady(summary.speedTrap, "speed");
  const hasTraces = Array.isArray(payload.traces?.speed) && payload.traces.speed.length > 0;
  const hasStints = Array.isArray(payload.stints?.basic) && payload.stints.basic.length > 0;
  return hasCoreSummary || hasTraces || hasStints;
}

function normalizeTelemetryDriverLabel(name = "") {
  const clean = String(name || "").trim();
  if (!clean) return "";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return clean;
  return `${parts.slice(0, -1).join(" ")} ${parts[parts.length - 1].toUpperCase()}`;
}

function formatTelemetrySeconds(value) {
  if (!Number.isFinite(value)) return "N/D";
  return `${value.toFixed(3)} s`;
}

function formatTelemetrySpeed(value) {
  if (!Number.isFinite(value)) return "N/D";
  return `${Math.round(value)} km/h`;
}

function formatTelemetryTemp(value) {
  if (!Number.isFinite(value)) return "N/D";
  return `${value.toFixed(1)} °C`;
}

function formatTelemetryCount(value) {
  if (!Number.isFinite(value)) return "N/D";
  return `${Math.round(value)}`;
}

function formatTelemetryDelta(value, kind = "seconds") {
  if (!Number.isFinite(value)) return "N/D";
  const sign = value > 0 ? "+" : "";
  if (kind === "speed") return `${sign}${value.toFixed(1)} km/h`;
  return `${sign}${value.toFixed(3)} s`;
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

function telemetryContextKey() {
  const t = engineerState.telemetry;
  return `${t.gp}:${t.sessionType}:${t.driver}`;
}

function telemetryPayloadKey() {
  const t = engineerState.telemetry;
  return `${t.gp}:${t.sessionKey}:${t.driver}`;
}

function telemetryErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("No hay telemetría histórica")) return "No hay telemetría histórica disponible para este piloto en esta sesión.";
  if (message.includes("Piloto no disponible")) return "El piloto seleccionado no aparece con datos válidos en esta sesión.";
  if (message.includes("Sesión no disponible")) return "La sesión seleccionada no está disponible en este GP 2026.";
  if (message.includes("fetch")) return "No se pudo conectar con la capa de telemetría.";
  return "No fue posible construir la telemetría real del piloto con las fuentes actuales.";
}

async function loadTelemetryContext() {
  const key = telemetryContextKey();
  if (engineerCache.context.has(key)) return engineerCache.context.get(key);
  const payload = await fetchEngineerApi("context", {
    year: TELEMETRY_SEASON_YEAR,
    meeting_key: engineerState.telemetry.gp,
    session_type: engineerState.telemetry.sessionType,
    driver: engineerState.telemetry.driver
  });
  engineerCache.context.set(key, payload);
  return payload;
}

function renderTelemetrySelector(options, current) {
  return options.map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(current) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function renderTelemetryTrace(title, values = [], kind = "speed") {
  if (!Array.isArray(values) || !values.length) return `<div class="empty-line">${escapeHtml(title)} no disponible.</div>`;
  const maxValue = Math.max(...values.map(item => Number.isFinite(item) ? item : 0), 1);
  const points = values.slice(0, 40).map((item, index) => {
    const x = (index / 39) * 100;
    const y = 100 - ((Number.isFinite(item) ? item : 0) / maxValue) * 100;
    return `${x.toFixed(2)},${Math.min(100, Math.max(0, y)).toFixed(2)}`;
  });
  const latest = values[values.length - 1];
  const latestLabel = kind === "speed"
    ? formatTelemetrySpeed(latest)
    : kind === "percent"
      ? `${Math.round(latest || 0)} %`
      : `${Math.round(latest || 0)}`;
  return `
    <div class="telemetry-wave">
      <div class="telemetry-wave-head">
        <span>${escapeHtml(title)}</span>
        <strong>${escapeHtml(latestLabel)}</strong>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="${escapeHtml(title)}">
        <polyline points="${points.join(" ")}"></polyline>
      </svg>
    </div>
  `;
}

function renderStints(items = []) {
  if (!items.length) return `<div class="empty-line">Sin datos de stint para este piloto en esta sesión.</div>`;
  return items.map(item => `
    <div class="telemetry-stint-line">
      <span>Stint ${escapeHtml(String(item.number || "-"))} · ${escapeHtml(item.compound || "N/D")}</span>
      <span>${Number.isFinite(item.laps) ? `${item.laps} vueltas` : "N/D"}</span>
    </div>
  `).join("");
}

function renderStintEvolution(items = []) {
  if (!items.length) return `<div class="empty-line">No hay evolución de stint calculable.</div>`;
  return items.map(item => `
    <div class="telemetry-evolution-line">
      <div><strong>Stint ${escapeHtml(String(item.stint || "-"))}</strong><span>${escapeHtml(item.compound || "N/D")}</span></div>
      <div><span>Ritmo ${escapeHtml(formatTelemetrySeconds(item.averagePace))}</span><span>Δ ref ${escapeHtml(formatTelemetryDelta(item.refDelta))}</span></div>
    </div>
  `).join("");
}

function renderTelemetryDashboard(payload) {
  const summary = payload.summary || {};
  const weather = payload.weather || {};
  const availability = payload.availability || {};
  const evolution = payload.session_evolution || [];
  const primaryStatus = payload.source?.fallback_chain?.find(item => item.provider === payload.source?.primary);
  const evolutionRows = evolution.length
    ? evolution.map(item => `<div class="telemetry-evolution-line"><div><strong>${escapeHtml(item.session_label || item.session_type || "Sesión")}</strong></div><div><span>${escapeHtml(formatTelemetrySeconds(item.averagePace))}</span><span>Δ ref ${escapeHtml(formatTelemetryDelta(item.deltaToReference))}</span></div></div>`).join("")
    : `<div class="empty-line">Sin evolución inter-sesión para este piloto.</div>`;

  return `
    <section class="card engineer-card telemetry-ops-hero">
      <div class="telemetry-wall-hero-top">
        <div class="telemetry-callout">
          <div class="card-title">${escapeHtml(payload.labels?.gp || "2026")}</div>
          <div class="card-sub">${escapeHtml(payload.labels?.session || "Sesión")} · Piloto: ${escapeHtml(payload.labels?.driver || "N/D")}</div>
        </div>
      </div>
      <div class="telemetry-wall-hero-grid telemetry-wall-grid-compact">
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Vuelta referencia</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(isTelemetryMetricReady(summary.referenceLap, "lap") ? formatTelemetrySeconds(summary.referenceLap) : "Cargando…")}</span></div></div>
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Ritmo medio</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(isTelemetryMetricReady(summary.averagePace, "pace") ? formatTelemetrySeconds(summary.averagePace) : "Cargando…")}</span></div></div>
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Velocidad punta</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(isTelemetryMetricReady(summary.topSpeed, "speed") ? formatTelemetrySpeed(summary.topSpeed) : "Cargando…")}</span></div></div>
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Speed trap</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(isTelemetryMetricReady(summary.speedTrap, "speed") ? formatTelemetrySpeed(summary.speedTrap) : "Cargando…")}</span></div></div>
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Sector 1</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(isTelemetryMetricReady(summary.sector1, "sector") ? formatTelemetrySeconds(summary.sector1) : "Cargando…")}</span></div></div>
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Sector 2</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(isTelemetryMetricReady(summary.sector2, "sector") ? formatTelemetrySeconds(summary.sector2) : "Cargando…")}</span></div></div>
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Sector 3</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(isTelemetryMetricReady(summary.sector3, "sector") ? formatTelemetrySeconds(summary.sector3) : "Cargando…")}</span></div></div>
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Δ ritmo vs referencia</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(formatTelemetryDelta(summary.deltaToReference))}</span></div></div>
        <div class="telemetry-wall-row"><div class="telemetry-wall-row-head"><strong>Degradación</strong></div><div class="telemetry-wall-row-values"><span>${escapeHtml(formatTelemetryDelta(summary.degradation))}</span></div></div>
      </div>
      <div class="telemetry-callout" style="margin-top:10px;">
        <div class="card-sub">Provider activo: <strong>${escapeHtml(payload.source?.primary || "openf1")}</strong> · Estado: ${escapeHtml(primaryStatus?.reason || "OK")}</div>
      </div>
    </section>

    <section class="card engineer-card telemetry-context-grid telemetry-context-grid-v2">
      <div><span>Pista</span><strong>${escapeHtml(formatTelemetryTemp(weather.avgTrackTemp))}</strong></div>
      <div><span>Aire</span><strong>${escapeHtml(formatTelemetryTemp(weather.avgAirTemp))}</strong></div>
      <div><span>Weather</span><strong>${escapeHtml(weather.weatherState || "N/D")}</strong></div>
      <div><span>Race control</span><strong>${escapeHtml(formatTelemetryCount(weather.raceControlMessages))}</strong></div>
      <div><span>Pit</span><strong>${escapeHtml(formatTelemetryCount(weather.pitStops))}</strong></div>
      <div><span>Overtakes</span><strong>${escapeHtml(formatTelemetryCount(weather.overtakes))}</strong></div>
      <div><span>Radio</span><strong>${escapeHtml(formatTelemetryCount(weather.teamRadios))}</strong></div>
      <div><span>Fuentes</span><strong>${escapeHtml((payload.source?.active_sources || ["openf1"]).join(" + "))}</strong></div>
    </section>

    <section class="telemetry-main-grid telemetry-main-grid-v2 telemetry-wall-focus">
      <div class="card engineer-card telemetry-graph-panel telemetry-primary-chart">
        <div class="card-title">Panel central de trazas</div>
        ${renderTelemetryTrace("Speed trace", payload.traces?.speed || [], "speed")}
        ${renderTelemetryTrace("Track position", payload.traces?.trackPosition || [], "value")}
      </div>
      <div class="card engineer-card telemetry-graph-panel">
        <div class="card-title">Entrada de piloto</div>
        ${renderTelemetryTrace("Throttle", payload.traces?.throttle || [], "percent")}
        ${renderTelemetryTrace("Brake", payload.traces?.brake || [], "percent")}
        <div class="telemetry-mini-kpis">
          <div><span>Gear</span><strong>${escapeHtml(availability.speedTrace === "available" ? "OK" : "N/D")}</strong></div>
          <div><span>RPM</span><strong>${escapeHtml(payload.traces?.rpm?.length ? "OK" : "N/D")}</strong></div>
          <div><span>Stints</span><strong>${escapeHtml(availability.stints === "available" ? "OK" : "N/D")}</strong></div>
          <div><span>Evolución</span><strong>${escapeHtml(availability.evolution === "available" ? "OK" : "N/D")}</strong></div>
        </div>
      </div>
    </section>

    <section class="telemetry-main-grid">
      <div class="card engineer-card">
        <div class="card-title">Stint básico</div>
        <div class="telemetry-stint-cols"><div>${renderStints(payload.stints?.basic || [])}</div></div>
      </div>
      <div class="card engineer-card">
        <div class="card-title">Evolución de stint</div>
        <div class="telemetry-evolution-wall">${renderStintEvolution(payload.stints?.evolution || [])}</div>
      </div>
      <div class="card engineer-card">
        <div class="card-title">Evolución entre sesiones</div>
        <div class="telemetry-evolution-wall">${evolutionRows}</div>
      </div>
    </section>
  `;
}

function renderTelemetryPanelBody() {
  const telemetry = engineerState.telemetry;
  if (telemetry.status === "loading") return `<div class="card engineer-card"><div class="empty-line">Cargando telemetría real 2026…</div></div>`;
  if (telemetry.status === "error") return `<div class="card engineer-card"><div class="card-title">Telemetría no disponible</div><div class="empty-line">${escapeHtml(telemetry.userMessage || "Sin telemetría")}</div><div class="card-sub">Prueba otra sesión del mismo GP.</div></div>`;
  if (telemetry.status === "empty") return `<div class="card engineer-card"><div class="card-title">Sin datos</div><div class="empty-line">${escapeHtml(telemetry.userMessage || "No hay datos para esta combinación")}</div></div>`;
  if (!telemetry.payload) return `<div class="card engineer-card"><div class="empty-line">Selecciona GP, sesión y piloto para cargar telemetría real.</div></div>`;
  return renderTelemetryDashboard(telemetry.payload);
}

function renderTelemetryPanel() {
  const telemetry = engineerState.telemetry;
  const context = telemetry.context || { meetings: [], sessions: [], drivers: [] };
  const disableSelectors = telemetry.status === "loading" && !telemetry.context;
  const gpOptions = (context.meetings || []).map(item => ({ value: String(item.meeting_key), label: item.gp_label }));
  const sessionOptions = (context.sessions || []).map(item => ({ value: item.type_key, label: item.type_label }));
  const driverOptions = (context.drivers || []).map(item => ({
    value: String(item.id || ""),
    label: item.team ? `${normalizeTelemetryDriverLabel(item.name)} · ${item.team}` : normalizeTelemetryDriverLabel(item.name)
  }));

  return `
    <section class="card engineer-card telemetry-control-panel">
      <div class="card-title">Telemetría · 2026</div>
      <div class="telemetry-control-strip">
        <label><span>GP</span><select class="select-input" onchange="setEngineerTelemetryGp(this.value)" ${disableSelectors ? "disabled" : ""}>${renderTelemetrySelector(gpOptions, telemetry.gp)}</select></label>
        <label><span>Sesión</span><select class="select-input" onchange="setEngineerTelemetrySessionType(this.value)" ${disableSelectors ? "disabled" : ""}>${renderTelemetrySelector(sessionOptions, telemetry.sessionType)}</select></label>
        <label><span>Piloto</span><select class="select-input" onchange="setEngineerTelemetryDriver(this.value)" ${disableSelectors ? "disabled" : ""}>${renderTelemetrySelector(driverOptions, telemetry.driver)}</select></label>
      </div>
    </section>
    ${renderTelemetryPanelBody()}
  `;
}

async function loadTelemetryData() {
  const telemetry = engineerState.telemetry;
  const requestId = ++telemetryRequestId;
  telemetry.status = "loading";
  telemetry.error = "";
  telemetry.userMessage = "";
  renderEngineerScreen();

  try {
    const context = await loadTelemetryContext();
    if (requestId !== telemetryRequestId) return;

    telemetry.context = context;
    telemetry.gp = context.selections?.meeting_key || "";
    telemetry.sessionType = context.selections?.session_type || "";
    telemetry.sessionKey = context.selections?.session_key || "";
    telemetry.driver = context.selections?.driver || "";

    if (!telemetry.sessionKey || !telemetry.driver) {
      telemetry.status = "empty";
      telemetry.payload = null;
      telemetry.userMessage = "No hay pilotos válidos con datos para esta sesión 2026.";
      renderEngineerScreen();
      return;
    }

    const payloadKey = telemetryPayloadKey();
    if (engineerCache.telemetry.has(payloadKey)) {
      telemetry.payload = engineerCache.telemetry.get(payloadKey);
      telemetry.status = "ready";
      renderEngineerScreen();
      return;
    }

    const payload = await fetchEngineerApi("telemetry", {
      year: TELEMETRY_SEASON_YEAR,
      meeting_key: telemetry.gp,
      session_key: telemetry.sessionKey,
      driver_number: telemetry.driver
    });

    if (requestId !== telemetryRequestId) return;

    if (!hasTelemetryPayloadData(payload)) {
      telemetry.status = "empty";
      telemetry.payload = null;
      telemetry.userMessage = "La fuente actual no ofrece suficientes datos para esta combinación.";
      renderEngineerScreen();
      return;
    }

    engineerCache.telemetry.set(payloadKey, payload);
    telemetry.payload = payload;
    telemetry.status = "ready";
    renderEngineerScreen();
  } catch (error) {
    if (requestId !== telemetryRequestId) return;
    telemetry.status = "error";
    telemetry.error = String(error?.message || "");
    telemetry.userMessage = telemetryErrorMessage(error);
    telemetry.payload = null;
    renderEngineerScreen();
  }
}

function setEngineerSubmode(mode) {
  engineerState.submode = mode === "telemetry" ? "telemetry" : "prediction";
  renderEngineerScreen();
  if (engineerState.submode === "telemetry") loadTelemetryData();
}

function setEngineerTelemetryGp(value) {
  engineerState.telemetry.gp = value || "";
  engineerState.telemetry.context = null;
  engineerState.telemetry.sessionType = "";
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.driver = "";
  engineerState.telemetry.payload = null;
  loadTelemetryData();
}

function setEngineerTelemetrySessionType(value) {
  engineerState.telemetry.sessionType = value || "";
  engineerState.telemetry.context = null;
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.driver = "";
  engineerState.telemetry.payload = null;
  loadTelemetryData();
}

function setEngineerTelemetryDriver(value) {
  engineerState.telemetry.driver = value || "";
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.payload = null;
  loadTelemetryData();
}

function renderEngineerScreen() {
  const selectedRace = getSelectedRace();
  const favorite = getFavorite();
  const needFreshPredict = shouldAutoGeneratePredict(favorite, selectedRace);
  const activePredictData = !needFreshPredict ? state.lastPredictData : null;
  const expert = isExpertMode();

  contentEl().innerHTML = `
    <div class="card engineer-card engineer-top-card">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">Ingeniero</div>
          <div class="card-sub">Predicción + telemetría técnica integrada</div>
        </div>
      </div>
      <div class="engineer-submode-switch" role="tablist" aria-label="Submodo ingeniero" style="margin-top:10px;">
        <button class="toggle-btn ${engineerState.submode === "prediction" ? "active" : ""}" onclick="setEngineerSubmode('prediction')">Predicción</button>
        <button class="toggle-btn ${engineerState.submode === "telemetry" ? "active" : ""}" onclick="setEngineerSubmode('telemetry')">Telemetría</button>
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

  engineerState.submode = "prediction";
  renderEngineerScreen();
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

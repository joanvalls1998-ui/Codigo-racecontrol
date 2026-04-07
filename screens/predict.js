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
    phase: "idle",
    error: "",
    userMessage: "",
    gp: "",
    sessionType: "",
    sessionKey: "",
    driver: "",
    context: null,
    payload: null,
    perf: null,
    lapSelection: {
      mode: "reference",
      manualLap: ""
    }
  }
};

const engineerCache = {
  context: new Map()
};

let telemetryRequestId = 0;
const TELEMETRY_CACHE_TTL_MS = 1000 * 60 * 10;
const telemetryTraceInspector = {
  active: false,
  index: null,
  pointCount: 0
};
const TELEMETRY_PRELOAD_DEBUG = (() => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem("rc_debug_telemetry_preload") === "1";
  } catch (_error) {
    return false;
  }
})();
const TELEMETRY_LAP_MODES = Object.freeze(["reference", "latest", "manual"]);

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

function telemetryPreloadLog(event, details = {}) {
  if (!TELEMETRY_PRELOAD_DEBUG) return;
  console.info(`[telemetry.preload] ${event}`, details);
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
  map.set(key, { value, expiresAt: Date.now() + Math.max(1000, ttlMs) });
  return value;
}

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
  if (value >= 60) {
    const minutes = Math.floor(value / 60);
    const seconds = value - (minutes * 60);
    return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
  }
  return value.toFixed(3);
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
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (kind === "speed") return `${sign}${value.toFixed(1)} km/h`;
  return `${sign}${absolute.toFixed(3)}`;
}

function formatTelemetryLapLabel(lap = {}) {
  const lapNumber = Number.isFinite(lap?.lapNumber) ? `Lap ${Math.round(lap.lapNumber)}` : "Lap N/D";
  const lapTime = Number.isFinite(lap?.lapTime) ? formatTelemetrySeconds(lap.lapTime) : null;
  const tags = [];
  if (lap?.status === "pit") tags.push("PIT");
  if (lap?.status === "invalid") tags.push("Invalid");
  if (lap?.status === "no_trace") tags.push("Sin traza");
  if (lap?.isBest) tags.push("PB");
  const parts = [lapNumber];
  if (lapTime) parts.push(lapTime);
  if (tags.length) parts.push(tags.join(" · "));
  return parts.join(" · ");
}

function resolveTelemetryActiveLap(payload = {}, selection = {}) {
  const lapContext = payload?.lap_context || {};
  const catalogRaw = Array.isArray(lapContext.catalog) ? lapContext.catalog : [];
  const tracesByLap = lapContext.traces_by_lap || {};
  if (!catalogRaw.length) return null;
  const selectionConfig = lapContext.selection || {};
  const bestLapNumber = Number.isFinite(selectionConfig.referenceLapNumber) ? selectionConfig.referenceLapNumber : null;
  const latestLapNumber = Number.isFinite(selectionConfig.latestLapNumber) ? selectionConfig.latestLapNumber : null;
  const withMeta = catalogRaw.map(item => ({ ...item, isBest: Number.isFinite(bestLapNumber) && item.lapNumber === bestLapNumber }));
  const usable = withMeta.filter(item => item.hasTelemetry);
  if (!usable.length) return null;
  const getByNumber = value => usable.find(item => String(item.lapNumber) === String(value)) || null;
  const mode = TELEMETRY_LAP_MODES.includes(selection?.mode) ? selection.mode : "reference";
  let selectedLap = null;
  if (mode === "manual") selectedLap = getByNumber(selection?.manualLap);
  if (!selectedLap && mode === "latest") selectedLap = getByNumber(latestLapNumber);
  if (!selectedLap) selectedLap = getByNumber(bestLapNumber);
  if (!selectedLap) selectedLap = usable[usable.length - 1];
  if (!selectedLap) return null;
  return {
    mode: mode === "manual" && selectedLap ? "manual" : (mode === "latest" ? "latest" : "reference"),
    bestLapNumber,
    latestLapNumber,
    selectedLap,
    availableLaps: usable,
    traces: tracesByLap[String(selectedLap.lapNumber)] || null
  };
}

async function fetchEngineerApi(endpoint, params = {}, options = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const response = await fetch(`/api/engineer/${endpoint}?${query.toString()}`, { cache: options.cacheMode || "no-store" });
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
  return `${TELEMETRY_SEASON_YEAR}:${t.gp || "auto"}:${t.sessionType || "auto"}:${t.driver || "auto"}`;
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
  const cached = cacheGet(engineerCache.context, key);
  if (cached) return cached;
  const t = engineerState.telemetry;
  const payload = await fetchEngineerApi("context", {
    year: TELEMETRY_SEASON_YEAR,
    meeting_key: t.gp,
    session_type: t.sessionType,
    driver: t.driver
  });
  return cacheSet(engineerCache.context, key, payload);
}

function renderTelemetrySelector(options, current) {
  return options.map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(current) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function renderTelemetryTrace(title, values = [], kind = "speed") {
  if (!Array.isArray(values) || !values.length) return `<div class="empty-line">${escapeHtml(title)} no disponible.</div>`;
  const cleanValues = values.filter(Number.isFinite);
  if (!cleanValues.length) return `<div class="empty-line">${escapeHtml(title)} no disponible.</div>`;
  const sample = cleanValues.slice(0, 42);
  const minValue = Math.min(...sample);
  const maxValue = Math.max(...sample);
  const range = Math.max(maxValue - minValue, 1);
  const points = sample.map((item, index) => {
    const denominator = Math.max(sample.length - 1, 1);
    const x = (index / denominator) * 100;
    const normalized = (item - minValue) / range;
    const y = 100 - normalized * 100;
    return `${x.toFixed(2)},${Math.min(100, Math.max(0, y)).toFixed(2)}`;
  });
  const latest = cleanValues[cleanValues.length - 1];
  const latestLabel = kind === "speed"
    ? formatTelemetrySpeed(latest)
    : kind === "percent"
      ? `${Math.round(latest || 0)} %`
      : kind === "pace"
        ? formatTelemetrySeconds(latest)
        : `${Math.round(latest || 0)}`;
  return `
    <div class="telemetry-wave ${kind === "speed" ? "kind-speed" : ""} ${kind === "percent" ? "kind-percent" : ""} ${kind === "brake" ? "kind-brake" : ""}">
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

function clampTelemetryPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function traceValueAt(values = [], index = 0, pointCount = 0) {
  if (!Array.isArray(values) || !values.length || !Number.isFinite(index) || pointCount < 1) return null;
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  if (clean.length === 1 || pointCount <= 1) return clean[0];
  const ratio = Math.max(0, Math.min(1, index / (pointCount - 1)));
  const sampleIndex = Math.round(ratio * (clean.length - 1));
  return clean[Math.max(0, Math.min(clean.length - 1, sampleIndex))];
}

function buildTracePoints(values = [], pointCount = 0, minValue = 0, maxValue = 1, bandTop = 0, bandHeight = 100) {
  if (!Array.isArray(values) || !values.length || pointCount < 1) return "";
  const points = [];
  for (let idx = 0; idx < pointCount; idx += 1) {
    const value = traceValueAt(values, idx, pointCount);
    if (!Number.isFinite(value)) continue;
    const denominator = Math.max(pointCount - 1, 1);
    const x = (idx / denominator) * 100;
    const range = Math.max(maxValue - minValue, 1);
    const normalized = (value - minValue) / range;
    const y = bandTop + (bandHeight - (Math.max(0, Math.min(1, normalized)) * bandHeight));
    points.push(`${x.toFixed(2)},${Math.max(0, Math.min(100, y)).toFixed(2)}`);
  }
  return points.join(" ");
}

function buildTelemetryTraceInspection(payload = {}, activeTraces = null) {
  const traces = activeTraces || payload?.traces || {};
  const speed = Array.isArray(traces.speed) ? traces.speed.filter(Number.isFinite) : [];
  const throttle = Array.isArray(traces.throttle) ? traces.throttle.filter(Number.isFinite).map(item => clampTelemetryPercent(item)).filter(Number.isFinite) : [];
  const brake = Array.isArray(traces.brake) ? traces.brake.filter(Number.isFinite).map(item => clampTelemetryPercent(item)).filter(Number.isFinite) : [];
  const gear = Array.isArray(traces.gear) ? traces.gear.filter(Number.isFinite) : [];
  const rpm = Array.isArray(traces.rpm) ? traces.rpm.filter(Number.isFinite) : [];
  const drs = Array.isArray(traces.drs) ? traces.drs.filter(Number.isFinite) : [];
  const distance = Array.isArray(traces.distance) ? traces.distance.filter(Number.isFinite) : [];
  const relativeDistance = Array.isArray(traces.relativeDistance) ? traces.relativeDistance.filter(Number.isFinite) : [];

  const pointCount = Math.max(speed.length, throttle.length, brake.length, gear.length, rpm.length, drs.length, distance.length, relativeDistance.length, 0);
  if (!pointCount) return null;
  telemetryTraceInspector.pointCount = pointCount;
  const selectedIndex = Number.isFinite(telemetryTraceInspector.index)
    ? Math.max(0, Math.min(pointCount - 1, telemetryTraceInspector.index))
    : pointCount - 1;
  const ratio = pointCount > 1 ? selectedIndex / (pointCount - 1) : 0;
  const selectedSpeed = traceValueAt(speed, selectedIndex, pointCount);
  const selectedThrottle = traceValueAt(throttle, selectedIndex, pointCount);
  const selectedBrake = traceValueAt(brake, selectedIndex, pointCount);
  const selectedGear = traceValueAt(gear, selectedIndex, pointCount);
  const selectedRpm = traceValueAt(rpm, selectedIndex, pointCount);
  const selectedDrs = traceValueAt(drs, selectedIndex, pointCount);
  const selectedDistance = traceValueAt(distance, selectedIndex, pointCount);
  const selectedRelativeDistance = traceValueAt(relativeDistance, selectedIndex, pointCount);
  const sectionRatio = Number.isFinite(selectedRelativeDistance) ? Math.max(0, Math.min(1, selectedRelativeDistance)) : ratio;
  const sector = sectionRatio < (1 / 3) ? "S1" : sectionRatio < (2 / 3) ? "S2" : "S3";

  return {
    pointCount,
    selectedIndex,
    ratio,
    sector,
    speed,
    throttle,
    brake,
    selectedValues: {
      speed: selectedSpeed,
      throttle: selectedThrottle,
      brake: selectedBrake,
      gear: selectedGear,
      rpm: selectedRpm,
      drs: Number.isFinite(selectedDrs) ? selectedDrs : null,
      distance: selectedDistance,
      relativeDistance: selectedRelativeDistance
    }
  };
}

function renderTelemetryTraceInspector(payload = {}) {
  const telemetry = engineerState.telemetry;
  const activeLap = resolveTelemetryActiveLap(payload, telemetry.lapSelection || {});
  const inspection = buildTelemetryTraceInspection(payload, activeLap?.traces || null);
  if (!inspection) return `<div class="empty-line">Trazas no disponibles para inspección.</div>`;
  const x = (inspection.ratio * 100).toFixed(2);
  const selected = inspection.selectedValues;
  const speedMax = Math.max(...inspection.speed, 1);
  const throttleMax = 100;
  const brakeMax = 100;
  const distanceLabel = Number.isFinite(selected.distance)
    ? `${Math.round(selected.distance)} m`
    : Number.isFinite(selected.relativeDistance)
      ? `${Math.round(selected.relativeDistance * 100)}% vuelta`
      : `${Math.round(inspection.ratio * 100)}% vuelta`;
  const drsLabel = Number.isFinite(selected.drs) ? (selected.drs > 0 ? "ON" : "OFF") : "N/D";
  const compactReadout = [
    { label: "Speed", value: formatTelemetrySpeed(selected.speed) },
    { label: "Throttle", value: Number.isFinite(selected.throttle) ? `${Math.round(selected.throttle)}%` : "N/D" },
    { label: "Brake", value: Number.isFinite(selected.brake) ? `${Math.round(selected.brake)}%` : "N/D" },
    { label: "Gear", value: Number.isFinite(selected.gear) ? `${Math.round(selected.gear)}` : "N/D" },
    { label: "RPM", value: Number.isFinite(selected.rpm) ? `${Math.round(selected.rpm)}` : "N/D" },
    { label: "DRS", value: Number.isFinite(selected.drs) ? drsLabel : "N/D" }
  ];

  return `
    <div class="telemetry-trace-inspector"
      data-points="${inspection.pointCount}"
      onpointerdown="engineerTelemetryTracePointerDown(event)"
      onpointermove="engineerTelemetryTracePointerMove(event)"
      onpointerup="engineerTelemetryTracePointerEnd(event)"
      onpointercancel="engineerTelemetryTracePointerEnd(event)"
      onpointerleave="engineerTelemetryTracePointerLeave(event)">
      <div class="telemetry-trace-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Trazas sincronizadas">
          <line class="trace-grid-h" x1="0" y1="25" x2="100" y2="25"></line>
          <line class="trace-grid-h" x1="0" y1="50" x2="100" y2="50"></line>
          <line class="trace-grid-h" x1="0" y1="75" x2="100" y2="75"></line>
          <polyline class="trace-line trace-line-speed" points="${buildTracePoints(inspection.speed, inspection.pointCount, 0, speedMax, 0, 31)}"></polyline>
          <polyline class="trace-line trace-line-throttle" points="${buildTracePoints(inspection.throttle, inspection.pointCount, 0, throttleMax, 34, 31)}"></polyline>
          <polyline class="trace-line trace-line-brake" points="${buildTracePoints(inspection.brake, inspection.pointCount, 0, brakeMax, 68, 31)}"></polyline>
          <line class="trace-cursor" x1="${x}" y1="0" x2="${x}" y2="100"></line>
        </svg>
        <div class="telemetry-trace-axis">
          <span>Speed</span><span>Throttle</span><span>Brake</span>
        </div>
      </div>
      <div class="telemetry-trace-tooltip">
        <div class="telemetry-trace-tooltip-row telemetry-trace-tooltip-row--main">
          ${compactReadout.map(item => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}
        </div>
        <div class="telemetry-trace-tooltip-row telemetry-trace-tooltip-row--meta">
          <div><span>Distancia</span><strong>${escapeHtml(distanceLabel)}</strong></div>
          <div><span>Sector</span><strong>${escapeHtml(inspection.sector)}</strong></div>
        </div>
      </div>
    </div>
  `;
}

function buildTelemetryUsefulStints(stintBasic, lapCatalog) {
  const catalog = Array.isArray(lapCatalog) ? lapCatalog : [];
  const MIN_VALID_LAPS = 4;
  const MIN_COMPLETE_RATIO = 0.7;
  return (Array.isArray(stintBasic) ? stintBasic : [])
    .map((stint, idx) => {
      const lapStart = Number.isFinite(stint?.lapStart) ? stint.lapStart : null;
      const lapEnd = Number.isFinite(stint?.lapEnd) ? stint.lapEnd : null;
      const expectedLaps = Number.isFinite(lapStart) && Number.isFinite(lapEnd) && lapEnd >= lapStart
        ? (lapEnd - lapStart + 1)
        : null;
      const lapsInRange = Number.isFinite(lapStart) && Number.isFinite(lapEnd)
        ? catalog.filter(lap => Number.isFinite(lap?.lapNumber) && lap.lapNumber >= lapStart && lap.lapNumber <= lapEnd)
        : [];
      const validLaps = lapsInRange
        .filter(lap => Number.isFinite(lap?.lapTime) && lap?.hasUsefulTiming !== false)
        .map(lap => lap.lapTime);
      const completionRatio = Number.isFinite(expectedLaps) && expectedLaps > 0
        ? (validLaps.length / expectedLaps)
        : 0;
      const startPace = validLaps.length >= 2 ? average(validLaps.slice(0, 2)) : (validLaps[0] ?? null);
      const latestPace = validLaps.length >= 2 ? average(validLaps.slice(-2)) : (validLaps[validLaps.length - 1] ?? null);
      const averagePace = validLaps.length ? average(validLaps) : null;
      const bestPace = validLaps.length ? Math.min(...validLaps) : null;
      const worstPace = validLaps.length ? Math.max(...validLaps) : null;
      const degradation = Number.isFinite(startPace) && Number.isFinite(latestPace) ? latestPace - startPace : null;
      const consistency = Number.isFinite(bestPace) && Number.isFinite(worstPace) ? worstPace - bestPace : null;
      const isUseful = validLaps.length >= MIN_VALID_LAPS
        && completionRatio >= MIN_COMPLETE_RATIO
        && Number.isFinite(startPace)
        && Number.isFinite(latestPace)
        && Number.isFinite(degradation);
      return {
        key: `${stint?.number || idx + 1}-${idx}`,
        number: Number.isFinite(stint?.number) ? stint.number : idx + 1,
        compound: stint?.compound || "N/D",
        laps: validLaps.length,
        averagePace,
        startPace,
        latestPace,
        degradation,
        consistency,
        isUseful
      };
    })
    .filter(stint => stint.isUseful);
}

function renderTelemetryStintComparativeBlock(usefulStints) {
  if (!Array.isArray(usefulStints) || usefulStints.length < 2) return "";
  const fastestAvg = Math.min(...usefulStints.map(stint => stint.averagePace).filter(Number.isFinite));
  const maxDeg = Math.max(...usefulStints.map(stint => Math.abs(stint.degradation)).filter(Number.isFinite), 0.001);
  const summaryCards = usefulStints.map(stint => `
    <article class="telemetry-stint-summary-card">
      <div class="telemetry-stint-summary-head">
        <strong>S${stint.number}</strong>
        <span>${escapeHtml(stint.compound)} · ${stint.laps} laps</span>
      </div>
      <div class="telemetry-stint-summary-metrics">
        <div><span>Avg</span><strong>${escapeHtml(formatTelemetrySeconds(stint.averagePace))}</strong></div>
        <div><span>Deg</span><strong>${escapeHtml(formatTelemetryDelta(stint.degradation))}</strong></div>
      </div>
    </article>
  `).join("");
  const bars = usefulStints.map(stint => {
    const relative = Number.isFinite(stint.averagePace) && Number.isFinite(fastestAvg)
      ? Math.max(0, Math.min(1, (stint.averagePace - fastestAvg) / 1.8))
      : 0.5;
    const width = 30 + (relative * 70);
    const slope = Number.isFinite(stint.degradation)
      ? Math.max(-1, Math.min(1, stint.degradation / maxDeg))
      : 0;
    return `
      <div class="telemetry-stint-compare-row">
        <div class="telemetry-stint-compare-tag">
          <strong>S${stint.number}</strong>
          <span>${escapeHtml(stint.compound)}</span>
        </div>
        <div class="telemetry-stint-compare-lane">
          <div class="telemetry-stint-compare-bar" style="width:${width.toFixed(1)}%"></div>
          <div class="telemetry-stint-compare-trend ${slope > 0.2 ? "down" : slope < -0.2 ? "up" : "stable"}">
            <span>Start ${escapeHtml(formatTelemetrySeconds(stint.startPace))}</span>
            <span>End ${escapeHtml(formatTelemetrySeconds(stint.latestPace))}</span>
          </div>
        </div>
        <div class="telemetry-stint-compare-extra">
          <span>Cons ${escapeHtml(formatTelemetryDelta(stint.consistency))}</span>
          <strong>${escapeHtml(formatTelemetryDelta(stint.degradation))}</strong>
        </div>
      </div>
    `;
  }).join("");

  return `
    <section class="card engineer-card telemetry-stint-block">
      <div class="telemetry-line-head"><strong>Stint Comparison</strong><span>${usefulStints.length} stints útiles</span></div>
      <div class="telemetry-stint-summary-grid">
        ${summaryCards}
      </div>
      <div class="telemetry-stint-compare-chart">
        ${bars}
      </div>
    </section>
  `;
}

function renderTelemetryDashboard(payload) {
  const summary = payload.summary || {};
  const weather = payload.weather || {};
  const evolution = payload.session_evolution || [];
  const lapResolution = resolveTelemetryActiveLap(payload, engineerState.telemetry.lapSelection || {});
  const activeLap = lapResolution?.selectedLap || null;
  const activeMode = lapResolution?.mode || "reference";
  const tracesPayload = lapResolution?.traces ? { ...payload, traces: lapResolution.traces } : payload;
  const tracesTitle = activeMode === "manual"
    ? `Trazas · ${formatTelemetryLapLabel(activeLap)}`
    : activeMode === "latest"
      ? `Trazas · Latest Valid Lap${activeLap?.lapTime ? ` · ${formatTelemetrySeconds(activeLap.lapTime)}` : ""}`
      : `Trazas · Best Lap${activeLap?.lapTime ? ` · ${formatTelemetrySeconds(activeLap.lapTime)}` : ""}`;
  const manualOptions = (lapResolution?.availableLaps || []).map(item => ({
    value: String(item.lapNumber),
    label: formatTelemetryLapLabel(item)
  }));
  const stintBasic = payload.stints?.basic || [];
  const stintEvolution = payload.stints?.evolution || [];
  const currentStint = stintBasic[stintBasic.length - 1] || null;
  const referenceLapNumber = Number.isFinite(payload?.lap_context?.selection?.referenceLapNumber)
    ? payload.lap_context.selection.referenceLapNumber
    : null;
  const referenceStint = Number.isFinite(referenceLapNumber)
    ? stintBasic.find(item => Number.isFinite(item?.lapStart) && Number.isFinite(item?.lapEnd) && referenceLapNumber >= item.lapStart && referenceLapNumber <= item.lapEnd)
    : null;
  const referenceMeta = Number.isFinite(referenceLapNumber)
    ? `Lap ${Math.round(referenceLapNumber)} · ${referenceStint?.compound || "N/D"}`
    : `Compuesto · ${currentStint?.compound || "N/D"}`;
  const stintLine = stintEvolution.map(item => Number.isFinite(item.averagePace) ? item.averagePace : null).filter(Number.isFinite);
  const usefulStints = buildTelemetryUsefulStints(stintBasic, payload.stints?.catalog || []);
  const stintBlock = renderTelemetryStintComparativeBlock(usefulStints);
  const sectorValues = [summary.sector1, summary.sector2, summary.sector3].filter(Number.isFinite);
  const sectorBaseline = sectorValues.length ? Math.min(...sectorValues) : null;

  const renderSectorBand = (label, value) => {
    let statusClass = "neutral";
    if (Number.isFinite(value) && Number.isFinite(sectorBaseline)) {
      if (Math.abs(value - sectorBaseline) < 0.001) statusClass = "purple";
      else if ((value - sectorBaseline) <= 0.18) statusClass = "green";
    }
    return `
      <div class="telemetry-sector-chip ${statusClass}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatTelemetrySeconds(value))}</strong>
      </div>
    `;
  };

  const evolutionValid = evolution
    .map(item => ({
      ...item,
      referenceLapValue: isTelemetryMetricReady(item.referenceLap, "lap") ? item.referenceLap : null,
      averagePaceValue: isTelemetryMetricReady(item.averagePace, "pace") ? item.averagePace : null
    }))
    .filter(item => Number.isFinite(item.referenceLapValue) || Number.isFinite(item.averagePaceValue));
  const evolutionRows = evolutionValid.length
    ? evolutionValid.map((item, idx) => {
      const pace = item.averagePaceValue;
      const prev = idx > 0 && Number.isFinite(evolutionValid[idx - 1]?.averagePaceValue) ? evolutionValid[idx - 1].averagePaceValue : null;
      const best = evolutionValid.map(row => row.averagePaceValue).filter(Number.isFinite).sort((a, b) => a - b)[0];
      let status = "stable";
      if (Number.isFinite(pace) && Number.isFinite(prev)) {
        if (pace < prev - 0.06) status = "up";
        else if (pace > prev + 0.06) status = "down";
      }
      if (Number.isFinite(pace) && Number.isFinite(best) && Math.abs(pace - best) < 0.001) status = "best";
      return `
        <div class="telemetry-timeline-node ${status}">
          <span>${escapeHtml(item.session_label || item.session_type || "SES")}</span>
          ${Number.isFinite(item.referenceLapValue) ? `<strong>${escapeHtml(formatTelemetrySeconds(item.referenceLapValue))}</strong>` : ""}
          ${Number.isFinite(item.averagePaceValue) ? `<em>${escapeHtml(formatTelemetrySeconds(item.averagePaceValue))}</em>` : ""}
          ${!Number.isFinite(item.referenceLapValue) && !Number.isFinite(item.averagePaceValue) ? "<em>N/D</em>" : ""}
        </div>
      `;
    }).join("")
    : `<div class="empty-line">${payload.__partial ? "Evolución cargando…" : "Sin evolución inter-sesión para este piloto."}</div>`;
  const heroLoading = Boolean(payload.__partial);

  return `
    <section class="card engineer-card telemetry-f1-hero">
      <div class="telemetry-f1-head">
        <div>
          <div class="card-title">${escapeHtml(payload.labels?.gp || "2026")}</div>
          <div class="card-sub">${escapeHtml(payload.labels?.session || "Sesión")} · ${escapeHtml(payload.labels?.driver || "N/D")}</div>
        </div>
        <div class="telemetry-provider-tag">${escapeHtml(payload.source?.primary || "openf1")}</div>
      </div>
      <div class="telemetry-f1-hero-grid">
        ${heroLoading
      ? `
          <div class="telemetry-hero-skeleton" aria-label="Cargando hero de telemetría">
            <div class="skeleton skeleton-line lg"></div>
            <div class="skeleton skeleton-line md"></div>
            <div class="skeleton skeleton-line sm"></div>
          </div>
        `
      : `
          <div class="telemetry-hero-core">
            <span>Vuelta referencia</span>
            <strong>${escapeHtml(isTelemetryMetricReady(summary.referenceLap, "lap") ? formatTelemetrySeconds(summary.referenceLap) : "N/D")}</strong>
            <div class="telemetry-hero-meta">${escapeHtml(referenceMeta)}</div>
          </div>
          <div class="telemetry-hero-core telemetry-hero-core--secondary">
            <span>Ritmo medio</span>
            <strong>${escapeHtml(isTelemetryMetricReady(summary.averagePace, "pace") ? formatTelemetrySeconds(summary.averagePace) : "N/D")}</strong>
            <div class="telemetry-hero-meta">Last ${stintLine.length || 0} valid laps</div>
          </div>
          <div class="telemetry-speed-pack">
            <div>
              <span>Top speed</span>
              <strong>${escapeHtml(isTelemetryMetricReady(summary.topSpeed, "speed") ? formatTelemetrySpeed(summary.topSpeed) : "N/D")}</strong>
            </div>
            <div>
              <span>Speed trap</span>
              <strong>${escapeHtml(isTelemetryMetricReady(summary.speedTrap, "speed") ? formatTelemetrySpeed(summary.speedTrap) : "N/D")}</strong>
            </div>
          </div>
        `}
      </div>
      <div class="telemetry-sector-band">
        ${renderSectorBand("S1", summary.sector1)}
        ${renderSectorBand("S2", summary.sector2)}
        ${renderSectorBand("S3", summary.sector3)}
      </div>
    </section>

    ${stintBlock}

    <section class="card engineer-card telemetry-traces-block">
      <div class="telemetry-line-head"><strong>${escapeHtml(tracesTitle)}</strong><span>Inspección sincronizada</span></div>
      ${lapResolution
        ? `<div class="telemetry-lap-mode">
            <div class="telemetry-lap-segments" role="tablist" aria-label="Selector de vuelta de trazas">
              <button class="${activeMode === "reference" ? "active" : ""}" onclick="setEngineerTelemetryLapMode('reference')">Referencia</button>
              <button class="${activeMode === "latest" ? "active" : ""}" onclick="setEngineerTelemetryLapMode('latest')">Última</button>
              <button class="${activeMode === "manual" ? "active" : ""}" onclick="setEngineerTelemetryLapMode('manual')">Manual</button>
            </div>
            ${activeMode === "manual"
      ? `<label><span>Vuelta</span><select class="select-input" onchange="setEngineerTelemetryManualLap(this.value)">${renderTelemetrySelector(manualOptions, engineerState.telemetry.lapSelection.manualLap || String(activeLap?.lapNumber || ""))}</select></label>`
      : ""}
          </div>`
        : `<div class="empty-line">No hay catálogo de vueltas con trazas.</div>`}
      ${payload.__partial
        ? `<div class="empty-line">Cargando trazas pesadas…</div>`
        : `
          ${renderTelemetryTraceInspector(tracesPayload)}
        `}
    </section>

    <section class="card engineer-card telemetry-session-bar">
      <div><span>TRACK / AIR</span><strong>${escapeHtml(formatTelemetryTemp(weather.avgTrackTemp))} / ${escapeHtml(formatTelemetryTemp(weather.avgAirTemp))}</strong></div>
      <div><span>WEATHER</span><strong>${escapeHtml(weather.weatherState || "N/D")}</strong></div>
    </section>

    <section class="card engineer-card telemetry-evolution-timeline">
      <div class="telemetry-line-head"><strong>Evolución sesiones</strong><span>Ref + Ritmo</span></div>
      <div class="telemetry-timeline-strip">
        ${evolutionRows}
      </div>
    </section>
  `;
}

function renderTelemetryPanelBody() {
  const telemetry = engineerState.telemetry;
  if (telemetry.status === "loading" && !telemetry.payload) return `<div class="card engineer-card"><div class="empty-line">Cargando telemetría real 2026…</div></div>`;
  if (telemetry.status === "error") return `<div class="card engineer-card"><div class="card-title">Telemetría no disponible</div><div class="empty-line">${escapeHtml(telemetry.userMessage || "Sin telemetría")}</div><div class="card-sub">Prueba otra sesión del mismo GP.</div></div>`;
  if (telemetry.status === "empty") return `<div class="card engineer-card"><div class="card-title">Sin datos</div><div class="empty-line">${escapeHtml(telemetry.userMessage || "No hay datos para esta combinación")}</div></div>`;
  if (!telemetry.payload) return `<div class="card engineer-card"><div class="empty-line">Selecciona GP, sesión y piloto para cargar telemetría real.</div></div>`;
  return renderTelemetryDashboard(telemetry.payload);
}

function renderTelemetryPanel() {
  const telemetry = engineerState.telemetry;
  const context = telemetry.context || { meetings: [], sessions: [], drivers: [] };
  const snapshotState = context.snapshot_state || {};
  const disableSelectors = telemetry.status === "loading" && !telemetry.context;
  const perf = telemetry.perf || null;
  const gpOptions = (context.meetings || []).map(item => ({ value: String(item.meeting_key), label: item.gp_label }));
  const sessionOptions = (context.sessions || []).map(item => ({ value: item.type_key, label: item.type_label }));
  const driverOptions = (context.drivers || []).map(item => ({
    value: String(item.id || ""),
    label: item.team ? `${normalizeTelemetryDriverLabel(item.name)} · ${item.team}` : normalizeTelemetryDriverLabel(item.name)
  }));

  return `
    <section class="card engineer-card telemetry-control-panel">
      <div class="telemetry-control-top">
        <div class="card-title">Telemetría · 2026</div>
        <div class="card-sub">Snapshots backend${snapshotState?.latest_useful?.gp_label ? ` · Último GP útil: ${escapeHtml(snapshotState.latest_useful.gp_label)}` : ""}${perf?.fullMs ? ` · ${Math.round(perf.fullMs)} ms` : ""}</div>
      </div>
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
  telemetry.phase = "context";
  telemetry.error = "";
  telemetry.userMessage = "";
  renderEngineerScreen();

  try {
    const perf = { startedAt: nowMs() };
    const contextStartedAt = nowMs();
    const context = await loadTelemetryContext();
    perf.contextMs = nowMs() - contextStartedAt;
    if (requestId !== telemetryRequestId) return;

    telemetry.context = context;
    telemetry.gp = context.selections?.meeting_key || "";
    telemetry.sessionType = context.selections?.session_type || "";
    telemetry.sessionKey = context.selections?.session_key || "";
    telemetry.driver = context.selections?.driver || "";
    telemetry.perf = perf;

    if (!telemetry.sessionKey || !telemetry.driver) {
      telemetry.status = "empty";
      telemetry.payload = null;
      telemetry.userMessage = "No hay pilotos válidos con datos para esta sesión 2026.";
      renderEngineerScreen();
      return;
    }

    const telemetryStartedAt = nowMs();
    const snapshotPayload = await fetchEngineerApi("telemetry", {
      year: TELEMETRY_SEASON_YEAR,
      meeting_key: telemetry.gp,
      session_key: telemetry.sessionKey,
      driver_number: telemetry.driver
    });
    if (requestId !== telemetryRequestId) return;
    perf.fullMs = nowMs() - telemetryStartedAt;

    if (!hasTelemetryPayloadData(snapshotPayload)) {
      telemetry.status = "empty";
      telemetry.payload = null;
      telemetry.userMessage = "La fuente actual no ofrece suficientes datos para esta combinación.";
      renderEngineerScreen();
      return;
    }

    telemetry.payload = snapshotPayload;
    telemetry.status = "ready";
    telemetry.phase = "full";
    telemetry.perf = perf;
    renderEngineerScreen();
    console.info("[telemetry.perf]", {
      gp: telemetry.gp,
      session_key: telemetry.sessionKey,
      driver: telemetry.driver,
      context_ms: Math.round(perf.contextMs || 0),
      full_ms: Math.round(perf.fullMs || 0),
      total_ms: Math.round((perf.contextMs || 0) + (perf.fullMs || 0))
    });
  } catch (error) {
    if (requestId !== telemetryRequestId) return;
    telemetry.status = "error";
    telemetry.phase = "error";
    telemetry.error = String(error?.message || "");
    telemetry.userMessage = telemetryErrorMessage(error);
    telemetry.payload = null;
    renderEngineerScreen();
  }
}

function setEngineerSubmode(mode) {
  engineerState.submode = mode === "telemetry" ? "telemetry" : "prediction";
  renderEngineerScreen();
  if (engineerState.submode === "telemetry") {
    loadTelemetryData();
  }
}

function setEngineerTelemetryGp(value) {
  engineerState.telemetry.gp = value || "";
  engineerState.telemetry.context = null;
  engineerState.telemetry.sessionType = "";
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.driver = "";
  engineerState.telemetry.payload = null;
  engineerState.telemetry.lapSelection = { mode: "reference", manualLap: "" };
  loadTelemetryData();
}

function setEngineerTelemetrySessionType(value) {
  engineerState.telemetry.sessionType = value || "";
  engineerState.telemetry.context = null;
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.driver = "";
  engineerState.telemetry.payload = null;
  engineerState.telemetry.lapSelection = { mode: "reference", manualLap: "" };
  loadTelemetryData();
}

function setEngineerTelemetryDriver(value) {
  engineerState.telemetry.driver = value || "";
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.payload = null;
  engineerState.telemetry.lapSelection = { mode: "reference", manualLap: "" };
  loadTelemetryData();
}

function setEngineerTelemetryLapMode(mode) {
  if (!TELEMETRY_LAP_MODES.includes(mode)) return;
  engineerState.telemetry.lapSelection.mode = mode;
  if (mode !== "manual") engineerState.telemetry.lapSelection.manualLap = "";
  telemetryTraceInspector.index = null;
  renderEngineerScreen();
}

function setEngineerTelemetryManualLap(value) {
  engineerState.telemetry.lapSelection.mode = "manual";
  engineerState.telemetry.lapSelection.manualLap = String(value || "");
  telemetryTraceInspector.index = null;
  renderEngineerScreen();
}

function telemetryTraceIndexFromEvent(event) {
  const target = event?.currentTarget;
  const points = Math.max(1, Number(target?.dataset?.points) || telemetryTraceInspector.pointCount || 1);
  const rect = target?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0) return 0;
  const x = Math.max(0, Math.min(rect.width, (event.clientX || 0) - rect.left));
  const ratio = rect.width ? x / rect.width : 0;
  return Math.max(0, Math.min(points - 1, Math.round(ratio * (points - 1))));
}

function engineerTelemetryTracePointerDown(event) {
  telemetryTraceInspector.active = true;
  telemetryTraceInspector.index = telemetryTraceIndexFromEvent(event);
  if (typeof event.currentTarget?.setPointerCapture === "function") {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  renderEngineerScreen();
}

function engineerTelemetryTracePointerMove(event) {
  if (event.pointerType === "mouse" && event.buttons === 0 && !telemetryTraceInspector.active) return;
  telemetryTraceInspector.index = telemetryTraceIndexFromEvent(event);
  renderEngineerScreen();
}

function engineerTelemetryTracePointerEnd(event) {
  telemetryTraceInspector.active = false;
  telemetryTraceInspector.index = null;
  if (typeof event.currentTarget?.releasePointerCapture === "function") {
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (_error) { /* noop */ }
  }
  renderEngineerScreen();
}

function engineerTelemetryTracePointerLeave(event) {
  if (telemetryTraceInspector.active) return;
  if (event.pointerType === "mouse") {
    telemetryTraceInspector.index = null;
    renderEngineerScreen();
  }
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
window.setEngineerTelemetryLapMode = setEngineerTelemetryLapMode;
window.setEngineerTelemetryManualLap = setEngineerTelemetryManualLap;
window.engineerTelemetryTracePointerDown = engineerTelemetryTracePointerDown;
window.engineerTelemetryTracePointerMove = engineerTelemetryTracePointerMove;
window.engineerTelemetryTracePointerEnd = engineerTelemetryTracePointerEnd;
window.engineerTelemetryTracePointerLeave = engineerTelemetryTracePointerLeave;

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
const TELEMETRY_SESSION_TYPES = Object.freeze([
  { key: "fp1", label: "FP1" },
  { key: "fp2", label: "FP2" },
  { key: "fp3", label: "FP3" },
  { key: "qualy", label: "Qualy" },
  { key: "race", label: "Carrera" }
]);

const engineerState = {
  submode: "prediction",
  telemetry: {
    status: "idle",
    error: "",
    userMessage: "",
    gp: "",
    sessionType: "",
    sessionKey: "",
    type: "driver",
    a: "",
    b: "",
    lastLoadedKey: "",
    initialized: false,
    technicalData: null,
    attemptedResolution: false
  }
};

const engineerCache = {
  meetings: [],
  meetingsPromise: null,
  sessionsByMeeting: new Map(),
  sessionsByGp: new Map(),
  sessionsPromiseByMeeting: new Map(),
  participantsBySession: new Map(),
  participantsPromiseBySession: new Map(),
  comparisonByKey: new Map(),
  dataBySelection: new Map()
};

let telemetryLoadRequestId = 0;

function telemetryTypeLabel(key) {
  return TELEMETRY_SESSION_TYPES.find(type => type.key === key)?.label || key;
}

function formatTelemetryTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "N/D";
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds - minutes * 60).toFixed(3).padStart(6, "0");
  return `${minutes}:${remainder}`;
}

function formatTelemetryDelta(value) {
  if (!Number.isFinite(value)) return "N/D";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(3)}s`;
}

function formatTelemetrySpeed(value) {
  if (!Number.isFinite(value)) return "N/D";
  return `${Math.round(value)} km/h`;
}

async function fetchEngineerApi(endpoint, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, value);
  });
  const response = await fetch(`/api/engineer/${endpoint}?${query.toString()}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Engineer API ${endpoint} (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function telemetryFriendlyErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("No hay participantes para esta sesión")) return "No hay participantes para esta sesión.";
  if (message.includes("No hay datos de comparación para esta combinación")) return "No hay datos de comparación para esta combinación.";
  if (message.includes("Ingeniero solo admite temporada 2026")) return "Ingeniero está limitado a temporada 2026.";
  if (message.includes("Failed to fetch")) return "No se pudo conectar con el backend técnico. Reintenta en unos segundos.";
  return "No se pudieron cargar datos técnicos. Intenta otra sesión.";
}

async function loadTelemetrySessionCatalog() {
  if (engineerCache.meetings.length) return engineerCache.meetings;
  if (engineerCache.meetingsPromise) return engineerCache.meetingsPromise;

  engineerCache.meetingsPromise = fetchEngineerApi("meetings", { year: TELEMETRY_SEASON_YEAR })
    .then(data => Array.isArray(data?.meetings) ? data.meetings : [])
    .finally(() => { engineerCache.meetingsPromise = null; });

  engineerCache.meetings = await engineerCache.meetingsPromise;
  return engineerCache.meetings;
}

function getTelemetrySessionForGp(gpKey, typeKey) {
  const sessions = engineerCache.sessionsByGp.get(String(gpKey)) || [];
  return sessions.filter(session => session.type_key === typeKey);
}

async function loadTelemetryParticipants(sessionKey) {
  if (engineerCache.participantsBySession.has(sessionKey)) {
    return engineerCache.participantsBySession.get(sessionKey);
  }
  if (engineerCache.participantsPromiseBySession.has(sessionKey)) {
    return engineerCache.participantsPromiseBySession.get(sessionKey);
  }

  const promise = fetchEngineerApi("entities", {
    year: TELEMETRY_SEASON_YEAR,
    session_key: sessionKey,
    type: "driver"
  })
    .then(data => ({
      drivers: Array.isArray(data?.drivers) ? data.drivers : [],
      teams: Array.isArray(data?.teams) ? data.teams.map(item => item.name) : []
    }))
    .finally(() => engineerCache.participantsPromiseBySession.delete(sessionKey));

  engineerCache.participantsPromiseBySession.set(sessionKey, promise);
  const payload = await promise;
  engineerCache.participantsBySession.set(sessionKey, payload);
  return payload;
}

async function buildTelemetryComparison({ sessionKey, type, a, b, participants }) {
  const cacheKey = `${engineerState.telemetry.gp}:${sessionKey}:${type}:${a}:${b}`;
  if (engineerCache.comparisonByKey.has(cacheKey)) return engineerCache.comparisonByKey.get(cacheKey);
  const payload = await fetchEngineerApi("compare", {
    year: TELEMETRY_SEASON_YEAR,
    meeting_key: engineerState.telemetry.gp,
    session_key: sessionKey,
    type,
    a,
    b
  });
  engineerCache.comparisonByKey.set(cacheKey, payload);
  return payload;
}

async function buildTelemetryEvolution({ gpKey, type, a, b, participants }) {
  const comparison = await buildTelemetryComparison({
    sessionKey: engineerState.telemetry.sessionKey,
    type,
    a,
    b,
    participants
  });
  return Array.isArray(comparison?.evolution) ? comparison.evolution : [];
}

function telemetryDelta(aValue, bValue) {
  if (!Number.isFinite(aValue) || !Number.isFinite(bValue)) return null;
  return aValue - bValue;
}

function renderTelemetryMetricTile(label, aValue, bValue, formatter) {
  if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return "";
  const delta = telemetryDelta(aValue, bValue);
  return `
    <div class="meta-tile telemetry-metric-tile">
      <div class="meta-kicker">${escapeHtml(label)}</div>
      <div class="telemetry-vs-row">
        <div><strong>A</strong> ${escapeHtml(formatter(aValue))}</div>
        <div><strong>B</strong> ${escapeHtml(formatter(bValue))}</div>
      </div>
      <div class="meta-caption">${Number.isFinite(delta) ? `Δ ${escapeHtml(formatTelemetryDelta(delta))}` : "Delta no disponible para esta combinación."}</div>
    </div>
  `;
}

function renderTelemetryDashboard(technicalData) {
  const { comparison, evolution, type } = technicalData;
  const aMetrics = comparison.a?.metrics || {};
  const bMetrics = comparison.b?.metrics || {};
  const context = comparison.context?.summary || {};

  const summaryTiles = [
    renderTelemetryMetricTile("Vuelta referencia", aMetrics.referenceLap, bMetrics.referenceLap, formatTelemetryTime),
    renderTelemetryMetricTile("Ritmo medio", aMetrics.averagePace, bMetrics.averagePace, formatTelemetryTime),
    renderTelemetryMetricTile("Velocidad punta", aMetrics.topSpeed, bMetrics.topSpeed, formatTelemetrySpeed),
    renderTelemetryMetricTile("Speed trap", aMetrics.speedTrap, bMetrics.speedTrap, formatTelemetrySpeed)
  ].filter(Boolean);

  const sectorTiles = [
    renderTelemetryMetricTile("Sector 1", aMetrics.sector1, bMetrics.sector1, formatTelemetryTime),
    renderTelemetryMetricTile("Sector 2", aMetrics.sector2, bMetrics.sector2, formatTelemetryTime),
    renderTelemetryMetricTile("Sector 3", aMetrics.sector3, bMetrics.sector3, formatTelemetryTime)
  ].filter(Boolean);

  return `
    <div class="card engineer-card telemetry-dashboard-card">
      <div class="card-title">0 · Contexto de sesión</div>
      <div class="telemetry-summary-grid" style="margin-top:10px;">
        ${renderTelemetryMetricTile("Temperatura pista", context.avgTrackTemp, context.avgTrackTemp, (v) => Number.isFinite(v) ? `${v.toFixed(1)} °C` : "N/D")}
        ${renderTelemetryMetricTile("Temperatura aire", context.avgAirTemp, context.avgAirTemp, (v) => Number.isFinite(v) ? `${v.toFixed(1)} °C` : "N/D")}
        ${renderTelemetryMetricTile("Mensajes race control", context.raceControlMessages, context.raceControlMessages, (v) => Number.isFinite(v) ? `${Math.round(v)}` : "N/D")}
        ${renderTelemetryMetricTile("Paradas en pit lane", context.pitStops, context.pitStops, (v) => Number.isFinite(v) ? `${Math.round(v)}` : "N/D")}
        ${renderTelemetryMetricTile("Overtakes registrados", context.overtakes, context.overtakes, (v) => Number.isFinite(v) ? `${Math.round(v)}` : "N/D")}
        ${renderTelemetryMetricTile("Team radio", context.teamRadios, context.teamRadios, (v) => Number.isFinite(v) ? `${Math.round(v)}` : "N/D")}
      </div>
      <div class="meta-caption" style="margin-top:10px;">Resumen derivado de endpoints gratuitos históricos de OpenF1 para 2026.</div>
    </div>

    <div class="card engineer-card telemetry-dashboard-card">
      <div class="card-title">1 · Resumen técnico</div>
      <div class="telemetry-summary-grid" style="margin-top:10px;">
        ${summaryTiles.length ? summaryTiles.join("") : `<div class="empty-line">No hay métricas de resumen disponibles para esta combinación.</div>`}
      </div>
    </div>

    <div class="card engineer-card telemetry-dashboard-card">
      <div class="card-title">2 · Sectores</div>
      <div class="telemetry-summary-grid" style="margin-top:10px;">
        ${sectorTiles.length ? sectorTiles.join("") : `<div class="empty-line">No hay sectores disponibles para esta combinación.</div>`}
      </div>
    </div>

    <div class="card engineer-card telemetry-dashboard-card">
      <div class="card-title">3 · Stint</div>
      <div class="telemetry-stint-grid" style="margin-top:10px;">
        <div class="meta-tile">
          <div class="meta-kicker">Degradación simple A/B</div>
          <div class="meta-value" style="font-size:17px;">${escapeHtml(formatTelemetryDelta(aMetrics.degradation))} / ${escapeHtml(formatTelemetryDelta(bMetrics.degradation))}</div>
          <div class="meta-caption">Calculada con la diferencia entre las 3 primeras y 3 últimas vueltas válidas.</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Ritmo por stint</div>
          <div class="meta-value" style="font-size:17px;">A ${escapeHtml(formatTelemetryTime(aMetrics.averagePace))} · B ${escapeHtml(formatTelemetryTime(bMetrics.averagePace))}</div>
          <div class="meta-caption">Stint básico con ritmo medio agregado por selección ${type === "driver" ? "piloto/piloto" : "equipo/equipo"}.</div>
        </div>
      </div>
    </div>

    <div class="card engineer-card telemetry-dashboard-card">
      <div class="card-title">4 · Comparativa</div>
      <div class="telemetry-compare-head" style="margin-top:10px;">
        <div class="telemetry-entity-block">
          ${comparison.a?.image ? `<img src="${escapeHtml(comparison.a.image)}" alt="${escapeHtml(comparison.a.label)}" class="telemetry-driver-photo" />` : ""}
          <div><strong>${escapeHtml(comparison.a?.label || "A")}</strong><div class="meta-caption">${escapeHtml(comparison.a?.team || "")}</div></div>
        </div>
        <div class="telemetry-entity-block">
          ${comparison.b?.image ? `<img src="${escapeHtml(comparison.b.image)}" alt="${escapeHtml(comparison.b.label)}" class="telemetry-driver-photo" />` : ""}
          <div><strong>${escapeHtml(comparison.b?.label || "B")}</strong><div class="meta-caption">${escapeHtml(comparison.b?.team || "")}</div></div>
        </div>
      </div>
      <div class="meta-caption" style="margin-top:10px;">Comparativa directa con métricas fiables de OpenF1 histórico para el mismo GP y sesión.</div>
    </div>

    <div class="card engineer-card telemetry-dashboard-card">
      <div class="card-title">5 · Evolución FP / Qualy / Carrera</div>
      <div class="telemetry-evolution-list" style="margin-top:10px;">
        ${evolution.length ? evolution.map(item => `
          <div class="standing-row">
            <div><strong>${escapeHtml(item.label)}</strong></div>
            <div class="news-meta-row">
              <span>A ritmo ${escapeHtml(formatTelemetryTime(item.aPace))}</span>
              <span>B ritmo ${escapeHtml(formatTelemetryTime(item.bPace))}</span>
              <span>Δ ref ${escapeHtml(formatTelemetryDelta(telemetryDelta(item.aRef, item.bRef)))}</span>
            </div>
          </div>
        `).join("") : `<div class="empty-line">No hay suficientes sesiones para construir evolución fiable todavía.</div>`}
      </div>
    </div>
  `;
}

function renderTelemetrySelector(options, currentValue, attrs = "") {
  return options.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === currentValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function renderTelemetryPanelBody() {
  const telemetry = engineerState.telemetry;
  if (telemetry.status === "loading") {
    return `<div class="card engineer-card"><div class="empty-line">Cargando telemetría histórica de OpenF1…</div></div>`;
  }

  if (telemetry.status === "error") {
    return `<div class="card engineer-card"><div class="card-title">Telemetría no disponible</div><div class="empty-line">${escapeHtml(telemetry.userMessage || "No se pudieron cargar datos técnicos. Intenta otra sesión.")}</div></div>`;
  }

  if (telemetry.status === "empty") {
    return `<div class="card engineer-card"><div class="card-title">Sin datos técnicos</div><div class="empty-line">${escapeHtml(telemetry.userMessage || "No hay datos de telemetría para esta combinación.")}</div></div>`;
  }

  if (!telemetry.technicalData) {
    return `<div class="card engineer-card"><div class="empty-line">Selecciona dos ${telemetry.type === "driver" ? "pilotos" : "equipos"} válidos.</div></div>`;
  }

  return renderTelemetryDashboard(telemetry.technicalData);
}

function renderTelemetryPanel(gpList = [], participants = { drivers: [], teams: [] }) {
  const telemetry = engineerState.telemetry;
  const gpOptions = gpList.map(item => ({ value: item.gpKey, label: item.label }));
  const gpSessions = engineerCache.sessionsByGp.get(String(telemetry.gp)) || [];
  const validTypeKeys = [...new Set(gpSessions.map(item => item.type_key))];
  const sessionOptions = TELEMETRY_SESSION_TYPES
    .filter(item => validTypeKeys.includes(item.key))
    .map(item => ({ value: item.key, label: item.label }));
  const typeOptions = [
    { value: "driver", label: "Piloto / Piloto" },
    { value: "team", label: "Equipo / Equipo" }
  ];
  const aOptionsSource = telemetry.type === "driver" ? participants.drivers.map(item => item.name) : participants.teams;
  const bOptionsSource = aOptionsSource.filter(name => name !== telemetry.a);
  const aOptions = aOptionsSource.map(item => ({ value: item, label: item }));
  const bOptions = bOptionsSource.map(item => ({ value: item, label: item }));
  const gpPlaceholder = telemetry.status === "loading" && !gpOptions.length
    ? [{ value: "", label: "Cargando GP 2026…" }]
    : [{ value: "", label: "No hay GP de 2026 disponibles ahora." }];
  const sessionPlaceholder = !telemetry.gp
    ? [{ value: "", label: "Selecciona GP primero" }]
    : [{ value: "", label: "No hay sesiones válidas para este GP" }];
  const entitiesPending = !telemetry.sessionKey || !telemetry.attemptedResolution;
  const entityPlaceholder = entitiesPending
    ? [{ value: "", label: "Selecciona GP y sesión" }]
    : [{ value: "", label: "No hay participantes disponibles para esa sesión" }];

  return `
    <div class="card engineer-card telemetry-controls-card">
      <div class="card-title">Telemetría</div>
      <div class="card-sub">OpenF1 histórico gratis · temporada 2026 · comparativa directa</div>
      <div class="telemetry-control-grid" style="margin-top:10px;">
        <label class="telemetry-control-item">
          <span>GP</span>
          <select class="select-input" onchange="setEngineerTelemetryGp(this.value)">
            ${renderTelemetrySelector(gpOptions.length ? gpOptions : gpPlaceholder, telemetry.gp)}
          </select>
        </label>
        <label class="telemetry-control-item">
          <span>Sesión</span>
          <select class="select-input" onchange="setEngineerTelemetrySessionType(this.value)">
            ${renderTelemetrySelector(sessionOptions.length ? sessionOptions : sessionPlaceholder, telemetry.sessionType)}
          </select>
        </label>
        <label class="telemetry-control-item">
          <span>Tipo</span>
          <select class="select-input" onchange="setEngineerTelemetryType(this.value)">
            ${renderTelemetrySelector(typeOptions, telemetry.type)}
          </select>
        </label>
        <label class="telemetry-control-item">
          <span>A</span>
          <select class="select-input" onchange="setEngineerTelemetryA(this.value)">
            ${renderTelemetrySelector(aOptions.length ? aOptions : entityPlaceholder, telemetry.a)}
          </select>
        </label>
        <label class="telemetry-control-item">
          <span>B</span>
          <select class="select-input" onchange="setEngineerTelemetryB(this.value)">
            ${renderTelemetrySelector(bOptions.length ? bOptions : entityPlaceholder, telemetry.b)}
          </select>
        </label>
      </div>
    </div>
    ${renderTelemetryPanelBody()}
  `;
}

async function ensureTelemetrySelection() {
  const telemetry = engineerState.telemetry;
  telemetry.attemptedResolution = false;
  const meetings = await loadTelemetrySessionCatalog();
  const gpList = meetings.map(item => ({ gpKey: String(item.meeting_key), label: item.gp_label }));
  if (!gpList.length) {
    telemetry.status = "empty";
    telemetry.userMessage = "No hay reuniones de 2026 disponibles en OpenF1 ahora mismo.";
    return { gpList, participants: { drivers: [], teams: [] } };
  }

  if (!telemetry.gp || !gpList.some(item => item.gpKey === telemetry.gp)) {
    telemetry.gp = gpList[0].gpKey;
  }

  if (!engineerCache.sessionsByMeeting.has(String(telemetry.gp))) {
    if (!engineerCache.sessionsPromiseByMeeting.has(String(telemetry.gp))) {
      engineerCache.sessionsPromiseByMeeting.set(
        String(telemetry.gp),
        fetchEngineerApi("sessions", {
          year: TELEMETRY_SEASON_YEAR,
          meeting_key: telemetry.gp
        }).then(data => Array.isArray(data?.sessions) ? data.sessions : [])
      );
    }
    const loadedSessions = await engineerCache.sessionsPromiseByMeeting.get(String(telemetry.gp));
    engineerCache.sessionsByMeeting.set(String(telemetry.gp), loadedSessions);
    engineerCache.sessionsByGp.set(String(telemetry.gp), loadedSessions);
    engineerCache.sessionsPromiseByMeeting.delete(String(telemetry.gp));
  }

  const sessionsForGp = engineerCache.sessionsByGp.get(String(telemetry.gp)) || [];
  const allowedSessions = sessionsForGp.filter(item =>
    item.session_key
    && TELEMETRY_SESSION_TYPES.some(type => type.key === item.type_key)
  );
  if (!allowedSessions.length) {
    telemetry.status = "empty";
    telemetry.sessionType = "";
    telemetry.sessionKey = "";
    telemetry.userMessage = "Este GP de 2026 no tiene sesiones válidas de FP, Qualy o Carrera.";
    return { gpList, participants: { drivers: [], teams: [] } };
  }

  if (!telemetry.sessionType || !allowedSessions.some(item => item.type_key === telemetry.sessionType)) {
    telemetry.sessionType = allowedSessions[allowedSessions.length - 1].type_key;
  }

  const sessionCandidates = allowedSessions.filter(item => item.type_key === telemetry.sessionType);
  const selectedSession = sessionCandidates[sessionCandidates.length - 1] || allowedSessions[allowedSessions.length - 1];
  telemetry.sessionType = selectedSession.type_key;
  telemetry.sessionKey = selectedSession.session_key;

  const participants = await loadTelemetryParticipants(telemetry.sessionKey);
  telemetry.attemptedResolution = true;
  const options = telemetry.type === "driver"
    ? participants.drivers.map(item => item.name)
    : participants.teams;

  if (!options.length) {
    telemetry.a = "";
    telemetry.b = "";
    telemetry.status = "empty";
    telemetry.userMessage = "No hay participantes disponibles para esa sesión.";
    return { gpList, participants };
  }

  if (!options.includes(telemetry.a)) telemetry.a = options[0] || "";
  const bOptions = options.filter(name => name !== telemetry.a);
  if (!bOptions.includes(telemetry.b)) telemetry.b = bOptions[0] || "";
  if (!telemetry.b && bOptions.length) telemetry.b = bOptions[0];

  return { gpList, participants };
}

async function loadTelemetryData() {
  const telemetry = engineerState.telemetry;
  const requestId = ++telemetryLoadRequestId;
  telemetry.status = "loading";
  telemetry.error = "";
  telemetry.userMessage = "";
  renderEngineerScreen();

  try {
    const { gpList, participants } = await ensureTelemetrySelection();
    if (requestId !== telemetryLoadRequestId) return;

    if (!telemetry.sessionKey) {
      telemetry.status = "empty";
      telemetry.technicalData = null;
      telemetry.userMessage = telemetry.userMessage || "Selecciona GP y sesión válidos para comparar.";
      renderEngineerScreen(gpList, participants);
      return;
    }

    if (!telemetry.a || !telemetry.b || !telemetry.sessionKey) {
      telemetry.status = "empty";
      telemetry.technicalData = null;
      telemetry.userMessage = telemetry.type === "driver"
        ? "Selecciona dos pilotos válidos."
        : "Selecciona dos equipos válidos.";
      renderEngineerScreen(gpList, participants);
      return;
    }

    const selectionKey = `${telemetry.gp}:${telemetry.sessionKey}:${telemetry.type}:${telemetry.a}:${telemetry.b}`;
    if (engineerCache.dataBySelection.has(selectionKey)) {
      telemetry.technicalData = engineerCache.dataBySelection.get(selectionKey);
      telemetry.status = "ready";
      telemetry.lastLoadedKey = selectionKey;
      renderEngineerScreen(gpList, participants);
      return;
    }

    const comparison = await buildTelemetryComparison({
      sessionKey: telemetry.sessionKey,
      type: telemetry.type,
      a: telemetry.a,
      b: telemetry.b,
      participants
    });
    if (requestId !== telemetryLoadRequestId) return;

    const hasData = comparison?.comparison?.a?.metrics?.lapCount || comparison?.comparison?.b?.metrics?.lapCount;
    if (!hasData) {
      telemetry.status = "empty";
      telemetry.technicalData = null;
      telemetry.userMessage = "No hay datos de comparación para esa combinación.";
      renderEngineerScreen(gpList, participants);
      return;
    }

    const evolution = await buildTelemetryEvolution({
      gpKey: telemetry.gp,
      type: telemetry.type,
      a: telemetry.a,
      b: telemetry.b,
      participants
    });
    if (requestId !== telemetryLoadRequestId) return;

    const technicalData = {
      comparison: comparison.comparison,
      evolution,
      type: telemetry.type
    };
    engineerCache.dataBySelection.set(selectionKey, technicalData);
    telemetry.technicalData = technicalData;
    telemetry.lastLoadedKey = selectionKey;
    telemetry.status = "ready";
    renderEngineerScreen(gpList, participants);
  } catch (error) {
    if (requestId !== telemetryLoadRequestId) return;
    console.error("[telemetry] load failed", error);
    telemetry.status = "error";
    telemetry.error = String(error?.message || "");
    telemetry.userMessage = telemetryFriendlyErrorMessage(error);
    telemetry.technicalData = null;
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
  if (!value) return;
  engineerState.telemetry.gp = value;
  engineerState.telemetry.sessionType = "";
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.a = "";
  engineerState.telemetry.b = "";
  engineerState.telemetry.technicalData = null;
  loadTelemetryData();
}

function setEngineerTelemetrySessionType(value) {
  if (!value) return;
  engineerState.telemetry.sessionType = value;
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.a = "";
  engineerState.telemetry.b = "";
  engineerState.telemetry.technicalData = null;
  loadTelemetryData();
}

function setEngineerTelemetryType(value) {
  engineerState.telemetry.type = value === "team" ? "team" : "driver";
  engineerState.telemetry.a = "";
  engineerState.telemetry.b = "";
  engineerState.telemetry.technicalData = null;
  loadTelemetryData();
}

function setEngineerTelemetryA(value) {
  if (!value) return;
  engineerState.telemetry.a = value;
  if (engineerState.telemetry.b === value) engineerState.telemetry.b = "";
  engineerState.telemetry.technicalData = null;
  loadTelemetryData();
}

function setEngineerTelemetryB(value) {
  if (!value) return;
  engineerState.telemetry.b = value;
  engineerState.telemetry.technicalData = null;
  loadTelemetryData();
}

function renderEngineerScreen(gpList = [], participants = { drivers: [], teams: [] }) {
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
      : renderTelemetryPanel(gpList, participants)}
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
window.setEngineerTelemetryType = setEngineerTelemetryType;
window.setEngineerTelemetryA = setEngineerTelemetryA;
window.setEngineerTelemetryB = setEngineerTelemetryB;

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
  submode: state.engineerSubmode === "telemetry" ? "telemetry" : "prediction",
  telemetry: {
    status: "idle",
    error: "",
    userMessage: "",
    gp: "",
    sessionType: "",
    sessionKey: "",
    driver: "",
    lapMode: "reference",
    manualLap: "",
    context: null,
    payload: null,
    viewportStart: 0,
    viewportEnd: 1,
    cursor: 0
  }
};

const engineerCache = { context: new Map() };
let telemetryRequestId = 0;
const TELEMETRY_CACHE_TTL_MS = 1000 * 60 * 8;
const TELEMETRY_LAP_MODES = Object.freeze(["reference", "latest", "manual"]);

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
  return `${TELEMETRY_SEASON_YEAR}:${t.gp || "auto"}:${t.sessionType || "auto"}:${t.driver || "auto"}`;
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

function clampTelemetryUnit(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function telemetryRange(length = 0) {
  const t = engineerState.telemetry;
  const start = clampTelemetryUnit(t.viewportStart);
  const end = Math.max(start + 0.04, clampTelemetryUnit(t.viewportEnd));
  const startIndex = Math.min(Math.max(0, Math.floor(start * Math.max(0, length - 1))), Math.max(0, length - 1));
  const endIndex = Math.min(Math.max(startIndex + 1, Math.ceil(end * Math.max(0, length - 1))), Math.max(1, length - 1));
  return { start, end, startIndex, endIndex };
}

function buildTelemetryLine(values = [], startIndex = 0, endIndex = 1, options = {}) {
  const clean = (Array.isArray(values) ? values : []).map(item => Number(item)).filter(Number.isFinite);
  const from = Math.max(0, Math.min(startIndex, clean.length - 1));
  const to = Math.max(from + 1, Math.min(endIndex, clean.length - 1));
  const slice = clean.slice(from, to + 1);
  if (!slice.length) return { points: "", min: 0, max: 1, current: null };
  const min = Number.isFinite(options.min) ? options.min : Math.min(...slice);
  const max = Number.isFinite(options.max) ? options.max : Math.max(...slice);
  const span = Math.max(1, max - min);
  const step = Math.max(1, Math.ceil(slice.length / 400));
  const sampled = slice.filter((_, idx) => idx % step === 0 || idx === slice.length - 1);
  const points = sampled.map((item, idx) => {
    const x = (idx / Math.max(1, sampled.length - 1)) * 100;
    const y = 100 - (((item - min) / span) * 100);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const cursorIndex = Math.min(slice.length - 1, Math.max(0, Math.round(clampTelemetryUnit(engineerState.telemetry.cursor) * (slice.length - 1))));
  const current = slice[cursorIndex];
  return { points, min, max, current };
}

function formatTelemetryReadout(value, unit = "") {
  if (!Number.isFinite(value)) return "—";
  if (unit === "kmh") return formatTelemetrySpeed(value);
  if (unit === "rpm") return `${Math.round(value).toLocaleString("es-ES")} rpm`;
  if (unit === "gear") return `G${Math.round(value)}`;
  if (unit === "drs") return value > 7 ? "DRS abierto" : "DRS cerrado";
  return `${Math.round(value)}${unit}`;
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
    session_type: t.sessionType,
    driver: t.driver
  });
  return cacheSet(engineerCache.context, key, payload);
}

function hasTelemetryPayloadData(payload) {
  if (!payload) return false;
  const laps = payload?.lap_selector?.laps || [];
  return Array.isArray(payload?.traces?.speed) && payload.traces.speed.length > 0 && laps.some(item => Number.isFinite(item?.lapNumber));
}

function renderLapOption(item = {}) {
  const chunks = [`L${Math.round(item.lapNumber || 0)}`];
  if (Number.isFinite(item.lapTime)) chunks.push(formatTelemetrySeconds(item.lapTime));
  if (item.isBest) chunks.push("PB");
  if (item.compound) chunks.push(item.compound);
  return chunks.join(" · ");
}

function renderTelemetryWorkspace(payload) {
  const summary = payload.summary || {};
  const selector = payload.lap_selector || {};
  const laps = Array.isArray(selector.laps) ? selector.laps.filter(item => Number.isFinite(item?.lapNumber) && item.hasTelemetry) : [];
  const selectedLap = laps.find(item => item.lapNumber === selector.selectedLapNumber) || null;
  const manualOptions = laps.map(item => ({ value: String(item.lapNumber), label: renderLapOption(item) }));
  const traces = payload.traces || {};
  const pointCount = Math.min(
    traces.speed?.length || 0,
    traces.throttle?.length || 0,
    traces.brake?.length || 0,
    traces.distance?.length || Number.MAX_SAFE_INTEGER
  );
  const { start, end, startIndex, endIndex } = telemetryRange(pointCount || 1);
  const traceRows = [
    { key: "speed", label: "Speed", values: traces.speed || [], variant: "speed", min: 0, unit: "kmh" },
    { key: "throttle", label: "Throttle", values: traces.throttle || [], variant: "throttle", min: 0, max: 100, unit: "%" },
    { key: "brake", label: "Brake", values: traces.brake || [], variant: "brake", min: 0, max: 100, unit: "%" }
  ];
  const secondarySignals = [
    { label: "RPM", value: buildTelemetryLine(traces.rpm || [], startIndex, endIndex).current, unit: "rpm" },
    { label: "Gear", value: buildTelemetryLine(traces.gear || [], startIndex, endIndex).current, unit: "gear" },
    { label: "DRS", value: buildTelemetryLine(traces.drs || [], startIndex, endIndex).current, unit: "drs" }
  ];
  const cursorIndex = Math.min(endIndex, Math.max(startIndex, startIndex + Math.round(clampTelemetryUnit(engineerState.telemetry.cursor) * Math.max(1, endIndex - startIndex))));
  const sectorNames = ["S1", "S2", "S3"];
  const selectedSectors = [selectedLap?.sector1 ?? summary.sector1, selectedLap?.sector2 ?? summary.sector2, selectedLap?.sector3 ?? summary.sector3];
  const sectorAverages = [1, 2, 3].map(index => {
    const values = laps.map(item => Number(item[`sector${index}`])).filter(Number.isFinite);
    return values.length ? values.reduce((acc, item) => acc + item, 0) / values.length : null;
  });
  const sectors = sectorNames.map((name, index) => {
    const current = selectedSectors[index];
    const avg = sectorAverages[index];
    return { name, current, avg, delta: Number.isFinite(current) && Number.isFinite(avg) ? current - avg : null };
  }).filter(item => Number.isFinite(item.current));
  const stintRows = (payload.stints || []).filter(item => item.lapCount >= 2);
  const activeStint = selectedLap && Number.isFinite(selectedLap.stint) ? stintRows.find(item => item.number === selectedLap.stint) : null;
  const lapShare = pointCount > 0 ? (cursorIndex / Math.max(1, pointCount - 1)) * 100 : 0;
  const trackSegments = 44;
  const speedTrace = traces.speed || [];
  const throttleTrace = traces.throttle || [];
  const trackCells = Array.from({ length: trackSegments }).map((_, idx) => {
    const a = Math.floor((idx / trackSegments) * Math.max(1, pointCount - 1));
    const b = Math.floor(((idx + 1) / trackSegments) * Math.max(1, pointCount - 1));
    const speeds = speedTrace.slice(a, Math.max(a + 1, b));
    const throttles = throttleTrace.slice(a, Math.max(a + 1, b));
    const avgSpeed = speeds.length ? speeds.reduce((acc, item) => acc + item, 0) / speeds.length : 0;
    const avgThrottle = throttles.length ? throttles.reduce((acc, item) => acc + item, 0) / throttles.length : 0;
    const normalized = Math.max(0, Math.min(1, avgSpeed / Math.max(220, summary.topSpeed || 220)));
    const tint = 190 - (normalized * 90);
    const light = 24 + (normalized * 38);
    const active = lapShare >= (idx / trackSegments) * 100 && lapShare < ((idx + 1) / trackSegments) * 100;
    return `<div class="telemetry-track-cell ${active ? "active" : ""}" style="background:hsl(${tint.toFixed(0)}deg, ${Math.max(46, avgThrottle * 0.45).toFixed(0)}%, ${light.toFixed(0)}%);"></div>`;
  }).join("");

  return `
    <section class="card engineer-card telemetry-workspace">
      <div class="telemetry-work-topbar">
        <div>
          <div class="card-title">${escapeHtml(payload.labels?.gp || "GP")}</div>
          <div class="card-sub">${escapeHtml(payload.labels?.session || "Sesión")} · ${escapeHtml(payload.labels?.driver || "Piloto")}</div>
        </div>
        <div class="telemetry-work-source">TracingInsights/2026</div>
      </div>
      <div class="telemetry-analytical-layout">
        <section class="telemetry-chart-zone">
          <div class="telemetry-lap-controls telemetry-lap-controls--inline">
            <div class="telemetry-lap-modes">
              <button class="${engineerState.telemetry.lapMode === "reference" ? "active" : ""}" onclick="setEngineerTelemetryLapMode('reference')">Referencia</button>
              <button class="${engineerState.telemetry.lapMode === "latest" ? "active" : ""}" onclick="setEngineerTelemetryLapMode('latest')">Última</button>
              <button class="${engineerState.telemetry.lapMode === "manual" ? "active" : ""}" onclick="setEngineerTelemetryLapMode('manual')">Manual</button>
            </div>
            ${engineerState.telemetry.lapMode === "manual" ? `<select class="select-input" onchange="setEngineerTelemetryManualLap(this.value)">${renderTelemetrySelector(manualOptions, engineerState.telemetry.manualLap || String(selector.selectedLapNumber || ""))}</select>` : ""}
            ${selectedLap ? `<div class="telemetry-lap-active">L${selectedLap.lapNumber} · ${escapeHtml(formatTelemetrySeconds(selectedLap.lapTime))}</div>` : ""}
            <button class="btn-secondary telemetry-reset-btn" onclick="resetEngineerTelemetryViewport()">Reset zoom</button>
          </div>

          <div class="telemetry-chart-stack">
            ${traceRows.map(row => {
    const line = buildTelemetryLine(row.values, startIndex, endIndex, { min: row.min, max: row.max });
    return `<article class="telemetry-trace-panel ${row.variant}">
                <header><span>${row.label}</span><strong>${escapeHtml(formatTelemetryReadout(line.current, row.unit))}</strong></header>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${line.points}"></polyline></svg>
              </article>`;
  }).join("")}
          </div>
          <div class="telemetry-brush">
            <div class="telemetry-brush-head"><span>Rango visible</span><strong>${Math.round(start * 100)}% → ${Math.round(end * 100)}%</strong></div>
            <input type="range" min="0" max="96" value="${Math.round(start * 100)}" oninput="setEngineerTelemetryViewportStart(this.value)">
            <input type="range" min="4" max="100" value="${Math.round(end * 100)}" oninput="setEngineerTelemetryViewportEnd(this.value)">
            <input type="range" min="0" max="100" value="${Math.round(engineerState.telemetry.cursor * 100)}" oninput="setEngineerTelemetryCursor(this.value)">
          </div>
        </section>

        <aside class="telemetry-analysis-zone">
          <article class="telemetry-track-panel">
            <div class="telemetry-track-head"><span>Track map analítico</span><strong>Cursor ${Math.round(lapShare)}%</strong></div>
            <div class="telemetry-track-ribbon">${trackCells}</div>
            <div class="telemetry-track-legend"><span>Baja velocidad / lift</span><span>Alta velocidad / aceleración</span></div>
          </article>

          <article class="telemetry-sectors-compact">
            <div class="telemetry-track-head"><span>Sectores</span><strong>Delta vs media</strong></div>
            ${sectors.map(item => `<div class="telemetry-sector-line ${item.delta <= 0 ? "gain" : "loss"}"><span>${item.name}</span><strong>${escapeHtml(formatTelemetrySeconds(item.current))}</strong><em>${Number.isFinite(item.delta) ? `${item.delta <= 0 ? "-" : "+"}${Math.abs(item.delta).toFixed(3)}s` : "—"}</em></div>`).join("")}
          </article>

          <article class="telemetry-stint-compact">
            <div class="telemetry-track-head"><span>Stints</span><strong>${activeStint ? `Stint activo S${activeStint.number}` : "Resumen"}</strong></div>
            ${stintRows.map(item => `<div class="telemetry-stint-line ${activeStint?.number === item.number ? "active" : ""}"><span>S${item.number} · ${escapeHtml(item.compound || "-")} · L${item.lapStart}-${item.lapEnd}</span><strong>${escapeHtml(formatTelemetrySeconds(item.avgLap))}</strong></div>`).join("")}
          </article>

          <div class="telemetry-kpi-row telemetry-kpi-row--compact">
            <div><span>Ritmo medio</span><strong>${escapeHtml(formatTelemetrySeconds(summary.averagePace))}</strong></div>
            <div><span>Top speed</span><strong>${escapeHtml(formatTelemetrySpeed(summary.topSpeed))}</strong></div>
            <div><span>Speed trap</span><strong>${escapeHtml(formatTelemetrySpeed(summary.speedTrap))}</strong></div>
          </div>
          <div class="telemetry-secondary-readout">
            ${secondarySignals.map(signal => `<div><span>${signal.label}</span><strong>${escapeHtml(formatTelemetryReadout(signal.value, signal.unit))}</strong></div>`).join("")}
          </div>
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
  return renderTelemetryWorkspace(telemetry.payload);
}

function renderTelemetryPanel() {
  const telemetry = engineerState.telemetry;
  const context = telemetry.context || { meetings: [], sessions: [], drivers: [] };
  const gpOptions = (context.meetings || []).map(item => ({ value: String(item.meeting_key), label: item.gp_label }));
  const sessionOptions = (context.sessions || []).map(item => ({ value: item.type_key, label: item.type_label }));
  const driverOptions = (context.drivers || []).map(item => ({ value: String(item.id || ""), label: item.team ? `${item.name} · ${item.team}` : item.name }));

  return `
    <section class="card engineer-card telemetry-work-controls">
      <div class="telemetry-work-controls-row">
        <label><span>GP</span><select class="select-input" onchange="setEngineerTelemetryGp(this.value)">${renderTelemetrySelector(gpOptions, telemetry.gp)}</select></label>
        <label><span>Sesión</span><select class="select-input" onchange="setEngineerTelemetrySessionType(this.value)">${renderTelemetrySelector(sessionOptions, telemetry.sessionType)}</select></label>
        <label><span>Piloto</span><select class="select-input" onchange="setEngineerTelemetryDriver(this.value)">${renderTelemetrySelector(driverOptions, telemetry.driver)}</select></label>
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
      telemetry.status = "error";
      telemetry.userMessage = "No hay combinación válida GP/sesión/piloto con datos.";
      telemetry.payload = null;
      renderEngineerScreen();
      return;
    }

    const payload = await fetchEngineerApi("telemetry", {
      year: TELEMETRY_SEASON_YEAR,
      meeting_key: telemetry.gp,
      session_key: telemetry.sessionKey,
      driver_number: telemetry.driver,
      lap_mode: telemetry.lapMode,
      manual_lap: telemetry.manualLap
    });
    if (requestId !== telemetryRequestId) return;

    if (!hasTelemetryPayloadData(payload)) {
      telemetry.status = "error";
      telemetry.userMessage = "La sesión no trae trazas útiles para este piloto.";
      telemetry.payload = null;
      renderEngineerScreen();
      return;
    }

    telemetry.payload = payload;
    telemetry.viewportStart = 0;
    telemetry.viewportEnd = 1;
    telemetry.cursor = 0;
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
  persistEngineerSubmode(engineerState.submode);
  renderEngineerScreen();
  if (engineerState.submode === "telemetry") loadTelemetryData();
}

function resetTelemetrySelection() {
  engineerState.telemetry.payload = null;
  engineerState.telemetry.manualLap = "";
  engineerState.telemetry.lapMode = "reference";
}

function setEngineerTelemetryGp(value) {
  engineerState.telemetry.gp = value || "";
  engineerState.telemetry.context = null;
  engineerState.telemetry.sessionType = "";
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.driver = "";
  resetTelemetrySelection();
  loadTelemetryData();
}

function setEngineerTelemetrySessionType(value) {
  engineerState.telemetry.sessionType = value || "";
  engineerState.telemetry.context = null;
  engineerState.telemetry.sessionKey = "";
  engineerState.telemetry.driver = "";
  resetTelemetrySelection();
  loadTelemetryData();
}

function setEngineerTelemetryDriver(value) {
  engineerState.telemetry.driver = value || "";
  engineerState.telemetry.sessionKey = "";
  resetTelemetrySelection();
  loadTelemetryData();
}

function setEngineerTelemetryLapMode(mode) {
  if (!TELEMETRY_LAP_MODES.includes(mode)) return;
  engineerState.telemetry.lapMode = mode;
  if (mode !== "manual") engineerState.telemetry.manualLap = "";
  loadTelemetryData();
}

function setEngineerTelemetryManualLap(value) {
  engineerState.telemetry.lapMode = "manual";
  engineerState.telemetry.manualLap = String(value || "");
  loadTelemetryData();
}

function resetEngineerTelemetryViewport() {
  engineerState.telemetry.viewportStart = 0;
  engineerState.telemetry.viewportEnd = 1;
  engineerState.telemetry.cursor = 0;
  renderEngineerScreen();
}

function setEngineerTelemetryViewportStart(value) {
  const normalized = clampTelemetryUnit(Number(value) / 100);
  engineerState.telemetry.viewportStart = normalized;
  if (engineerState.telemetry.viewportEnd - normalized < 0.04) engineerState.telemetry.viewportEnd = Math.min(1, normalized + 0.04);
  renderEngineerScreen();
}

function setEngineerTelemetryViewportEnd(value) {
  const normalized = clampTelemetryUnit(Number(value) / 100);
  engineerState.telemetry.viewportEnd = normalized;
  if (normalized - engineerState.telemetry.viewportStart < 0.04) engineerState.telemetry.viewportStart = Math.max(0, normalized - 0.04);
  renderEngineerScreen();
}

function setEngineerTelemetryCursor(value) {
  engineerState.telemetry.cursor = clampTelemetryUnit(Number(value) / 100);
  renderEngineerScreen();
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
window.setEngineerTelemetryViewportStart = setEngineerTelemetryViewportStart;
window.setEngineerTelemetryViewportEnd = setEngineerTelemetryViewportEnd;
window.setEngineerTelemetryCursor = setEngineerTelemetryCursor;
window.resetEngineerTelemetryViewport = resetEngineerTelemetryViewport;


function persistEngineerSubmode(mode) {
  state.engineerSubmode = mode === "telemetry" ? "telemetry" : "prediction";
  saveUiState();
}

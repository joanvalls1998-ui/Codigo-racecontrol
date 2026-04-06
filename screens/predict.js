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
    type: "driver",
    a: "",
    b: "",
    context: null,
    technicalData: null
  }
};

const engineerCache = {
  context: new Map(),
  compare: new Map()
};

let telemetryLoadRequestId = 0;

function formatTelemetryTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "N/D";
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds - minutes * 60).toFixed(3).padStart(6, "0");
  return `${minutes}:${remainder}`;
}

function formatTelemetrySigned(value, decimals = 3, unit = "") {
  if (!Number.isFinite(value)) return "N/D";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(decimals)}${unit}`;
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

function formatTelemetryDeltaByKind(value, kind = "time") {
  if (!Number.isFinite(value)) return "N/D";
  if (kind === "time") return formatTelemetrySigned(value, 3, "s");
  if (kind === "speed") return formatTelemetrySigned(value, 1, " km/h");
  if (kind === "temp") return formatTelemetrySigned(value, 1, " °C");
  if (kind === "count") return formatTelemetrySigned(value, 0, "");
  if (kind === "position") return formatTelemetrySigned(value, 1, " pos");
  return formatTelemetrySigned(value, 2, "");
}

function telemetryDelta(aValue, bValue) {
  if (!Number.isFinite(aValue) || !Number.isFinite(bValue)) return null;
  return aValue - bValue;
}

function telemetryWinnerClass(winner) {
  return winner === "a" ? "win-a" : winner === "b" ? "win-b" : "";
}

function telemetryWinnerCopy(winner, aLabel = "A", bLabel = "B") {
  if (winner === "a") return `${aLabel} domina`;
  if (winner === "b") return `${bLabel} domina`;
  return "Empate";
}

function telemetryNormalizedWidths(aValue, bValue, lowerIsBetter = true) {
  const safeA = Number.isFinite(aValue) ? aValue : 0;
  const safeB = Number.isFinite(bValue) ? bValue : 0;
  const max = Math.max(safeA, safeB, 1);
  const ratioA = safeA / max;
  const ratioB = safeB / max;
  const mappedA = lowerIsBetter ? Math.max(0.08, 1 - ratioA + 0.08) : Math.max(0.08, ratioA);
  const mappedB = lowerIsBetter ? Math.max(0.08, 1 - ratioB + 0.08) : Math.max(0.08, ratioB);
  const norm = mappedA + mappedB || 1;
  return { aWidth: (mappedA / norm) * 100, bWidth: (mappedB / norm) * 100 };
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
  if (message.includes("No hay participantes para esta sesión")) return "No hay participantes comparables en la sesión seleccionada.";
  if (message.includes("No hay datos de comparación para esta combinación")) return "Combinación válida sin señal comparable todavía. Prueba otra sesión 2026.";
  if (message.includes("Ingeniero solo admite temporada 2026")) return "Ingeniero está centrado exclusivamente en la temporada 2026.";
  if (message.includes("Failed to fetch")) return "No se pudo conectar con la capa técnica. Reintenta en unos segundos.";
  return "No se pudieron cargar datos técnicos de esta combinación.";
}

function contextCacheKey() {
  const telemetry = engineerState.telemetry;
  return `${telemetry.gp}:${telemetry.sessionType}:${telemetry.type}:${telemetry.a}:${telemetry.b}`;
}

function compareCacheKey() {
  const telemetry = engineerState.telemetry;
  return `${telemetry.gp}:${telemetry.sessionKey}:${telemetry.type}:${telemetry.a}:${telemetry.b}`;
}

async function loadTelemetryContext() {
  const key = contextCacheKey();
  if (engineerCache.context.has(key)) return engineerCache.context.get(key);
  const payload = await fetchEngineerApi("context", {
    year: TELEMETRY_SEASON_YEAR,
    meeting_key: engineerState.telemetry.gp,
    session_type: engineerState.telemetry.sessionType,
    type: engineerState.telemetry.type,
    a: engineerState.telemetry.a,
    b: engineerState.telemetry.b
  });
  engineerCache.context.set(key, payload);
  return payload;
}

function telemetryMetricRow({ label, aValue, bValue, winner = "none", formatter, deltaKind = "time", lowerIsBetter = true }) {
  if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return "";
  const delta = telemetryDelta(aValue, bValue);
  const widths = telemetryNormalizedWidths(aValue, bValue, lowerIsBetter);
  return `
    <div class="telemetry-panel-row ${telemetryWinnerClass(winner)}">
      <div class="telemetry-panel-row-head">
        <span class="meta-kicker">${escapeHtml(label)}</span>
        <span class="meta-caption">${escapeHtml(telemetryWinnerCopy(winner))}</span>
      </div>
      <div class="telemetry-panel-row-values">
        <span>A ${escapeHtml(formatter(aValue))}</span>
        <span>B ${escapeHtml(formatter(bValue))}</span>
        <span>Δ ${escapeHtml(formatTelemetryDeltaByKind(delta, deltaKind))}</span>
      </div>
      <div class="telemetry-panel-bars">
        <div class="telemetry-panel-bar-a" style="width:${widths.aWidth}%;"></div>
        <div class="telemetry-panel-bar-b" style="width:${widths.bWidth}%;"></div>
      </div>
    </div>
  `;
}

function renderTelemetryStintCompact(items = []) {
  if (!items.length) return `<div class="empty-line">Sin stints trazables.</div>`;
  return items.slice(0, 4).map(stint => `
    <div class="telemetry-stint-row">
      <span>Stint ${escapeHtml(String(stint.number || "-"))} · ${escapeHtml(stint.compound || "N/D")}</span>
      <span>${Number.isFinite(stint.laps) ? `${stint.laps} vueltas` : "N/D"}</span>
    </div>
  `).join("");
}

function renderTelemetryDashboard(technicalData) {
  const blocks = technicalData.blocks || {};
  const summary = blocks.summary || {};
  const sectors = blocks.sectors || {};
  const stints = blocks.stints || {};
  const sessionContext = blocks.sessionContext || {};
  const evolution = blocks.evolution || [];
  const comparison = blocks.comparison || technicalData.comparison || {};
  const primaryDelta = summary.primaryDelta?.value;
  const winner = summary.primaryDelta?.advantage || "none";

  const heroRows = [
    telemetryMetricRow({ label: "Vuelta referencia", aValue: summary.referenceLap?.a, bValue: summary.referenceLap?.b, winner: summary.referenceLap?.winner, formatter: formatTelemetryTime, deltaKind: "time", lowerIsBetter: true }),
    telemetryMetricRow({ label: "Ritmo medio", aValue: summary.averagePace?.a, bValue: summary.averagePace?.b, winner: summary.averagePace?.winner, formatter: formatTelemetryTime, deltaKind: "time", lowerIsBetter: true }),
    telemetryMetricRow({ label: "Velocidad punta", aValue: summary.topSpeed?.a, bValue: summary.topSpeed?.b, winner: summary.topSpeed?.winner, formatter: formatTelemetrySpeed, deltaKind: "speed", lowerIsBetter: false }),
    telemetryMetricRow({ label: "Speed trap", aValue: summary.speedTrap?.a, bValue: summary.speedTrap?.b, winner: summary.speedTrap?.winner, formatter: formatTelemetrySpeed, deltaKind: "speed", lowerIsBetter: false })
  ].filter(Boolean).join("");

  const sectorRows = [
    telemetryMetricRow({ label: "Sector 1", aValue: sectors.sector1?.a, bValue: sectors.sector1?.b, winner: sectors.sector1?.winner, formatter: formatTelemetryTime, deltaKind: "time", lowerIsBetter: true }),
    telemetryMetricRow({ label: "Sector 2", aValue: sectors.sector2?.a, bValue: sectors.sector2?.b, winner: sectors.sector2?.winner, formatter: formatTelemetryTime, deltaKind: "time", lowerIsBetter: true }),
    telemetryMetricRow({ label: "Sector 3", aValue: sectors.sector3?.a, bValue: sectors.sector3?.b, winner: sectors.sector3?.winner, formatter: formatTelemetryTime, deltaKind: "time", lowerIsBetter: true })
  ].filter(Boolean).join("");

  return `
    <div class="card engineer-card telemetry-hero-board">
      <div class="telemetry-hero-topline">
        <div>
          <div class="card-title">Telemetría · Panel técnico</div>
          <div class="card-sub">Lectura compacta A/B · foco 2026 · bloque central de decisión</div>
        </div>
        <div class="telemetry-hero-delta-box ${telemetryWinnerClass(winner)}">
          <div class="meta-kicker">Delta principal</div>
          <div class="meta-value">${escapeHtml(formatTelemetryDeltaByKind(primaryDelta, "time"))}</div>
          <div class="meta-caption">${escapeHtml(telemetryWinnerCopy(winner, comparison.a?.label || "A", comparison.b?.label || "B"))}</div>
        </div>
      </div>
      <div class="telemetry-panel-stack">${heroRows || `<div class="empty-line">Sin datos comparables en el bloque principal.</div>`}</div>
    </div>

    <div class="card engineer-card telemetry-dashboard-card">
      <div class="card-title">0 · Contexto de sesión</div>
      <div class="telemetry-context-ribbon">
        <div><span>Pista</span><strong>${escapeHtml(formatTelemetryTemp(sessionContext.avgTrackTemp))}</strong></div>
        <div><span>Aire</span><strong>${escapeHtml(formatTelemetryTemp(sessionContext.avgAirTemp))}</strong></div>
        <div><span>Humedad</span><strong>${Number.isFinite(sessionContext.avgHumidity) ? `${sessionContext.avgHumidity.toFixed(0)}%` : "N/D"}</strong></div>
        <div><span>Race control</span><strong>${escapeHtml(formatTelemetryCount(sessionContext.raceControlMessages))}</strong></div>
        <div><span>Pit</span><strong>${escapeHtml(formatTelemetryCount(sessionContext.pitStops))}</strong></div>
        <div><span>Overtakes</span><strong>${escapeHtml(formatTelemetryCount(sessionContext.overtakes))}</strong></div>
        <div><span>Team radio</span><strong>${escapeHtml(formatTelemetryCount(sessionContext.teamRadios))}</strong></div>
      </div>
    </div>

    <div class="telemetry-dashboard-split">
      <div class="card engineer-card telemetry-dashboard-card">
        <div class="card-title">1 · Resumen técnico</div>
        <div class="telemetry-panel-stack">${heroRows || `<div class="empty-line">Sin resumen técnico comparable.</div>`}</div>
      </div>
      <div class="card engineer-card telemetry-dashboard-card">
        <div class="card-title">2 · Sectores</div>
        <div class="telemetry-panel-stack">${sectorRows || `<div class="empty-line">No hay sectores comparables.</div>`}</div>
      </div>
    </div>

    <div class="telemetry-dashboard-split">
      <div class="card engineer-card telemetry-dashboard-card">
        <div class="card-title">3 · Stint</div>
        <div class="telemetry-panel-stack">
          ${telemetryMetricRow({ label: "Degradación", aValue: stints.degradation?.a, bValue: stints.degradation?.b, winner: stints.degradation?.winner, formatter: value => formatTelemetrySigned(value, 3, "s"), deltaKind: "time", lowerIsBetter: true })}
          ${telemetryMetricRow({ label: "Ritmo por stint", aValue: stints.averagePace?.a, bValue: stints.averagePace?.b, winner: stints.averagePace?.winner, formatter: formatTelemetryTime, deltaKind: "time", lowerIsBetter: true })}
        </div>
        <div class="telemetry-stint-columns">
          <div><div class="meta-kicker">A · Evolución stint</div>${renderTelemetryStintCompact(stints.stintsA || [])}</div>
          <div><div class="meta-kicker">B · Evolución stint</div>${renderTelemetryStintCompact(stints.stintsB || [])}</div>
        </div>
      </div>
      <div class="card engineer-card telemetry-dashboard-card">
        <div class="card-title">4 · Comparativa</div>
        <div class="telemetry-compare-head">
          <div class="telemetry-entity-block">${comparison.a?.image ? `<img src="${escapeHtml(comparison.a.image)}" alt="${escapeHtml(comparison.a.label)}" class="telemetry-driver-photo"/>` : ""}<div><strong>${escapeHtml(comparison.a?.label || "A")}</strong><div class="meta-caption">${escapeHtml(comparison.a?.team || "")}</div></div></div>
          <div class="telemetry-entity-block">${comparison.b?.image ? `<img src="${escapeHtml(comparison.b.image)}" alt="${escapeHtml(comparison.b.label)}" class="telemetry-driver-photo"/>` : ""}<div><strong>${escapeHtml(comparison.b?.label || "B")}</strong><div class="meta-caption">${escapeHtml(comparison.b?.team || "")}</div></div></div>
        </div>
      </div>
    </div>

    <div class="card engineer-card telemetry-dashboard-card">
      <div class="card-title">5 · Evolución FP / Qualy / Carrera</div>
      <div class="telemetry-evolution-grid">
        ${evolution.length ? evolution.map(item => `
          <div class="telemetry-evolution-item">
            <div class="telemetry-panel-row-head"><strong>${escapeHtml(item.label)}</strong><span class="meta-caption">Δ ritmo ${escapeHtml(formatTelemetryDeltaByKind(item.paceDelta, "time"))}</span></div>
            <div class="telemetry-panel-bars">
              <div class="telemetry-panel-bar-a" style="width:${telemetryNormalizedWidths(item.aPace, item.bPace, true).aWidth}%;"></div>
              <div class="telemetry-panel-bar-b" style="width:${telemetryNormalizedWidths(item.aPace, item.bPace, true).bWidth}%;"></div>
            </div>
            <div class="telemetry-panel-row-values"><span>A ${escapeHtml(formatTelemetryTime(item.aPace))}</span><span>B ${escapeHtml(formatTelemetryTime(item.bPace))}</span><span>Δ ref ${escapeHtml(formatTelemetryDeltaByKind(item.refDelta, "time"))}</span></div>
          </div>
        `).join("") : `<div class="empty-line">Sin sesiones suficientes para evolución robusta.</div>`}
      </div>
    </div>
  `;
}

function renderTelemetrySelector(options, currentValue) {
  return options.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === currentValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function renderTelemetryPanelBody() {
  const telemetry = engineerState.telemetry;
  if (telemetry.status === "loading") {
    return `<div class="card engineer-card"><div class="empty-line">Cargando stack técnico 2026…</div></div>`;
  }

  if (telemetry.status === "error") {
    return `<div class="card engineer-card"><div class="card-title">Telemetría no disponible</div><div class="empty-line">${escapeHtml(telemetry.userMessage || "No hay datos técnicos históricos disponibles para este caso.")}</div></div>`;
  }

  if (telemetry.status === "empty") {
    return `<div class="card engineer-card"><div class="card-title">Sin datos técnicos</div><div class="empty-line">${escapeHtml(telemetry.userMessage || "No hay datos técnicos históricos disponibles para este caso.")}</div></div>`;
  }

  if (!telemetry.technicalData) {
    return `<div class="card engineer-card"><div class="empty-line">Selecciona dos ${telemetry.type === "driver" ? "pilotos" : "equipos"} válidos para iniciar análisis.</div></div>`;
  }

  return renderTelemetryDashboard(telemetry.technicalData);
}

function renderTelemetryPanel() {
  const telemetry = engineerState.telemetry;
  const context = telemetry.context || { meetings: [], sessions: [], options: { a: [], b: [] } };
  const gpOptions = context.meetings.map(item => ({ value: String(item.meeting_key), label: item.gp_label }));
  const sessionOptions = context.sessions.map(item => ({ value: item.type_key, label: item.type_label }));
  const typeOptions = [
    { value: "driver", label: "Piloto / Piloto" },
    { value: "team", label: "Equipo / Equipo" }
  ];

  const aOptions = (context.options?.a || []).map(item => ({ value: String(item.value || ""), label: item.label || item.value || "" }));
  const bOptions = (context.options?.b || []).map(item => ({ value: String(item.value || ""), label: item.label || item.value || "" }));

  return `
    <div class="card engineer-card telemetry-controls-card">
      <div class="card-title">Telemetría</div>
      <div class="card-sub">Control técnico de sesión · temporada fija 2026 · backend agregador interno</div>
      <div class="telemetry-control-grid" style="margin-top:10px;">
        <label class="telemetry-control-item">
          <span>GP</span>
          <select class="select-input" onchange="setEngineerTelemetryGp(this.value)">
            ${renderTelemetrySelector(gpOptions.length ? gpOptions : [{ value: "", label: "No hay GP disponibles en 2026" }], telemetry.gp)}
          </select>
        </label>
        <label class="telemetry-control-item">
          <span>Sesión</span>
          <select class="select-input" onchange="setEngineerTelemetrySessionType(this.value)">
            ${renderTelemetrySelector(sessionOptions.length ? sessionOptions : [{ value: "", label: "No hay sesiones disponibles" }], telemetry.sessionType)}
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
            ${renderTelemetrySelector(aOptions.length ? aOptions : [{ value: "", label: "No hay entidades para esta sesión" }], telemetry.a)}
          </select>
        </label>
        <label class="telemetry-control-item">
          <span>B</span>
          <select class="select-input" onchange="setEngineerTelemetryB(this.value)">
            ${renderTelemetrySelector(bOptions.length ? bOptions : [{ value: "", label: "Selecciona una entidad A primero" }], telemetry.b)}
          </select>
        </label>
      </div>
    </div>
    ${renderTelemetryPanelBody()}
  `;
}

async function loadTelemetryData() {
  const telemetry = engineerState.telemetry;
  const requestId = ++telemetryLoadRequestId;
  telemetry.status = "loading";
  telemetry.error = "";
  telemetry.userMessage = "";
  renderEngineerScreen();

  try {
    const context = await loadTelemetryContext();
    if (requestId !== telemetryLoadRequestId) return;

    telemetry.context = context;
    telemetry.gp = context.selections?.meeting_key || "";
    telemetry.sessionType = context.selections?.session_type || "";
    telemetry.sessionKey = context.selections?.session_key || "";
    telemetry.type = context.selections?.type || telemetry.type;
    telemetry.a = context.selections?.a || "";
    telemetry.b = context.selections?.b || "";

    if (!telemetry.sessionKey || !telemetry.a || !telemetry.b) {
      telemetry.status = "empty";
      telemetry.technicalData = null;
      telemetry.userMessage = !telemetry.sessionKey ? "No hay sesiones válidas para este GP en 2026." : "No hay entidades suficientes para comparar en esta sesión.";
      renderEngineerScreen();
      return;
    }

    const compareKey = compareCacheKey();
    if (engineerCache.compare.has(compareKey)) {
      telemetry.technicalData = engineerCache.compare.get(compareKey);
      telemetry.status = "ready";
      renderEngineerScreen();
      return;
    }

    const comparison = await fetchEngineerApi("compare", {
      year: TELEMETRY_SEASON_YEAR,
      meeting_key: telemetry.gp,
      session_key: telemetry.sessionKey,
      type: telemetry.type,
      a: telemetry.a,
      b: telemetry.b
    });
    if (requestId !== telemetryLoadRequestId) return;

    if (!comparison?.comparison?.a?.metrics?.lapCount && !comparison?.comparison?.b?.metrics?.lapCount) {
      telemetry.status = "empty";
      telemetry.technicalData = null;
      telemetry.userMessage = "No hay datos técnicos suficientes en la sesión seleccionada.";
      renderEngineerScreen();
      return;
    }

    engineerCache.compare.set(compareKey, comparison);
    telemetry.technicalData = comparison;
    telemetry.status = "ready";
    renderEngineerScreen();
  } catch (error) {
    if (requestId !== telemetryLoadRequestId) return;
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
  if (engineerState.submode === "telemetry") loadTelemetryData();
}

function setEngineerTelemetryGp(value) {
  engineerState.telemetry.gp = value || "";
  engineerState.telemetry.sessionType = "";
  engineerState.telemetry.a = "";
  engineerState.telemetry.b = "";
  engineerState.telemetry.technicalData = null;
  loadTelemetryData();
}

function setEngineerTelemetrySessionType(value) {
  engineerState.telemetry.sessionType = value || "";
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
  engineerState.telemetry.a = value || "";
  if (engineerState.telemetry.b === engineerState.telemetry.a) engineerState.telemetry.b = "";
  engineerState.telemetry.technicalData = null;
  loadTelemetryData();
}

function setEngineerTelemetryB(value) {
  engineerState.telemetry.b = value || "";
  engineerState.telemetry.technicalData = null;
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
window.setEngineerTelemetryType = setEngineerTelemetryType;
window.setEngineerTelemetryA = setEngineerTelemetryA;
window.setEngineerTelemetryB = setEngineerTelemetryB;

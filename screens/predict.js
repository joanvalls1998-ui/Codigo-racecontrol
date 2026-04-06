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

function showPredict() {
  setActiveNav("nav-predict");
  rememberScreen("predict");
  updateSubtitle();

  const selectedRace = getSelectedRace();
  const favorite = getFavorite();
  const needFreshPredict = shouldAutoGeneratePredict(favorite, selectedRace);
  const activePredictData = !needFreshPredict ? state.lastPredictData : null;
  const expert = isExpertMode();

  contentEl().innerHTML = expert ? `
    ${renderPredictHeroV2({ predict: renderPredictContent(), favorite, raceName: selectedRace, expert, activePredictData })}
    ${renderPredictPrimaryFocusCard(favorite, selectedRace, activePredictData)}

    <div class="card app-panel-card">
      <div class="card-head">
        <div class="card-head-left"><div class="card-title">Capa 2 · ejecución</div></div>
        <div class="card-head-actions"><button class="icon-btn" onclick="sharePrediction()">Compartir</button></div>
      </div>
      <div id="predictKeyFactors" style="margin-top:10px;">${renderPredictWeekendKeyCard(favorite, selectedRace, activePredictData, true)}</div>
      <div id="predictQualyRace" style="margin-top:10px;">${renderPredictExecutionSplitCard(favorite, selectedRace, activePredictData, true)}</div>
    </div>

    <div class="card app-panel-card">
      <details>
        <summary style="cursor:pointer; font-weight:700;">Capa 3 · análisis ampliado</summary>
        <div id="predictSummaryCards" style="margin-top:12px;">${activePredictData ? renderPredictSummaryCards(activePredictData) : renderPredictPreviewCards(favorite, selectedRace)}</div>
        <div id="predictScenarioCards" style="margin-top:12px;">${renderPredictScenarioCards(favorite, selectedRace, activePredictData)}</div>
        <div id="predictStrategyDetail" style="margin-top:10px;">${renderPredictStrategyDetail(favorite, selectedRace, activePredictData)}</div>
        <div id="predictGridRead" style="margin-top:10px;">${renderPredictGridRead(favorite, selectedRace, activePredictData)}</div>
      </details>
    </div>

    <div class="card app-panel-card">
      <details>
        <summary style="cursor:pointer; font-weight:700;">Historial técnico</summary>
        <div style="margin-top:12px;">
          <pre id="predictOutput" class="ai-output predict-v2-raw-output">${activePredictData ? escapeHtml(formatPredictResponse(activePredictData)) : "Preparando predicción…"}</pre>
          <div id="predictionHistoryBox" style="margin-top:10px;">${renderPredictionHistory()}</div>
        </div>
      </details>
    </div>
  ` : `
    ${renderPredictHeroV2({ predict: renderPredictContent(), favorite, raceName: selectedRace, expert, activePredictData })}
    ${renderPredictPrimaryFocusCard(favorite, selectedRace, activePredictData)}
    <div class="card app-panel-card">
      <div class="card-head">
        <div class="card-head-left"><div class="card-title">Bloque principal</div></div>
        <div class="card-head-actions"><button class="icon-btn" onclick="sharePrediction()">Más info</button></div>
      </div>
      <div id="predictKeyFactors" style="margin-top:10px;">${renderPredictWeekendKeyCard(favorite, selectedRace, activePredictData, false)}</div>
      <div id="predictQualyRace" style="display:none;"></div>
      <div id="predictSummaryCards" style="display:none;"></div>
      <div id="predictScenarioCards" style="display:none;"></div>
      <div id="predictStrategyDetail" style="display:none;"></div>
      <div id="predictGridRead" style="display:none;"></div>
    </div>
    <div class="card app-panel-card">
      <details>
        <summary style="cursor:pointer; font-weight:700;">Ver análisis completo</summary>
        <div style="margin-top:12px;">
          ${renderPredictExecutionSplitCard(favorite, selectedRace, activePredictData, false)}
          <div style="margin-top:10px;">${renderPredictScenarioCards(favorite, selectedRace, activePredictData)}</div>
          <div style="margin-top:10px;">${renderPredictStrategyDetail(favorite, selectedRace, activePredictData)}</div>
          <pre id="predictOutput" class="ai-output predict-v2-raw-output">${activePredictData ? escapeHtml(formatPredictResponse(activePredictData)) : "Preparando predicción…"}</pre>
          <div id="predictionHistoryBox" style="margin-top:10px;">${renderPredictionHistory()}</div>
        </div>
      </details>
    </div>
  `;

  if (needFreshPredict) setTimeout(() => runPredict(), 80);
}


window.runPredict = runPredict;
window.refreshPredict = refreshPredict;
window.showPredict = showPredict;
window.clearPredictionHistory = clearPredictionHistory;
window.openPredictionHistoryItem = openPredictionHistoryItem;

window.sharePrediction = sharePrediction;

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
      qualyRace: renderPredictQualyRaceCard(favorite, raceName, data),
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
      qualyRace: renderPredictQualyRaceCard(favorite, raceName, null),
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

function showPredict() {
  setActiveNav("nav-predict");
  updateSubtitle();

  const predict = renderPredictContent();
  const selectedRace = getSelectedRace();
  const favorite = getFavorite();
  const needFreshPredict = shouldAutoGeneratePredict(favorite, selectedRace);
  const activePredictData = !needFreshPredict ? state.lastPredictData : null;

  contentEl().innerHTML = `
    <div class="card highlight-card">
      <div class="pill">IA · PREDICT</div>
      <div class="card-title" style="color: var(--${predict.accent});">${escapeHtml(predict.title)}</div>

      <div class="news-meta-row" style="margin-top:10px;">
        <span class="tag ${predict.copy.phaseTagClass}">${escapeHtml(predict.copy.phaseLabel)}</span>
      </div>
      
      <select id="predictRace" class="select-input" onchange="saveSelectedRace(this.value)">
        ${getPredictRaceOptions().map(race => `
          <option value="${race}" ${race === selectedRace ? "selected" : ""}>${race}</option>
        `).join("")}
      </select>

      <div class="action-row">
        <button class="btn" onclick="runPredict()">Generar</button>
        <button class="icon-btn" onclick="refreshPredict()">Actualizar</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(predict.copy.guidanceTitle)}</div>
      ${renderPredictPhaseGuideCard(predict)}
    </div>

    ${renderContextGlossaryCard("predict", predict.phase)}

    <div class="card">
      <div class="card-title">${escapeHtml(predict.copy.summaryTitle)}</div>
      <div id="predictSummaryCards">
        ${activePredictData
          ? renderPredictSummaryCards(activePredictData)
          : renderPredictPreviewCards(favorite, selectedRace)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(predict.copy.scenariosTitle)}</div>
      <div id="predictScenarioCards">
        ${renderPredictScenarioCards(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(predict.copy.factorsTitle)}</div>
      <div id="predictKeyFactors">
        ${renderPredictKeyFactors(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(predict.copy.qualyTitle)}</div>
      <div id="predictQualyRace">
        ${renderPredictQualyRaceCard(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(predict.copy.strategyTitle)}</div>
      <div id="predictStrategyDetail">
        ${renderPredictStrategyDetail(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(predict.copy.gridTitle)}</div>
      <div id="predictGridRead">
        ${renderPredictGridRead(favorite, selectedRace, activePredictData)}
      </div>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(predict.copy.textTitle)}</div>
      <pre id="predictOutput" class="ai-output">${activePredictData ? escapeHtml(formatPredictResponse(activePredictData)) : "Preparando predicción avanzada..."}</pre>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-head-left">
          <div class="card-title">Historial</div>
        </div>
        <div class="card-head-actions">
          <button class="icon-btn" onclick="clearPredictionHistory()">Vaciar</button>
        </div>
      </div>
      <div id="predictionHistoryBox">${renderPredictionHistory()}</div>
    </div>
  `;

  if (needFreshPredict) {
    setTimeout(() => runPredict(), 80);
  }
}


window.runPredict = runPredict;
window.refreshPredict = refreshPredict;
window.showPredict = showPredict;
window.clearPredictionHistory = clearPredictionHistory;
window.openPredictionHistoryItem = openPredictionHistoryItem;

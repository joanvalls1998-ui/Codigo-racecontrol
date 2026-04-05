function renderExperienceModeLine(settings) {
  const mode = settings.experienceMode === "expert" ? "expert" : "casual";

  return `
    <div class="settings-line" style="padding-top:8px;">
      <div class="settings-line-left">
        <div>
          <div class="settings-line-title">Modo de experiencia</div>
          
        </div>
      </div>
      <div class="filters-row" style="margin-top:0;">
        <button class="chip ${mode === "casual" ? "active" : ""}" onclick="setExperienceMode('casual')">Casual</button>
        <button class="chip ${mode === "expert" ? "active" : ""}" onclick="setExperienceMode('expert')">Experto</button>
      </div>
    </div>
  `;
}

function getSettingsSystemState() {
  const settings = getSettings();
  const summary = getLocalDataSummary();
  const isExpert = isExpertMode();

  return {
    settings,
    summary,
    isExpert,
    lastScreenLabel: getLastScreenLabel(),
    weekendModeEnabled: state.weekendModeEnabled,
    raceModeLabel: settings.autoSelectNextRace
      ? "Automático"
      : `Manual · ${summary.selectedRace || "Sin selección"}`,
    raceModeSub: settings.autoSelectNextRace
      ? "Se usa el siguiente GP detectado en calendario."
      : "Se mantiene el circuito elegido hasta hacer reset.",
    favoriteTypeLabel: summary.favorite.type === "driver" ? "Piloto" : "Equipo"
  };
}

function renderSettingsSectionTitle(title, sub = "") {
  return `
    <div class="settings-system-section-head">
      <div class="settings-system-section-title">${escapeHtml(title)}</div>
      ${sub ? `<div class="settings-system-section-sub">${escapeHtml(sub)}</div>` : ""}
    </div>
  `;
}

function renderSettingsSecondaryPreferencesBlock(state) {
  const { settings, isExpert } = state;

  return `
    <div class="card">
      ${renderSettingsSectionTitle(
        "A. Preferencias secundarias",
        isExpert ? "" : "Ajustes poco frecuentes."
      )}

      <div class="settings-line" style="padding-top:6px;">
        <div class="settings-line-left">
          <div>
            <div class="settings-line-title">Idioma</div>
            
          </div>
        </div>
        <div class="tag general">es-ES</div>
      </div>

      ${renderExperienceModeLine(settings)}

      <div class="settings-line">
        <div class="settings-line-left">
          <div class="settings-line-title">Modo explicativo</div>
          
        </div>
        <button class="icon-btn" onclick="togglePremiumSetting('weekendExplainerMode')">${settings.weekendExplainerMode ? "Activado" : "Desactivado"}</button>
      </div>

      <div class="settings-line">
        <div class="settings-line-left">
          <div class="settings-line-title">Modo fin de semana</div>
          
        </div>
        <button class="icon-btn" onclick="toggleWeekendModeEnabled('showSettingsPanel')">${state.weekendModeEnabled ? "Visible" : "Oculto"}</button>
      </div>
    </div>
  `;
}

function renderSettingsLocalStateBlock(state) {
  const { summary, isExpert, raceModeLabel, raceModeSub, favoriteTypeLabel, lastScreenLabel } = state;

  return `
    <div class="card">
      ${renderSettingsSectionTitle(
        "B. Estado local",
        isExpert ? "" : "Qué hay guardado en este dispositivo."
      )}

      <div class="meta-grid" style="margin-top:8px;">
        <div class="meta-tile">
          <div class="meta-kicker">Favorito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(summary.favorite.name)}</div>
          <div class="meta-caption">${favoriteTypeLabel}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(raceModeLabel)}</div>
          <div class="meta-caption">${escapeHtml(raceModeSub)}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Predicciones</div>
          <div class="meta-value" style="font-size:18px;">${summary.predictions}</div>
          <div class="meta-caption">Guardadas localmente</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Última pantalla</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(lastScreenLabel)}</div>
          <div class="meta-caption">Se abrirá al volver</div>
        </div>
      </div>

      ${isExpert ? "" : `
        <div class="settings-system-note">Incluye favorito, ajustes visuales, predicciones y GP manual.</div>
      `}
    </div>
  `;
}

function renderSettingsMaintenanceBlock(state) {
  const { isExpert } = state;

  return `
    <div class="card">
      ${renderSettingsSectionTitle(
        "C. Limpieza / mantenimiento",
        isExpert ? "" : "Limpieza parcial y segura."
      )}

      <div class="settings-line" style="padding-top:6px;">
        <div class="settings-line-left">
          <div class="settings-line-title">Vaciar historial de predicciones</div>
          
        </div>
        <button class="btn-secondary" onclick="runSettingsMaintenanceAction('clearPredictionHistory')">Vaciar historial</button>
      </div>

      <div class="settings-line">
        <div class="settings-line-left">
          <div class="settings-line-title">Reset circuito manual</div>
          
        </div>
        <button class="btn-secondary" onclick="runSettingsMaintenanceAction('clearSelectedRaceSetting')">Reset circuito</button>
      </div>

      <div class="settings-line">
        <div class="settings-line-left">
          <div class="settings-line-title">Reset favorito</div>
          
        </div>
        <button class="danger-btn" onclick="runSettingsMaintenanceAction('resetFavoriteToDefault')">Reset favorito</button>
      </div>
    </div>
  `;
}

function renderSettingsHardResetBlock(state) {
  const { isExpert } = state;

  return `
    <div class="card settings-system-reset-card">
      ${renderSettingsSectionTitle(
        "D. Reset total",
        isExpert
          ? "Borra favoritos, historial y preferencias locales para reiniciar esta instalación desde cero."
          : "Borra todo lo local y reinicia la app."
      )}
      <div class="settings-actions" style="margin-top:10px;">
        <button class="danger-btn" onclick="runSettingsMaintenanceAction('resetAllDataAndReboot')">Borrar todo</button>
      </div>
    </div>
  `;
}

function runSettingsMaintenanceAction(action) {
  if (action === "clearPredictionHistory") {
    const accepted = window.confirm("¿Vaciar el historial de predicciones guardadas en este dispositivo?");
    if (!accepted) return;
    clearPredictionHistory();
    showSettingsPanel();
    return;
  }

  if (action === "clearSelectedRaceSetting") {
    const accepted = window.confirm("¿Volver al circuito automático según calendario?");
    if (!accepted) return;
    clearSelectedRaceSetting();
    return;
  }

  if (action === "resetFavoriteToDefault") {
    const accepted = window.confirm("¿Resetear el favorito al valor por defecto?");
    if (!accepted) return;
    resetFavoriteToDefault();
    return;
  }

  if (action === "resetAllDataAndReboot") {
    const accepted = window.confirm("Esta acción borra todos los datos locales. ¿Quieres continuar?");
    if (!accepted) return;
    resetAllDataAndReboot();
  }
}

function getLastScreenLabel() {
  const map = {
    home: "Inicio",
    predict: "Predict",
    favorito: "Favorito",
    news: "Noticias",
    more: "Más",
    sessions: "Sesiones",
    calendar: "Calendario",
    standings: "Clasificación",
    raceMode: "Modo carrera",
    settings: "Ajustes",
    glossary: "Glosario"
  };

  return map[state.lastScreen] || "Inicio";
}

function showSettingsPanel() {
  setActiveNav("nav-more");
  rememberScreen("settings");
  updateSubtitle();

  const systemState = getSettingsSystemState();

  contentEl().innerHTML = `
    ${renderSettingsSecondaryPreferencesBlock(systemState)}
    ${renderSettingsLocalStateBlock(systemState)}
    ${renderSettingsMaintenanceBlock(systemState)}
    ${renderSettingsHardResetBlock(systemState)}
  `;
}

window.showSettingsPanel = showSettingsPanel;
window.runSettingsMaintenanceAction = runSettingsMaintenanceAction;

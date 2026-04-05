function renderExperienceModeLine(settings) {
  const mode = settings.experienceMode === "expert" ? "expert" : "casual";

  return `
    <div class="settings-line" style="margin-top:12px;">
      <div class="settings-line-left">
        <div>
          <div class="settings-line-title">Modo de experiencia</div>
          <div class="settings-line-sub">Casual: vista ligera y rápida · Experto: más contexto y detalle técnico.</div>
        </div>
      </div>
      <div class="filters-row" style="margin-top:0;">
        <button class="chip ${mode === "casual" ? "active" : ""}" onclick="setExperienceMode('casual')">Casual</button>
        <button class="chip ${mode === "expert" ? "active" : ""}" onclick="setExperienceMode('expert')">Experto</button>
      </div>
    </div>
  `;
}

function renderSettingsAdvancedCard() {
  const settings = getSettings();
  const summary = getLocalDataSummary();

  return `
    <div class="card">
      <div class="card-title">Preferencias premium</div>
      <div class="card-sub">Pequeños ajustes que hacen la app más tuya y más cómoda entre aperturas.</div>

      <div class="settings-line">
        <div class="settings-line-left">
          <div class="settings-line-title">Mostrar hora circuito</div>
          <div class="settings-line-sub">Añade la hora local del circuito en sesiones y calendario.</div>
        </div>
        <button class="icon-btn" onclick="togglePremiumSetting('showCircuitLocalTime')">${settings.showCircuitLocalTime ? "Activado" : "Desactivado"}</button>
      </div>

      <div class="settings-line">
        <div class="settings-line-left">
          <div class="settings-line-title">Home compacta</div>
          <div class="settings-line-sub">Reduce un poco la home y deja solo lo más operativo.</div>
        </div>
        <button class="icon-btn" onclick="togglePremiumSetting('homeCompactMode')">${settings.homeCompactMode ? "Activado" : "Desactivado"}</button>
      </div>

      <div class="settings-line">
        <div class="settings-line-left">
          <div class="settings-line-title">Modo explicativo</div>
          <div class="settings-line-sub">Mantiene tarjetas tipo “qué mirar ahora” pensadas para casuals.</div>
        </div>
        <button class="icon-btn" onclick="togglePremiumSetting('weekendExplainerMode')">${settings.weekendExplainerMode ? "Activado" : "Desactivado"}</button>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Predicciones</div>
          <div class="meta-value" style="font-size:18px;">${summary.predictions}</div>
          <div class="meta-caption">Guardadas en este dispositivo</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(summary.selectedRace)}</div>
          <div class="meta-caption">Manual o automático</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Favorito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(summary.favorite.name)}</div>
          <div class="meta-caption">${summary.favorite.type === "driver" ? "Piloto" : "Equipo"}</div>
        </div>
      </div>
    </div>
  `;
}

function showSettingsPanel() {
  setActiveNav("nav-more");
  updateSubtitle();

  const settings = getSettings();
  const favorite = getFavorite();

  contentEl().innerHTML = `
    <div class="card">
      <div class="card-title">Ajustes</div>
      <div class="card-sub">Preferencias básicas de la app y limpieza rápida de datos locales.</div>

      <div class="settings-line" style="margin-bottom:10px;">
        <div class="settings-line-left">
          <div>
            <div class="settings-line-title">Idioma</div>
            <div class="settings-line-sub">Actualmente fijado para español de España.</div>
          </div>
        </div>
        <div class="tag general">es-ES</div>
      </div>

      <div class="settings-line" style="margin-bottom:10px;">
        <div class="settings-line-left">
          <div>
            <div class="settings-line-title">Favorito actual</div>
            <div class="settings-line-sub">${favorite.type === "driver" ? `${escapeHtml(favorite.name)} · ${escapeHtml(favorite.team)}` : escapeHtml(favorite.name)}</div>
          </div>
        </div>
        <div class="tag statement">${favorite.type === "driver" ? "Piloto" : "Equipo"}</div>
      </div>

      <div class="settings-line">
        <div class="settings-line-left">
          <div>
            <div class="settings-line-title">Circuito automático</div>
            <div class="settings-line-sub">Usar por defecto la siguiente carrera detectada en el calendario.</div>
          </div>
        </div>
        <button class="icon-btn" onclick="togglePremiumSetting('autoSelectNextRace')">${settings.autoSelectNextRace ? "Activado" : "Desactivado"}</button>
      </div>

      ${renderExperienceModeLine(settings)}

      <div class="settings-actions" style="margin-top:14px;">
        <button class="btn-secondary" onclick="clearPredictionHistory()">Vaciar historial</button>
        <button class="btn-secondary" onclick="clearSelectedRaceSetting()">Reset circuito</button>
        <button class="danger-btn" onclick="resetFavoriteToDefault()">Reset favorito</button>
      </div>
    </div>

    ${renderSettingsAdvancedCard()}

    <div class="card">
      <div class="card-title">Limpieza total</div>
      <div class="card-sub">Borra favorito, historial y preferencias locales de esta instalación.</div>
      <div class="settings-actions" style="margin-top:14px;">
        <button class="danger-btn" onclick="resetAllDataAndReboot()">Borrar todo</button>
      </div>
    </div>
  `;
}


window.showSettingsPanel = showSettingsPanel;

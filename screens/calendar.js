/* ===== CALENDARIO / RACE MODE · toque visual extra ===== */

function getCalendarLeadSession(context) {
  if (!context) return null;
  return context.currentSession || context.nextSession || context.lastCompletedSession || null;
}

function renderCalendarIntelligenceHero(nextRace, context) {
  if (!nextRace) return "";

  const raceName = mapCalendarEventToPredictRace(nextRace) || "GP";
  const heuristics = getRaceHeuristics(raceName);
  const format = getCalendarFormatLabel(raceName);
  const casual = isCasualMode();
  const leadSession = getCalendarLeadSession(context);
  const operational = getWeekendOperationalFocus(context);
  const leadSessionLabel = leadSession?.label || "Sin referencia";
  const leadSessionStatus = leadSession
    ? (leadSession.status === "live" ? "En curso" : leadSession.status === "next" ? "Siguiente" : leadSession.status === "completed" ? "Completada" : "Próxima")
    : "Sin sesión";

  return `
    <div class="card highlight-card calendar-hero-card">
      <div class="mini-pill">SIGUIENTE GP</div>
      <div class="card-title">${escapeHtml(nextRace.title)}</div>
      ${casual ? `<div class="card-sub">${escapeHtml(nextRace.venue || "Venue pendiente")} · ${escapeHtml(nextRace.location || "Ubicación pendiente")}</div>` : ""}

      ${renderCircuitThumb(raceName, 84)}

      <div class="news-meta-row calendar-hero-tags">
        <span class="tag ${nextRace.sprint ? "statement" : "general"}">${nextRace.sprint ? "Sprint weekend" : "Formato normal"}</span>
        <span class="tag technical">${escapeHtml(heuristics.tag)}</span>
        ${context?.phaseLabel ? `<span class="tag ${getWeekendPhaseTagClass(context.phase)}">${escapeHtml(context.phaseLabel)}</span>` : ""}
        <span class="tag ${escapeHtml(operational.tagClass)}">Foco: ${escapeHtml(operational.label)}</span>
        ${casual ? "" : `<span class="tag market">${escapeHtml(format)}</span>`}
      </div>

      <div class="meta-grid calendar-hero-grid">
        <div class="meta-tile">
          <div class="meta-kicker">Fecha GP</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(formatCalendarDateRange(nextRace.start, nextRace.end))}</div>
          <div class="meta-caption">Round ${escapeHtml(String(nextRace.round || "—"))}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Siguiente referencia</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(leadSessionLabel)}</div>
          <div class="meta-caption">${escapeHtml(leadSessionStatus)} · ${escapeHtml(context?.nextSessionCountdown || (context?.currentSession ? "ahora" : "—"))}</div>
        </div>
        ${casual ? "" : `
          <div class="meta-tile">
            <div class="meta-kicker">Lectura circuito</div>
            <div class="meta-value" style="font-size:18px;">${escapeHtml(heuristics.tag)}</div>
            <div class="meta-caption">${escapeHtml(getCalendarEventNarrative(nextRace))}</div>
          </div>
        `}
      </div>

      <div class="info-line" style="margin-top:12px;">${escapeHtml(operational.detail)}</div>

      <div class="quick-row" style="margin-top:14px;">
        <a href="#" class="btn-secondary" onclick="showSessions(); return false;">Sesiones</a>
        <a href="#" class="btn-secondary" onclick="showPredict(); return false;">Predict</a>
      </div>
    </div>
  `;
}
/* ===== CALENDARIO ===== */

function renderCalendarEventCard(event, options = {}) {
  const casual = isCasualMode();
  const isTesting = event.type === "testing";
  const isRace = event.type === "race";
  const raceName = isRace ? mapCalendarEventToPredictRace(event) : null;
  const heuristics = raceName ? getRaceHeuristics(raceName) : null;
  const format = raceName ? getCalendarFormatLabel(raceName) : (isTesting ? "Testing" : "Evento");
  const circuitThumb = raceName ? renderCircuitThumb(raceName, 62) : "";
  const dateLabel = formatCalendarDateRange(event.start, event.end);
  const statusLabel = getCalendarStatusLabel(event.status, event.type);
  const locationLine = event.location ? ` · ${escapeHtml(event.location)}` : "";
  const statusClass = event.status === "next" ? "status-next" : event.status === "upcoming" ? "status-upcoming" : "status-completed";
  const completedClass = options.secondary ? "calendar-event-card-secondary" : "";
  const narrative = raceName ? getCalendarEventNarrative(event) : "";

  return `
    <div class="calendar-event-card ${statusClass} ${completedClass}">
      <div class="calendar-event-top">
        <div class="calendar-event-main">
          ${circuitThumb}
          <div>
            <div class="calendar-event-title">${isRace ? `R${event.round} · ${escapeHtml(event.title)}` : escapeHtml(event.title)}</div>
            <div class="calendar-event-sub">${escapeHtml(event.venue || "—")}${locationLine}</div>
          </div>
        </div>
        <div class="calendar-event-right">
          <div class="calendar-event-date">${escapeHtml(dateLabel)}</div>
          <div class="calendar-event-status">${escapeHtml(statusLabel)}</div>
        </div>
      </div>

      <div class="calendar-event-tags">
        <span class="tag general">${isTesting ? "Testing" : "Carrera"}</span>
        ${event.sprint ? `<span class="tag market">Sprint</span>` : `<span class="tag technical">Normal</span>`}
        ${casual || !heuristics ? "" : `<span class="tag technical">${escapeHtml(heuristics.tag)}</span>`}
        ${casual || !raceName ? "" : `<span class="tag reliability">${escapeHtml(format)}</span>`}
      </div>

      ${casual || !narrative ? "" : `<div class="calendar-event-note">${escapeHtml(narrative)}</div>`}
    </div>
  `;
}

function renderCalendarFlowCard(context) {
  if (!context?.sessions?.length) return "";

  const showCircuitTime = getSettings().showCircuitLocalTime;

  return `
    <div class="card calendar-flow-card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">Flujo del GP</div>
            ${isCasualMode() ? `<div class="card-sub">Orden operativo de sesiones del fin de semana.</div>` : ""}
          </div>
      </div>

      <div class="calendar-flow-list">
        ${context.sessions.map(session => `
          <div class="calendar-flow-item ${session.status === "live" ? "live" : session.status === "next" ? "next" : session.status === "completed" ? "completed" : "upcoming"}">
            <div class="row-left">
              <div class="row-info">
                <div class="row-name">${escapeHtml(session.label)}</div>
                <div class="row-team">${escapeHtml(formatSessionDateTime(session.start))}</div>
                ${showCircuitTime ? `<div class="row-team">Circuito: ${escapeHtml(formatSessionCircuitDateTime(session.start, session.timeZone))}</div>` : ""}
              </div>
            </div>
            <div class="row-badges">
              <span class="tag ${session.status === "live" ? "statement" : session.status === "next" ? "market" : session.status === "completed" ? "general" : "technical"}">
                ${escapeHtml(session.status === "next" ? "Siguiente" : session.status === "live" ? "En curso" : session.status === "completed" ? "Completada" : "Próxima")}
              </span>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

async function showCalendar(force = false) {
  setActiveNav("nav-more");
  rememberScreen("calendar");
  updateSubtitle();

  contentEl().innerHTML = renderLoadingCard("Calendario", "Cargando calendario oficial 2026…", true);

  try {
    const data = await fetchCalendarData(force);
    const events = Array.isArray(data?.events) ? data.events : [];
    const nextRace = getNextRaceFromCalendar(events);
    const upcoming = events.filter(event => event.status === "next" || event.status === "upcoming");
    const completed = events.filter(event => event.status === "completed");
    const casual = isCasualMode();
    const completedVisible = casual ? completed.slice(0, 6) : completed;
    const completedHiddenCount = Math.max(0, completed.length - completedVisible.length);
    const context = getHomeWeekendContext();

    contentEl().innerHTML = `
      ${renderCalendarIntelligenceHero(nextRace, context)}
      ${renderCalendarFlowCard(context)}

      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">Próximas citas</div>
            ${casual ? `<div class="card-sub">Qué toca ahora y qué viene después.</div>` : ""}
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshCalendar()">Refrescar</button>
          </div>
        </div>

        <div class="calendar-group-title">Calendario activo</div>
        ${upcoming.length ? upcoming.map(event => renderCalendarEventCard(event)).join("") : `<div class="empty-line">No hay próximas citas cargadas.</div>`}
      </div>

      <div class="card calendar-secondary-card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">Citas completadas</div>
            ${casual ? `<div class="card-sub">Histórico resumido.</div>` : ""}
          </div>
        </div>

        ${completedVisible.length ? completedVisible.map(event => renderCalendarEventCard(event, { secondary: true })).join("") : `<div class="empty-line">No hay citas completadas registradas.</div>`}
        ${completedHiddenCount > 0 ? `<div class="empty-line">Se ocultaron ${completedHiddenCount} citas ya cerradas para reducir scroll en modo casual.</div>` : ""}
      </div>
    `;
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Calendario", "Error al cargar el calendario", error.message);
  }
}

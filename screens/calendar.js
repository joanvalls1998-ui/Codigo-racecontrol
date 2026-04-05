/* ===== CALENDARIO / RACE MODE · toque visual extra ===== */

function renderCalendarIntelligenceHero(nextRace, context) {
  if (!nextRace) return "";

  const raceName = mapCalendarEventToPredictRace(nextRace) || "GP";
  const heuristics = getRaceHeuristics(raceName);
  const format = getCalendarFormatLabel(raceName);

  return `
    <div class="card highlight-card">
      <div class="mini-pill">CALENDARIO INTELIGENTE</div>
      <div class="card-title">${escapeHtml(nextRace.title)}</div>

      ${renderCircuitThumb(raceName, 80)}

      <div class="news-meta-row" style="margin-top:2px;">
        <span class="tag general">${escapeHtml(format)}</span>
        <span class="tag technical">${escapeHtml(heuristics.tag)}</span>
      </div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Fecha</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(formatCalendarDateRange(nextRace.start, nextRace.end))}</div>
          <div class="meta-caption">${escapeHtml(nextRace.venue || "—")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Circuito</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(heuristics.tag)}</div>
          <div class="meta-caption">${escapeHtml(nextRace.location || "—")}</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Siguiente sesión</div>
          <div class="meta-value" style="font-size:18px;">${escapeHtml(context?.nextSession?.label || "—")}</div>
          <div class="meta-caption">${escapeHtml(context?.nextSessionCountdown || "—")}</div>
        </div>
      </div>

      <div class="quick-row" style="margin-top:14px;">
        <a href="#" class="btn-secondary" onclick="showSessions(); return false;">Abrir sesiones</a>
        <a href="#" class="btn-secondary" onclick="showPredict(); return false;">Abrir predicción</a>
      </div>
    </div>
  `;
}
/* ===== CALENDARIO ===== */

function renderCalendarEventCard(event) {
  const isTesting = event.type === "testing";
  const isRace = event.type === "race";
  const dateLabel = formatCalendarDateRange(event.start, event.end);
  const statusLabel = getCalendarStatusLabel(event.status, event.type);
  const locationLine = event.location ? ` · ${escapeHtml(event.location)}` : "";

  return `
    <div class="calendar-event-card">
      <div class="calendar-event-top">
        <div>
          <div class="calendar-event-title">${isRace ? `R${event.round} · ${escapeHtml(event.title)}` : escapeHtml(event.title)}</div>
          <div class="calendar-event-sub">${escapeHtml(event.venue || "—")}${locationLine}</div>
        </div>
        <div class="calendar-event-right">${escapeHtml(dateLabel)}<br>${escapeHtml(statusLabel)}</div>
      </div>

      <div class="calendar-event-tags">
        <span class="tag general">${isTesting ? "Testing" : "Carrera"}</span>
        ${event.sprint ? `<span class="tag market">Sprint</span>` : ""}
        ${event.type === "race" && event.status === "next" ? `<span class="tag statement">Siguiente</span>` : ""}
      </div>
    </div>
  `;
}

function renderCalendarFlowCard(context) {
  if (!context?.sessions?.length) return "";

  const showCircuitTime = getSettings().showCircuitLocalTime;

  return `
    <div class="card">
      <div class="card-title">Flujo del GP</div>

      ${context.sessions.map(session => `
        <div class="standing-row">
          <div class="row-left">
            <div class="row-info">
              <div class="row-name">${escapeHtml(session.label)}</div>
              <div class="row-team">${escapeHtml(formatSessionDateTime(session.start))}</div>
            </div>
          </div>
          <div class="row-badges">
            <span class="tag ${session.status === "live" ? "statement" : session.status === "next" ? "market" : session.status === "completed" ? "general" : "technical"}">
              ${escapeHtml(session.status === "next" ? "Siguiente" : session.status === "live" ? "En curso" : session.status === "completed" ? "Completada" : "Próxima")}
            </span>
            ${showCircuitTime ? `<div class="row-team">${escapeHtml(formatSessionCircuitDateTime(session.start, session.timeZone))}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

async function showCalendar(force = false) {
  setActiveNav("nav-more");
  updateSubtitle();

  contentEl().innerHTML = renderLoadingCard("Calendario", "Cargando calendario oficial 2026…", true);

  try {
    const data = await fetchCalendarData(force);
    const events = Array.isArray(data?.events) ? data.events : [];
    const nextRace = getNextRaceFromCalendar(events);
    const upcoming = events.filter(event => event.status === "next" || event.status === "upcoming");
    const completed = events.filter(event => event.status === "completed");
    const context = getHomeWeekendContext();

    contentEl().innerHTML = `
      ${renderCalendarIntelligenceHero(nextRace, context)}
      ${renderCalendarFlowCard(context)}

      <div class="card">
        <div class="card-head">
          <div class="card-head-left">
            <div class="card-title">Calendario</div>
          </div>
          <div class="card-head-actions">
            <button class="icon-btn" onclick="refreshCalendar()">Refrescar</button>
          </div>
        </div>

        <div class="calendar-group-title">Próximas citas</div>
        ${upcoming.length ? upcoming.map(renderCalendarEventCard).join("") : `<div class="empty-line">No hay próximas citas cargadas.</div>`}

        <div class="calendar-group-title" style="margin-top:14px;">Ya completadas</div>
        ${completed.length ? completed.map(renderCalendarEventCard).join("") : `<div class="empty-line">No hay citas completadas registradas.</div>`}
      </div>
    `;
  } catch (error) {
    contentEl().innerHTML = renderErrorCard("Calendario", "Error al cargar el calendario", error.message);
  }
}

const ENGINEER_SESSIONS = Object.freeze([
  { key: "fp1", label: "FP1" },
  { key: "fp2", label: "FP2" },
  { key: "fp3", label: "FP3" },
  { key: "qualifying", label: "Qualy" },
  { key: "race", label: "Carrera" }
]);

const ENGINEER_TABS = Object.freeze([
  { key: "resumen", label: "Resumen" },
  { key: "sectores", label: "Sectores" },
  { key: "stint", label: "Stint" },
  { key: "comparativas", label: "Comparativas" },
  { key: "evolucion", label: "Evolución" }
]);

const EngineerTelemetryProvider = {
  getGrandPrixOptions() {
    return getPredictRaceOptions();
  },

  getDriverOptions() {
    const names = [];
    const seen = new Set();
    (state.standingsCache?.drivers || []).forEach(driver => {
      if (!driver?.name || seen.has(driver.name)) return;
      seen.add(driver.name);
      names.push(driver.name);
    });

    if (!names.length) {
      [
        "George Russell", "Kimi Antonelli", "Charles Leclerc", "Lewis Hamilton", "Lando Norris", "Oscar Piastri",
        "Max Verstappen", "Isack Hadjar", "Fernando Alonso", "Lance Stroll"
      ].forEach(name => {
        if (seen.has(name)) return;
        seen.add(name);
        names.push(name);
      });
    }

    return names;
  },

  getTeamOptions() {
    const names = [];
    const seen = new Set();
    (state.standingsCache?.teams || []).forEach(team => {
      const name = team?.team;
      if (!name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });

    if (!names.length) {
      ["Mercedes", "Ferrari", "McLaren", "Red Bull", "Aston Martin", "Racing Bulls", "Alpine", "Williams", "Haas", "Audi", "Cadillac"].forEach(name => {
        if (seen.has(name)) return;
        seen.add(name);
        names.push(name);
      });
    }

    return names;
  },

  resolveLatestSelection() {
    const races = this.getGrandPrixOptions();
    const raceEvents = (state.calendarCache?.events || []).filter(event => event.type === "race");
    const completed = raceEvents
      .filter(event => event.status === "completed")
      .sort((a, b) => new Date(b.end || b.start || 0) - new Date(a.end || a.start || 0));

    const targetEvent = completed[0] || raceEvents
      .filter(event => event.status === "next" || event.status === "upcoming")
      .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0))[0] || null;

    const mapped = mapCalendarEventToPredictRace(targetEvent);
    const gp = mapped && races.includes(mapped) ? mapped : races[races.length - 1];
    const session = targetEvent?.status === "completed" ? "race" : "fp3";

    return {
      gp,
      session: ENGINEER_SESSIONS.some(item => item.key === session) ? session : "race"
    };
  },

  buildMetrics({ gpA, sessionA, gpB, sessionB, compareMode, compareType, entityA, entityB }) {
    const raceA = getRaceHeuristics(gpA);
    const raceB = getRaceHeuristics(gpB || gpA);

    const dataA = compareType === "driver"
      ? this.getDriverBase(entityA)
      : this.getTeamBase(entityA);
    const dataB = compareType === "driver"
      ? this.getDriverBase(entityB)
      : this.getTeamBase(entityB);

    const sessionWeightA = this.getSessionWeight(sessionA);
    const sessionWeightB = this.getSessionWeight(sessionB || sessionA);
    const crossGpOffset = compareMode === "between_gp" ? this.hashOffset(`${gpA}-${gpB}-${sessionA}-${sessionB}`) : 0;

    const paceA = this.round1((dataA.pace + raceA.safetyCar * 0.05 + sessionWeightA * 0.8 + crossGpOffset * 0.3));
    const paceB = this.round1((dataB.pace + raceB.safetyCar * 0.05 + sessionWeightB * 0.8 - crossGpOffset * 0.2));

    const topSpeedA = this.round1(dataA.topSpeed + (raceA.tag === "urbano" ? 2 : 4));
    const topSpeedB = this.round1(dataB.topSpeed + (raceB.tag === "urbano" ? 2 : 4));

    const speedTrapA = this.round1(topSpeedA + 4.4 + (raceA.rain * 0.01));
    const speedTrapB = this.round1(topSpeedB + 4.4 + (raceB.rain * 0.01));

    const refLapA = this.makeReferenceLap(paceA, raceA, sessionA);
    const refLapB = this.makeReferenceLap(paceB, raceB, sessionB || sessionA);

    const sectorsA = this.makeSectors(refLapA, dataA, raceA);
    const sectorsB = this.makeSectors(refLapB, dataB, raceB);

    const stintA = this.makeStintData(paceA, raceA);
    const stintB = this.makeStintData(paceB, raceB);

    const deltaLap = this.round3(refLapB - refLapA);
    const avgPaceA = this.round3(refLapA + stintA.deg * 0.26);
    const avgPaceB = this.round3(refLapB + stintB.deg * 0.26);

    return {
      refLapA,
      refLapB,
      avgPaceA,
      avgPaceB,
      topSpeedA,
      topSpeedB,
      speedTrapA,
      speedTrapB,
      deltaLap,
      sectorsA,
      sectorsB,
      stintA,
      stintB,
      fastSlowA: this.buildFastSlow(sectorsA, raceA),
      fastSlowB: this.buildFastSlow(sectorsB, raceB),
      evolution: this.buildEvolution(compareType, entityA, entityB, gpA),
      compareMode,
      compareType
    };
  },

  buildEvolution(compareType, entityA, entityB, gpName) {
    const phase = this.hashOffset(`${compareType}-${entityA}-${entityB}-${gpName}`);
    const base = 91 + phase * 0.35;
    return {
      fp: this.round1(base - 0.8),
      qualy: this.round1(base + 1.4),
      race: this.round1(base + 0.5)
    };
  },

  getDriverBase(name) {
    const standingsDriver = (state.standingsCache?.drivers || []).find(driver => driver.name === name);
    const teamData = getTeamData(standingsDriver?.team || "Mercedes");
    const form = standingsDriver ? Math.max(72, 96 - (standingsDriver.pos || 12)) : 82;
    return {
      pace: this.round1(teamData.racePace * 0.55 + form * 0.45),
      topSpeed: teamData.topSpeed
    };
  },

  getTeamBase(name) {
    const teamData = getTeamData(name || "Mercedes");
    return {
      pace: this.round1(teamData.racePace * 0.7 + teamData.qualyPace * 0.3),
      topSpeed: teamData.topSpeed
    };
  },

  getSessionWeight(sessionKey) {
    const map = {
      fp1: -0.6,
      fp2: -0.2,
      fp3: 0.2,
      qualifying: 1.1,
      race: 0.9
    };
    return map[sessionKey] ?? 0;
  },

  makeReferenceLap(pace, race, session) {
    const sessionShift = this.getSessionWeight(session);
    const safetyFactor = race.safetyCar * 0.004;
    return this.round3(94.5 - pace * 0.21 + safetyFactor - sessionShift * 0.28);
  },

  makeSectors(refLap, data, race) {
    const aeroBias = data.pace * 0.01;
    const s1 = this.round3(refLap * 0.332 - aeroBias * 0.16);
    const s2 = this.round3(refLap * 0.358 + (race.tag === "urbano" ? 0.13 : -0.08));
    const s3 = this.round3(refLap - s1 - s2);
    return { s1, s2, s3 };
  },

  makeStintData(pace, race) {
    const deg = this.round2(Math.max(0.045, race.safetyCar * 0.001 + race.rain * 0.0008 + (100 - pace) * 0.002));
    return {
      deg,
      shortRun: this.round3(95 - pace * 0.2),
      longRun: this.round3(95.4 - pace * 0.19 + deg * 2.4)
    };
  },

  buildFastSlow(sectors, race) {
    return {
      fast: this.round2(sectors.s1 * 0.62 + sectors.s3 * 0.38 - (race.tag === "permanente" ? 0.11 : 0.03)),
      slow: this.round2(sectors.s2 * 0.66 + sectors.s3 * 0.34 + (race.tag === "urbano" ? 0.16 : 0.04))
    };
  },

  hashOffset(seed) {
    return seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 11 - 5;
  },

  round1(value) { return Number(value.toFixed(1)); },
  round2(value) { return Number(value.toFixed(2)); },
  round3(value) { return Number(value.toFixed(3)); }
};

function getEngineerState() {
  if (!window.__engineerModeState) {
    const latest = EngineerTelemetryProvider.resolveLatestSelection();
    window.__engineerModeState = {
      gpA: latest.gp,
      sessionA: latest.session,
      gpB: latest.gp,
      sessionB: latest.session,
      compareMode: "same_gp",
      compareType: "driver",
      entityA: "",
      entityB: "",
      tab: "resumen"
    };
  }
  return window.__engineerModeState;
}

function openEngineerMode() {
  setExperienceMode("engineer");
}

async function showEngineerHub() {
  setActiveNav("");
  rememberScreen("engineer");
  updateSubtitle();

  if (!state.calendarCache) {
    try { await fetchCalendarData(); } catch {}
  }
  if (!state.standingsCache) {
    try { await fetchStandingsData(); } catch {}
  }

  const mode = getExperienceMode();
  if (mode !== "engineer") {
    setExperienceMode("engineer");
    return;
  }

  const engineer = getEngineerState();
  hydrateEngineerDefaults(engineer);
  renderEngineerHub();
}

function hydrateEngineerDefaults(engineer) {
  const driverOptions = EngineerTelemetryProvider.getDriverOptions();
  const teamOptions = EngineerTelemetryProvider.getTeamOptions();
  const source = engineer.compareType === "driver" ? driverOptions : teamOptions;

  if (!source.includes(engineer.entityA)) engineer.entityA = source[0] || "";
  if (!source.includes(engineer.entityB) || engineer.entityB === engineer.entityA) engineer.entityB = source[1] || source[0] || "";
}

function renderEngineerSelect(label, value, options, onChange, { compact = false } = {}) {
  const cls = compact ? "engineer-field compact" : "engineer-field";
  return `
    <label class="${cls}">
      <span>${escapeHtml(label)}</span>
      <select onchange="${onChange}(this.value)">
        ${options.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderEngineerHub() {
  const engineer = getEngineerState();
  const driverOptions = EngineerTelemetryProvider.getDriverOptions();
  const teamOptions = EngineerTelemetryProvider.getTeamOptions();
  const sourceOptions = engineer.compareType === "driver" ? driverOptions : teamOptions;

  const metrics = EngineerTelemetryProvider.buildMetrics({
    gpA: engineer.gpA,
    sessionA: engineer.sessionA,
    gpB: engineer.gpB,
    sessionB: engineer.sessionB,
    compareMode: engineer.compareMode,
    compareType: engineer.compareType,
    entityA: engineer.entityA,
    entityB: engineer.entityB
  });

  const raceOptions = EngineerTelemetryProvider.getGrandPrixOptions().map(gp => ({ value: gp, label: gp }));
  const sessionOptions = ENGINEER_SESSIONS.map(session => ({ value: session.key, label: session.label }));
  const comparisonModeOptions = [
    { value: "same_gp", label: "Mismo GP" },
    { value: "between_gp", label: "Entre GP" }
  ];
  const comparisonTypeOptions = [
    { value: "driver", label: "Piloto / Piloto" },
    { value: "team", label: "Equipo / Equipo" }
  ];

  contentEl().innerHTML = `
    <section class="engineer-shell">
      <header class="engineer-header">
        <button class="engineer-back" onclick="exitEngineerMode()" aria-label="Volver">←</button>
        <div class="engineer-controls">
          ${renderEngineerSelect("GP", engineer.gpA, raceOptions, "setEngineerGpA")}
          ${renderEngineerSelect("Sesión", engineer.sessionA, sessionOptions, "setEngineerSessionA")}
          ${renderEngineerSelect("Comparación", engineer.compareMode, comparisonModeOptions, "setEngineerCompareMode")}
          ${engineer.compareMode === "between_gp"
            ? `${renderEngineerSelect("GP B", engineer.gpB, raceOptions, "setEngineerGpB")}${renderEngineerSelect("Sesión B", engineer.sessionB, sessionOptions, "setEngineerSessionB")}`
            : ""
          }
          ${renderEngineerSelect("Tipo", engineer.compareType, comparisonTypeOptions, "setEngineerCompareType")}
          ${renderEngineerSelect("A", engineer.entityA, sourceOptions.map(item => ({ value: item, label: item })), "setEngineerEntityA", { compact: true })}
          ${renderEngineerSelect("B", engineer.entityB, sourceOptions.map(item => ({ value: item, label: item })), "setEngineerEntityB", { compact: true })}
        </div>
      </header>

      <section class="engineer-quick-summary">
        ${renderEngineerSummaryKpi("REFERENCIA", `${metrics.refLapA.toFixed(3)}s`, `${engineer.entityA}`)}
        ${renderEngineerSummaryKpi("RITMO MEDIO", `${metrics.avgPaceA.toFixed(3)}s`, `${engineer.entityA}`)}
        ${renderEngineerSummaryKpi("VELOCIDAD PUNTA", `${metrics.topSpeedA.toFixed(1)} km/h`, `${engineer.entityA}`)}
        ${renderEngineerSummaryKpi("DELTA", `${metrics.deltaLap >= 0 ? "+" : ""}${metrics.deltaLap.toFixed(3)}s`, `${engineer.entityB} vs ${engineer.entityA}`, metrics.deltaLap <= 0 ? "good" : "bad")}
      </section>

      <nav class="engineer-tabs">
        ${ENGINEER_TABS.map(tab => `<button class="engineer-tab ${engineer.tab === tab.key ? "active" : ""}" onclick="setEngineerTab('${tab.key}')">${tab.label}</button>`).join("")}
      </nav>

      <section class="engineer-content">
        ${renderEngineerTabContent(engineer, metrics)}
      </section>
    </section>
  `;
}

function renderEngineerSummaryKpi(label, value, sub, tone = "") {
  return `
    <article class="engineer-kpi ${tone}">
      <div class="engineer-kpi-label">${escapeHtml(label)}</div>
      <div class="engineer-kpi-value">${escapeHtml(value)}</div>
      <div class="engineer-kpi-sub">${escapeHtml(sub)}</div>
    </article>
  `;
}

function renderEngineerMetricRow(label, valueA, valueB, { suffix = "", highlight = "" } = {}) {
  return `
    <div class="engineer-row ${highlight}">
      <span>${escapeHtml(label)}</span>
      <span class="a">${escapeHtml(String(valueA))}${escapeHtml(suffix)}</span>
      <span class="b">${escapeHtml(String(valueB))}${escapeHtml(suffix)}</span>
    </div>
  `;
}

function renderEngineerTabContent(engineer, metrics) {
  if (engineer.tab === "resumen") {
    return `
      <div class="engineer-grid">
        <article class="engineer-panel">
          <h3>VELOCIDAD PUNTA</h3>
          ${renderEngineerMetricRow("Top Speed", metrics.topSpeedA.toFixed(1), metrics.topSpeedB.toFixed(1), { suffix: " km/h" })}
          ${renderEngineerMetricRow("Speed Trap", metrics.speedTrapA.toFixed(1), metrics.speedTrapB.toFixed(1), { suffix: " km/h" })}
        </article>
        <article class="engineer-panel">
          <h3>REFERENCIA</h3>
          ${renderEngineerMetricRow("Vuelta", metrics.refLapA.toFixed(3), metrics.refLapB.toFixed(3), { suffix: " s" })}
          ${renderEngineerMetricRow("Ritmo medio", metrics.avgPaceA.toFixed(3), metrics.avgPaceB.toFixed(3), { suffix: " s" })}
        </article>
      </div>
    `;
  }

  if (engineer.tab === "sectores") {
    return `
      <div class="engineer-grid">
        <article class="engineer-panel">
          <h3>SECTOR 1 / 2 / 3</h3>
          ${renderEngineerMetricRow("SECTOR 1", metrics.sectorsA.s1.toFixed(3), metrics.sectorsB.s1.toFixed(3), { suffix: " s" })}
          ${renderEngineerMetricRow("SECTOR 2", metrics.sectorsA.s2.toFixed(3), metrics.sectorsB.s2.toFixed(3), { suffix: " s" })}
          ${renderEngineerMetricRow("SECTOR 3", metrics.sectorsA.s3.toFixed(3), metrics.sectorsB.s3.toFixed(3), { suffix: " s" })}
          ${renderEngineerMetricRow("DELTA", metrics.deltaLap.toFixed(3), (-metrics.deltaLap).toFixed(3), { suffix: " s", highlight: metrics.deltaLap <= 0 ? "good" : "bad" })}
        </article>
        <article class="engineer-panel">
          <h3>CURVAS</h3>
          ${renderEngineerMetricRow("RÁPIDAS", metrics.fastSlowA.fast.toFixed(2), metrics.fastSlowB.fast.toFixed(2), { suffix: " s" })}
          ${renderEngineerMetricRow("LENTAS", metrics.fastSlowA.slow.toFixed(2), metrics.fastSlowB.slow.toFixed(2), { suffix: " s" })}
        </article>
      </div>
    `;
  }

  if (engineer.tab === "stint") {
    return `
      <div class="engineer-grid">
        <article class="engineer-panel">
          <h3>STINT Y DEGRADACIÓN</h3>
          ${renderEngineerMetricRow("DEG/VUELTA", metrics.stintA.deg.toFixed(2), metrics.stintB.deg.toFixed(2), { suffix: " s" })}
          ${renderEngineerMetricRow("STINT CORTO", metrics.stintA.shortRun.toFixed(3), metrics.stintB.shortRun.toFixed(3), { suffix: " s" })}
          ${renderEngineerMetricRow("STINT LARGO", metrics.stintA.longRun.toFixed(3), metrics.stintB.longRun.toFixed(3), { suffix: " s" })}
        </article>
      </div>
    `;
  }

  if (engineer.tab === "comparativas") {
    const badgeA = engineer.compareType === "driver" ? renderDriverAvatar(engineer.entityA, getDriverImageByName(engineer.entityA), "row-avatar") : "";
    const badgeB = engineer.compareType === "driver" ? renderDriverAvatar(engineer.entityB, getDriverImageByName(engineer.entityB), "row-avatar") : "";
    return `
      <div class="engineer-grid">
        <article class="engineer-panel">
          <h3>${engineer.compareType === "driver" ? "PILOTO / PILOTO" : "EQUIPO / EQUIPO"}</h3>
          <div class="engineer-compare-head">
            <div>${badgeA}<strong>${escapeHtml(engineer.entityA)}</strong></div>
            <div>${badgeB}<strong>${escapeHtml(engineer.entityB)}</strong></div>
          </div>
          ${renderEngineerMetricRow("REFERENCIA", metrics.refLapA.toFixed(3), metrics.refLapB.toFixed(3), { suffix: " s" })}
          ${renderEngineerMetricRow("RITMO", metrics.avgPaceA.toFixed(3), metrics.avgPaceB.toFixed(3), { suffix: " s" })}
          ${renderEngineerMetricRow("SPEED TRAP", metrics.speedTrapA.toFixed(1), metrics.speedTrapB.toFixed(1), { suffix: " km/h" })}
        </article>
      </div>
    `;
  }

  return `
    <div class="engineer-grid">
      <article class="engineer-panel">
        <h3>EVOLUCIÓN FP / QUALY / CARRERA</h3>
        ${renderEngineerMetricRow("FP", metrics.evolution.fp.toFixed(1), (metrics.evolution.fp + 0.4).toFixed(1), { suffix: " pts" })}
        ${renderEngineerMetricRow("QUALY", metrics.evolution.qualy.toFixed(1), (metrics.evolution.qualy - 0.2).toFixed(1), { suffix: " pts" })}
        ${renderEngineerMetricRow("CARRERA", metrics.evolution.race.toFixed(1), (metrics.evolution.race + 0.1).toFixed(1), { suffix: " pts" })}
      </article>
    </div>
  `;
}

function setEngineerTab(tabKey) {
  const engineer = getEngineerState();
  engineer.tab = ENGINEER_TABS.some(tab => tab.key === tabKey) ? tabKey : "resumen";
  renderEngineerHub();
}

function setEngineerGpA(value) {
  const engineer = getEngineerState();
  engineer.gpA = value;
  if (engineer.compareMode === "same_gp") engineer.gpB = value;
  renderEngineerHub();
}

function setEngineerSessionA(value) {
  const engineer = getEngineerState();
  engineer.sessionA = value;
  if (engineer.compareMode === "same_gp") engineer.sessionB = value;
  renderEngineerHub();
}

function setEngineerCompareMode(value) {
  const engineer = getEngineerState();
  engineer.compareMode = value === "between_gp" ? "between_gp" : "same_gp";
  if (engineer.compareMode === "same_gp") {
    engineer.gpB = engineer.gpA;
    engineer.sessionB = engineer.sessionA;
  }
  renderEngineerHub();
}

function setEngineerGpB(value) {
  const engineer = getEngineerState();
  engineer.gpB = value;
  renderEngineerHub();
}

function setEngineerSessionB(value) {
  const engineer = getEngineerState();
  engineer.sessionB = value;
  renderEngineerHub();
}

function setEngineerCompareType(value) {
  const engineer = getEngineerState();
  engineer.compareType = value === "team" ? "team" : "driver";
  engineer.entityA = "";
  engineer.entityB = "";
  hydrateEngineerDefaults(engineer);
  renderEngineerHub();
}

function setEngineerEntityA(value) {
  const engineer = getEngineerState();
  engineer.entityA = value;
  if (engineer.entityA === engineer.entityB) {
    const sourceOptions = engineer.compareType === "driver"
      ? EngineerTelemetryProvider.getDriverOptions()
      : EngineerTelemetryProvider.getTeamOptions();
    engineer.entityB = sourceOptions.find(item => item !== value) || value;
  }
  renderEngineerHub();
}

function setEngineerEntityB(value) {
  const engineer = getEngineerState();
  engineer.entityB = value;
  if (engineer.entityB === engineer.entityA) {
    const sourceOptions = engineer.compareType === "driver"
      ? EngineerTelemetryProvider.getDriverOptions()
      : EngineerTelemetryProvider.getTeamOptions();
    engineer.entityA = sourceOptions.find(item => item !== value) || value;
  }
  renderEngineerHub();
}

function exitEngineerMode() {
  const fallback = state.lastNonEngineerMode === "expert" ? "expert" : "casual";
  setExperienceMode(fallback);
  showHome();
}

window.openEngineerMode = openEngineerMode;
window.showEngineerHub = showEngineerHub;
window.exitEngineerMode = exitEngineerMode;
window.setEngineerTab = setEngineerTab;
window.setEngineerGpA = setEngineerGpA;
window.setEngineerSessionA = setEngineerSessionA;
window.setEngineerCompareMode = setEngineerCompareMode;
window.setEngineerGpB = setEngineerGpB;
window.setEngineerSessionB = setEngineerSessionB;
window.setEngineerCompareType = setEngineerCompareType;
window.setEngineerEntityA = setEngineerEntityA;
window.setEngineerEntityB = setEngineerEntityB;

function getEngineerTabs() {
  return [
    { key: "summary", label: "Resumen" },
    { key: "sectors", label: "Sectores" },
    { key: "stint", label: "Stint" },
    { key: "comparisons", label: "Comparativas" },
    { key: "evolution", label: "Evolución" }
  ];
}

function sanitizeEngineerTab(tabKey) {
  const tabs = getEngineerTabs();
  return tabs.some(tab => tab.key === tabKey) ? tabKey : "summary";
}

function setEngineerTab(tabKey) {
  state.engineerActiveTab = sanitizeEngineerTab(tabKey);
  if (!state.engineerModeActive) return;
  showEngineerMode();
}

function enterEngineerMode(initialTab = "summary") {
  state.engineerModeActive = true;
  state.engineerActiveTab = sanitizeEngineerTab(initialTab);
  applyEngineerModeState();
  showEngineerMode();
}

function exitEngineerMode() {
  state.engineerModeActive = false;
  state.engineerActiveTab = "summary";
  applyEngineerModeState();
  showHome();
}

function handleEngineerModeSwitch(mode) {
  if (mode === "engineer") {
    if (!state.engineerModeActive) enterEngineerMode();
    return;
  }

  const nextMode = mode === "expert" ? "expert" : "casual";
  const settings = getSettings();
  const isModeChange = settings.experienceMode !== nextMode;

  state.engineerModeActive = false;
  state.engineerActiveTab = "summary";
  applyEngineerModeState();

  if (isModeChange) {
    saveSettings({
      ...settings,
      experienceMode: nextMode
    });
  }

  applyExperienceTheme();
  showHome();
}

function renderEngineerPlaceholder(tabKey) {
  if (tabKey === "summary") {
    return `
      <section class="engineer-panel">
        <div class="engineer-panel-title">Estado de sesión</div>
        <div class="engineer-panel-line">Base estructural preparada para integrar estado en vivo y referencias de sesión en fases posteriores.</div>
      </section>
      <section class="engineer-grid engineer-grid-2">
        <article class="engineer-panel">
          <div class="engineer-panel-title">Objetivo del bloque</div>
          <div class="engineer-panel-line">Zona reservada para consolidar lectura global del fin de semana.</div>
        </article>
        <article class="engineer-panel">
          <div class="engineer-panel-title">Checklist de entrada</div>
          <ul class="engineer-list">
            <li>Selección de evento</li>
            <li>Piloto/equipo activo</li>
            <li>Referencia de sesión</li>
          </ul>
        </article>
      </section>
    `;
  }

  if (tabKey === "sectors") {
    return `
      <section class="engineer-grid engineer-grid-3">
        <article class="engineer-panel"><div class="engineer-panel-title">Sector 1</div><div class="engineer-panel-line">Contenedor reservado para delta y estabilidad.</div></article>
        <article class="engineer-panel"><div class="engineer-panel-title">Sector 2</div><div class="engineer-panel-line">Contenedor reservado para referencias de tracción y paso por curva.</div></article>
        <article class="engineer-panel"><div class="engineer-panel-title">Sector 3</div><div class="engineer-panel-line">Contenedor reservado para cierre de vuelta y velocidad punta.</div></article>
      </section>
      <section class="engineer-panel">
        <div class="engineer-panel-title">Lectura de sectores</div>
        <div class="engineer-panel-line">Espacio preparado para tabla de comparación sectorial en próximas fases.</div>
      </section>
    `;
  }

  if (tabKey === "stint") {
    return `
      <section class="engineer-panel">
        <div class="engineer-panel-title">Plan de stint</div>
        <div class="engineer-panel-line">Bloque base para ritmo por vuelta, degradación y ventana de parada.</div>
      </section>
      <section class="engineer-grid engineer-grid-2">
        <article class="engineer-panel"><div class="engineer-panel-title">Stint actual</div><div class="engineer-panel-line">Zona reservada para vueltas y tendencia.</div></article>
        <article class="engineer-panel"><div class="engineer-panel-title">Stint objetivo</div><div class="engineer-panel-line">Zona reservada para simulación y margen de estrategia.</div></article>
      </section>
    `;
  }

  if (tabKey === "comparisons") {
    return `
      <section class="engineer-panel">
        <div class="engineer-panel-title">Comparativa principal</div>
        <div class="engineer-panel-line">Estructura lista para enfrentar piloto A vs piloto B o equipo vs equipo.</div>
      </section>
      <section class="engineer-grid engineer-grid-2">
        <article class="engineer-panel"><div class="engineer-panel-title">Referencia A</div><div class="engineer-panel-line">Contenedor de métricas clave.</div></article>
        <article class="engineer-panel"><div class="engineer-panel-title">Referencia B</div><div class="engineer-panel-line">Contenedor de métricas clave.</div></article>
      </section>
    `;
  }

  return `
    <section class="engineer-panel">
      <div class="engineer-panel-title">Evolución de rendimiento</div>
      <div class="engineer-panel-line">Área estructural para introducir timeline de métricas en siguientes fases.</div>
    </section>
    <section class="engineer-grid engineer-grid-2">
      <article class="engineer-panel"><div class="engineer-panel-title">Ventana corta</div><div class="engineer-panel-line">Reservado para tendencia por tanda/sesión.</div></article>
      <article class="engineer-panel"><div class="engineer-panel-title">Ventana amplia</div><div class="engineer-panel-line">Reservado para evolución de fin de semana.</div></article>
    </section>
  `;
}

function renderEngineerMode() {
  const tabs = getEngineerTabs();
  const activeTab = sanitizeEngineerTab(state.engineerActiveTab);

  return `
    <section class="engineer-shell">
      <nav class="engineer-mode-switch" aria-label="Selector de modo">
        <button
          class="engineer-mode-chip ${!state.engineerModeActive && getExperienceMode() === "casual" ? "active" : ""}"
          onclick="handleEngineerModeSwitch('casual')"
          aria-pressed="${!state.engineerModeActive && getExperienceMode() === "casual"}">
          Casual
        </button>
        <button
          class="engineer-mode-chip ${!state.engineerModeActive && getExperienceMode() === "expert" ? "active" : ""}"
          onclick="handleEngineerModeSwitch('expert')"
          aria-pressed="${!state.engineerModeActive && getExperienceMode() === "expert"}">
          Experto
        </button>
        <button
          class="engineer-mode-chip ${state.engineerModeActive ? "active" : ""}"
          onclick="handleEngineerModeSwitch('engineer')"
          aria-pressed="${state.engineerModeActive}">
          Ingeniero
        </button>
      </nav>

      <header class="engineer-header">
        <div class="engineer-title-wrap">
          <div class="engineer-kicker">Modo técnico</div>
          <h1 class="engineer-title">Ingeniero</h1>
        </div>
      </header>

      <section class="engineer-main">
        <main class="engineer-content">
          ${renderEngineerPlaceholder(activeTab)}
        </main>

        <nav class="engineer-tabs" aria-label="Pestañas del modo Ingeniero">
          ${tabs.map(tab => `
            <button
              class="engineer-tab ${tab.key === activeTab ? "active" : ""}"
              onclick="setEngineerTab('${tab.key}')"
              aria-pressed="${tab.key === activeTab}">
              ${tab.label}
            </button>
          `).join("")}
        </nav>
      </section>
    </section>
  `;
}

function showEngineerMode() {
  state.engineerModeActive = true;
  applyEngineerModeState();
  setActiveNav();
  contentEl().innerHTML = renderEngineerMode();
}

/* ===== GLOSARIO RÁPIDO CON ⓘ ===== */

function escapeForSingleQuotedAttr(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

function getGlossaryDefinitionPriority(item) {
  const expert = isExpertMode();
  const easyText = item.easy || item.short || "";
  const technicalText = item.short || item.easy || "";

  if (expert) {
    return {
      primaryLabel: "Experto",
      primaryText: technicalText,
      secondaryLabel: "Casual",
      secondaryText: easyText
    };
  }

  return {
    primaryLabel: "Casual",
    primaryText: easyText,
    secondaryLabel: "Experto",
    secondaryText: technicalText
  };
}

function renderGlossaryInfoButton(term) {
  const safeTerm = escapeForSingleQuotedAttr(term);

  return `
    <button
      type="button"
      class="glossary-info-btn"
      onclick="openGlossaryQuickTerm('${safeTerm}')"
      aria-label="Ver definición de ${escapeHtml(term)}"
      title="Definición rápida"
    >ⓘ</button>
  `;
}

function renderGlossaryTermWithInfo(item) {
  return `
    <div class="glossary-term-head">
      <strong class="glossary-term-name">${escapeHtml(item.term)}</strong>
      ${renderGlossaryInfoButton(item.term)}
    </div>
  `;
}

function renderGlossaryDefinitionBlocks(item, { compact = false } = {}) {
  const definitions = getGlossaryDefinitionPriority(item);
  const secondaryClass = compact ? "glossary-definition-secondary glossary-definition-secondary-compact" : "glossary-definition-secondary";

  return `
    <div class="glossary-definitions${compact ? " glossary-definitions-compact" : ""}">
      <div class="glossary-definition-primary">
        <strong>${definitions.primaryLabel}</strong><br>
        ${escapeHtml(definitions.primaryText)}
      </div>
      <div class="${secondaryClass}">
        <strong>${definitions.secondaryLabel}</strong><br>
        ${escapeHtml(definitions.secondaryText)}
      </div>
    </div>
  `;
}

function renderGlossaryTermMeta(item, { compact = false } = {}) {
  return `
    <div class="news-meta-row${compact ? " glossary-meta-row-compact" : " glossary-meta-row"}">
      <span class="tag ${getGlossaryLevelTagClass(item.level)}">${escapeHtml(item.level)}</span>
      <span class="tag general">${escapeHtml(item.sectionTitle || "Glosario F1")}</span>
    </div>
  `;
}

function renderGlossaryFocusCard(item) {
  if (!item) return "";

  return `
    <div class="card highlight-card glossary-focus-card">
      <div class="mini-pill">TÉRMINO DESTACADO</div>
      <div class="card-title">${escapeHtml(item.term)}</div>
      

      ${renderGlossaryTermMeta(item)}
      ${renderGlossaryDefinitionBlocks(item)}
    </div>
  `;
}

function openGlossaryQuickTerm(term) {
  const item = findGlossaryItemByTerm(term);
  if (!item) return;

  const safeTerm = escapeForSingleQuotedAttr(item.term);

  openDetailModal(`
    <div class="card glossary-modal-card" style="margin-bottom:0;">
      ${renderGlossaryTermMeta(item, { compact: true })}
      <div class="card-title">${escapeHtml(item.term)}</div>
      ${renderGlossaryDefinitionBlocks(item, { compact: true })}

      <div class="quick-row glossary-modal-actions">
        <a
          href="#"
          class="btn-secondary"
          onclick="closeDetailModal(); showGlossary('${safeTerm}'); return false;"
        >Abrir glosario</a>
      </div>
    </div>
  `);
}

/* Tarjeta contextual con “Término ⓘ”. */
function renderContextGlossaryCard(screen, phase) {
  const items = getContextGlossaryItems(screen, phase);
  if (!items.length) return "";

  const copy = getContextGlossaryTitle(screen, phase);

  return `
    <div class="card glossary-context-card">
      <div class="card-title">${escapeHtml(copy.title)}</div>
      

      <div class="insight-list glossary-context-list">
        ${items.map(item => `
          <div class="insight-item glossary-context-item">
            ${renderGlossaryTermMeta(item, { compact: true })}
            ${renderGlossaryTermWithInfo(item)}
            <div class="glossary-context-easy-copy">
              ${escapeHtml(item.easy)}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/* Secciones del glosario completo con “Término ⓘ”. */
function renderGlossarySection(section) {
  return `
    <div class="card glossary-section-card">
      <div class="card-title">${escapeHtml(section.title)}</div>
      

      <div class="insight-list glossary-term-list">
        ${section.items.map(item => `
          <div class="insight-item glossary-term-item">
            ${renderGlossaryTermMeta(item, { compact: true })}
            ${renderGlossaryTermWithInfo(item)}
            ${renderGlossaryDefinitionBlocks(item, { compact: true })}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/* Permite abrir glosario enfocado en un término. */
function showGlossary(focusTerm = null) {
  setActiveNav("nav-more");
  rememberScreen("glossary");
  updateSubtitle();

  const sections = getGlossarySections();
  const focusItem = focusTerm ? findGlossaryItemByTerm(focusTerm) : null;

  contentEl().innerHTML = `
    <div class="card highlight-card glossary-hero-card app-panel-card">
      <div class="card-title">Glosario</div>
      <div class="app-hero-subline">Consulta rápida de términos.</div>
    </div>
    ${focusItem ? renderGlossaryFocusCard(focusItem) : ""}
    <div class="card app-panel-card">
      ${sections.map(renderGlossarySection).join("")}
    </div>
  `;
}

window.showGlossary = showGlossary;
window.openGlossaryQuickTerm = openGlossaryQuickTerm;
window.renderContextGlossaryCard = renderContextGlossaryCard;

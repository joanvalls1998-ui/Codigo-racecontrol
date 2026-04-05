/* ===== GLOSARIO RÁPIDO CON ⓘ ===== */

function escapeForSingleQuotedAttr(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

function renderGlossaryInfoButton(term) {
  const safeTerm = escapeForSingleQuotedAttr(term);

  return `
    <button
      type="button"
      onclick="openGlossaryQuickTerm('${safeTerm}')"
      aria-label="Ver definición de ${escapeHtml(term)}"
      style="
        border:none;
        background:transparent;
        color:rgba(255,255,255,0.72);
        font:inherit;
        font-size:16px;
        line-height:1;
        cursor:pointer;
        padding:0;
        margin-left:6px;
      "
    >ⓘ</button>
  `;
}

function renderGlossaryTermWithInfo(item) {
  return `
    <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
      <strong>${escapeHtml(item.term)}</strong>
      ${renderGlossaryInfoButton(item.term)}
    </div>
  `;
}

function renderGlossaryFocusCard(item) {
  if (!item) return "";

  return `
    <div class="card highlight-card">
      <div class="mini-pill">TÉRMINO DESTACADO</div>
      <div class="card-title">${escapeHtml(item.term)}</div>

      <div class="news-meta-row" style="margin-top:10px;">
        <span class="tag ${getGlossaryLevelTagClass(item.level)}">${escapeHtml(item.level)}</span>
        <span class="tag general">${escapeHtml(item.sectionTitle || "Glosario F1")}</span>
      </div>

      <div class="insight-list" style="margin-top:14px;">
        <div class="insight-item">
          <strong>Casual</strong><br>
          ${escapeHtml(item.easy || item.short || "")}
        </div>
        <div class="insight-item">
          <strong>Experto</strong><br>
          ${escapeHtml(item.short || item.easy || "")}
        </div>
      </div>
    </div>
  `;
}

function openGlossaryQuickTerm(term) {
  const item = findGlossaryItemByTerm(term);
  if (!item) return;

  const safeTerm = escapeForSingleQuotedAttr(item.term);

  openDetailModal(`
    <div class="card" style="margin-bottom:0;">
      <div class="news-meta-row" style="margin-bottom:10px;">
        <span class="tag ${getGlossaryLevelTagClass(item.level)}">${escapeHtml(item.level)}</span>
        <span class="tag general">${escapeHtml(item.sectionTitle || "Glosario F1")}</span>
      </div>

      <div class="card-title">${escapeHtml(item.term)}</div>

      <div class="insight-list" style="margin-top:14px;">
        <div class="insight-item">
          <strong>Casual</strong><br>
          ${escapeHtml(item.easy || item.short || "")}
        </div>
        <div class="insight-item">
          <strong>Experto</strong><br>
          ${escapeHtml(item.short || item.easy || "")}
        </div>
      </div>

      <div class="quick-row" style="margin-top:14px;">
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
    <div class="card">
      <div class="card-title">${escapeHtml(copy.title)}</div>
      <div class="card-sub">${escapeHtml(copy.sub)}</div>

      <div class="insight-list" style="margin-top:12px;">
        ${items.map(item => `
          <div class="insight-item">
            <div class="news-meta-row" style="margin-bottom:8px;">
              <span class="tag ${getGlossaryLevelTagClass(item.level)}">${escapeHtml(item.level)}</span>
            </div>
            ${renderGlossaryTermWithInfo(item)}
            <div style="margin-top:6px;">
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
    <div class="card">
      <div class="card-title">${escapeHtml(section.title)}</div>
      <div class="card-sub">${escapeHtml(section.subtitle)}</div>

      <div class="insight-list" style="margin-top:12px;">
        ${section.items.map(item => `
          <div class="insight-item">
            <div class="news-meta-row" style="margin-bottom:8px;">
              <span class="tag ${getGlossaryLevelTagClass(item.level)}">${escapeHtml(item.level)}</span>
            </div>
            ${renderGlossaryTermWithInfo(item)}
            <div style="margin-top:6px; color: rgba(255,255,255,0.92);">
              ${escapeHtml(item.short)}
            </div>
            <div style="margin-top:4px; color: rgba(255,255,255,0.62);">
              ${escapeHtml(item.easy)}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/* Permite abrir glosario enfocado en un término. */
function showGlossary(focusTerm = null) {
  setActiveNav("nav-more");
  updateSubtitle();

  const sections = getGlossarySections();
  const focusItem = focusTerm ? findGlossaryItemByTerm(focusTerm) : null;

  contentEl().innerHTML = `
    <div class="card highlight-card">
      <div class="mini-pill">GLOSARIO</div>
      <div class="card-title">Glosario F1</div>

      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-tile">
          <div class="meta-kicker">Básico</div>
          <div class="meta-value" style="font-size:18px;">Esencial</div>
          <div class="meta-caption">Para entender retransmisiones y titulares</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Muy usado</div>
          <div class="meta-value" style="font-size:18px;">Habitual</div>
          <div class="meta-caption">Sale mucho en análisis y radios</div>
        </div>
        <div class="meta-tile">
          <div class="meta-kicker">Actual 2026</div>
          <div class="meta-value" style="font-size:18px;">Nuevo</div>
          <div class="meta-caption">Términos del reglamento moderno</div>
        </div>
      </div>
    </div>

    ${focusItem ? renderGlossaryFocusCard(focusItem) : ""}

    ${sections.map(renderGlossarySection).join("")}
  `;
}

window.showGlossary = showGlossary;
window.openGlossaryQuickTerm = openGlossaryQuickTerm;
window.renderContextGlossaryCard = renderContextGlossaryCard;

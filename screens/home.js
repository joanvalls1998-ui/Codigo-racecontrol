/* ===== HOME COMPACTA REAL ===== */

function renderHomeDynamicBlocks(context, favorite) {
  return `
    ${renderHomePhaseHero(context)}
    ${renderHomeNowCard(context, favorite)}
    ${renderHomeQuickLinks(context)}
  `;
}

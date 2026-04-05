/* ===== HOME COMPACTA REAL ===== */

function renderHomeDynamicBlocks(context, favorite) {
  const settings = getSettings();

  if (settings.homeCompactMode) {
    return `
      ${renderHomePhaseHero(context)}
      ${renderHomeNowCard(context, favorite)}
      ${renderHomeQuickLinks(context)}
    `;
  }

  return `
    ${renderHomePhaseHero(context)}
    ${renderHomeNowCard(context, favorite)}
    ${renderHomeWhatToWatchCard(context)}
    ${renderHomePhaseSummaryCard(context, favorite)}
    ${renderHomeQuickLinks(context)}
  `;
}

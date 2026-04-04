window.__racecontrolScriptLoaded = true;

/* =========================================================
   1. STATE
========================================================= */

const state = {
  standingsCache: null,
  calendarCache: null,
  newsCache: {},
  predictCache: {},
  weekendContext: null,
  detectedNextRaceName: null,
  lastPredictData: null,
  lastPredictContext: null,
  standingsDelta: { drivers: {}, teams: {} },

  ui: {
    currentTab: "home",
    standingsViewType: "drivers",
    standingsScope: "top10",
    currentNewsFilterKey: "favorite"
  }
};

/* =========================================================
   2. DOM HELPERS
========================================================= */

// contentEl()
// modalEl()
// modalContentEl()
// setActiveNav()
// openDetailModal()
// closeDetailModal()

/* =========================================================
   3. STORAGE / SETTINGS
========================================================= */

// safeJsonParse()
// getDefaultFavorite()
// getDefaultSettings()
// normalizeFavorite()
// getFavorite()
// saveFavorite()
// getSettings()
// saveSettings()
// getUiState()
// saveUiState()
// applyStoredUiState()
// clearPredictionHistory()
// clearAllLocalData()
// resetAllDataAndReboot()

/* =========================================================
   4. GENERIC UTILS
========================================================= */

// escapeHtml()
// clamp()
// normalizeText()
// containsAny()
// unique()
// formatNewsDate()
// formatDateTimeShort()
// formatCalendarDateRange()
// formatSessionDateTime()
// formatSessionCircuitDateTime()
// getCountdownToSession()

/* =========================================================
   5. STATIC DATA / MAPS
========================================================= */

// getPredictRaceOptions()
// getRaceHeuristics()
// getTeamData()
// getTeamColorClass()
// getTeamLogo()
// OFFICIAL_2026_SESSION_CONFIG
// getOfficialSessionConfig()
// mapCalendarEventToPredictRace()
// getCircuitAssetByRaceName()

/* =========================================================
   6. DATA FETCHERS
========================================================= */

// fetchStandingsData()
// fetchCalendarData()
// fetchNewsDataForFavorite()
// fetchPredictData()

/* =========================================================
   7. DATA NORMALIZATION / CONTEXT
========================================================= */

// refreshFavoriteFromStandings()
// saveStandingsSnapshot()
// computeStandingsDelta()
// getNextRaceFromCalendar()
// buildWeekendSessionsFromEvent()
// decorateSessionsWithStatus()
// buildWeekendContext()
// getHomeWeekendContext()
// getSelectedRace()
// saveSelectedRace()

/* =========================================================
   8. CIRCUITS / VISUAL HELPERS
========================================================= */

// renderCircuitThumb(raceName, size = 72)
// renderChip()
// renderStatTile()
// renderInfoRow()
// renderSectionTitle()

/* =========================================================
   9. SHARED RENDER BLOCKS
========================================================= */

// renderLoadingCard()
// renderErrorCard()
// renderFavoriteHero()
// renderCompactNewsList()
// renderSimpleListCard()
// renderSimpleGridCard()
// renderCircuitHeroCard()

/* =========================================================
   10. HOME
========================================================= */

// renderHomeMainStatusCard()
// renderHomeQuickLinks()
// renderHomeNewsCard()
// renderHomeTeamStatusCard()
// showHome()

/* =========================================================
   11. PREDICTION
========================================================= */

// formatPredictResponse()
// formatFavoritePredictionText()
// getActivePredictDataForRace()
// getPredictLocalEstimate()
// getPredictScenarios()
// getPredictKeyFactors()
// getQualyRaceBalance()
// getStrategyNarrative()
// getPredictGridRead()
// renderPredictHero()
// renderPredictSummarySection()
// renderPredictScenariosSection()
// renderPredictKeysSection()
// renderPredictQualyRaceSection()
// renderPredictStrategySection()
// renderPredictGridSection()
// renderPredictionHistory()
// runPredict()
// refreshPredict()
// showPredict()

/* =========================================================
   12. FAVORITE
========================================================= */

// getFavoriteMetrics()
// getTrendInfo()
// getFavoriteStrengthWindow()
// getFavoriteWeekendObjective()
// getCircuitDemandProfile()
// getFavoriteCircuitFit()
// getFavoriteComparisonBreakdown()
// getFavoriteDirectRivals()
// renderFavoriteObjectiveSection()
// renderFavoriteTechnicalSection()
// renderFavoriteCircuitFitSection()
// renderFavoriteComparisonSection()
// renderFavoriteRivalsSection()
// showFavorito()

/* =========================================================
   13. NEWS
========================================================= */

// buildNewsFilterPresets()
// getActiveNewsFilter()
// switchNewsFilter()
// categorizeNewsItem()
// getNewsRecencyScore()
// getNewsCategoryWeight()
// scoreNewsItem()
// sortNewsItems()
// renderNewsHeader()
// renderFeaturedNews()
// renderNewsListItem()
// refreshCurrentNews()
// showNews()

/* =========================================================
   14. CALENDAR
========================================================= */

// getCalendarFormatLabel()
// getCalendarEventNarrative()
// renderCalendarHero()
// renderCalendarEventCard()
// showCalendar()
// refreshCalendar()

/* =========================================================
   15. SESSIONS
========================================================= */

// getSessionStatusLabel()
// getSessionStatusTagClass()
// renderSessionsHero()
// renderSessionCard()
// showSessions()

/* =========================================================
   16. STANDINGS
========================================================= */

// getStandingsOverviewData()
// renderStandingsOverviewCard()
// renderStandingsBattleCard()
// renderStandingsSummaryBlock()
// driverRow()
// teamRow()
// setFavoriteDriver()
// setFavoriteTeam()
// setStandingsView()
// setStandingsScope()
// showDriversStandings()
// showTeamsStandings()
// showStandings()
// refreshStandings()

/* =========================================================
   17. MORE / SETTINGS / GLOSSARY
========================================================= */

// getGlossarySections()
// findGlossaryItemByTerm()
// openGlossaryTerm()
// renderGlossarySection()
// showGlossary()
// togglePremiumSetting()
// resetFavoriteToDefault()
// clearSelectedRaceSetting()
// showSettingsPanel()
// showMore()

/* =========================================================
   18. BOOT
========================================================= */

// updateSubtitle()
// renderBootError()
// repairLocalStorageState()
// bootRaceControl()

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootRaceControl);
} else {
  bootRaceControl();
}
import { DEFAULT_YEAR, apiError, getEntities, parseYear } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    const sessionKey = String(req.query?.session_key || "").trim();
    const type = String(req.query?.type || "driver").trim() === "team" ? "team" : "driver";

    if (year !== DEFAULT_YEAR) {
      return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    }
    if (!sessionKey) {
      return apiError(res, 400, "Falta session_key", "MISSING_SESSION_KEY");
    }

    const entities = await getEntities(sessionKey);
    const payload = type === "team" ? entities.teams : entities.drivers;

    return res.status(200).json({
      year,
      session_key: sessionKey,
      type,
      entities: payload,
      drivers: entities.drivers,
      teams: entities.teams
    });
  } catch (_error) {
    return apiError(res, 502, "No se pudieron resolver participantes de esta sesión", "ENTITIES_UNAVAILABLE");
  }
}

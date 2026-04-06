import { DEFAULT_YEAR, apiError, getDrivers, parseYear } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    const sessionKey = String(req.query?.session_key || "").trim();

    if (year !== DEFAULT_YEAR) return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    if (!sessionKey) return apiError(res, 400, "Falta session_key", "MISSING_SESSION_KEY");

    const drivers = await getDrivers(sessionKey);
    return res.status(200).json({ year, session_key: sessionKey, drivers });
  } catch {
    return apiError(res, 502, "No se pudieron resolver pilotos de esta sesión", "DRIVERS_UNAVAILABLE");
  }
}

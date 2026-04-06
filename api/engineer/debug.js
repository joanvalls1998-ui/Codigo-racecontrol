import { DEFAULT_YEAR, apiError, buildTelemetryDebugReport, parseYear } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  const allowDebug = process.env.NODE_ENV !== "production" || process.env.ENGINEER_DEBUG_API === "1";
  if (!allowDebug) {
    return apiError(res, 403, "Debug endpoint deshabilitado en producción", "DEBUG_DISABLED");
  }

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    const gp = String(req.query?.gp || req.query?.meeting_key || "").trim();
    const session = String(req.query?.session || req.query?.session_key || req.query?.session_type || "").trim();
    const driver = String(req.query?.driver || req.query?.driver_number || "").trim();

    if (year !== DEFAULT_YEAR) {
      return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    }

    const report = await buildTelemetryDebugReport({ year, gp, session, driver });
    return res.status(200).json(report);
  } catch {
    return apiError(res, 502, "No se pudo construir el diagnóstico de telemetría", "DEBUG_UNAVAILABLE");
  }
}

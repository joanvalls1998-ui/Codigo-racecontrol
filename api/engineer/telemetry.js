import { DEFAULT_YEAR, apiError, buildDriverTelemetry, parseYear } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    const meetingKey = String(req.query?.meeting_key || "").trim();
    const sessionKey = String(req.query?.session_key || "").trim();
    const driverNumber = String(req.query?.driver_number || "").trim();
    const lapMode = String(req.query?.lap_mode || "reference").trim().toLowerCase();
    const manualLap = String(req.query?.manual_lap || "").trim();

    if (year !== DEFAULT_YEAR) return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    if (!meetingKey || !sessionKey || !driverNumber) {
      return apiError(res, 400, "Faltan parámetros GP + sesión + piloto", "MISSING_PARAMS");
    }

    const payload = await buildDriverTelemetry({
      year,
      meetingKey,
      sessionKey,
      driverNumber,
      lapMode,
      manualLap
    });

    return res.status(200).json(payload);
  } catch (error) {
    if (error?.code === "MEETING_NOT_FOUND") return apiError(res, 404, "GP no válido para 2026", "MEETING_NOT_FOUND");
    if (error?.code === "SESSION_NOT_FOUND") return apiError(res, 404, "Sesión no disponible para este GP", "SESSION_NOT_FOUND");
    if (error?.code === "DRIVER_NOT_FOUND") return apiError(res, 404, "Piloto no disponible en esta sesión", "DRIVER_NOT_FOUND");
    if (error?.code === "NO_TELEMETRY") {
      return apiError(res, 404, "No hay telemetría histórica disponible para este piloto en esta sesión.", "NO_TELEMETRY");
    }
    if (error?.code === "MANUAL_LAP_UNAVAILABLE") {
      return apiError(res, 404, "La vuelta manual seleccionada no tiene trazas útiles.", "MANUAL_LAP_UNAVAILABLE");
    }
    return apiError(res, 502, "No se pudo construir la telemetría del piloto", "TELEMETRY_UNAVAILABLE");
  }
}

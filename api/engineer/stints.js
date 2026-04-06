import { DEFAULT_YEAR, apiError, buildComparison, parseYear } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    const meetingKey = String(req.query?.meeting_key || "").trim();
    const sessionKey = String(req.query?.session_key || "").trim();
    const type = String(req.query?.type || "driver").trim() === "team" ? "team" : "driver";
    const a = String(req.query?.a || "").trim();
    const b = String(req.query?.b || "").trim();

    if (year !== DEFAULT_YEAR) return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    if (!meetingKey || !sessionKey || !a || !b) return apiError(res, 400, "Faltan parámetros para la comparación", "MISSING_PARAMS");

    const data = await buildComparison({ year, meetingKey, sessionKey, type, a, b });
    return res.status(200).json({
      year: data.year,
      meeting_key: data.meeting_key,
      session_key: data.session_key,
      type: data.type,
      stints: data.blocks?.stints || null
    });
  } catch {
    return apiError(res, 502, "No se pudo construir el bloque de stint", "STINTS_UNAVAILABLE");
  }
}

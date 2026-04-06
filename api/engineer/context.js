import { DEFAULT_YEAR, apiError, parseYear, resolveTelemetryContext } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    const meetingKey = String(req.query?.meeting_key || "").trim();
    const sessionType = String(req.query?.session_type || "").trim();
    const type = String(req.query?.type || "driver").trim() === "team" ? "team" : "driver";
    const a = String(req.query?.a || "").trim();
    const b = String(req.query?.b || "").trim();

    if (year !== DEFAULT_YEAR) {
      return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    }

    const payload = await resolveTelemetryContext({ year, meetingKey, sessionType, type, a, b });
    return res.status(200).json(payload);
  } catch (_error) {
    return apiError(res, 502, "No se pudo resolver el contexto técnico del Ingeniero", "CONTEXT_UNAVAILABLE");
  }
}

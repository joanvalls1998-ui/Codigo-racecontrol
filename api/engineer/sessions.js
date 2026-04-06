import { DEFAULT_YEAR, apiError, getSessions, parseYear } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    const meetingKey = String(req.query?.meeting_key || "").trim();

    if (year !== DEFAULT_YEAR) {
      return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    }
    if (!meetingKey) {
      return apiError(res, 400, "Falta meeting_key", "MISSING_MEETING_KEY");
    }

    const sessions = await getSessions(meetingKey, year);
    return res.status(200).json({ year, meeting_key: meetingKey, sessions });
  } catch (_error) {
    return apiError(res, 502, "No se pudieron cargar sesiones para este GP", "SESSIONS_UNAVAILABLE");
  }
}

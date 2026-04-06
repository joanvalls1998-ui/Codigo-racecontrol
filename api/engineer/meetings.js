import { DEFAULT_YEAR, apiError, getMeetings, parseYear } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    if (year !== DEFAULT_YEAR) {
      return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    }

    const meetings = await getMeetings(year);
    return res.status(200).json({ year, meetings });
  } catch (error) {
    return apiError(res, 502, "No se pudieron cargar meetings de 2026", "MEETINGS_UNAVAILABLE");
  }
}

import { DEFAULT_YEAR, apiError, buildRaceOptiCoverageReport, parseYear } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  const providedToken = String(req.query?.token || req.headers["x-engineer-debug-token"] || "").trim();
  const expectedToken = String(process.env.ENGINEER_DEBUG_TOKEN || "").trim();
  if (!expectedToken || !providedToken || providedToken !== expectedToken) {
    return apiError(res, 403, "Endpoint protegido", "FORBIDDEN");
  }

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    if (year !== DEFAULT_YEAR) return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    const report = await buildRaceOptiCoverageReport({ year });
    return res.status(200).json(report);
  } catch {
    return apiError(res, 502, "No se pudo validar cobertura RaceOptiData", "COVERAGE_UNAVAILABLE");
  }
}

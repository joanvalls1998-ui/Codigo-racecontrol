import { DEFAULT_YEAR, apiError, getMeetings, parseYear } from "./_core.js";
import { getSnapshotIndex, summarizeMeetingReadiness } from "./_snapshots.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");
  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    if (year !== DEFAULT_YEAR) {
      return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    }
    const [meetings, index] = await Promise.all([getMeetings(year), getSnapshotIndex()]);
    const summary = summarizeMeetingReadiness(index, meetings);
    return res.status(200).json({
      year,
      retry_policy: {
        t_plus_minutes: 20,
        retry_minutes: 10,
        max_retries: 18
      },
      index,
      summary
    });
  } catch (error) {
    return apiError(res, 500, `Snapshot status unavailable: ${String(error?.message || "UNKNOWN")}`, "SNAPSHOT_STATUS_UNAVAILABLE");
  }
}

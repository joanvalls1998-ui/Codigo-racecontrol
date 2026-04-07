import { DEFAULT_YEAR, apiError, buildDriverTelemetry, parseYear } from "./_core.js";
import { isSnapshotStale, persistTelemetrySnapshot, readTelemetrySnapshot, snapshotLog } from "./_snapshots.js";

function buildSnapshotParams({ year, meetingKey, sessionKey, driverNumber, mode }) {
  return {
    year,
    meetingKey,
    sessionKey,
    driverNumber,
    mode: mode === "core" ? "core" : "full"
  };
}

function responseFromSnapshot(snapshot = {}, status = "hit") {
  const payload = snapshot?.payload || null;
  if (!payload || typeof payload !== "object") return null;
  return {
    ...payload,
    snapshot: {
      id: snapshot.snapshot_id || "",
      status,
      freshness: snapshot.freshness || {}
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");

  try {
    const year = parseYear(req.query?.year ?? DEFAULT_YEAR);
    const meetingKey = String(req.query?.meeting_key || "").trim();
    const sessionKey = String(req.query?.session_key || "").trim();
    const driverNumber = String(req.query?.driver_number || "").trim();
    const mode = String(req.query?.mode || "full").trim().toLowerCase();
    const includeHeavy = mode !== "core";

    if (year !== DEFAULT_YEAR) return apiError(res, 400, "Ingeniero solo admite temporada 2026", "INVALID_YEAR");
    if (!meetingKey || !sessionKey || !driverNumber) {
      return apiError(res, 400, "Faltan parámetros GP + sesión + piloto", "MISSING_PARAMS");
    }

    const snapshotParams = buildSnapshotParams({ year, meetingKey, sessionKey, driverNumber, mode });
    snapshotLog("snapshot_lookup_started", {
      year,
      meeting_key: meetingKey,
      session_key: sessionKey,
      driver_number: driverNumber,
      mode: snapshotParams.mode
    });

    const storedSnapshot = await readTelemetrySnapshot(snapshotParams);
    if (storedSnapshot && !isSnapshotStale(storedSnapshot)) {
      snapshotLog("snapshot_hit", {
        snapshot_id: storedSnapshot.snapshot_id,
        year,
        meeting_key: meetingKey,
        session_key: sessionKey,
        driver_number: driverNumber,
        mode: snapshotParams.mode
      });
      const cachedPayload = responseFromSnapshot(storedSnapshot, "ready");
      if (cachedPayload) return res.status(200).json(cachedPayload);
    }

    if (storedSnapshot) {
      snapshotLog("snapshot_stale", {
        snapshot_id: storedSnapshot.snapshot_id,
        year,
        meeting_key: meetingKey,
        session_key: sessionKey,
        driver_number: driverNumber,
        mode: snapshotParams.mode
      });
    } else {
      snapshotLog("snapshot_miss", {
        year,
        meeting_key: meetingKey,
        session_key: sessionKey,
        driver_number: driverNumber,
        mode: snapshotParams.mode
      });
    }

    snapshotLog("snapshot_generation_started", {
      year,
      meeting_key: meetingKey,
      session_key: sessionKey,
      driver_number: driverNumber,
      mode: snapshotParams.mode,
      trigger: "runtime_fallback"
    });

    const payload = await buildDriverTelemetry({ year, meetingKey, sessionKey, driverNumber, includeHeavy });
    const persisted = await persistTelemetrySnapshot({
      params: snapshotParams,
      payload,
      source: "runtime_fallback",
      status: "ready"
    });

    snapshotLog("snapshot_generation_completed", {
      snapshot_id: persisted.snapshot_id,
      year,
      meeting_key: meetingKey,
      session_key: sessionKey,
      driver_number: driverNumber,
      mode: snapshotParams.mode,
      trigger: "runtime_fallback"
    });

    const prepared = responseFromSnapshot(persisted, "generated");
    return res.status(200).json(prepared || payload);
  } catch (error) {
    snapshotLog("snapshot_generation_failed", {
      reason: error?.code || "SNAPSHOT_GENERATION_FAILED",
      message: String(error?.message || "")
    });
    if (error?.code === "MEETING_NOT_FOUND") return apiError(res, 404, "GP no válido para 2026", "MEETING_NOT_FOUND");
    if (error?.code === "SESSION_NOT_FOUND") return apiError(res, 404, "Sesión no disponible para este GP", "SESSION_NOT_FOUND");
    if (error?.code === "DRIVER_NOT_FOUND") return apiError(res, 404, "Piloto no disponible en esta sesión", "DRIVER_NOT_FOUND");
    if (error?.code === "NO_TELEMETRY") {
      return apiError(res, 404, "No hay telemetría histórica disponible para este piloto en esta sesión.", "NO_TELEMETRY");
    }
    return apiError(res, 502, "No se pudo construir la telemetría del piloto", "TELEMETRY_UNAVAILABLE");
  }
}

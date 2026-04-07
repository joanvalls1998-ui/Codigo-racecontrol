import { DEFAULT_YEAR, getDrivers, getMeetings, getSessions, buildDriverTelemetry } from "../engineer/_core.js";
import {
  evaluateSessionEligibility,
  getRetryPolicy,
  getSnapshotIndex,
  markSessionSnapshotState,
  persistTelemetrySnapshot,
  registerLatestUsefulMeeting,
  snapshotLog,
  buildSnapshotId
} from "../engineer/_snapshots.js";

function isCronAuthorized(req) {
  const cronSecret = String(process.env.ENGINEER_CRON_SECRET || "").trim();
  if (!cronSecret) return true;
  const header = String(req.headers["x-cron-secret"] || req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  return header === cronSecret;
}

function buildSessionRef(year, session = {}) {
  return `${year}:${session.meeting_key}:${session.session_key}`;
}

function hasUsefulPayload(payload = {}) {
  const summary = payload?.summary || {};
  return Number.isFinite(summary.referenceLap)
    || Number.isFinite(summary.averagePace)
    || Number.isFinite(summary.topSpeed)
    || Number.isFinite(summary.speedTrap)
    || (Array.isArray(payload?.stints?.basic) && payload.stints.basic.length > 0)
    || (Array.isArray(payload?.traces?.speed) && payload.traces.speed.length > 0);
}

async function generateDriverSnapshots({ year, meeting, session, drivers }) {
  let readyDrivers = 0;
  for (const driver of drivers) {
    const params = {
      year,
      meetingKey: meeting.meeting_key,
      sessionKey: session.session_key,
      driverNumber: String(driver.id),
      mode: "full"
    };
    try {
      snapshotLog("snapshot_generation_started", {
        trigger: "cron",
        year,
        meeting_key: meeting.meeting_key,
        session_key: session.session_key,
        driver_number: driver.id,
        snapshot_id: buildSnapshotId(params)
      });
      const payload = await buildDriverTelemetry({
        year,
        meetingKey: meeting.meeting_key,
        sessionKey: session.session_key,
        driverNumber: String(driver.id),
        includeHeavy: true
      });
      if (!hasUsefulPayload(payload)) {
        snapshotLog("session_not_ready_reason", {
          trigger: "cron",
          year,
          meeting_key: meeting.meeting_key,
          session_key: session.session_key,
          driver_number: driver.id,
          reason: "PAYLOAD_NOT_USEFUL"
        });
        continue;
      }
      await persistTelemetrySnapshot({ params, payload, source: "cron", status: "ready" });
      readyDrivers += 1;
      snapshotLog("snapshot_generation_completed", {
        trigger: "cron",
        year,
        meeting_key: meeting.meeting_key,
        session_key: session.session_key,
        driver_number: driver.id
      });
    } catch (error) {
      snapshotLog("snapshot_generation_failed", {
        trigger: "cron",
        year,
        meeting_key: meeting.meeting_key,
        session_key: session.session_key,
        driver_number: driver.id,
        reason: error?.code || "CRON_GENERATION_FAILED",
        message: String(error?.message || "")
      });
    }
  }
  return readyDrivers;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!isCronAuthorized(req)) return res.status(401).json({ error: "Unauthorized cron request" });

  const year = DEFAULT_YEAR;
  const retryPolicy = getRetryPolicy();
  const summary = {
    year,
    checked_sessions: 0,
    eligible_sessions: 0,
    ready_sessions: 0,
    retry_scheduled: 0,
    skipped: [],
    generated: []
  };

  try {
    const [meetings, index] = await Promise.all([getMeetings(year), getSnapshotIndex()]);

    for (const meeting of meetings) {
      const sessions = await getSessions(meeting.meeting_key, year);
      for (const session of sessions) {
        summary.checked_sessions += 1;
        const sessionRef = buildSessionRef(year, session);
        const currentState = index.sessions?.[sessionRef] || null;
        const retries = Number(currentState?.retries || 0);
        const eligibility = evaluateSessionEligibility(session, Date.now());

        if (!eligibility.eligible) {
          snapshotLog("session_not_ready_reason", {
            trigger: "cron",
            year,
            meeting_key: meeting.meeting_key,
            session_key: session.session_key,
            reason: eligibility.reason,
            ready_at_ms: eligibility.ready_at_ms
          });
          summary.skipped.push({
            meeting_key: meeting.meeting_key,
            session_key: session.session_key,
            reason: eligibility.reason
          });
          continue;
        }

        summary.eligible_sessions += 1;

        if (retries >= retryPolicy.max_retries && currentState?.status !== "ready") {
          await markSessionSnapshotState({
            year,
            meetingKey: meeting.meeting_key,
            session,
            status: "failed",
            reason: "MAX_RETRIES_REACHED",
            retries
          });
          summary.skipped.push({
            meeting_key: meeting.meeting_key,
            session_key: session.session_key,
            reason: "MAX_RETRIES_REACHED"
          });
          continue;
        }

        await markSessionSnapshotState({
          year,
          meetingKey: meeting.meeting_key,
          session,
          status: "generating",
          reason: "CRON_WARMING",
          retries
        });

        const drivers = await getDrivers(session.session_key, year);
        const readyDrivers = await generateDriverSnapshots({ year, meeting, session, drivers });

        if (readyDrivers > 0) {
          await markSessionSnapshotState({
            year,
            meetingKey: meeting.meeting_key,
            session,
            status: "ready",
            reason: "SNAPSHOTS_READY",
            retries,
            driversTotal: drivers.length,
            driversReady: readyDrivers
          });
          summary.ready_sessions += 1;
          summary.generated.push({
            meeting_key: meeting.meeting_key,
            session_key: session.session_key,
            drivers_ready: readyDrivers,
            drivers_total: drivers.length
          });
          snapshotLog("session_ready", {
            trigger: "cron",
            year,
            meeting_key: meeting.meeting_key,
            session_key: session.session_key,
            drivers_ready: readyDrivers,
            drivers_total: drivers.length
          });
        } else {
          const nextRetryAt = new Date(Date.now() + retryPolicy.delay_ms).toISOString();
          await markSessionSnapshotState({
            year,
            meetingKey: meeting.meeting_key,
            session,
            status: "retry_scheduled",
            reason: "NO_USEFUL_DATA",
            retries: retries + 1,
            driversTotal: drivers.length,
            driversReady: 0,
            nextRetryAt
          });
          summary.retry_scheduled += 1;
          snapshotLog("retry_scheduled", {
            trigger: "cron",
            year,
            meeting_key: meeting.meeting_key,
            session_key: session.session_key,
            retries: retries + 1,
            next_retry_at: nextRetryAt
          });
        }
      }

      const refreshedIndex = await getSnapshotIndex();
      const meetingSessions = Object.values(refreshedIndex.sessions || {}).filter(item => item.meeting_key === meeting.meeting_key);
      if (meetingSessions.some(item => item.status === "ready")) {
        await registerLatestUsefulMeeting({ year, meeting, sessions: meetingSessions });
      }
    }

    return res.status(200).json({ ok: true, summary, retry_policy: retryPolicy });
  } catch (error) {
    snapshotLog("snapshot_generation_failed", {
      trigger: "cron",
      reason: error?.code || "CRON_FATAL_ERROR",
      message: String(error?.message || "")
    });
    return res.status(500).json({ ok: false, error: String(error?.message || "CRON_FATAL_ERROR"), summary });
  }
}

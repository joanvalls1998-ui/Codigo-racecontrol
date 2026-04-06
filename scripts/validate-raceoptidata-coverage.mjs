#!/usr/bin/env node

const YEAR = 2026;
const OPENF1 = "https://api.openf1.org/v1";
const RACEOPTI = "https://api.raceoptidata.com";
const API_KEY = String(process.env.RACEOPTIDATA_API_KEY || "").trim();

const SESSION_TYPES = ["race", "sprint_race", "qualy", "fp1", "fp2", "fp3", "sprint_qualy"];

function mapSessionType(name = "") {
  const lower = String(name).toLowerCase();
  if (lower.includes("practice 1") || lower === "fp1") return "fp1";
  if (lower.includes("practice 2") || lower === "fp2") return "fp2";
  if (lower.includes("practice 3") || lower === "fp3") return "fp3";
  if (lower.includes("sprint quali") || lower.includes("sprint shootout") || lower.includes("sprint qualifying")) return "sprint_qualy";
  if (lower === "sprint" || lower.includes("sprint race")) return "sprint_race";
  if (lower.includes("qual")) return "qualy";
  if (lower.includes("race")) return "race";
  return "";
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: response.ok, status: response.status, json };
}

async function run() {
  const report = {
    date_utc: new Date().toISOString(),
    year: YEAR,
    has_key: Boolean(API_KEY),
    sample: [],
    matrix: {}
  };
  if (!API_KEY) {
    console.log(JSON.stringify({ error: "RACEOPTIDATA_API_KEY_MISSING", report }, null, 2));
    process.exit(2);
  }

  const meetings = await getJson(`${OPENF1}/meetings?year=${YEAR}`);
  if (!meetings.ok || !Array.isArray(meetings.json)) {
    console.log(JSON.stringify({ error: "OPENF1_MEETINGS_UNAVAILABLE", detail: meetings }, null, 2));
    process.exit(3);
  }
  const sortedMeetings = meetings.json
    .filter(item => String(item.date_start || "").startsWith(String(YEAR)))
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
  const samples = [0, 4, 9, 14, 19].map(i => sortedMeetings[i]).filter(Boolean);

  for (const meeting of samples) {
    const sessionsRes = await getJson(`${OPENF1}/sessions?meeting_key=${meeting.meeting_key}`);
    if (!sessionsRes.ok || !Array.isArray(sessionsRes.json)) continue;
    const sessions = sessionsRes.json
      .map(item => ({ session_key: item.session_key, type_key: mapSessionType(item.session_name), name: item.session_name }))
      .filter(item => item.type_key);
    const sessionByType = new Map(sessions.map(item => [item.type_key, item]));
    report.sample.push({
      meeting_key: meeting.meeting_key,
      location: meeting.location,
      sessions: [...new Set(sessions.map(item => item.type_key))]
    });

    for (const type of SESSION_TYPES) {
      const entry = report.matrix[type] || { tested: 0, raceoptidata_ok: 0, raceoptidata_fail: 0 };
      report.matrix[type] = entry;
      const selected = sessionByType.get(type);
      if (!selected) continue;
      entry.tested += 1;

      const sessionCode = type === "race" ? "R" : type === "sprint_race" ? "S" : type === "qualy" ? "Q" : "";
      if (!sessionCode) {
        entry.raceoptidata_fail += 1;
        continue;
      }
      const bestLapRes = await getJson(`${RACEOPTI}/bestlap/${YEAR}/1?session=${sessionCode}`, {
        headers: { "x-api-key": API_KEY, accept: "application/json" }
      });
      if (bestLapRes.ok) entry.raceoptidata_ok += 1;
      else entry.raceoptidata_fail += 1;
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

run().catch(error => {
  console.error(JSON.stringify({ error: "VALIDATION_SCRIPT_FAILED", detail: String(error?.message || error) }, null, 2));
  process.exit(1);
});

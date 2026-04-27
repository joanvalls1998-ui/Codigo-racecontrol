import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "..", "data", "state.json");

export const DEFAULT_STATE = {
  meta: { updatedAt: null, version: 1 },
  teams: {},
  drivers: {},
  newsSignals: [],
  weeklySnapshots: []
};

export async function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return DEFAULT_STATE;
    }
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const data = JSON.parse(raw);
    return {
      meta: data.meta || DEFAULT_STATE.meta,
      teams: data.teams || {},
      drivers: data.drivers || {},
      newsSignals: Array.isArray(data.newsSignals) ? data.newsSignals : [],
      weeklySnapshots: Array.isArray(data.weeklySnapshots) ? data.weeklySnapshots : []
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function writeState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return true;
}
import { readState, writeState } from "../lib/state-manager.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const currentState = await readState();

    const incomingState = body?.state && typeof body.state === "object" ? body.state : {};
    const nextState = {
      meta: {
        updatedAt: new Date().toISOString(),
        version: incomingState?.meta?.version || 1
      },
      teams: incomingState?.teams || currentState.teams || {},
      drivers: incomingState?.drivers || currentState.drivers || {},
      newsSignals: Array.isArray(incomingState?.newsSignals) ? incomingState.newsSignals : currentState.newsSignals || [],
      weeklySnapshots: Array.isArray(incomingState?.weeklySnapshots) ? incomingState.weeklySnapshots : currentState.weeklySnapshots || []
    };

    await writeState(nextState);

    return res.status(200).json({
      ok: true,
      message: "state inicializado correctamente",
      state: nextState
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno",
      message: error.message
    });
  }
}
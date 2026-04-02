import { get } from "@vercel/edge-config";

const DEFAULT_STATE = {
  meta: {
    updatedAt: null,
    version: 1
  },
  teams: {},
  drivers: {},
  newsSignals: [],
  weeklySnapshots: []
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const edgeState = await get("state");

    if (
      edgeState &&
      typeof edgeState === "object" &&
      !Array.isArray(edgeState)
    ) {
      return res.status(200).json({
        ok: true,
        source: "edge-config",
        state: {
          meta: edgeState.meta || DEFAULT_STATE.meta,
          teams: edgeState.teams || {},
          drivers: edgeState.drivers || {},
          newsSignals: Array.isArray(edgeState.newsSignals)
            ? edgeState.newsSignals
            : [],
          weeklySnapshots: Array.isArray(edgeState.weeklySnapshots)
            ? edgeState.weeklySnapshots
            : []
        }
      });
    }

    return res.status(200).json({
      ok: true,
      source: "default-empty",
      state: DEFAULT_STATE
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error al leer Edge Config",
      message: error.message
    });
  }
}
import { writeState, DEFAULT_STATE } from "../lib/state-manager.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const resetState = {
      ...DEFAULT_STATE,
      meta: {
        updatedAt: new Date().toISOString(),
        version: 1
      }
    };

    await writeState(resetState);

    return res.status(200).json({
      ok: true,
      message: "state reseteado correctamente",
      state: resetState
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno",
      message: error.message
    });
  }
}
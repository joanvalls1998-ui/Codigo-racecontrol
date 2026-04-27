import { readState } from "../lib/state-manager.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const state = await readState();
    return res.status(200).json({
      ok: true,
      source: "local",
      state
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error al leer state",
      message: error.message
    });
  }
}
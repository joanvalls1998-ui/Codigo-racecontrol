const DEFAULT_STATE = {
  meta: {
    updatedAt: "2026-04-01T00:00:00.000Z",
    version: 1
  },
  teams: {},
  drivers: {},
  newsSignals: [],
  weeklySnapshots: []
};

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function buildEdgeConfigUrl() {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!edgeConfigId) {
    throw new Error("Falta EDGE_CONFIG_ID");
  }

  const url = new URL(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`);

  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  return url.toString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const token = process.env.VERCEL_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "Falta VERCEL_API_TOKEN"
      });
    }

    const body = parseBody(req);
    const incomingState =
      body && typeof body.state === "object" && !Array.isArray(body.state)
        ? body.state
        : DEFAULT_STATE;

    const state = {
      meta: {
        updatedAt: new Date().toISOString(),
        version: incomingState?.meta?.version || 1
      },
      teams: incomingState?.teams || {},
      drivers: incomingState?.drivers || {},
      newsSignals: Array.isArray(incomingState?.newsSignals)
        ? incomingState.newsSignals
        : [],
      weeklySnapshots: Array.isArray(incomingState?.weeklySnapshots)
        ? incomingState.weeklySnapshots
        : []
    };

    const response = await fetch(buildEdgeConfigUrl(), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [
          {
            operation: "upsert",
            key: "state",
            value: state
          }
        ]
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: "No se pudo inicializar Edge Config",
        details: data
      });
    }

    return res.status(200).json({
      ok: true,
      message: "state inicializado correctamente en Edge Config",
      state
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error interno",
      message: error.message
    });
  }
}
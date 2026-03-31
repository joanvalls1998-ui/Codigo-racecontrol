function extractResponseText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    const parts = [];

    for (const item of data.output) {
      if (!Array.isArray(item.content)) continue;

      for (const content of item.content) {
        if (typeof content.text === "string" && content.text.trim()) {
          parts.push(content.text.trim());
        }
      }
    }

    if (parts.length) return parts.join("\n\n");
  }

  return "No se pudo generar la predicción.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const favorite = body.favorite || {
      type: "driver",
      name: "Fernando Alonso",
      team: "Aston Martin",
      number: "14",
      points: "0",
      pos: "22",
      colorClass: "aston"
    };

    const raceName = body.raceName || "GP Miami";

    const focusBlock =
      favorite.type === "team"
        ? `
Centro principal del análisis: equipo ${favorite.name}.
Pilotos del equipo: ${favorite.drivers || "No especificados"}.
No centres la respuesta en Fernando Alonso salvo que el equipo favorito sea Aston Martin.
`
        : `
Centro principal del análisis: piloto ${favorite.name}.
Equipo del piloto: ${favorite.team || "Desconocido"}.
Posición actual estimada: P${favorite.pos || "?"}.
Puntos actuales estimados: ${favorite.points || "0"}.
`;

    const outputFormat =
      favorite.type === "team"
        ? `
Salida en este formato EXACTO:

PREDICCIÓN ${raceName.toUpperCase()}

Favorito seleccionado:
Equipo:
Pilotos:
Ritmo estimado clasificación:
Ritmo estimado carrera:
Probabilidad de puntos dobles (%):
Probabilidad de podio (%):
Probabilidad de DNF del equipo (%):
Probabilidad lluvia (%):
Probabilidad Safety Car (%):
Estrategia más probable:
Número de paradas:
Resumen:
`
        : `
Salida en este formato EXACTO:

PREDICCIÓN ${raceName.toUpperCase()}

Favorito seleccionado:
Piloto:
Equipo:
Predicción clasificación:
Predicción carrera:
Probabilidad de puntos (%):
Probabilidad de DNF (%):
Probabilidad lluvia (%):
Probabilidad Safety Car (%):
Estrategia más probable:
Número de paradas:
Resumen:
`;

    const prompt = `
Actúa como analista de Fórmula 1 en 2026.

Haz una predicción realista para la próxima carrera teniendo en cuenta:
- Forma actual de los equipos
- Ritmo de clasificación
- Ritmo de carrera
- Degradación de neumáticos
- Historial del circuito
- Fiabilidad de los equipos
- Equipos top actuales
- Situación actual del favorito seleccionado

${focusBlock}

No inventes certezas absolutas.
Sé prudente, realista y directo.
La respuesta debe estar en español.

${outputFormat}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenAI error",
        details: data
      });
    }

    const text = extractResponseText(data);

    return res.status(200).json({ result: text });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}
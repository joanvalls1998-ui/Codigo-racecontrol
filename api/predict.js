export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body || {});

  const favorite = body.favorite || {
    type: "driver",
    name: "Fernando Alonso",
    team: "Aston Martin"
  };

  const raceName = body.raceName || "GP Miami";

  const focusText =
    favorite.type === "team"
      ? `El favorito del usuario es el equipo ${favorite.name}.`
      : `El favorito del usuario es ${favorite.name} (${favorite.team}).`;

  const prompt = `
Actúa como analista de Fórmula 1 en 2026.

Haz una predicción realista para ${raceName} teniendo en cuenta:
- Forma actual de los equipos
- Ritmo de clasificación
- Ritmo de carrera
- Degradación de neumáticos
- Historial del circuito
- Fiabilidad de los equipos
- Posibles coches de seguridad
- Posibilidad de lluvia
- Situación del favorito del usuario

${focusText}

Escribe siempre en español de España.

Salida en este formato exacto:

PREDICCIÓN ${raceName.toUpperCase()}

Favorito para la victoria:
Equipos con más ritmo:
Equipos con peor ritmo:

Predicción del favorito en clasificación:
Predicción del favorito en carrera:
Probabilidad de puntos del favorito (%):
Probabilidad de abandono del favorito (%):

Probabilidad de lluvia (%):
Probabilidad de Safety Car (%):

Estrategia más probable:
Número de paradas:
`;

  try {
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

    const text =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "No se pudo generar la predicción.";

    return res.status(200).json({
      result: text,
      raceName,
      favorite
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}
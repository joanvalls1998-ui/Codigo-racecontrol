export default async function handler(req, res) {
  const prompt = `
Actúa como analista de Fórmula 1 en 2026.

Haz una predicción realista para la próxima carrera teniendo en cuenta:
- Forma actual de los equipos
- Ritmo de clasificación
- Ritmo de carrera
- Degradación de neumáticos
- Historial del circuito
- Fiabilidad de los equipos
- Situación actual de Aston Martin y Fernando Alonso

Salida en este formato:

PREDICCIÓN GP MIAMI

Favorito para la victoria:
Equipos con más ritmo:
Equipos con peor ritmo:

Predicción Alonso clasificación:
Predicción Alonso carrera:
Probabilidad de puntos Alonso (%):
Probabilidad de DNF Alonso (%):

Probabilidad lluvia (%):
Probabilidad Safety Car (%):

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
      data.output?.[0]?.content?.[0]?.text ||
      "No se pudo generar la predicción.";

    return res.status(200).json({ result: text });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}

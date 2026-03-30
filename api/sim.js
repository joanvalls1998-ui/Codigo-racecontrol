export default async function handler(req, res) {
  const prompt = `
Actúa como ingeniero de estrategia de Fórmula 1 en 2026.

Quiero una simulación realista del próximo Gran Premio teniendo en cuenta:
- Rendimiento actual de los equipos
- Resultados de las últimas carreras
- Fiabilidad de cada equipo
- Ritmo de carrera vs clasificación
- Probabilidad de Safety Car
- Probabilidad de lluvia
- Estrategias reales usadas en ese circuito
- Reglamento 2026

Salida en este formato:

SIMULACIÓN GP JAPÓN

Ritmo equipos (%):
Mercedes:
Ferrari:
McLaren:
Red Bull:
Aston Martin:
Alpine:
Haas:
Racing Bulls:
Williams:
Audi:
Cadillac:

Predicción clasificación Alonso:
Predicción carrera Alonso:
Probabilidad puntos Alonso (%):
Probabilidad DNF Alonso (%):
Estrategia más probable Alonso:
Vuelta parada:

Probabilidad Safety Car (%):
Probabilidad lluvia (%):

Top 10 estimado carrera:
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.
`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
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

    const text = data.output?.[0]?.content?.[0]?.text || "No se pudo generar la simulación.";
    return res.status(200).json({ result: text });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}

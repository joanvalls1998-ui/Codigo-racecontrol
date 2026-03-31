export default async function handler(req, res) {
  const prompt = `
Actúa como ingeniero de estrategia de Fórmula 1 en 2026.

Simula el próximo Gran Premio con foco en Aston Martin y Fernando Alonso.

Formato:

SIMULACIÓN GP

Ritmo equipos (%):
Mercedes:
Ferrari:
McLaren:
Red Bull:
Aston Martin:

Predicción clasificación Alonso:
Predicción carrera Alonso:
Probabilidad puntos Alonso (%):
Probabilidad DNF Alonso (%):

Probabilidad Safety Car (%):
Probabilidad lluvia (%):

Top 10 carrera:
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
    const text = data.output?.[0]?.content?.[0]?.text || "Error generando simulación.";

    res.status(200).json({ result: text });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

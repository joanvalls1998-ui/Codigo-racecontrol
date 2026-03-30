export default async function handler(req, res) {
  const prompt = `
Actúa como ingeniero de estrategia de Fórmula 1 en 2026.
Haz una simulación realista del GP de Japón.
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
        step: "openai_error",
        data
      });
    }

    return res.status(200).json({
      step: "success",
      data
    });
  } catch (error) {
    return res.status(500).json({
      step: "server_error",
      message: error.message || "Unknown error"
    });
  }
}

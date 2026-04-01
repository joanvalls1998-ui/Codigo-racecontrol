export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
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

  const raceProfiles = {
    "GP de Australia": {
      circuito: "Albert Park",
      tipo: "urbano semipermanente",
      claves: [
        "probabilidad media-alta de Safety Car",
        "clasificación importante",
        "muros cercanos",
        "ventanas estratégicas sensibles"
      ]
    },
    "GP de China": {
      circuito: "Shanghái",
      tipo: "circuito permanente",
      claves: [
        "recta larga",
        "alto castigo al neumático delantero izquierdo",
        "importancia de la tracción",
        "posibilidad de estrategias variables"
      ]
    },
    "GP de Japón": {
      circuito: "Suzuka",
      tipo: "circuito permanente",
      claves: [
        "alta exigencia aerodinámica",
        "curvas enlazadas",
        "clasificación muy importante",
        "errores castigados"
      ]
    },
    "GP Miami": {
      circuito: "Miami International Autodrome",
      tipo: "urbano semipermanente",
      claves: [
        "alta probabilidad de Safety Car",
        "temperaturas elevadas",
        "tracción en salidas lentas",
        "degradación media"
      ]
    },
    "GP de Canadá": {
      circuito: "Gilles Villeneuve",
      tipo: "urbano semipermanente",
      claves: [
        "muros cercanos",
        "frenadas fuertes",
        "Safety Car frecuente",
        "oportunidades estratégicas"
      ]
    },
    "GP de Mónaco": {
      circuito: "Montecarlo",
      tipo: "urbano",
      claves: [
        "clasificación decisiva",
        "adelantar es muy difícil",
        "ritmo de carrera condicionado por posición",
        "baja velocidad"
      ]
    },
    "GP de España": {
      circuito: "Barcelona-Catalunya",
      tipo: "circuito permanente",
      claves: [
        "circuito completo para medir coche",
        "degradación relevante",
        "importancia del equilibrio aerodinámico",
        "ritmo de carrera muy representativo"
      ]
    },
    "GP de Austria": {
      circuito: "Red Bull Ring",
      tipo: "circuito permanente",
      claves: [
        "vuelta corta",
        "diferencias pequeñas en clasificación",
        "tracción y potencia importantes",
        "posibilidad de estrategias agresivas"
      ]
    },
    "GP de Gran Bretaña": {
      circuito: "Silverstone",
      tipo: "circuito permanente",
      claves: [
        "alta carga aerodinámica",
        "curvas rápidas",
        "viento variable",
        "sensibilidad al equilibrio del coche"
      ]
    },
    "GP de Bélgica": {
      circuito: "Spa-Francorchamps",
      tipo: "circuito permanente",
      claves: [
        "meteorología cambiante",
        "sectores muy distintos",
        "alta eficiencia aerodinámica importante",
        "estrategia sensible a Safety Car y lluvia"
      ]
    },
    "GP de Hungría": {
      circuito: "Hungaroring",
      tipo: "circuito permanente",
      claves: [
        "adelantar complicado",
        "clasificación muy importante",
        "degradación térmica",
        "ritmo constante clave"
      ]
    },
    "GP de Países Bajos": {
      circuito: "Zandvoort",
      tipo: "circuito permanente",
      claves: [
        "curvas peraltadas",
        "clasificación muy importante",
        "pista estrecha",
        "dificultad para adelantar"
      ]
    },
    "GP de Italia": {
      circuito: "Monza",
      tipo: "circuito permanente",
      claves: [
        "baja carga aerodinámica",
        "velocidad punta",
        "frenadas fuertes",
        "rebufo determinante"
      ]
    },
    "GP de España (Madrid)": {
      circuito: "Madrid",
      tipo: "urbano",
      claves: [
        "tramo urbano exigente",
        "mucha importancia de la confianza en frenada",
        "probable relevancia de clasificación",
        "riesgo medio de incidentes"
      ]
    },
    "GP de Azerbaiyán": {
      circuito: "Bakú",
      tipo: "urbano",
      claves: [
        "recta muy larga",
        "muros cercanos",
        "Safety Car probable",
        "equilibrio entre carga y velocidad punta"
      ]
    },
    "GP de Singapur": {
      circuito: "Marina Bay",
      tipo: "urbano",
      claves: [
        "alta exigencia física",
        "probabilidad elevada de Safety Car",
        "degradación y temperatura importantes",
        "ritmo de carrera prioritario"
      ]
    },
    "GP de Estados Unidos": {
      circuito: "Austin",
      tipo: "circuito permanente",
      claves: [
        "sector 1 muy aerodinámico",
        "fuerte exigencia en neumáticos",
        "baches",
        "mezcla de curvas lentas y rápidas"
      ]
    },
    "GP de México": {
      circuito: "Hermanos Rodríguez",
      tipo: "circuito permanente en altitud",
      claves: [
        "altitud muy alta",
        "menos carga real por densidad del aire",
        "refrigeración importante",
        "recta principal clave"
      ]
    },
    "GP de São Paulo": {
      circuito: "Interlagos",
      tipo: "circuito permanente",
      claves: [
        "meteorología cambiante",
        "vuelta corta",
        "oportunidades estratégicas",
        "Safety Car posible"
      ]
    },
    "GP de Las Vegas": {
      circuito: "Las Vegas Strip Circuit",
      tipo: "urbano",
      claves: [
        "temperaturas bajas",
        "rectas largas",
        "frenadas fuertes",
        "graining posible"
      ]
    },
    "GP de Catar": {
      circuito: "Lusail",
      tipo: "circuito permanente",
      claves: [
        "curvas rápidas",
        "alta carga lateral",
        "desgaste relevante",
        "ritmo sostenido importante"
      ]
    },
    "GP de Abu Dabi": {
      circuito: "Yas Marina",
      tipo: "circuito permanente",
      claves: [
        "tracción en zonas lentas",
        "clasificación relevante",
        "estrategia sensible al tráfico",
        "degradación media"
      ]
    }
  };

  const profile = raceProfiles[raceName] || {
    circuito: raceName,
    tipo: "circuito",
    claves: ["clasificación importante", "ritmo de carrera importante"]
  };

  const favoriteText =
    favorite.type === "team"
      ? `El favorito del usuario es el equipo ${favorite.name}.`
      : `El favorito del usuario es el piloto ${favorite.name}, del equipo ${favorite.team}.`;

  const prompt = `
Actúa como analista experto de Fórmula 1 en 2026.

Tu tarea es hacer una predicción razonada y realista para ${raceName}.

Contexto del circuito:
- Circuito: ${profile.circuito}
- Tipo: ${profile.tipo}
- Factores clave: ${profile.claves.join(", ")}

Contexto del usuario:
- ${favoriteText}

Instrucciones:
- Escribe siempre en español de España.
- Sé realista y prudente.
- No des certezas absolutas.
- Ajusta la predicción al tipo de circuito.
- Si el favorito es un piloto, céntrate en ese piloto.
- Si el favorito es un equipo, céntrate en el rendimiento general del equipo.
- Usa porcentajes coherentes y no exagerados.
- Ten en cuenta:
  - forma reciente de los equipos
  - ritmo a una vuelta
  - ritmo de carrera
  - degradación de neumáticos
  - fiabilidad
  - probabilidad de lluvia
  - probabilidad de Safety Car
  - dificultad para adelantar
  - peso de la clasificación según el circuito

Devuelve la respuesta exactamente en este formato:

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
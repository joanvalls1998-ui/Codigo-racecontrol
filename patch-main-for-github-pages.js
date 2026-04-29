#!/usr/bin/env node
// Parche para convertir main.js a versión estática para GitHub Pages

import { readFileSync, writeFileSync } from 'fs';

const mainJs = readFileSync('main.js.tmp', 'utf-8');

// 1. Reemplazar fetchStandingsData para usar datos estáticos
const standingsStatic = `
async function fetchStandingsData(force = false) {
  if (state.standingsCache && !force) return state.standingsCache;
  
  // Datos estáticos de clasificación (actualizar manualmente cuando cambie)
  const data = {
    updatedAt: new Date().toISOString(),
    drivers: [
      { pos: 1, number: "12", name: "Kimi Antonelli", team: "Mercedes", points: 72 },
      { pos: 2, number: "63", name: "George Russell", team: "Mercedes", points: 63 },
      { pos: 3, number: "16", name: "Charles Leclerc", team: "Ferrari", points: 49 },
      { pos: 4, number: "44", name: "Lewis Hamilton", team: "Ferrari", points: 41 },
      { pos: 5, number: "1", name: "Lando Norris", team: "McLaren", points: 25 },
      { pos: 6, number: "81", name: "Oscar Piastri", team: "McLaren", points: 24 },
      { pos: 7, number: "14", name: "Fernando Alonso", team: "Aston Martin", points: 18 },
      { pos: 8, number: "18", name: "Lance Stroll", team: "Aston Martin", points: 12 },
      { pos: 9, number: "27", name: "Nico Hulkenberg", team: "Haas", points: 8 },
      { pos: 10, number: "23", name: "Alexander Albon", team: "Williams", points: 6 }
    ],
    teams: [
      { pos: 1, team: "Mercedes", points: 135 },
      { pos: 2, team: "Ferrari", points: 90 },
      { pos: 3, team: "McLaren", points: 49 },
      { pos: 4, team: "Aston Martin", points: 30 },
      { pos: 5, team: "Haas", points: 8 },
      { pos: 6, team: "Williams", points: 6 }
    ]
  };
  
  state.standingsCache = data;
  computeStandingsDelta(data);
  refreshFavoriteFromStandings(data);
  return data;
}
`;

// 2. Reemplazar fetchCalendarData para importar datos estáticos
const calendarStatic = `
async function fetchCalendarData(force = false) {
  if (state.calendarCache && !force) return state.calendarCache;
  
  // Importar datos estáticos del calendario
  const { calendarEvents } = await import('./data/calendar-events.js');
  
  const now = new Date();
  let nextRaceAssigned = false;

  const enriched = calendarEvents.map((event) => {
    const endDate = new Date(\`\${event.end}T23:59:59Z\`);
    let status = "upcoming";

    if (endDate < now) {
      status = "completed";
    } else if (!nextRaceAssigned && event.type === "race") {
      status = "next";
      nextRaceAssigned = true;
    }

    return { ...event, status };
  });

  const data = { events: enriched };
  state.calendarCache = data;

  const nextRace = getNextRaceFromCalendar(enriched);
  const mappedRace = mapCalendarEventToPredictRace(nextRace);
  if (mappedRace) state.detectedNextRaceName = mappedRace;

  const favorite = getFavorite();
  state.weekendContext = buildWeekendContext(enriched, favorite);
  state.weekendNowIso = new Date().toISOString();

  return data;
}
`;

// 3. Reemplazar fetchNewsDataForFavorite para evitar CORS (devolver vacío temporalmente)
const newsStatic = `
async function fetchNewsDataForFavorite(favorite, force = false) {
  const cacheKey = getNewsCacheKey(favorite);
  if (state.homeNewsCache[cacheKey] && !force) return state.homeNewsCache[cacheKey];
  
  // Temporalmente devolver noticias vacías (CORS en GitHub Pages)
  // Opción futura: usar Cloudflare Worker para proxy RSS
  const data = {
    favorite,
    items: []
  };
  
  state.homeNewsCache[cacheKey] = data;
  return data;
}
`;

// 4. Reemplazar fetchPredictData para usar Web Worker
const predictStatic = `
async function fetchPredictData(favorite, raceName) {
  // Usar Web Worker para simulaciones
  return new Promise((resolve, reject) => {
    const worker = new Worker('workers/sim-worker.js');
    
    worker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'prediction_complete' || type === 'simulation_complete') {
        resolve(data);
      } else if (type === 'error') {
        reject(new Error(data.error));
      }
    };
    
    worker.onerror = (e) => reject(e);
    
    // Enviar parámetros de simulación
    worker.postMessage({
      type: 'predict_strategy',
      data: {
        favorite,
        raceName,
        track: raceName?.toLowerCase()?.replace('gp de ', '') || 'monaco',
        laps: 57,
        weather: { current: 'dry', changing: false }
      }
    });
  });
}
`;

// Aplicar reemplazos
let patched = mainJs;

// Reemplazar funciones completas
patched = patched.replace(
  /async function fetchStandingsData\(force = false\) \{[\s\S]*?return data;\s*\}/,
  standingsStatic.trim()
);

patched = patched.replace(
  /async function fetchCalendarData\(force = false\) \{[\s\S]*?return data;\s*\}/,
  calendarStatic.trim()
);

patched = patched.replace(
  /async function fetchNewsDataForFavorite\(favorite, force = false\) \{[\s\S]*?return data;\s*\}/,
  newsStatic.trim()
);

patched = patched.replace(
  /async function fetchPredictData\(favorite, raceName\) \{[\s\S]*?\}/,
  predictStatic.trim()
);

writeFileSync('main.js', patched);
console.log('✅ main.js parcheado para GitHub Pages');
console.log('   - standings: datos estáticos');
console.log('   - calendar: datos estáticos');
console.log('   - news: desactivado (CORS)');
console.log('   - predict: Web Worker');

// Web Worker para simulaciones F1
// Se ejecuta en segundo plano sin bloquear la UI

self.onmessage = async function(e) {
  const { type, data, requestId } = e.data;
  
  try {
    switch (type) {
      case 'simulate_race':
        const result = await simulateRace(data);
        self.postMessage({ type: 'simulation_complete', data: result, requestId });
        break;
        
      case 'predict_strategy':
        const prediction = await predictStrategy(data);
        self.postMessage({ type: 'prediction_complete', data: prediction, requestId });
        break;
        
      case 'calculate_telemetry':
        const telemetry = await calculateTelemetry(data);
        self.postMessage({ type: 'telemetry_ready', data: telemetry, requestId });
        break;
        
      default:
        self.postMessage({ type: 'error', error: 'Unknown operation', requestId });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message, requestId });
  }
};

async function simulateRace(params) {
  const {
    drivers,
    teams,
    track,
    laps,
    weather,
    strategies
  } = params;
  
  // Simulación por vueltas
  const results = [];
  const driverStates = {};
  
  // Inicializar estado de cada piloto
  drivers.forEach(driver => {
    driverStates[driver.number] = {
      position: driver.gridPosition || 0,
      lapTimes: [],
      pitStops: [],
      tireWear: 100,
      fuelLoad: strategies?.[driver.number]?.fuel || 100,
      tireCompound: strategies?.[driver.number]?.tire || 'medium'
    };
  });
  
  // Simular cada vuelta
  for (let lap = 1; lap <= laps; lap++) {
    const lapResults = { lap, positions: {} };
    
    drivers.forEach(driver => {
      const state = driverStates[driver.number];
      
      // Calcular tiempo de vuelta con factores aleatorios controlados
      const baseTime = getBaseLapTime(track, driver.team);
      const tireDegradation = calculateTireDegradation(state.tireWear, state.tireCompound);
      const fuelEffect = calculateFuelEffect(state.fuelLoad);
      const trafficEffect = calculateTrafficEffect(state.position, drivers.length);
      const weatherEffect = calculateWeatherEffect(weather, lap);
      
      const lapTime = baseTime + tireDegradation + fuelEffect + trafficEffect + weatherEffect;
      state.lapTimes.push(lapTime);
      
      // Degradar neumáticos y combustible
      state.tireWear -= getTireWearRate(state.tireCompound);
      state.fuelLoad -= getFuelConsumptionRate();
      
      // Estrategia de pits
      if (shouldPit(state, strategies?.[driver.number])) {
        state.pitStops.push({ lap, duration: calculatePitStopDuration() });
        state.tireWear = 100;
        state.fuelLoad = strategies?.[driver.number]?.fuel || 100;
      }
      
      lapResults.positions[driver.number] = {
        position: state.position,
        lapTime,
        gap: calculateGap(driverStates, state.position)
      };
    });
    
    // Actualizar posiciones basado en tiempos
    updatePositions(driverStates, drivers);
    
    results.push(lapResults);
    
    // Yield para no bloquear
    if (lap % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return {
    completed: true,
    totalLaps: laps,
    results,
    finalStandings: getFinalStandings(driverStates, drivers),
    fastestLap: getFastestLap(driverStates),
    pitStopsSummary: getPitStopsSummary(driverStates)
  };
}

function getBaseLapTime(track, team) {
  // Tiempos base por tipo de circuito (en segundos)
  const trackTimes = {
    'monaco': 72.0,
    'monza': 82.0,
    'spa': 105.0,
    'silverstone': 93.0,
    'default': 90.0
  };
  
  // Bonificación por equipo (simplificado)
  const teamBonus = {
    'mercedes': -0.5,
    'ferrari': -0.4,
    'mclaren': -0.3,
    'redbull': -0.6,
    'default': 0
  };
  
  return (trackTimes[track?.toLowerCase()] || trackTimes.default) + 
         (teamBonus[team?.toLowerCase()] || teamBonus.default);
}

function calculateTireDegradation(tireWear, compound) {
  const degradationRates = {
    'soft': 0.15,
    'medium': 0.10,
    'hard': 0.07,
    'intermediate': 0.12,
    'wet': 0.05
  };
  
  const rate = degradationRates[compound] || 0.10;
  return (100 - tireWear) * rate * 0.1;
}

function calculateFuelEffect(fuelLoad) {
  // Menos combustible = más rápido (~0.03s por kg)
  return (fuelLoad / 100) * 0.3;
}

function calculateTrafficEffect(position, totalDrivers) {
  // Pequeña penalización por tráfico en posiciones intermedias
  if (position > 3 && position < totalDrivers - 2) {
    return Math.random() * 0.2;
  }
  return 0;
}

function calculateWeatherEffect(weather, lap) {
  if (!weather) return 0;
  
  // Cambios dinámicos de clima
  if (weather.changing && Math.random() < 0.1) {
    weather.current = weather.current === 'dry' ? 'wet' : 'dry';
  }
  
  return weather.current === 'wet' ? 3.0 : 0;
}

function getTireWearRate(compound) {
  const rates = {
    'soft': 2.5,
    'medium': 1.8,
    'hard': 1.2,
    'intermediate': 2.0,
    'wet': 1.5
  };
  return rates[compound] || 1.8;
}

function getFuelConsumptionRate() {
  return 0.8; // kg por vuelta
}

function shouldPit(state, strategy) {
  if (!strategy) return false;
  
  // Criterios de pit stop
  if (state.tireWear < 20) return true;
  if (state.fuelLoad < 10) return true;
  
  // Pit stop planeado
  if (strategy.plannedLap && state.lapTimes.length === strategy.plannedLap) {
    return true;
  }
  
  return false;
}

function calculatePitStopDuration() {
  // Entre 2.0 y 3.5 segundos normalmente
  return 2.0 + Math.random() * 1.5;
}

function calculateGap(driverStates, position) {
  // Calcular diferencia con el líder
  const leader = Object.values(driverStates).find(s => s.position === 1);
  if (!leader) return 0;
  
  const current = Object.values(driverStates).find(s => s.position === position);
  if (!current) return 0;
  
  const leaderTime = current.lapTimes.reduce((a, b) => a + b, 0);
  const currentTime = current.lapTimes.reduce((a, b) => a + b, 0);
  
  return currentTime - leaderTime;
}

function updatePositions(driverStates, drivers) {
  // Ordenar por tiempo total acumulado
  const sorted = Object.entries(driverStates)
    .sort(([, a], [, b]) => {
      const timeA = a.lapTimes.reduce((sum, t) => sum + t, 0);
      const timeB = b.lapTimes.reduce((sum, t) => sum + t, 0);
      return timeA - timeB;
    });
  
  sorted.forEach(([number, state], index) => {
    state.position = index + 1;
  });
}

function getFinalStandings(driverStates, drivers) {
  return Object.entries(driverStates)
    .map(([number, state]) => {
      const driver = drivers.find(d => d.number === number);
      return {
        position: state.position,
        number,
        name: driver?.name || 'Unknown',
        team: driver?.team || 'Unknown',
        totalTime: state.lapTimes.reduce((a, b) => a + b, 0),
        pitStops: state.pitStops.length
      };
    })
    .sort((a, b) => a.position - b.position);
}

function getFastestLap(driverStates) {
  let fastest = { time: Infinity, driver: null, lap: 0 };
  
  Object.entries(driverStates).forEach(([number, state]) => {
    state.lapTimes.forEach((time, lapIndex) => {
      if (time < fastest.time) {
        fastest = { time, driver: number, lap: lapIndex + 1 };
      }
    });
  });
  
  return fastest;
}

function getPitStopsSummary(driverStates) {
  const summary = {};
  
  Object.entries(driverStates).forEach(([number, state]) => {
    if (state.pitStops.length > 0) {
      summary[number] = {
        count: state.pitStops.length,
        totalDuration: state.pitStops.reduce((sum, stop) => sum + stop.duration, 0),
        stops: state.pitStops
      };
    }
  });
  
  return summary;
}

async function predictStrategy(params) {
  // Predicción de estrategia óptima
  const { track, weather, tireCompounds } = params;
  
  // Análisis simple basado en datos históricos
  const optimalStrategy = {
    startingTire: 'medium',
    pitLaps: [Math.floor(params.laps / 3), Math.floor(params.laps * 2 / 3)],
    fuelLoad: Math.floor(params.laps * 1.5),
    confidence: 0.75
  };
  
  if (weather?.chanceOfRain > 50) {
    optimalStrategy.startingTire = 'intermediate';
    optimalStrategy.confidence = 0.5;
  }
  
  return optimalStrategy;
}

async function calculateTelemetry(params) {
  // Procesamiento de telemetría en tiempo real
  const { sectorTimes, speeds, rpms } = params;
  
  return {
    averageSpeed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
    maxSpeed: Math.max(...speeds),
    sectorAnalysis: analyzeSectors(sectorTimes),
    rpmDistribution: analyzeRPM(rpms)
  };
}

function analyzeSectors(sectorTimes) {
  return {
    sector1: { average: avg(sectorTimes.s1), best: min(sectorTimes.s1) },
    sector2: { average: avg(sectorTimes.s2), best: min(sectorTimes.s2) },
    sector3: { average: avg(sectorTimes.s3), best: min(sectorTimes.s3) }
  };
}

function analyzeRPM(rpms) {
  const distribution = { low: 0, mid: 0, high: 0 };
  rpms.forEach(rpm => {
    if (rpm < 6000) distribution.low++;
    else if (rpm < 10000) distribution.mid++;
    else distribution.high++;
  });
  return distribution;
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function min(arr) { return Math.min(...arr); }

/* ===== CIRCUIT SVG MAPS — inline F1-style simplified track paths ===== */

const CIRCUIT_SVGS = {
  "GP de Australia": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 30 95 L 55 95 L 60 80 L 75 65 L 95 60 L 115 62 L 135 70 L 150 80 L 165 85 L 170 95 L 160 108 L 140 115 L 115 118 L 95 115 L 70 112 L 50 105 L 30 95 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 95 60 L 95 40 L 100 35 L 105 40 L 105 62" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="95" cy="60" r="4" fill="#00ff94"/>
  <rect x="72" y="63" width="12" height="6" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Gran Bretaña": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 25 70 L 50 65 L 65 50 L 80 45 L 100 48 L 115 55 L 130 65 L 140 80 L 145 95 L 150 110 L 135 120 L 115 122 L 95 118 L 75 112 L 55 100 L 40 85 L 25 70 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 100 48 L 100 25 L 108 20 L 116 25 L 116 48" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="100" cy="48" r="4" fill="#00ff94"/>
  <rect x="97" y="51" width="6" height="14" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de España": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 35 80 L 55 75 L 75 65 L 95 62 L 115 68 L 130 78 L 145 88 L 155 100 L 150 115 L 130 120 L 105 118 L 80 110 L 60 100 L 45 88 L 35 80 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 95 62 L 92 42 L 100 36 L 108 42 L 105 62" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="95" cy="62" r="4" fill="#00ff94"/>
  <rect x="91" y="65" width="8" height="10" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Mónaco": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 40 115 L 40 85 L 50 70 L 65 60 L 85 58 L 105 62 L 120 72 L 130 85 L 128 100 L 118 110 L 100 115 L 80 112 L 65 105 L 55 95 L 40 115 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 85 58 L 82 42 L 90 36 L 98 42 L 95 62" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="85" cy="58" r="4" fill="#00ff94"/>
  <rect x="80" y="62" width="10" height="8" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Austria": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 50 95 L 70 88 L 95 82 L 120 80 L 145 85 L 160 95 L 158 108 L 140 115 L 115 118 L 90 115 L 68 108 L 50 95 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 105 80 L 105 55 L 112 48 L 120 55 L 118 80" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="105" cy="80" r="4" fill="#00ff94"/>
  <rect x="101" y="83" width="8" height="12" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Italia": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 30 75 L 55 70 L 80 68 L 105 70 L 130 72 L 155 78 L 170 88 L 168 100 L 150 108 L 125 110 L 100 108 L 75 105 L 55 98 L 38 88 L 30 75 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 100 70 L 100 42 L 108 35 L 116 42 L 116 70" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="100" cy="70" r="4" fill="#00ff94"/>
  <rect x="95" y="73" width="10" height="18" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Bélgica": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 45 35 L 65 30 L 85 28 L 105 30 L 125 35 L 145 45 L 160 58 L 165 75 L 160 90 L 145 100 L 125 105 L 105 108 L 85 105 L 68 98 L 55 85 L 48 70 L 45 55 L 45 35 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 105 30 L 102 12 L 110 6 L 118 12 L 115 30" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="105" cy="30" r="4" fill="#00ff94"/>
  <rect x="98" y="33" width="14" height="8" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Japón": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 50 115 L 55 95 L 65 75 L 80 62 L 100 58 L 120 62 L 138 75 L 148 90 L 148 108 L 135 120 L 115 122 L 95 118 L 75 112 L 58 105 L 50 115 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 100 58 L 100 38 L 107 32 L 114 38 L 114 62" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="100" cy="58" r="4" fill="#00ff94"/>
  <rect x="95" y="61" width="10" height="10" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Estados Unidos": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 30 80 L 50 72 L 75 65 L 100 62 L 125 65 L 148 75 L 165 88 L 170 105 L 155 118 L 130 122 L 105 118 L 80 112 L 58 100 L 42 88 L 30 80 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 100 62 L 100 40 L 108 33 L 116 40 L 116 62" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="100" cy="62" r="4" fill="#00ff94"/>
  <rect x="95" y="65" width="10" height="16" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de São Paulo": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 55 40 L 80 35 L 108 38 L 132 48 L 150 62 L 158 80 L 150 98 L 132 110 L 108 115 L 80 112 L 58 100 L 48 82 L 52 62 L 55 40 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 105 38 L 105 15 L 112 10 L 119 15 L 117 38" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="105" cy="38" r="4" fill="#00ff94"/>
  <rect x="99" y="41" width="12" height="8" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Abu Dabi": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 38 95 L 55 85 L 75 75 L 100 70 L 125 72 L 145 82 L 158 95 L 162 112 L 150 125 L 128 128 L 105 122 L 82 115 L 62 105 L 48 98 L 38 95 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 100 70 L 100 48 L 107 42 L 114 48 L 114 70" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="100" cy="70" r="4" fill="#00ff94"/>
  <rect x="96" y="73" width="8" height="8" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP Miami": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 30 85 L 50 78 L 75 72 L 100 70 L 125 72 L 148 80 L 165 92 L 168 108 L 155 120 L 130 125 L 105 122 L 80 115 L 58 105 L 42 95 L 30 85 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 100 70 L 100 48 L 108 42 L 116 48 L 116 72" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="100" cy="70" r="4" fill="#00ff94"/>
  <rect x="95" y="73" width="10" height="8" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Las Vegas": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 28 72 L 48 65 L 72 62 L 98 65 L 122 70 L 145 78 L 168 88 L 178 102 L 172 115 L 152 122 L 128 120 L 102 115 L 78 108 L 58 98 L 42 85 L 28 72 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 103 65 L 103 45 L 110 40 L 117 45 L 115 65" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="103" cy="65" r="4" fill="#00ff94"/>
  <rect x="99" y="68" width="8" height="14" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`,

  "GP de Azerbaiyán": `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 50 95 L 65 80 L 80 65 L 100 58 L 120 62 L 138 75 L 150 90 L 152 108 L 140 122 L 118 128 L 95 125 L 72 118 L 58 105 L 50 95 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M 100 58 L 100 38 L 108 32 L 116 38 L 116 62" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="100" cy="58" r="4" fill="#00ff94"/>
  <rect x="95" y="61" width="10" height="12" rx="1" fill="rgba(0,255,148,0.3)" stroke="#00ff94" stroke-width="1"/>
</svg>`
};

/* Fallback SVG for circuits without custom paths */
function getGenericCircuitSvg() {
  return `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="140" fill="rgba(0,255,148,0.03)" rx="12"/>
  <path d="M 40 90 L 60 75 L 85 68 L 115 68 L 142 75 L 162 90 L 158 110 L 130 120 L 100 122 L 70 118 L 50 105 L 40 90 Z" fill="none" stroke="#00ff94" stroke-width="3.5" stroke-linejoin="round"/>
  <circle cx="100" cy="68" r="4" fill="#00ff94"/>
</svg>`;
}

function getCircuitSvg(raceName) {
  return CIRCUIT_SVGS[raceName] || getGenericCircuitSvg();
}

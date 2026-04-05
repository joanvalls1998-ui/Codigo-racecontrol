/* ===== PULIDO VISUAL FINAL ===== */

function getCircuitAsset(raceName) {
  const fileName = getCircuitAssetName(raceName);
  return fileName ? `assets/circuits/${fileName}` : "";
}

function renderCircuitThumb(raceName, height = 72) {
  const asset = getCircuitAsset(raceName);
  if (!asset) return "";

  return `
    <div style="
      width:100%;
      height:${height}px;
      border-radius:16px;
      background:rgba(255,255,255,0.03);
      border:1px solid rgba(255,255,255,0.06);
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      margin-bottom:12px;
    ">
      <img
        src="${asset}"
        alt="${escapeHtml(raceName)}"
        style="max-width:100%; max-height:${height - 16}px; object-fit:contain; opacity:0.96;"
        onerror="this.parentNode.style.display='none'"
      >
    </div>
  `;
}

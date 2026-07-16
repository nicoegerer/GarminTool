/* ============================================================
   Chart-Fabrik: Chart.js-Defaults nach Dataviz-Spezifikation
   (2px-Linien, Hairline-Grid, Surface-Gaps, Crosshair-Tooltip,
   Tabellenansicht als Nicht-Hover-Zugang zu jedem Wert)
   ============================================================ */

const INK = "#f2f5f9", INK2 = "#a9b3c1", INK3 = "#717d8d";
const GRID = "#232a35", SURFACE = "#151a23";

Chart.defaults.font.family = getComputedStyle(document.documentElement).getPropertyValue("--font") || "Inter, system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = INK3;
Chart.defaults.borderColor = GRID;
Chart.defaults.animation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 350 };
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = "#0d1117";
Chart.defaults.plugins.tooltip.borderColor = "rgba(255,255,255,0.12)";
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleColor = INK;
Chart.defaults.plugins.tooltip.bodyColor = INK2;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.displayColors = true;
Chart.defaults.plugins.tooltip.boxPadding = 4;

/* Fadenkreuz auf Linien-Charts */
const crosshair = {
  id: "crosshair",
  afterDatasetsDraw(chart) {
    const active = chart.tooltip && chart.tooltip.getActiveElements();
    if (!active || !active.length) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};
Chart.register(crosshair);

const charts = new Map(); // id -> Chart-Instanz

/* ---------- Karten-Gerüst ---------- */

function chartCard(container, { title, sub, height, legend }) {
  const card = typeof container === "string" ? document.getElementById(container) : container;
  card.innerHTML = `
    <div class="card-head"><h3>${title}${sub ? ` <span class="card-sub">${sub}</span>` : ""}</h3></div>
    ${legend ? `<div class="chart-legend">${legend}</div>` : ""}
    <div class="canvas-box"${height ? ` style="height:${height}px"` : ""}><canvas></canvas></div>
  `;
  return card.querySelector("canvas");
}

function emptyCard(container, title, msg) {
  const card = typeof container === "string" ? document.getElementById(container) : container;
  card.innerHTML = `
    <div class="card-head"><h3>${title}</h3></div>
    <div class="chart-empty">${msg || "Keine Daten vorhanden."}</div>
  `;
}

function legendHTML(items) {
  return `<div class="legend-row">` + items.map((i) =>
    `<span class="legend-item"><span class="legend-swatch" style="background:${i.color}"></span>${i.label}</span>`
  ).join("") + `</div>`;
}

/* Tabellenansicht: jeder Wert ist auch ohne Hover erreichbar */
function attachTable(container, headers, rows) {
  const card = typeof container === "string" ? document.getElementById(container) : container;
  if (!rows || !rows.length) return;
  const details = document.createElement("details");
  details.className = "tbl";
  details.innerHTML = `
    <summary>Daten als Tabelle</summary>
    <div class="tbl-scroll"><table>
      <thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c == null ? "–" : c}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  card.appendChild(details);
}

function makeChart(canvas, config) {
  const id = canvas.closest(".card").id || Math.random().toString(36).slice(2);
  if (charts.has(id)) charts.get(id).destroy();
  const c = new Chart(canvas, config);
  charts.set(id, c);
  return c;
}

/* ---------- Wiederverwendbare Optionen ---------- */

function baseScales({ yTitle, reverse = false, stacked = false, yMin, yMax, fmt } = {}) {
  return {
    x: {
      stacked,
      grid: { display: false },
      ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 16, color: INK3 },
      border: { color: "#313a48" },
    },
    y: {
      stacked,
      reverse,
      min: yMin,
      max: yMax,
      title: yTitle ? { display: true, text: yTitle, color: INK3, font: { size: 10 } } : undefined,
      grid: { color: GRID, drawTicks: false },
      border: { display: false },
      ticks: { color: INK3, padding: 6, callback: fmt || undefined },
    },
  };
}

function lineDataset({ label, data, color, fill = false, dash, width = 2, points = false }) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: fill ? hexA(color, 0.1) : color,
    borderWidth: width,
    borderDash: dash,
    fill,
    tension: 0.35,
    spanGaps: true,
    pointRadius: points ? 4 : 0,
    pointHoverRadius: 5,
    pointBackgroundColor: color,
    pointBorderColor: SURFACE,   /* 2px Surface-Ring */
    pointBorderWidth: 2,
    pointHitRadius: 14,
  };
}

function barDataset({ label, data, color }) {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: SURFACE,        /* 2px Surface-Gap zwischen Segmenten */
    borderWidth: { top: 0, right: 0, bottom: 2, left: 0 },
    borderSkipped: false,
    borderRadius: { topLeft: 4, topRight: 4 },
    maxBarThickness: 22,
    hoverBackgroundColor: hexA(color, 0.85),
  };
}

function hexA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const hoverLine = { mode: "index", intersect: false };
const hoverNearest = { mode: "nearest", intersect: false };

"use strict";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const tooltip = document.querySelector("#tooltip");

const state = {
  temperatureRows: [],
  temperatureSource: "",
  graph: null,
  graphSource: "",
  measure: "max",
  detailYears: 8,
  matrixOrder: "degree",
  activeNodeId: null,
  activePair: null
};

boot();

async function boot() {
  wireTabs();
  wireControls();

  const [temperatureResult, graphResult] = await Promise.all([
    loadTemperatureData(),
    loadGraphData()
  ]);

  state.temperatureRows = temperatureResult.rows;
  state.temperatureSource = temperatureResult.source;
  state.graph = prepareCseGraph(graphResult.graph);
  state.graphSource = graphResult.source;

  document.querySelector("#temperature-source").textContent = describeTemperatureSource();
  document.querySelector("#graph-source").textContent = describeGraphSource();

  renderTemperatureViews();
  renderNetworkViews();
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("is-active"));
      document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("is-active"));
      button.classList.add("is-active");
      document.querySelector(`#${button.dataset.target}`).classList.add("is-active");
    });
  });
}

function wireControls() {
  document.querySelector("#temperature-measure").addEventListener("change", (event) => {
    state.measure = event.target.value;
    renderTemperatureViews();
  });

  document.querySelector("#detail-years").addEventListener("change", (event) => {
    state.detailYears = Number(event.target.value);
    renderDailyLines();
  });

  document.querySelector("#matrix-order").addEventListener("change", (event) => {
    state.matrixOrder = event.target.value;
    renderNetworkViews();
  });
}

async function loadTemperatureData() {
  try {
    const response = await fetch("temperature_daily.csv");
    if (!response.ok) throw new Error("CSV not found");
    const text = await response.text();
    return {
      rows: parseTemperatureCsv(text),
      source: "Using local temperature_daily.csv from the original challenge data."
    };
  } catch {
    return {
      rows: generateTemperatureRows(1997, 2017),
      source: "Local temperature_daily.csv was not available, so this run uses deterministic demo data with the same columns."
    };
  }
}

async function loadGraphData() {
  try {
    const response = await fetch("HKUST_coauthor_graph.json");
    if (!response.ok) throw new Error("JSON not found");
    return {
      graph: await response.json(),
      source: "Using local HKUST_coauthor_graph.json from the original challenge data."
    };
  } catch {
    return {
      graph: generateGraphData(),
      source: "Local HKUST_coauthor_graph.json was not available, so this run uses deterministic demo graph data with the same shape."
    };
  }
}

function parseTemperatureCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  return lines.slice(1).map((line) => {
    const [date, maxTemperature, minTemperature] = line.split(",");
    return {
      date,
      max_temperature: Number(maxTemperature),
      min_temperature: Number(minTemperature)
    };
  }).filter((row) => row.date && Number.isFinite(row.max_temperature) && Number.isFinite(row.min_temperature));
}

function generateTemperatureRows(startYear, endYear) {
  const rows = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const days = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= days; day += 1) {
        const seasonal = Math.sin(((month - 2) / 12) * Math.PI * 2);
        const dayWave = Math.sin((day / days) * Math.PI * 2 + year * 0.17);
        const trend = (year - startYear) * 0.035;
        const max = Math.round(25 + seasonal * 8 + dayWave * 1.9 + trend + seededNoise(year, month, day) * 2.2);
        const min = Math.round(max - (5 + Math.max(0, seasonal) * 1.8 + seededNoise(year + 7, month, day) * 1.5));
        rows.push({
          date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          max_temperature: max,
          min_temperature: min
        });
      }
    }
  }
  return rows;
}

function seededNoise(a, b, c) {
  const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

function renderTemperatureViews() {
  renderHeatmap();
  renderDailyLines();
}

function buildMonthlyData(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const [yearText, monthText] = row.date.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const key = `${year}-${month}`;
    if (!groups.has(key)) groups.set(key, { year, month, days: [] });
    groups.get(key).days.push({
      date: row.date,
      day: Number(row.date.slice(8, 10)),
      max: row.max_temperature,
      min: row.min_temperature
    });
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    max: Math.max(...group.days.map((day) => day.max)),
    min: Math.min(...group.days.map((day) => day.min)),
    avgMax: mean(group.days.map((day) => day.max)),
    avgMin: mean(group.days.map((day) => day.min))
  })).sort((a, b) => a.year - b.year || a.month - b.month);
}

function renderHeatmap() {
  const data = buildMonthlyData(state.temperatureRows);
  const years = unique(data.map((item) => item.year));
  const measureKey = state.measure;
  const values = data.map((item) => item[measureKey]);
  const color = sequentialScale(Math.min(...values), Math.max(...values), ["#e7f0f3", "#f0c35a", "#b33f2f"]);

  const margin = { top: 54, right: 34, bottom: 82, left: 66 };
  const cellW = 38;
  const cellH = 28;
  const width = margin.left + margin.right + years.length * cellW;
  const height = margin.top + margin.bottom + 12 * cellH;
  const svg = resetSvg("#heatmap", width, height);

  addText(svg, "Monthly temperature matrix", 20, 26, "title-label");

  years.forEach((year, index) => {
    if (index % 2 === 0) addText(svg, String(year), margin.left + index * cellW + cellW / 2, 46, "axis-label", "middle");
  });
  months.forEach((month, index) => addText(svg, month, 48, margin.top + index * cellH + 18, "axis-label", "end"));

  data.forEach((item) => {
    const x = margin.left + years.indexOf(item.year) * cellW;
    const y = margin.top + (item.month - 1) * cellH;
    svg.appendChild(rect(x, y, cellW - 2, cellH - 2, color(item[measureKey]), "cell", {
      "data-value": item[measureKey]
    }));
    const node = svg.lastElementChild;
    node.addEventListener("mousemove", (event) => showTooltip(event, [
      `${monthNames[item.month - 1]} ${item.year}`,
      `${measureKey === "max" ? "Monthly maximum" : "Monthly minimum"}: ${item[measureKey].toFixed(1)} C`,
      `Daily records: ${item.days.length}`
    ]));
    node.addEventListener("mouseleave", hideTooltip);
  });

  drawLegend(svg, width - 360, height - 46, 280, color, Math.min(...values), Math.max(...values), "Temperature (C)");
}

function renderDailyLines() {
  const monthly = buildMonthlyData(state.temperatureRows);
  const years = unique(monthly.map((item) => item.year)).slice(-state.detailYears);
  const data = monthly.filter((item) => years.includes(item.year));
  const allTemps = data.flatMap((item) => item.days.flatMap((day) => [day.max, day.min]));
  const tempScale = linearScale(Math.min(...allTemps), Math.max(...allTemps), 44, 6);

  const margin = { top: 54, right: 34, bottom: 46, left: 66 };
  const cellW = 92;
  const cellH = 52;
  const width = margin.left + margin.right + years.length * cellW;
  const height = margin.top + margin.bottom + 12 * cellH;
  const svg = resetSvg("#daily-lines", width, height);

  addText(svg, "Daily changes inside each month", 20, 26, "title-label");
  years.forEach((year, index) => addText(svg, String(year), margin.left + index * cellW + cellW / 2, 46, "axis-label", "middle"));
  months.forEach((month, index) => addText(svg, month, 48, margin.top + index * cellH + 32, "axis-label", "end"));

  data.forEach((item) => {
    const x = margin.left + years.indexOf(item.year) * cellW;
    const y = margin.top + (item.month - 1) * cellH;
    const background = rect(x, y, cellW - 5, cellH - 5, "#fbfcfe", "mini-cell");
    background.addEventListener("mousemove", (event) => showTooltip(event, [
      `${monthNames[item.month - 1]} ${item.year}`,
      `Max range: ${Math.min(...item.days.map((day) => day.max))}-${Math.max(...item.days.map((day) => day.max))} C`,
      `Min range: ${Math.min(...item.days.map((day) => day.min))}-${Math.max(...item.days.map((day) => day.min))} C`,
      `Daily records: ${item.days.length}`
    ]));
    background.addEventListener("mouseleave", hideTooltip);
    svg.appendChild(background);
    const maxDay = Math.max(...item.days.map((day) => day.day));
    const dayScale = linearScale(1, maxDay, x + 7, x + cellW - 13);
    svg.appendChild(path(item.days.map((day) => [dayScale(day.day), y + tempScale(day.max)]), "line-max"));
    svg.appendChild(path(item.days.map((day) => [dayScale(day.day), y + tempScale(day.min)]), "line-min"));
  });

  addText(svg, "Max", width - 110, 26, "legend-label");
  svg.appendChild(path([[width - 150, 22], [width - 118, 22]], "line-max"));
  addText(svg, "Min", width - 50, 26, "legend-label");
  svg.appendChild(path([[width - 90, 22], [width - 58, 22]], "line-min"));
}

function generateGraphData() {
  const names = [
    ["Li, Xin", "lixin"], ["Papadopoulos, S", "stavrosp"], ["Liu, Yunhao", "liuyh"],
    ["Yi, Ke", "yike"], ["Zhang, Nevin L", "lzhang"], ["Ng, Wilfred", "wng"],
    ["Mak, Brian K W", "bmak"], ["Zhang, Qian", "qianzh"], ["Rossiter, David P", "rossiter"],
    ["Cheung, S C", "sccheung"], ["Wang, Wei", "weiwang"], ["Chen, Lei", "leichen"]
  ];
  const nodes = names.map(([fullname, itsc], index) => ({
    id: index + 1,
    uniqueID: String(12000 + index),
    label: `${12000 + index}:CSE:${itsc}`,
    dept: "CSE",
    fullname,
    itsc
  }));
  const pairs = [
    [1, 3, 6], [1, 5, 3], [1, 8, 4], [2, 4, 7], [2, 8, 5], [2, 12, 2],
    [3, 6, 4], [3, 10, 3], [4, 7, 6], [4, 8, 2], [5, 9, 5], [5, 10, 3],
    [6, 7, 2], [6, 11, 4], [7, 12, 3], [8, 11, 6], [9, 10, 2], [10, 11, 3]
  ];
  const edges = pairs.map(([source, target, count]) => ({
    source,
    target,
    publications: Array.from({ length: count }, (_, index) => ({
      pubId: `demo-${source}-${target}-${index + 1}`,
      year: 2006 + ((source + target + index) % 10)
    }))
  }));
  return { nodes, edges };
}

function prepareCseGraph(graph) {
  const cseNodes = graph.nodes.filter((node) => node.dept === "CSE");
  const cseIds = new Set(cseNodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => cseIds.has(edge.source) && cseIds.has(edge.target))
    .map((edge) => ({
      ...edge,
      count: edge.publications ? edge.publications.length : edge.count || 1
    }));
  const degree = new Map(cseNodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    degree.set(edge.source, degree.get(edge.source) + 1);
    degree.set(edge.target, degree.get(edge.target) + 1);
  });
  const nodes = cseNodes.map((node) => ({ ...node, degree: degree.get(node.id), x: 0, y: 0 }));
  return { nodes, edges };
}

function describeTemperatureSource() {
  const years = state.temperatureRows.map((row) => Number(row.date.slice(0, 4)));
  return `${state.temperatureSource} ${state.temperatureRows.length} daily records, ${Math.min(...years)}-${Math.max(...years)}.`;
}

function describeGraphSource() {
  return `${state.graphSource} Extracted ${state.graph.nodes.length} CSE professors and ${state.graph.edges.length} internal collaboration edges.`;
}

function renderNetworkViews() {
  runForceLayout(state.graph.nodes, state.graph.edges, 520, 460);
  renderNodeLink();
  renderMatrix();
}

function runForceLayout(nodes, edges, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2;
    node.x = centerX + Math.cos(angle) * 170;
    node.y = centerY + Math.sin(angle) * 150;
  });

  for (let tick = 0; tick < 260; tick += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const distanceSq = dx * dx + dy * dy;
        const force = Math.min(2.8, 1800 / distanceSq);
        a.x -= dx * force;
        a.y -= dy * force;
        b.x += dx * force;
        b.y += dy * force;
      }
    }

    edges.forEach((edge) => {
      const source = nodes.find((node) => node.id === edge.source);
      const target = nodes.find((node) => node.id === edge.target);
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.hypot(dx, dy) || 1;
      const desired = 92 + Math.max(0, 6 - edge.count) * 4;
      const pull = (distance - desired) * 0.015;
      source.x += dx / distance * pull;
      source.y += dy / distance * pull;
      target.x -= dx / distance * pull;
      target.y -= dy / distance * pull;
    });

    nodes.forEach((node) => {
      node.x += (centerX - node.x) * 0.01;
      node.y += (centerY - node.y) * 0.01;
      node.x = clamp(node.x, 38, width - 38);
      node.y = clamp(node.y, 44, height - 44);
    });
  }
}

function renderNodeLink() {
  const width = 560;
  const height = 500;
  const svg = resetSvg("#node-link", width, height);
  addText(svg, "Node-link diagram", 20, 26, "title-label");

  const radius = linearScale(0, Math.max(...state.graph.nodes.map((node) => node.degree)), 7, 18);
  state.graph.edges.forEach((edge) => {
    const source = state.graph.nodes.find((node) => node.id === edge.source);
    const target = state.graph.nodes.find((node) => node.id === edge.target);
    const line = svgLine(source.x, source.y, target.x, target.y, "link");
    line.dataset.source = edge.source;
    line.dataset.target = edge.target;
    line.style.strokeWidth = String(1 + Math.sqrt(edge.count));
    svg.appendChild(line);
  });

  state.graph.nodes.forEach((node) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", radius(node.degree));
    circle.setAttribute("class", "node");
    circle.dataset.nodeId = node.id;
    circle.addEventListener("mousemove", (event) => {
      setNodeHighlight(node.id);
      showTooltip(event, [displayName(node), `Collaborators: ${node.degree}`]);
    });
    circle.addEventListener("mouseleave", () => {
      clearHighlight();
      hideTooltip();
    });
    svg.appendChild(circle);
    addText(svg, shortName(node), node.x + radius(node.degree) + 4, node.y + 4, "node-label");
  });
}

function renderMatrix() {
  const ordered = [...state.graph.nodes].sort((a, b) => {
    if (state.matrixOrder === "name") return displayName(a).localeCompare(displayName(b));
    return b.degree - a.degree || displayName(a).localeCompare(displayName(b));
  });
  const indexById = new Map(ordered.map((node, index) => [node.id, index]));
  const edgeByPair = new Map();
  state.graph.edges.forEach((edge) => {
    edgeByPair.set(pairKey(edge.source, edge.target), edge);
  });

  const margin = { top: 150, right: 40, bottom: 40, left: 150 };
  const cell = 28;
  const width = margin.left + margin.right + ordered.length * cell;
  const height = margin.top + margin.bottom + ordered.length * cell;
  const maxCount = Math.max(...state.graph.edges.map((edge) => edge.count), 1);
  const color = sequentialScale(0, maxCount, ["#f8fafc", "#8ec4ce", "#24566d"]);
  const svg = resetSvg("#matrix", width, height);
  addText(svg, "Collaboration matrix", 20, 26, "title-label");

  ordered.forEach((node, index) => {
    const x = margin.left + index * cell + cell / 2;
    const y = margin.top + index * cell + cell / 2;
    const topLabel = addText(svg, shortName(node), x, margin.top - 8, "matrix-label", "start");
    topLabel.setAttribute("transform", `rotate(-60 ${x} ${margin.top - 8})`);
    addText(svg, shortName(node), margin.left - 8, y + 4, "matrix-label", "end");
  });

  ordered.forEach((rowNode, rowIndex) => {
    ordered.forEach((colNode, colIndex) => {
      const edge = edgeByPair.get(pairKey(rowNode.id, colNode.id));
      const count = edge ? edge.count : 0;
      const cellNode = rect(
        margin.left + colIndex * cell,
        margin.top + rowIndex * cell,
        cell - 1,
        cell - 1,
        color(count),
        "matrix-cell"
      );
      cellNode.dataset.rowId = rowNode.id;
      cellNode.dataset.colId = colNode.id;
      cellNode.dataset.count = count;
      cellNode.addEventListener("mousemove", (event) => {
        setPairHighlight(rowNode.id, colNode.id);
        showTooltip(event, [
          `${displayName(rowNode)} x ${displayName(colNode)}`,
          count ? `Collaborations: ${count}` : "No recorded collaboration"
        ]);
      });
      cellNode.addEventListener("mouseleave", () => {
        clearHighlight();
        hideTooltip();
      });
      svg.appendChild(cellNode);
    });
  });

  drawLegend(svg, width - 300, 45, 220, color, 0, maxCount, "Publications");
}

function setNodeHighlight(nodeId) {
  state.activeNodeId = nodeId;
  state.activePair = null;
  applyHighlights();
}

function setPairHighlight(sourceId, targetId) {
  state.activePair = [sourceId, targetId];
  state.activeNodeId = null;
  applyHighlights();
}

function clearHighlight() {
  state.activeNodeId = null;
  state.activePair = null;
  applyHighlights();
}

function applyHighlights() {
  const activeIds = new Set();
  if (state.activeNodeId) activeIds.add(String(state.activeNodeId));
  if (state.activePair) {
    activeIds.add(String(state.activePair[0]));
    activeIds.add(String(state.activePair[1]));
  }

  document.querySelectorAll(".node").forEach((node) => {
    const id = node.dataset.nodeId;
    const isActive = activeIds.size === 0 || activeIds.has(id);
    node.classList.toggle("is-dimmed", !isActive);
    node.classList.toggle("is-highlighted", activeIds.has(id));
  });

  document.querySelectorAll(".link").forEach((link) => {
    const source = link.dataset.source;
    const target = link.dataset.target;
    const touchesNode = state.activeNodeId && (source === String(state.activeNodeId) || target === String(state.activeNodeId));
    const matchesPair = state.activePair && pairKey(source, target) === pairKey(state.activePair[0], state.activePair[1]);
    const isActive = activeIds.size === 0 || touchesNode || matchesPair;
    link.classList.toggle("is-dimmed", !isActive);
    link.classList.toggle("is-highlighted", Boolean(touchesNode || matchesPair));
  });

  document.querySelectorAll(".matrix-cell").forEach((cell) => {
    const row = cell.dataset.rowId;
    const col = cell.dataset.colId;
    const touchesNode = state.activeNodeId && (row === String(state.activeNodeId) || col === String(state.activeNodeId));
    const matchesPair = state.activePair && pairKey(row, col) === pairKey(state.activePair[0], state.activePair[1]);
    const isActive = activeIds.size === 0 || touchesNode || matchesPair;
    cell.classList.toggle("is-dimmed", !isActive);
    cell.classList.toggle("is-highlighted", Boolean(touchesNode || matchesPair));
  });
}

function resetSvg(selector, width, height) {
  const svg = document.querySelector(selector);
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  return svg;
}

function rect(x, y, width, height, fill, className, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  element.setAttribute("x", x);
  element.setAttribute("y", y);
  element.setAttribute("width", width);
  element.setAttribute("height", height);
  element.setAttribute("fill", fill);
  element.setAttribute("class", className);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function path(points, className) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
  element.setAttribute("d", points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" "));
  element.setAttribute("class", className);
  return element;
}

function svgLine(x1, y1, x2, y2, className) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "line");
  element.setAttribute("x1", x1);
  element.setAttribute("y1", y1);
  element.setAttribute("x2", x2);
  element.setAttribute("y2", y2);
  element.setAttribute("class", className);
  return element;
}

function addText(svg, text, x, y, className, anchor = "start") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "text");
  element.textContent = text;
  element.setAttribute("x", x);
  element.setAttribute("y", y);
  element.setAttribute("class", className);
  element.setAttribute("text-anchor", anchor);
  svg.appendChild(element);
  return element;
}

function drawLegend(svg, x, y, width, color, min, max, label) {
  const steps = 80;
  for (let i = 0; i < steps; i += 1) {
    const value = min + (i / (steps - 1)) * (max - min);
    svg.appendChild(rect(x + (i / steps) * width, y, width / steps + 1, 10, color(value), ""));
  }
  addText(svg, `${min.toFixed(0)}`, x, y + 28, "legend-label");
  addText(svg, `${max.toFixed(0)}`, x + width, y + 28, "legend-label", "end");
  addText(svg, label, x + width / 2, y + 28, "legend-label", "middle");
}

function sequentialScale(min, max, colors) {
  return (value) => {
    const t = max === min ? 0.5 : clamp((value - min) / (max - min), 0, 1);
    if (colors.length === 2) return mixColor(colors[0], colors[1], t);
    if (t < 0.5) return mixColor(colors[0], colors[1], t * 2);
    return mixColor(colors[1], colors[2], (t - 0.5) * 2);
  };
}

function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const mixed = ca.map((channel, index) => Math.round(channel + (cb[index] - channel) * t));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
  return (value) => {
    if (domainMax === domainMin) return (rangeMin + rangeMax) / 2;
    return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unique(values) {
  return Array.from(new Set(values));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pairKey(a, b) {
  return [String(a), String(b)].sort((x, y) => Number(x) - Number(y)).join("-");
}

function displayName(node) {
  return node.fullname || node.itsc || node.label;
}

function shortName(node) {
  const name = displayName(node);
  if (name.includes(",")) return name.split(",")[0];
  return name.length > 12 ? `${name.slice(0, 11)}.` : name;
}

function showTooltip(event, lines) {
  tooltip.innerHTML = lines.map((line, index) => index === 0 ? `<strong>${line}</strong>` : line).join("<br>");
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
  tooltip.classList.add("is-visible");
}

function hideTooltip() {
  tooltip.classList.remove("is-visible");
}

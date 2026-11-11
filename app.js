"use strict";

const LEVELS = ["junior", "mid", "senior"];
const LEVEL_NAME = { junior: "Junior", mid: "Mid-level", senior: "Senior" };
const LEVEL_YEARS = { junior: "0 to 2 yrs", mid: "3 to 5 yrs", senior: "6 to 10 yrs" };

// Text colour for a number sitting inside its own level's bar.
const LABEL_CLASS = { junior: "light", mid: "dark", senior: null };

const COST_PARTS = [
  ["rent_outside", "rent", "Rent"],
  ["everyday", "everyday", "Everyday costs"],
  ["commute", "commute", "Commute"],
  ["health", "health", "Health insurance"]
];

const EVERYDAY_NAMES = {
  groceries: "Groceries",
  utilities: "Utilities",
  internet_phone: "Internet and phone",
  going_out: "Going out",
  other: "Other"
};

const NAME_COL = "214px";
const TARGET_STEP = 50;
const STORAGE_KEY = "eu-dev-pay-filters";

const flag = cc => String.fromCodePoint(...[...cc].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
const euro = v => (v < 0 ? "-" : "") + "€" + Math.abs(Math.round(v)).toLocaleString("en");
const euroK = v => "€" + Math.round(v) + "k";
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const niceMax = (value, step) => Math.ceil(value / step) * step;

const countryName = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return cc => names.of(cc);
})();

const ALL_CITIES = window.CITIES.map(c => ({
  ...c,
  costs: c.rent_outside + c.everyday + c.commute + c.health
}));

const COUNTRIES = [...new Set(ALL_CITIES.map(c => c.country))]
  .sort((a, b) => countryName(a).localeCompare(countryName(b)));


// ---------- shared filter state ----------

const state = loadState();

function loadState() {
  const defaults = { levels: [...LEVELS], countries: [...COUNTRIES], target: 1500 };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return defaults;

    const levels = LEVELS.filter(l => saved.levels?.includes(l));
    const countries = COUNTRIES.filter(cc => saved.countries?.includes(cc));
    const target = Number.isFinite(saved.target) ? saved.target : defaults.target;

    return { levels: levels.length ? levels : defaults.levels, countries, target };
  } catch {
    return defaults;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage can be blocked; the filter still works for this visit
  }
}

const visibleLevels = () => LEVELS.filter(l => state.levels.includes(l));
const visibleCities = () => ALL_CITIES.filter(c => state.countries.includes(c.country));
const bestLeft = (c, levels) => Math.max(...levels.map(l => c.surplus[l]));


// ---------- small shared pieces ----------

const options = pairs => pairs.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("");

function setOptions(select, pairs) {
  const previous = select.value;
  select.innerHTML = options(pairs);
  if (pairs.some(([value]) => value === previous)) select.value = previous;
}

const levelLegend = levels => levels.map((l, i) => `
  <span><i class="key b-${l}"></i> ${LEVEL_NAME[l]} (${LEVEL_YEARS[l]})${i === levels.length - 1 && levels.length > 1 ? ", the full bar" : ""}</span>`).join("");

const EMPTY = `<p class="empty">No city matches the filter. Pick at least one country in the filter panel.</p>`;

const cityName = c =>
  `<div class="name"><span class="info" aria-hidden="true">i</span>${esc(c.city)}<span class="cc">${esc(c.country)} ${flag(c.country)}</span></div>`;

const openCities = el => new Set([...el.querySelectorAll("details.city[open]")].map(d => d.dataset.city));


// Every city row in every chart is an accordion that opens the same detail panel.
function cityRow(c, { style, cells, title, open }) {
  const details = document.createElement("details");
  details.className = "city";
  details.dataset.city = c.city;

  details.innerHTML = `
    <summary class="row" style="${style}" title="${esc(title)}">${cityName(c)}${cells}</summary>
    <div class="panel"></div>`;

  details.addEventListener("toggle", () => {
    const panel = details.querySelector(".panel");
    if (details.open && !panel.innerHTML.trim()) panel.innerHTML = cityDetail(c);
  });

  if (open) details.open = true;
  return details;
}


// Numbers always sit inside the bars, right-aligned at each bar's end; they shrink a little when the bars are short.
function placeLabels(track, px, items, format) {
  const segments = items.filter(([value]) => value != null && value > 0);

  const labels = segments.map(([value]) => {
    const label = document.createElement("div");
    label.className = "lab";
    label.textContent = format(value);
    track.appendChild(label);
    return label;
  });

  const layout = size => {
    labels.forEach(label => { label.style.fontSize = size; });

    let previousRight = 0;
    let fits = true;

    const lefts = segments.map(([value], i) => {
      const width = labels[i].offsetWidth;
      let left = px(value) - 5 - width;

      if (i === 0 && left < 2) left = 2;
      if (left < previousRight + 3) fits = false;

      previousRight = left + width;
      return left;
    });

    return { lefts, fits };
  };

  let result = layout("10.5px");
  if (!result.fits) result = layout("9px");

  labels.forEach((label, i) => {
    const left = result.lefts[i];
    const right = left + label.offsetWidth;
    const segmentStart = i === 0 ? 0 : px(segments[i - 1][0]);
    const insideOwnColour = left >= segmentStart - 1 && right <= px(segments[i][0]);
    const plainClass = segments[i][1];

    label.style.left = left + "px";
    label.className = "lab" + (insideOwnColour && plainClass ? " " + plainClass : "");
  });
}


// ---------- chart 1: money left ----------

function moneyChart(root, onTargetCommit) {
  root.innerHTML = `
    <div class="legend" data-legend></div>
    <div class="ctls">
      <label>Order by <select data-order></select></label>
      <span>Gross ticks:</span>
      <span class="tick-boxes" data-tick-boxes></span>
    </div>
    <div class="axis" style="grid-template-columns:${NAME_COL} 1fr;margin-top:26px"><div></div><div class="ticks"></div></div>
    <div class="rows">
      <div class="lines" style="left:${NAME_COL}"></div>
      <div data-above></div>
      <details class="fold"><summary></summary><div data-below></div></details>
    </div>
    <p class="note">Bars are monthly take-home pay minus costs; ticks are gross pay per month (yearly gross divided by 12, before tax and bonus). Drag the target line, or focus its label and use the arrow keys. Cities where no selected level reaches the target move into the fold under the chart. Real free cash is roughly €300 to €500 lower than the bars, because savings, travel, clothing and deposits are not counted.</p>`;

  const order = root.querySelector("[data-order]");
  const ticksEl = root.querySelector(".ticks");
  const lines = root.querySelector(".lines");
  const above = root.querySelector("[data-above]");
  const fold = root.querySelector(".fold");
  const below = root.querySelector("[data-below]");
  const shownTicks = new Set();
  const grossMonthly = (c, l) => c.base_yearly[l] / 12;

  let MAX = 1000;
  let rowsFrame = 0;

  const pct = v => (Math.max(0, v) / MAX * 100) + "%";

  const sorters = {
    junior: (a, b) => b.surplus.junior - a.surplus.junior,
    mid: (a, b) => b.surplus.mid - a.surplus.mid,
    senior: (a, b) => b.surplus.senior - a.surplus.senior,
    country: (a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city),
    name: (a, b) => a.city.localeCompare(b.city)
  };

  const legendHtml = levels =>
    levelLegend(levels) + `<span><i class="key-line"></i> ${euro(state.target)} left a month (drag the line to change)</span>`;

  function positionTarget() {
    const handle = ticksEl.querySelector(".target-handle");
    const line = lines.querySelector(".target");
    if (!handle) return;

    handle.style.left = pct(state.target);
    handle.textContent = euro(state.target);
    handle.setAttribute("aria-valuenow", state.target);
    line.style.left = pct(state.target);
    root.querySelector("[data-legend]").innerHTML = legendHtml(visibleLevels());
  }

  function setTarget(value) {
    const next = Math.min(MAX - TARGET_STEP, Math.max(0, Math.round(value / TARGET_STEP) * TARGET_STEP));
    if (next === state.target) return;

    state.target = next;
    positionTarget();

    cancelAnimationFrame(rowsFrame);
    rowsFrame = requestAnimationFrame(drawRows);
  }

  function commitTarget() {
    saveState();
    onTargetCommit();
  }

  function startDrag(event) {
    event.preventDefault();
    const rect = ticksEl.getBoundingClientRect();
    const move = e => setTarget((e.clientX - rect.left) / rect.width * MAX);

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("dragging");
      commitTarget();
    };

    document.body.classList.add("dragging");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function onHandleKey(event) {
    const step = event.shiftKey ? TARGET_STEP * 5 : TARGET_STEP;
    const moves = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
    if (!(event.key in moves)) return;

    event.preventDefault();
    setTarget(state.target + moves[event.key]);
    commitTarget();
  }

  // Labels are measured, so rows inside the closed fold get theirs only once the fold opens.
  function labelRows(rows) {
    const width = ticksEl.getBoundingClientRect().width;
    const px = v => Math.max(0, v) / MAX * width;
    const levels = visibleLevels();

    rows.forEach(row => {
      if (row.dataset.labelled) return;
      row.dataset.labelled = "1";

      const c = row.cityData;
      placeLabels(row.querySelector(".track"), px, levels.map(l => [c.surplus[l], LABEL_CLASS[l]]), euro);
    });
  }

  function makeRow(c, levels, open) {
    let marks = "";

    [...levels].reverse().forEach(l => {
      marks += `<div class="bar b-${l}" style="top:4px;height:16px;width:${pct(c.surplus[l])}"></div>`;
    });

    levels.filter(l => shownTicks.has(l)).forEach(l => {
      marks += `<div class="pay" style="top:2px;height:20px;left:${pct(grossMonthly(c, l))};background:var(--c-${l})"></div>`;
    });

    const row = cityRow(c, {
      style: `grid-template-columns:${NAME_COL} 1fr;height:24px`,
      cells: `<div class="track" style="height:24px">${marks}</div>`,
      title: `${c.city}: left after costs ${levels.map(l => `${euro(c.surplus[l])} ${LEVEL_NAME[l].toLowerCase()}`).join(", ")}. Gross ${levels.map(l => euro(grossMonthly(c, l))).join(", ")} a month.`,
      open
    });

    row.cityData = c;
    return row;
  }

  function drawRows() {
    const levels = visibleLevels();
    const open = openCities(root);
    above.innerHTML = "";
    below.innerHTML = "";

    const sorted = visibleCities().sort(sorters[order.value]);
    const clears = sorted.filter(c => bestLeft(c, levels) >= state.target);
    const misses = sorted.filter(c => bestLeft(c, levels) < state.target);

    const aboveRows = clears.map(c => above.appendChild(makeRow(c, levels, open.has(c.city))));
    misses.forEach(c => below.appendChild(makeRow(c, levels, open.has(c.city))));

    fold.hidden = misses.length === 0;
    fold.querySelector("summary").textContent =
      `${misses.length} more ${misses.length === 1 ? "city" : "cities"} where no selected level leaves ${euro(state.target)} a month`;

    labelRows(aboveRows);
    if (fold.open) labelRows([...below.children]);
  }

  fold.addEventListener("toggle", () => {
    if (fold.open) labelRows([...below.children]);
  });

  function draw() {
    const levels = visibleLevels();
    const data = visibleCities();

    root.querySelector("[data-legend]").innerHTML = legendHtml(levels);

    setOptions(order, [
      ...levels.map(l => [l, `${LEVEL_NAME[l]} money left (highest first)`]),
      ["country", "Country, then city"],
      ["name", "City A to Z"]
    ]);

    root.querySelector("[data-tick-boxes]").innerHTML = levels.map(l => `
      <label><input type="checkbox" data-tick="${l}"${shownTicks.has(l) ? " checked" : ""}><i class="key-line" style="background:var(--c-${l})"></i> ${LEVEL_NAME[l].toLowerCase()}</label>`).join("");

    ticksEl.innerHTML = "";
    lines.innerHTML = "";

    if (!data.length) {
      above.innerHTML = EMPTY;
      below.innerHTML = "";
      fold.hidden = true;
      return;
    }

    let top = state.target + 500;
    data.forEach(c => {
      levels.forEach(l => { top = Math.max(top, c.surplus[l]); });
      levels.filter(l => shownTicks.has(l)).forEach(l => { top = Math.max(top, grossMonthly(c, l)); });
    });

    MAX = niceMax(top + 200, 1000);

    for (let t = 0; t <= MAX; t += 1000) {
      if (t < MAX) ticksEl.insertAdjacentHTML("beforeend", `<span style="left:${pct(t)}">${euro(t)}</span>`);
      lines.insertAdjacentHTML("beforeend", `<i style="left:${pct(t)}"></i>`);
    }

    ticksEl.insertAdjacentHTML("beforeend",
      `<button type="button" class="target-handle" role="slider" aria-label="Money left target per month" aria-valuemin="0" aria-valuemax="${MAX}" title="Drag, or use the arrow keys"></button>`);
    lines.insertAdjacentHTML("beforeend", `<i class="target" title="Drag to change the target"></i>`);

    const handle = ticksEl.querySelector(".target-handle");
    handle.addEventListener("pointerdown", startDrag);
    handle.addEventListener("keydown", onHandleKey);
    lines.querySelector(".target").addEventListener("pointerdown", startDrag);

    positionTarget();
    drawRows();
  }

  root.addEventListener("change", event => {
    const tick = event.target.dataset?.tick;

    if (tick) {
      if (event.target.checked) shownTicks.add(tick); else shownTicks.delete(tick);
      draw();
    } else if (event.target === order) {
      drawRows();
    }
  });

  return draw;
}


// ---------- chart 2: salary needed ----------

// Take-home pay as a line through the researched junior, mid and senior points; outside them the nearest slope is extended.
function takeHomeModel(c) {
  const points = LEVELS
    .map(l => [c.base_yearly[l] * (1 + c.bonus_rate[l]) / 1000, c.net[l] * 12 / 1000])
    .sort((a, b) => a[0] - b[0]);

  const slopes = points.slice(1).map((p, i) => (p[1] - points[i][1]) / (p[0] - points[i][0]));
  const below = Math.min(0.9, slopes[0] * 1.1);
  // progressive tax keeps growing past the senior point, except in Italy where the top bracket already applies
  const above = slopes[slopes.length - 1] * (c.country === "IT" ? 1.03 : 0.95);

  return grossK => {
    if (grossK < points[0][0]) return points[0][1] - (points[0][0] - grossK) * below;

    for (let i = 1; i < points.length; i++) {
      if (grossK <= points[i][0]) return points[i - 1][1] + (grossK - points[i - 1][0]) * slopes[i - 1];
    }

    const last = points[points.length - 1];
    return last[1] + (grossK - last[0]) * above;
  };
}


function salaryChart(root) {
  const models = new Map(ALL_CITIES.map(c => [c, { c, net: takeHomeModel(c), bonus: c.bonus_rate.mid }]));

  root.innerHTML = `
    <div class="legend" data-legend></div>
    <div class="ctls">
      <label>Order by <select data-order></select></label>
      <label><input type="checkbox" data-bonus> Count the assumed annual bonus</label>
    </div>
    <div class="axis" style="grid-template-columns:${NAME_COL} 1fr 64px;column-gap:8px"><div></div><div class="ticks"></div><div style="opacity:.7">needed</div></div>
    <div class="rows"></div>
    <p class="note">Gross salaries per year, Swiss francs converted at 1.083. The marker follows the target you set on the first chart. Each marker comes from that city's take-home pay at the three researched salaries plus its costs; outside the researched salaries the line is extended, so treat a marker as about plus or minus €5k. Bonus rates are assumptions.</p>`;

  const order = root.querySelector("[data-order]");
  const bonusBox = root.querySelector("[data-bonus]");

  const surplusAt = (m, grossK) => m.net(bonusBox.checked ? grossK * (1 + m.bonus) : grossK) * 1000 / 12 - m.c.costs;

  const needed = m => {
    let low = 1, high = 600;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (surplusAt(m, mid) < state.target) low = mid; else high = mid;
    }
    return (low + high) / 2;
  };

  const base = (m, l) => m.c.base_yearly[l] / 1000;

  const sorters = {
    needed: () => (a, b) => a.need - b.need,
    country: () => (a, b) => a.m.c.country.localeCompare(b.m.c.country) || a.m.c.city.localeCompare(b.m.c.city),
    name: () => (a, b) => a.m.c.city.localeCompare(b.m.c.city),
    left: l => (a, b) => b.m.c.surplus[l] - a.m.c.surplus[l],
    gap: l => (a, b) => (base(b.m, l) - b.need) - (base(a.m, l) - a.need),
    pay: l => (a, b) => base(b.m, l) - base(a.m, l)
  };

  function draw() {
    const levels = visibleLevels();
    const rowsEl = root.querySelector(".rows");
    const ticksEl = root.querySelector(".ticks");
    const open = openCities(rowsEl);

    root.querySelector("[data-legend]").innerHTML =
      levelLegend(levels) + `<span><i class="key-line"></i> Salary needed for ${euro(state.target)} left a month</span>`;

    setOptions(order, [
      ...levels.map(l => [`left:${l}`, `${LEVEL_NAME[l]} money left (as in the first chart)`]),
      ...levels.map(l => [`gap:${l}`, `How far ${LEVEL_NAME[l].toLowerCase()} pay clears the marker`]),
      ["needed", "Lowest salary needed first"],
      ...levels.map(l => [`pay:${l}`, `Highest ${LEVEL_NAME[l].toLowerCase()} pay first`]),
      ["country", "Country, then city"],
      ["name", "City A to Z"]
    ]);

    rowsEl.innerHTML = "";
    ticksEl.innerHTML = "";

    const data = visibleCities();
    if (!data.length) {
      rowsEl.innerHTML = EMPTY;
      return;
    }

    const list = data.map(c => {
      const m = models.get(c);
      return { m, need: needed(m) };
    });

    const top = Math.max(...list.map(({ m, need }) => Math.max(need, ...levels.map(l => base(m, l)))));
    const MAX = niceMax(top + 4, 20);
    const pct = v => (v / MAX * 100) + "%";

    for (let t = 0; t < MAX; t += 20) ticksEl.insertAdjacentHTML("beforeend", `<span style="left:${pct(t)}">€${t}k</span>`);

    let grid = "";
    for (let t = 20; t <= MAX; t += 20) grid += `<i style="position:absolute;top:0;bottom:0;width:1px;left:${pct(t)};background:var(--border);opacity:.7"></i>`;

    const [sortKey, sortLevel] = order.value.split(":");
    const tracks = [];

    list.sort(sorters[sortKey](sortLevel)).forEach(({ m, need }) => {
      const c = m.c;

      let bars = "";
      [...levels].reverse().forEach(l => {
        bars += `<div class="bar b-${l}" style="top:4px;height:16px;width:${pct(base(m, l))}"></div>`;
      });

      const row = cityRow(c, {
        style: `grid-template-columns:${NAME_COL} 1fr 64px;column-gap:8px;height:28px`,
        cells:
          `<div class="track" style="height:24px">${grid}${bars}<div class="marker" style="top:0;height:24px;left:${pct(need)}"></div></div>` +
          `<div style="font-weight:700">${euroK(need)}</div>`,
        title: `${c.city}: ${levels.map(l => `${LEVEL_NAME[l].toLowerCase()} ${euroK(base(m, l))}`).join(", ")} gross. About ${euroK(need)} gross leaves ${euro(state.target)} a month.`,
        open: open.has(c.city)
      });

      rowsEl.appendChild(row);
      tracks.push([row.querySelector(".track"), m]);
    });

    const width = tracks[0][0].getBoundingClientRect().width;
    const px = v => v / MAX * width;

    tracks.forEach(([track, m]) => placeLabels(track, px, levels.map(l => [base(m, l), LABEL_CLASS[l]]), euroK));
  }

  order.addEventListener("change", draw);
  bonusBox.addEventListener("change", draw);
  return draw;
}


// ---------- chart 3: where the money goes ----------

function cityDetail(c) {
  const pay = visibleLevels().map(l => `
    <tr>
      <td>${LEVEL_NAME[l]} <span class="tag">${LEVEL_YEARS[l]}</span></td>
      <td class="num">${euro(c.base_yearly[l])}</td>
      <td class="num">${Math.round(c.bonus_rate[l] * 100)}%</td>
      <td class="num">${euro(c.net[l])}</td>
      <td class="num">${euro(c.surplus[l])}</td>
    </tr>`).join("");

  const parts = Object.entries(c.everyday_parts || {}).filter(([, v]) => v > 0);
  const biggestPart = Math.max(1, ...parts.map(([, v]) => v));
  const partRows = parts.map(([key, v]) => `
      <div>${esc(EVERYDAY_NAMES[key] || key)}</div>
      <div><div class="mbar" style="width:${v / biggestPart * 100}%"></div></div>
      <div class="num">${euro(v)}</div>`).join("");

  const room = c.room_shared ? euro(c.room_shared) : "no data";
  const notes = (c.notes || []).map(n => `<li>${esc(n)}</li>`).join("");
  const sources = (c.sources || [])
    .map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`)
    .join("");

  return `
    <div>
      <h3>Pay</h3>
      <table>
        <tr><th>Level</th><th class="num">Base gross per year</th><th class="num">Bonus</th><th class="num">Take-home a month</th><th class="num">Left a month</th></tr>
        ${pay}
      </table>
    </div>
    <div>
      <h3>Monthly costs</h3>
      <table>
        <tr><td>Rent, 1-bed outside the centre</td><td class="num">${euro(c.rent_outside)}</td></tr>
        <tr><td>Rent, 1-bed in the centre</td><td class="num">${euro(c.rent_centre)}</td></tr>
        <tr><td>Room in a shared flat</td><td class="num">${room}</td></tr>
        <tr><td>Everyday costs</td><td class="num">${euro(c.everyday)}</td></tr>
        <tr><td>Commute <span class="tag">${esc(c.commute_note)}</span></td><td class="num">${euro(c.commute)}</td></tr>
        <tr><td>Health insurance paid separately</td><td class="num">${euro(c.health)}</td></tr>
        <tr><th>Total with rent outside the centre</th><th class="num">${euro(c.costs)}</th></tr>
      </table>
    </div>
    <div>
      <h3>Everyday costs in detail</h3>
      <div class="mini">${partRows || "<div>No breakdown</div>"}</div>
    </div>
    <div class="wide">
      <p><b>Tax:</b> ${esc(c.tax_regime_note)}</p>
      <p><b>Language:</b> ${esc(c.language)}</p>
      ${notes ? `<b>Worth knowing</b><ul>${notes}</ul>` : ""}
    </div>
    <div class="wide sources"><b>Sources:</b> ${sources}</div>`;
}


function breakdownChart(root) {
  root.innerHTML = `
    <div class="legend">
      ${COST_PARTS.map(([, cls, label]) => `<span><i class="key seg-${cls}"></i> ${label}</span>`).join("")}
    </div>
    <div class="ctls">
      <label>Order by <select data-order></select></label>
    </div>
    <div class="axis"><div></div><div class="ticks"></div><div class="left3 head"></div></div>
    <div class="rows"></div>
    <p class="note">Bars are monthly costs with rent outside the centre, on the same € scale for every city. The columns on the right are what is left each month after those costs at the selected levels. Click a city for its full numbers and sources.</p>`;

  const order = root.querySelector("[data-order]");

  const sorters = {
    costs: () => (a, b) => b.costs - a.costs,
    costsLow: () => (a, b) => a.costs - b.costs,
    rent: () => (a, b) => b.rent_outside - a.rent_outside,
    left: l => (a, b) => b.surplus[l] - a.surplus[l],
    country: () => (a, b) => a.country.localeCompare(b.country) || b.costs - a.costs,
    name: () => (a, b) => a.city.localeCompare(b.city)
  };

  function draw() {
    const levels = visibleLevels();
    const columns = `grid-template-columns:${NAME_COL} 1fr ${levels.length * 72}px;column-gap:10px`;
    const leftGrid = `grid-template-columns:repeat(${levels.length},1fr)`;

    setOptions(order, [
      ["costs", "Highest costs first"],
      ["costsLow", "Lowest costs first"],
      ["rent", "Highest rent first"],
      ...levels.map(l => [`left:${l}`, `Most left at ${LEVEL_NAME[l].toLowerCase()} pay first`]),
      ["country", "Country, then city"],
      ["name", "City A to Z"]
    ]);

    const axis = root.querySelector(".axis");
    axis.style.cssText = columns;

    const head = axis.querySelector(".left3");
    head.style.cssText = leftGrid;
    head.innerHTML = levels.map(l => `<span>${LEVEL_NAME[l]}</span>`).join("");

    const rowsEl = root.querySelector(".rows");
    const ticksEl = axis.querySelector(".ticks");
    const open = openCities(rowsEl);
    rowsEl.innerHTML = "";
    ticksEl.innerHTML = "";

    const data = visibleCities();
    if (!data.length) {
      rowsEl.innerHTML = EMPTY;
      return;
    }

    const MAX = niceMax(Math.max(...data.map(c => c.costs)) + 100, 500);
    const pct = v => v / MAX * 100;

    for (let t = 0; t < MAX; t += 1000) ticksEl.insertAdjacentHTML("beforeend", `<span style="left:${pct(t)}%">${euro(t)}</span>`);

    const leftCell = c => `<div class="left3" style="${leftGrid}">${levels.map(l => {
      const left = c.surplus[l];
      return `<span class="${left < 0 ? "short" : ""}" title="${LEVEL_NAME[l]}: ${euro(left)} left a month">${euro(left)}</span>`;
    }).join("")}</div>`;

    const [sortKey, sortLevel] = order.value.split(":");

    const rows = data.sort(sorters[sortKey](sortLevel)).map(c => {
      let x = 0;

      const segments = COST_PARTS
        .map(([key, cls, label]) => ({ value: c[key], cls, label }))
        .filter(p => p.value > 0)
        .map(p => {
          const html = `<div class="seg seg-${p.cls}" data-value="${p.value}" style="left:${x / c.costs * 100}%;width:${p.value / c.costs * 100}%" title="${esc(p.label)}: ${euro(p.value)}"></div>`;
          x += p.value;
          return html;
        }).join("");

      const row = cityRow(c, {
        style: `${columns};height:32px`,
        cells: `<div class="track" style="height:20px"><div class="stack" style="width:${pct(c.costs)}%">${segments}</div></div>` + leftCell(c),
        title: `${c.city}: ${euro(c.costs)} of costs a month`,
        open: open.has(c.city)
      });

      rowsEl.appendChild(row);
      return row;
    });

    // put a number on every part wide enough to carry it
    rows.forEach(row => {
      row.querySelectorAll(".seg").forEach(seg => {
        const label = document.createElement("div");
        label.className = "lab " + (seg.classList.contains("seg-rent") ? "light" : "dark");
        label.textContent = euro(Number(seg.dataset.value));
        seg.appendChild(label);
        label.style.left = "4px";
        if (label.offsetWidth + 8 > seg.offsetWidth) label.remove();
      });
    });
  }

  order.addEventListener("change", draw);
  return draw;
}


// ---------- filter panel ----------

function filterPanel(root, onChange) {
  const cityCount = cc => ALL_CITIES.filter(c => c.country === cc).length;

  root.innerHTML = `
    <h2>Filter</h2>
    <fieldset>
      <legend>Levels</legend>
      ${LEVELS.map(l => `
        <label><input type="checkbox" data-level="${l}"><i class="key b-${l}"></i> ${LEVEL_NAME[l]} <span class="muted">${LEVEL_YEARS[l]}</span></label>`).join("")}
    </fieldset>
    <fieldset>
      <legend>Countries</legend>
      <p class="muted" data-count></p>
      <div class="quick">
        <button type="button" data-all>All</button>
        <button type="button" data-none>None</button>
      </div>
      <div class="countries">
        ${COUNTRIES.map(cc => `
          <label><input type="checkbox" data-country="${cc}"> ${flag(cc)} ${esc(countryName(cc))} <span class="muted">${cityCount(cc)}</span></label>`).join("")}
      </div>
    </fieldset>
    <p class="muted">Your choice is saved in this browser.</p>`;

  function sync() {
    root.querySelectorAll("[data-level]").forEach(box => { box.checked = state.levels.includes(box.dataset.level); });
    root.querySelectorAll("[data-country]").forEach(box => { box.checked = state.countries.includes(box.dataset.country); });

    const cities = visibleCities().length;
    root.querySelector("[data-count]").textContent =
      `${state.countries.length} of ${COUNTRIES.length} countries, ${cities} ${cities === 1 ? "city" : "cities"}`;
  }

  function apply() {
    sync();
    saveState();
    onChange();
  }

  root.addEventListener("change", event => {
    const box = event.target;

    if (box.dataset.level) {
      const next = LEVELS.filter(l => l === box.dataset.level ? box.checked : state.levels.includes(l));
      // at least one level has to stay on, or every chart would be empty
      if (next.length) state.levels = next;
      apply();
    }

    if (box.dataset.country) {
      state.countries = COUNTRIES.filter(cc => cc === box.dataset.country ? box.checked : state.countries.includes(cc));
      apply();
    }
  });

  root.querySelector("[data-all]").addEventListener("click", () => { state.countries = [...COUNTRIES]; apply(); });
  root.querySelector("[data-none]").addEventListener("click", () => { state.countries = []; apply(); });

  sync();
}


// ---------- start ----------

const CHART_DRAWS = {
  money: moneyChart(document.getElementById("money-chart"), () => CHART_DRAWS.salary()),
  salary: salaryChart(document.getElementById("salary-chart")),
  breakdown: breakdownChart(document.getElementById("breakdown-chart"))
};

const chartsView = document.getElementById("charts-view");
const methodView = document.getElementById("method");
const navLinks = [...document.querySelectorAll("[data-tab]")];
const isMethodView = () => location.hash === "#method";

function drawCharts() {
  if (!chartsView.hidden) Object.values(CHART_DRAWS).forEach(draw => draw());
}

function markActive(id) {
  navLinks.forEach(link => {
    if (link.dataset.tab === id) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
}

// The nav marks whichever chart sits under the sticky header, like a table of contents.
function markChartInView() {
  if (isMethodView()) return;

  const headerBottom = document.querySelector("header.top").getBoundingClientRect().bottom;
  const sections = [...chartsView.querySelectorAll(".chart-section")];
  const current = sections.filter(section => section.getBoundingClientRect().top <= headerBottom + 80).pop() || sections[0];

  markActive(current.id);
}

let firstShow = true;
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function showView() {
  const method = isMethodView();
  chartsView.hidden = method;
  methodView.hidden = !method;

  drawCharts();

  const anchor = !method && document.getElementById(location.hash.slice(1));
  const behavior = firstShow || prefersReducedMotion() ? "auto" : "smooth";
  firstShow = false;

  if (anchor) anchor.scrollIntoView({ behavior });
  else window.scrollTo({ top: 0, behavior });

  if (method) markActive("method");
  else markChartInView();
}

filterPanel(document.getElementById("filters"), drawCharts);
window.addEventListener("hashchange", showView);
window.addEventListener("scroll", markChartInView, { passive: true });
showView();

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawCharts, 150);
});

"use strict";

const LEVELS = ["junior", "mid", "senior"];
const LEVEL_NAME = { junior: "Junior", mid: "Mid-level", senior: "Senior" };
const LEVEL_YEARS = { junior: "0 to 2 yrs", mid: "3 to 5 yrs", senior: "6 to 10 yrs" };
const TARGET = 1500;

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

const flag = cc => String.fromCodePoint(...[...cc].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
const euro = v => (v < 0 ? "-" : "") + "€" + Math.abs(Math.round(v)).toLocaleString("en");
const euroK = v => "€" + Math.round(v) + "k";
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const niceMax = (value, step) => Math.ceil(value / step) * step;

const cities = window.CITIES.map(c => ({
  ...c,
  costs: c.rent_outside + c.everyday + c.commute + c.health
}));

const cityName = c =>
  `<div class="name">${esc(c.city)}<span class="cc">${esc(c.country)} ${flag(c.country)}</span></div>`;

const options = (pairs) => pairs.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("");


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


function moneyChart(root) {
  const data = cities.filter(c => c.surplus.junior >= 0);
  const excluded = cities.filter(c => c.surplus.junior < 0).map(c => `${c.city} (${euro(c.surplus.junior)})`).join(", ");

  root.innerHTML = `
    <div class="legend">
      ${LEVELS.map(l => `<span><i class="key b-${l}"></i> ${LEVEL_NAME[l]} (${LEVEL_YEARS[l]})${l === "senior" ? ", the full bar" : ""}</span>`).join("")}
      <span><i class="key-line"></i> €1,500 left a month</span>
    </div>
    <div class="ctls">
      <label>Order by <select data-order>${options([
        ["junior", "Junior money left (highest first)"],
        ["mid", "Mid-level money left (highest first)"],
        ["senior", "Senior money left (highest first)"],
        ["netJunior", "Junior take-home (highest first)"],
        ["country", "Country, then city"],
        ["name", "City A to Z"]
      ])}</select></label>
      <span>Take-home ticks:</span>
      ${LEVELS.map(l => `<label><input type="checkbox" data-tick="${l}"><i class="key-line" style="background:var(--c-${l})"></i> ${LEVEL_NAME[l].toLowerCase()}</label>`).join("")}
    </div>
    <div class="axis" style="grid-template-columns:196px 1fr;margin-top:20px"><div></div><div class="ticks"></div></div>
    <div class="rows"><div class="lines" style="left:196px"></div></div>
    <p class="note">Bars are monthly take-home pay minus costs; ticks are take-home pay before costs. Real free cash is roughly €300 to €500 lower than the bars, because savings, travel, clothing and deposits are not counted. Not shown because a junior ends up below zero there: ${esc(excluded)}. The scale adjusts to what is switched on.</p>`;

  const order = root.querySelector("[data-order]");
  const tickBoxes = [...root.querySelectorAll("[data-tick]")];

  const sorters = {
    junior: (a, b) => b.surplus.junior - a.surplus.junior,
    mid: (a, b) => b.surplus.mid - a.surplus.mid,
    senior: (a, b) => b.surplus.senior - a.surplus.senior,
    netJunior: (a, b) => b.net.junior - a.net.junior,
    country: (a, b) => a.country.localeCompare(b.country) || b.surplus.junior - a.surplus.junior,
    name: (a, b) => a.city.localeCompare(b.city)
  };

  function draw() {
    const rowsEl = root.querySelector(".rows");
    const ticksEl = root.querySelector(".ticks");
    const lines = root.querySelector(".lines");

    rowsEl.querySelectorAll(".row").forEach(n => n.remove());
    ticksEl.innerHTML = "";
    lines.innerHTML = "";

    const shownTicks = tickBoxes.filter(box => box.checked).map(box => box.dataset.tick);

    let top = 0;
    data.forEach(c => {
      top = Math.max(top, c.surplus.senior);
      shownTicks.forEach(l => { top = Math.max(top, c.net[l]); });
    });

    const MAX = niceMax(top + 200, 1000);
    const pct = v => (Math.max(0, v) / MAX * 100) + "%";

    for (let t = 0; t <= MAX; t += 1000) {
      if (t < MAX) ticksEl.insertAdjacentHTML("beforeend", `<span style="left:${pct(t)}">${euro(t)}</span>`);
      lines.insertAdjacentHTML("beforeend", `<i style="left:${pct(t)}"></i>`);
    }
    ticksEl.insertAdjacentHTML("beforeend", `<span class="target" style="left:${pct(TARGET)}">${euro(TARGET)}</span>`);
    lines.insertAdjacentHTML("beforeend", `<i class="target" style="left:${pct(TARGET)}"></i>`);

    const tracks = [];

    [...data].sort(sorters[order.value]).forEach(c => {
      const row = document.createElement("div");
      row.className = "row";
      row.style.gridTemplateColumns = "196px 1fr";
      row.style.height = "24px";
      row.title = `${c.city}: left after costs ${LEVELS.map(l => `${euro(c.surplus[l])} ${LEVEL_NAME[l].toLowerCase()}`).join(", ")}. Take-home ${LEVELS.map(l => euro(c.net[l])).join(", ")} a month.`;

      let marks = "";
      ["senior", "mid", "junior"].forEach(l => {
        marks += `<div class="bar b-${l}" style="top:4px;height:16px;width:${pct(c.surplus[l])}"></div>`;
      });
      shownTicks.forEach(l => {
        marks += `<div class="pay" style="top:2px;height:20px;left:${pct(c.net[l])};background:var(--c-${l})"></div>`;
      });

      row.innerHTML = cityName(c) + `<div class="track" style="height:24px">${marks}</div>`;
      rowsEl.appendChild(row);
      tracks.push([row.querySelector(".track"), c]);
    });

    const width = tracks[0][0].getBoundingClientRect().width;
    const px = v => Math.max(0, v) / MAX * width;

    tracks.forEach(([track, c]) => placeLabels(track, px, [
      [c.surplus.junior, "light"], [c.surplus.mid, "dark"], [c.surplus.senior, null]
    ], euro));
  }

  order.addEventListener("change", draw);
  tickBoxes.forEach(box => box.addEventListener("change", draw));
  return draw;
}


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
  const models = cities.map(c => ({ c, net: takeHomeModel(c), bonus: c.bonus_rate.mid }));

  root.innerHTML = `
    <div class="legend">
      ${LEVELS.map(l => `<span><i class="key b-${l}"></i> ${LEVEL_NAME[l]} (${LEVEL_YEARS[l]})${l === "senior" ? ", the full bar" : ""}</span>`).join("")}
      <span><i class="key-line"></i> Salary needed for €1,500 left a month</span>
    </div>
    <div class="ctls">
      <label>Order by <select data-order>${options([
        ["surplus", "Junior money left (as in the first chart)"],
        ["gapJunior", "How far junior pay clears the marker"],
        ["gapMid", "How far mid-level pay clears the marker"],
        ["needed", "Lowest salary needed first"],
        ["payJunior", "Highest junior pay first"],
        ["paySenior", "Highest senior pay first"],
        ["country", "Country, then city"],
        ["name", "City A to Z"]
      ])}</select></label>
      <label><input type="checkbox" data-bonus> Count the assumed annual bonus</label>
    </div>
    <div class="axis" style="grid-template-columns:196px 1fr 64px;column-gap:8px"><div></div><div class="ticks"></div><div style="opacity:.7">needed</div></div>
    <div class="rows"></div>
    <p class="note">Gross salaries per year, Swiss francs converted at 1.083. Each marker comes from that city's take-home pay at the three researched salaries plus its costs; outside the researched salaries the line is extended, so treat a marker as about plus or minus €5k. Bonus rates are assumptions.</p>`;

  const order = root.querySelector("[data-order]");
  const bonusBox = root.querySelector("[data-bonus]");

  const surplusAt = (m, grossK) => m.net(bonusBox.checked ? grossK * (1 + m.bonus) : grossK) * 1000 / 12 - m.c.costs;

  const needed = m => {
    let low = 5, high = 400;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (surplusAt(m, mid) < TARGET) low = mid; else high = mid;
    }
    return (low + high) / 2;
  };

  const base = (m, l) => m.c.base_yearly[l] / 1000;

  const sorters = {
    surplus: (a, b) => b.m.c.surplus.junior - a.m.c.surplus.junior,
    gapJunior: (a, b) => (base(b.m, "junior") - b.need) - (base(a.m, "junior") - a.need),
    gapMid: (a, b) => (base(b.m, "mid") - b.need) - (base(a.m, "mid") - a.need),
    needed: (a, b) => a.need - b.need,
    payJunior: (a, b) => base(b.m, "junior") - base(a.m, "junior"),
    paySenior: (a, b) => base(b.m, "senior") - base(a.m, "senior"),
    country: (a, b) => a.m.c.country.localeCompare(b.m.c.country) || b.m.c.surplus.junior - a.m.c.surplus.junior,
    name: (a, b) => a.m.c.city.localeCompare(b.m.c.city)
  };

  function draw() {
    const rowsEl = root.querySelector(".rows");
    const ticksEl = root.querySelector(".ticks");
    rowsEl.innerHTML = "";
    ticksEl.innerHTML = "";

    const list = models.map(m => ({ m, need: needed(m) }));
    const top = Math.max(...list.map(({ m, need }) => Math.max(base(m, "senior"), need)));
    const MAX = niceMax(top + 4, 20);
    const pct = v => (v / MAX * 100) + "%";

    for (let t = 0; t < MAX; t += 20) ticksEl.insertAdjacentHTML("beforeend", `<span style="left:${pct(t)}">€${t}k</span>`);

    let grid = "";
    for (let t = 20; t <= MAX; t += 20) grid += `<i style="position:absolute;top:0;bottom:0;width:1px;left:${pct(t)};background:var(--border);opacity:.7"></i>`;

    const tracks = [];

    list.sort(sorters[order.value]).forEach(({ m, need }) => {
      const c = m.c;
      const row = document.createElement("div");
      row.className = "row";
      row.style.gridTemplateColumns = "196px 1fr 64px";
      row.style.columnGap = "8px";
      row.style.height = "28px";
      row.title = `${c.city}: ${LEVELS.map(l => `${LEVEL_NAME[l].toLowerCase()} ${euroK(base(m, l))}`).join(", ")} gross. About ${euroK(need)} gross leaves €1,500 a month.`;

      let bars = "";
      ["senior", "mid", "junior"].forEach(l => {
        bars += `<div class="bar b-${l}" style="top:4px;height:16px;width:${pct(base(m, l))}"></div>`;
      });

      row.innerHTML = cityName(c) +
        `<div class="track" style="height:24px">${grid}${bars}<div class="marker" style="top:0;height:24px;left:${pct(need)}"></div></div>` +
        `<div style="font-weight:700">${euroK(need)}</div>`;

      rowsEl.appendChild(row);
      tracks.push([row.querySelector(".track"), m]);
    });

    const width = tracks[0][0].getBoundingClientRect().width;
    const px = v => v / MAX * width;

    tracks.forEach(([track, m]) => placeLabels(track, px, [
      [base(m, "junior"), "light"], [base(m, "mid"), "dark"], [base(m, "senior"), null]
    ], euroK));
  }

  order.addEventListener("change", draw);
  bonusBox.addEventListener("change", draw);
  return draw;
}


function cityDetail(c) {
  const pay = LEVELS.map(l => `
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
      <span><i class="key seg-left"></i> Left over</span>
    </div>
    <div class="ctls">
      <label>Level <select data-level>${options(LEVELS.map(l => [l, `${LEVEL_NAME[l]} (${LEVEL_YEARS[l]})`]))}</select></label>
      <label>Scale <select data-scale>${options([["share", "Share of take-home pay"], ["same", "Same € scale for every city"]])}</select></label>
      <label>Order by <select data-order>${options([
        ["left", "Most left over first"],
        ["leftLow", "Least left over first"],
        ["rentShare", "Rent takes the biggest share first"],
        ["net", "Highest take-home first"],
        ["country", "Country, then city"],
        ["name", "City A to Z"]
      ])}</select></label>
    </div>
    <div class="rows"></div>
    <p class="note">Click a city to open its details. Small parts carry their number in the details rather than on the bar.</p>`;

  const level = root.querySelector("[data-level]");
  const scale = root.querySelector("[data-scale]");
  const order = root.querySelector("[data-order]");

  const sorters = {
    left: l => (a, b) => b.surplus[l] - a.surplus[l],
    leftLow: l => (a, b) => a.surplus[l] - b.surplus[l],
    rentShare: l => (a, b) => b.rent_outside / b.net[l] - a.rent_outside / a.net[l],
    net: l => (a, b) => b.net[l] - a.net[l],
    country: l => (a, b) => a.country.localeCompare(b.country) || b.surplus[l] - a.surplus[l],
    name: () => (a, b) => a.city.localeCompare(b.city)
  };

  function draw() {
    const rowsEl = root.querySelector(".rows");
    const openCities = new Set([...rowsEl.querySelectorAll("details[open]")].map(d => d.dataset.city));
    rowsEl.innerHTML = "";

    const l = level.value;
    const sameScale = scale.value === "same";
    const globalMax = Math.max(...cities.map(c => Math.max(c.net[l], c.costs)));

    const filled = [];

    [...cities].sort(sorters[order.value](l)).forEach(c => {
      const left = c.surplus[l];
      const cityTotal = Math.max(c.net[l], c.costs);
      const scaleTotal = sameScale ? globalMax : cityTotal;
      const pct = v => v / scaleTotal * 100;
      const inner = v => v / cityTotal * 100;

      const parts = COST_PARTS
        .map(([key, cls, label]) => ({ value: c[key], cls, label }))
        .filter(p => p.value > 0);
      if (left > 0) parts.push({ value: left, cls: "left", label: "Left over" });

      let x = 0;
      const segments = parts.map(p => {
        const html = `<div class="seg seg-${p.cls}" data-value="${p.value}" style="left:${inner(x)}%;width:${inner(p.value)}%" title="${esc(p.label)}: ${euro(p.value)}"></div>`;
        x += p.value;
        return html;
      }).join("");

      const netMarker = left < 0
        ? `<div class="marker" title="Take-home ${euro(c.net[l])}" style="top:-3px;height:26px;left:${pct(c.net[l])}%"></div>`
        : "";

      const details = document.createElement("details");
      details.className = "city";
      details.dataset.city = c.city;
      details.innerHTML = `
        <summary class="row" style="grid-template-columns:196px 1fr 110px;column-gap:10px;height:32px" title="${esc(c.city)}: take-home ${euro(c.net[l])} a month">
          ${cityName(c)}
          <div class="track" style="height:20px;border-radius:0 8px 8px 0;overflow:visible">
            <div class="stack" style="width:${pct(cityTotal)}%">${segments}</div>
            ${netMarker}
          </div>
          <div class="left-val${left < 0 ? " short" : ""}">${left < 0 ? "short " + euro(-left) : euro(left) + " left"}</div>
        </summary>
        <div class="panel"></div>`;

      details.addEventListener("toggle", () => {
        const panel = details.querySelector(".panel");
        if (details.open && !panel.innerHTML.trim()) panel.innerHTML = cityDetail(c);
      });

      rowsEl.appendChild(details);
      if (openCities.has(c.city)) details.open = true;
      filled.push(details);
    });

    // put a number on every part wide enough to carry it
    filled.forEach(details => {
      details.querySelectorAll(".seg").forEach(seg => {
        const label = document.createElement("div");
        label.className = "lab " + (seg.classList.contains("seg-rent") ? "light" : "dark");
        label.textContent = euro(Number(seg.dataset.value));
        seg.appendChild(label);
        label.style.left = "4px";
        if (label.offsetWidth + 8 > seg.offsetWidth) label.remove();
      });
    });
  }

  [level, scale, order].forEach(control => control.addEventListener("change", draw));
  return draw;
}


const draws = [
  moneyChart(document.getElementById("money-chart")),
  salaryChart(document.getElementById("salary-chart")),
  breakdownChart(document.getElementById("breakdown-chart"))
];

draws.forEach(draw => draw());

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => draws.forEach(draw => draw()), 150);
});

const appName = document.querySelector('meta[name="app-name"]').content;
const root = document.querySelector("#root");
const pageSizes = [5, 10, 25, 50];

const viewHash = {
  dashboard: "dashboard",
  draws: "lotteries",
  payments: "payment",
  banks: "banks",
  winners: "winners",
  customers: "customers",
  report: "report",
};
const hashView = {
  dashboard: "dashboard",
  lotteries: "draws",
  lottery: "draws",
  payments: "payments",
  payment: "payments",
  banks: "banks",
  bank: "banks",
  winners: "winners",
  winner: "winners",
  customers: "customers",
  customer: "customers",
  report: "report",
};

function viewFromHash() {
  const name = location.hash.replace(/^#/, "").trim().toLowerCase();
  return hashView[name] || "dashboard";
}

const state = {
  admin: null,
  view: viewFromHash(),
  menuOpen: false,
  theme: (() => {
    try { return localStorage.getItem("staff-theme") === "light" ? "light" : "dark"; } catch { return "dark"; }
  })(),
  error: "",
  notice: "",
  pending: 0,
  board: {
    preset: "month",
    from: "",
    to: "",
    lottery: "all",
    bank: "all",
    status: "all",
    summary: {
      collected: 0,
      waiting: 0,
      rejected: 0,
      rate: null,
      previous: null,
      change: null,
      orders: 0,
      tickets: 0,
      buyers: 0,
      average: 0,
    },
    series: [],
    grain: "day",
    draws: [],
    banks: [],
    options: { lotteries: [], banks: [] },
  },
  draws: { rows: [], search: "", status: "all", page: 1, pageSize: 10 },
  payments: {
    rows: [],
    counts: { all: 0, pending: 0, approved: 0, rejected: 0 },
    search: "",
    status: "all",
    page: 1,
    pageSize: 10,
    total: 0,
  },
  banks: { rows: [], search: "", status: "all", page: 1, pageSize: 10 },
  winners: { rows: [], search: "", page: 1, pageSize: 10 },
  customers: { rows: [], search: "", page: 1, pageSize: 10 },
  report: {
    kind: "payments",
    from: "",
    to: "",
    lottery: "all",
    status: "all",
    lotteries: [],
    ready: false,
    progress: null,
    columns: [],
    rows: [],
    amount: null,
    sheet: "Payments",
    page: 1,
    pageSize: 10,
    loading: false,
  },
  modal: null,
};

let loadSeq = 0;
let searchTimer = 0;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function safeSrc(url) {
  const value = String(url || "");
  if (
    value.startsWith("uploads/")
    || value.startsWith("/api/receipt-files/")
    || value.startsWith("https://images.pexels.com/")
  ) return value;
  return "";
}

const ZONE = "Africa/Nairobi";
const OFFSET = "+03:00";

function nairobiParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const map = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return map;
}

function asNairobi(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const wall = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00${OFFSET}` : text;
  const date = new Date(wall);
  return Number.isNaN(date.getTime()) ? null : date;
}

function when(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    timeZone: ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function localInput(value) {
  const parts = nairobiParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${Math.round(number).toLocaleString("en-US")} Birr`;
}

function badge(status) {
  const name = String(status || "");
  return `<span class="badge ${esc(name)}">${esc(name)}</span>`;
}

function messageOf(body, fallback) {
  return body.message || body.error || fallback;
}

async function request(path, options = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...options });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function unauthorized(res) {
  if (res.status !== 401) return false;
  const error = new Error("Sign in again");
  error.unauthorized = true;
  throw error;
}

async function postOk(path, payload) {
  const { res, body } = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  unauthorized(res);
  if (!res.ok || body.success === false) throw new Error(messageOf(body, "Request failed"));
}

function captureFocus() {
  const el = document.activeElement;
  if (!el?.id) return null;
  return { id: el.id, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(saved) {
  if (!saved) return;
  const el = document.getElementById(saved.id);
  if (!el) return;
  el.focus();
  if (typeof saved.start === "number" && el.setSelectionRange) {
    try { el.setSelectionRange(saved.start, saved.end); } catch { /* number and select inputs */ }
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  try { localStorage.setItem("staff-theme", state.theme); } catch { /* private browsing */ }
}

applyTheme();

function render() {
  const saved = captureFocus();
  root.innerHTML = state.admin ? shell() : login();
  restoreFocus(saved);
}

function login() {
  return `
    <main class="login">
      <form id="login-form" class="card">
        <p class="eyebrow">${esc(appName)}</p>
        <h1>Sign in</h1>
        <label>Username <input id="username" name="username" autocomplete="username" required></label>
        <label>Password <input id="password" name="password" type="password" autocomplete="current-password" required></label>
        ${state.error ? `<p class="alert" role="alert">${esc(state.error)}</p>` : ""}
        <button class="primary" type="submit">Sign in</button>
      </form>
    </main>`;
}

function shell() {
  const views = [
    ["dashboard", "Dashboard", "", "chart"],
    ["draws", "Lotteries", "", "ticket"],
    ["payments", "Payments", state.pending ? String(state.pending) : "", "card"],
    ["banks", "Banks", "", "bank"],
    ["winners", "Winners", "", "trophy"],
    ["customers", "Customers", "", "user"],
    ["report", "Report", "", "file"],
  ];
  const titles = {
    dashboard: ["Dashboard", "Collected, waiting, and rejected money for the period you choose."],
    draws: ["Lotteries", "Create a lottery, edit one, or choose its winner."],
    payments: ["Payments", "Receipts waiting for a decision."],
    banks: ["Banks", "Accounts buyers transfer to."],
    winners: ["Winners", "Announced results."],
    customers: ["Customers", "People registered with Telegram, and the orders they placed."],
    report: ["Report", "Review the rows, then export them."],
  };
  const [title, blurb] = titles[state.view] || titles.dashboard;
  const menuMark = state.menuOpen
    ? '<path d="M6 6 18 18"/><path d="M18 6 6 18"/>'
    : '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>';
  return `
    <div class="shell">
      ${state.menuOpen ? '<button type="button" class="scrim" data-act="menu" aria-label="Close menu"></button>' : ""}
      <aside class="side ${state.menuOpen ? "open" : ""}">
        <div class="brand">
          <strong>${esc(appName)}</strong>
        </div>
        <nav aria-label="Menu">
          ${views.map(([id, label, count, icon]) => `
            <button type="button" data-act="nav" data-view="${id}" class="${state.view === id ? "on" : ""}" ${state.view === id ? 'aria-current="page"' : ""}>
              <span class="nav-label">${svg(glyph[icon])}<span>${esc(label)}</span></span>
              ${count ? `<span class="count">${esc(count)}</span>` : ""}
            </button>`).join("")}
        </nav>
        <div class="side-foot">
          <div class="foot-id">
            <span class="foot-circle" aria-hidden="true">${esc(String(state.admin.username || "?").slice(0, 1).toUpperCase())}</span>
            <span class="foot-role" title="${esc(state.admin.username)}">${esc(state.admin.username)}</span>
            <button type="button" class="icon-btn" data-act="password" aria-label="Password" title="Password">${svg(glyph.key)}</button>
          </div>
          <div class="foot-tools">
            <button type="button" class="icon-btn" data-act="theme" aria-label="${state.theme === "dark" ? "Light theme" : "Dark theme"}" title="${state.theme === "dark" ? "Light theme" : "Dark theme"}">${svg(state.theme === "dark" ? glyph.sun : glyph.moon)}</button>
            <button type="button" class="icon-btn" data-act="logout" aria-label="Sign out" title="Sign out">${svg(glyph.out)}</button>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="main-head">
          <button type="button" class="ghost menu-toggle" data-act="menu" aria-label="${state.menuOpen ? "Close menu" : "Open menu"}">${svg(menuMark)}</button>
          <div>
            <h1>${esc(title)}</h1>
            <p class="muted">${esc(blurb)}</p>
          </div>
        </header>
        <section class="workspace">
          ${state.error ? `<p class="alert" role="alert">${esc(state.error)}</p>` : ""}
          ${state.notice ? `<p class="ok" role="status">${esc(state.notice)}</p>` : ""}
          ${viewBody()}
        </section>
      </div>
      ${modalHtml()}
    </div>`;
}

function viewBody() {
  if (state.view === "dashboard") return dashboardView();
  if (state.view === "payments") return paymentsView();
  if (state.view === "banks") return banksView();
  if (state.view === "winners") return winnersView();
  if (state.view === "customers") return customersView();
  if (state.view === "report") return reportView();
  return drawsView();
}

function shiftDate(parts, days) {
  const utc = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days));
  const pad = (part) => String(part).padStart(2, "0");
  return {
    year: String(utc.getUTCFullYear()),
    month: pad(utc.getUTCMonth() + 1),
    day: pad(utc.getUTCDate()),
  };
}

function rangeFor(preset) {
  const parts = nairobiParts(new Date());
  if (!parts) return { from: "", to: "" };
  const end = `${parts.year}-${parts.month}-${parts.day}T23:59`;
  const start = (day) => `${day.year}-${day.month}-${day.day}T00:00`;
  if (preset === "today") return { from: start(parts), to: end };
  if (preset === "7d") return { from: start(shiftDate(parts, -6)), to: end };
  if (preset === "30d") return { from: start(shiftDate(parts, -29)), to: end };
  if (preset === "month") return { from: `${parts.year}-${parts.month}-01T00:00`, to: end };
  if (preset === "year") return { from: `${parts.year}-01-01T00:00`, to: end };
  return { from: "", to: "" };
}

function ensureBoardRange() {
  if (state.board.preset === "custom" || state.board.preset === "all") return;
  const range = rangeFor(state.board.preset);
  state.board.from = range.from;
  state.board.to = range.to;
}

function periodCaption() {
  if (state.board.preset === "all" && !state.board.from && !state.board.to) return "Every payment";
  const fmt = (value) => {
    const date = asNairobi(value);
    if (!date) return "";
    return date.toLocaleString(undefined, {
      timeZone: ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (state.board.from && state.board.to) return `${fmt(state.board.from)} – ${fmt(state.board.to)}`;
  if (state.board.from) return `From ${fmt(state.board.from)}`;
  if (state.board.to) return `Until ${fmt(state.board.to)}`;
  return "Every payment";
}

function rateText(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return "—";
  return `${Number(rate).toLocaleString("en-US")}%`;
}

function deltaText(summary) {
  if (summary.previous == null) return "";
  if (Number(summary.previous) === 0 && Number(summary.collected) === 0) return "";
  if (Number(summary.previous) === 0) return "None in the previous period";
  if (!Number(summary.change)) return "Same as the previous period";
  const amount = Math.abs(Number(summary.change)).toLocaleString("en-US");
  return Number(summary.change) > 0
    ? `${amount}% above the previous period`
    : `${amount}% below the previous period`;
}

function deltaClass(summary) {
  if (summary.previous == null || (Number(summary.previous) === 0 && Number(summary.collected) === 0)) return "";
  if (Number(summary.previous) === 0 || Number(summary.change) > 0) return "up";
  if (Number(summary.change) < 0) return "down";
  return "";
}

function pointLabel(key, grain) {
  if (grain === "hour") {
    const date = new Date(`${key}:00${OFFSET}`);
    if (Number.isNaN(date.getTime())) return key;
    return date.toLocaleString(undefined, { timeZone: ZONE, hour: "numeric" });
  }
  if (grain === "month") {
    const date = new Date(`${key}-01T00:00${OFFSET}`);
    if (Number.isNaN(date.getTime())) return key;
    return date.toLocaleString(undefined, { timeZone: ZONE, month: "short", year: "numeric" });
  }
  const date = new Date(`${key}T00:00${OFFSET}`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleString(undefined, { timeZone: ZONE, day: "numeric", month: "short" });
}

function showPointLabel(index, total) {
  if (total <= 12) return true;
  return index === 0 || index === total - 1 || index === Math.floor((total - 1) / 2);
}

function moneyBars(points, grain, color) {
  if (!points.length || points.every((point) => Number(point.amount) === 0)) {
    return `<p class="muted">No payments in this period.</p>`;
  }
  const max = Math.max(...points.map((point) => Number(point.amount) || 0), 1);
  return `
    <div class="bars" role="list">
      ${points.map((point, index) => {
        const height = Math.round((Number(point.amount) / max) * 100);
        const label = pointLabel(point.key, grain);
        const text = `${label}, ${money(point.amount)}`;
        return `
          <div role="listitem" title="${esc(text)}" aria-label="${esc(text)}">
            <span class="plot"><span class="fill ${color}" style="height:${height}%"></span></span>
            <small>${showPointLabel(index, points.length) ? esc(label) : ""}</small>
          </div>`;
      }).join("")}
    </div>`;
}

function meterList(rows, empty) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  const max = Math.max(...rows.map((row) => Number(row.amount) || 0), 1);
  return `
    <div class="meters">
      ${rows.map((row) => {
        const width = Math.round((Number(row.amount) / max) * 100);
        return `
          <div class="meter">
            <div><strong>${esc(row.label)}</strong><span>${esc(money(row.amount))}</span></div>
            <div class="track" aria-hidden="true"><span style="width:${width}%"></span></div>
          </div>`;
      }).join("")}
    </div>`;
}

function selectOptions(pairs, current) {
  return pairs.map(([value, label]) => (
    `<option value="${esc(value)}" ${String(current) === String(value) ? "selected" : ""}>${esc(label)}</option>`
  )).join("");
}

function dashboardView() {
  ensureBoardRange();
  const summary = state.board.summary || {};
  const flow = state.board.status;
  const flowName = { all: "Money", approved: "Collected", pending: "Waiting", rejected: "Rejected" }[flow] || "Money";
  const color = flow === "pending" ? "wait" : flow === "rejected" ? "bad" : "gold";
  const delta = deltaText(summary);
  const presets = [
    ["today", "Today"],
    ["7d", "Last 7 days"],
    ["30d", "Last 30 days"],
    ["month", "This month"],
    ["year", "This year"],
    ["all", "All time"],
    ["custom", "Custom"],
  ];
  const draws = [["all", "All lotteries"]].concat(
    (state.board.options.lotteries || []).map((row) => [row.id, `${row.id} · ${row.title}`]),
  );
  const banks = [["all", "All banks"]].concat(
    (state.board.options.banks || []).map((row) => [row.id, row.name]),
  );
  const flows = [
    ["all", "All money"],
    ["approved", "Collected"],
    ["pending", "Waiting"],
    ["rejected", "Rejected"],
  ];
  const mix = [
    { label: "Collected", amount: summary.collected || 0 },
    { label: "Waiting", amount: summary.waiting || 0 },
    { label: "Rejected", amount: summary.rejected || 0 },
  ].filter((row) => row.amount > 0);
  return `
    <form class="filters" id="board-filters">
      <label>Period
        <select id="range" aria-label="Period">${selectOptions(presets, state.board.preset)}</select>
      </label>
      <label>From
        <input id="from" type="datetime-local" value="${esc(state.board.from)}" aria-label="From">
      </label>
      <label>To
        <input id="to" type="datetime-local" value="${esc(state.board.to)}" aria-label="To">
      </label>
      <label>Lottery
        <select id="draw" aria-label="Lottery">${selectOptions(draws, state.board.lottery)}</select>
      </label>
      <label>Bank
        <select id="account" aria-label="Bank">${selectOptions(banks, state.board.bank)}</select>
      </label>
      <label>Money
        <select id="flow" aria-label="Money">${selectOptions(flows, flow)}</select>
      </label>
    </form>
    <p class="period-note">${esc(periodCaption())}</p>
    <div class="stats">
      <article class="stat">
        <span>Collected</span>
        <strong>${esc(money(summary.collected || 0))}</strong>
        ${delta ? `<em class="${deltaClass(summary)}">${esc(delta)}</em>` : ""}
      </article>
      <article class="stat"><span>Waiting</span><strong>${esc(money(summary.waiting || 0))}</strong></article>
      <article class="stat"><span>Rejected</span><strong>${esc(money(summary.rejected || 0))}</strong></article>
      <article class="stat"><span>Collection rate</span><strong>${esc(rateText(summary.rate))}</strong></article>
    </div>
    <div class="charts">
      <section class="chart">
        <h2>${esc(flowName)} over time</h2>
        ${moneyBars(state.board.series || [], state.board.grain, color)}
      </section>
      <section class="chart">
        <h2>Payment mix</h2>
        ${meterList(mix, "No payments in this period.")}
      </section>
    </div>
    <div class="stats">
      <article class="stat"><span>Orders</span><strong>${esc(summary.orders || 0)}</strong></article>
      <article class="stat"><span>Tickets</span><strong>${esc(summary.tickets || 0)}</strong></article>
      <article class="stat"><span>Buyers</span><strong>${esc(summary.buyers || 0)}</strong></article>
      <article class="stat"><span>Average order</span><strong>${esc(money(summary.average || 0))}</strong></article>
    </div>
    <div class="charts">
      <section class="chart">
        <h2>By lottery</h2>
        ${meterList(state.board.draws || [], "No lottery money in this period.")}
      </section>
      <section class="chart">
        <h2>By bank</h2>
        ${meterList(state.board.banks || [], "No bank money in this period.")}
      </section>
    </div>`;
}

function match(row, search, fields) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return fields.some((field) => String(row[field] ?? "").toLowerCase().includes(query));
}

function pageSlice(rows, bag) {
  const pages = Math.max(1, Math.ceil(rows.length / bag.pageSize));
  if (bag.page > pages) bag.page = pages;
  if (bag.page < 1) bag.page = 1;
  const start = (bag.page - 1) * bag.pageSize;
  return { rows: rows.slice(start, start + bag.pageSize), total: rows.length, pages, page: bag.page, start };
}

function pageList(current, pages) {
  const want = new Set([1, pages, current - 1, current, current + 1]);
  return [...want].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
}

function toolbar({ placeholder, statuses = [], extra = "" }) {
  const bag = state[state.view];
  const options = statuses.map(([value, label]) => (
    `<option value="${esc(value)}" ${bag.status === value ? "selected" : ""}>${esc(label)}</option>`
  )).join("");
  const sizes = pageSizes.map((size) => (
    `<option value="${size}" ${Number(bag.pageSize) === size ? "selected" : ""}>${size} rows</option>`
  )).join("");
  return `
    <div class="toolbar">
      <input id="filter" type="search" value="${esc(bag.search)}" placeholder="${esc(placeholder)}" aria-label="Filter" autocomplete="off">
      ${statuses.length ? `<select id="status" aria-label="Status">${options}</select>` : ""}
      <select id="page-size" aria-label="Rows per page">${sizes}</select>
      ${extra}
    </div>`;
}

function tableHtml({ name, columns, rows, actions, empty }) {
  const actionHead = actions ? `<th scope="col" class="actions">Actions</th>` : "";
  const span = columns.length + (actions ? 1 : 0);
  const head = `${columns.map((col) => `<th scope="col">${esc(col.label)}</th>`).join("")}${actionHead}`;
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((col) => `<td>${col.cell(row)}</td>`).join("")}${actions ? `<td class="actions">${actions(row)}</td>` : ""}</tr>`).join("")
    : `<tr><td class="empty" colspan="${span}">${esc(empty)}</td></tr>`;
  return `<div class="table-wrap"><table aria-label="${esc(name)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function pagerHtml(info, act) {
  const from = info.total === 0 ? 0 : info.start + 1;
  const end = info.total === 0 ? 0 : info.start + info.rows.length;
  let last = 0;
  const pages = [];
  for (const n of pageList(info.page, info.pages)) {
    if (last && n - last > 1) pages.push('<span class="gap">…</span>');
    pages.push(`<button type="button" data-act="${act}" data-page="${n}" class="${n === info.page ? "on" : ""}">${n}</button>`);
    last = n;
  }
  return `
    <div class="pager">
      <p>${info.total === 0 ? "No matching rows" : `Showing ${from}–${end} of ${info.total}`}</p>
      <div>
        <button type="button" data-act="${act}" data-page="${info.page - 1}" ${info.page <= 1 ? "disabled" : ""}>Previous</button>
        ${pages.join("")}
        <button type="button" data-act="${act}" data-page="${info.page + 1}" ${info.page >= info.pages ? "disabled" : ""}>Next</button>
      </div>
    </div>`;
}

function imageList(row) {
  const list = Array.isArray(row?.images) && row.images.length ? row.images : (row?.image_url ? [row.image_url] : []);
  return list.map((src) => safeSrc(src)).filter(Boolean);
}

function drawCell(row) {
  const images = imageList(row);
  const img = images[0]
    ? `<span class="thumb-wrap"><img class="thumb" alt="" src="${esc(images[0])}">${images.length > 1 ? `<span class="more">+${images.length - 1}</span>` : ""}</span>`
    : "";
  return `<div class="who">${img}<div><strong>${esc(row.title)}</strong><span>${esc(row.subtitle || "")}</span></div></div>`;
}

function svg(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const glyph = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4v2a3 3 0 0 0 3 3"/><path d="M17 6h3v2a3 3 0 0 1-3 3"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 3.8 3.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-4.2 4.8"/><path d="M6.1 6.1C3.5 7.9 2 12 2 12a18.6 18.6 0 0 0 6.2 6.2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  power: '<path d="M12 3v8"/><path d="M7.1 6.1a7 7 0 1 0 9.8 0"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  ticket: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v7"/><path d="M10 10v7"/><path d="M15 10v7"/><path d="M19 10v7"/><path d="M3 17h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  moon: '<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11.5 12.5 8-8"/><path d="m16 7 2 2"/><path d="m18 5 2 2"/>',
  out: '<path d="M9 6H5v12h4"/><path d="M10 12h9"/><path d="m16 8 4 4-4 4"/>',
  user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-4-8 7"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
};

function iconButton({ act, id, label, name, tone = "", ticket = "", view = "", src = "", caption = "", gallery = false }) {
  const idAttr = id == null ? "" : ` data-id="${esc(id)}"`;
  const ticketAttr = ticket ? ` data-ticket="${esc(ticket)}"` : "";
  const viewAttr = view ? ` data-view="${esc(view)}"` : "";
  const srcAttr = src ? ` data-src="${esc(src)}"` : "";
  const captionAttr = caption ? ` data-title="${esc(caption)}"` : "";
  const galleryAttr = gallery ? ` data-gallery="1"` : "";
  const toneClass = tone ? ` ${tone}` : "";
  return `<button type="button" class="icon-btn${toneClass}" data-act="${act}"${idAttr}${ticketAttr}${viewAttr}${srcAttr}${captionAttr}${galleryAttr} aria-label="${esc(label)}" title="${esc(label)}">${svg(glyph[name])}</button>`;
}

function iconSlots(items) {
  return `<div class="icon-row">${items.map((item) => item || '<span class="icon-slot" aria-hidden="true"></span>').join("")}</div>`;
}

function drawActions(row) {
  const open = row.status === "active";
  const sold = Number(row.sold_tickets) > 0;
  const images = imageList(row);
  return iconSlots([
    images.length ? iconButton({ act: "see-image", id: row.id, gallery: true, src: images[0], caption: row.title, label: images.length > 1 ? "See images" : "See image", name: "image" }) : "",
    iconButton({ act: "edit-draw", id: row.id, label: "Edit", name: "edit" }),
    open ? iconButton({ act: "winner", id: row.id, label: "Pick winner", name: "trophy" }) : "",
    sold ? "" : iconButton({ act: "delete-draw", id: row.id, label: "Delete", name: "trash", tone: "bad" }),
  ]);
}

function drawsView() {
  const bag = state.draws;
  const filtered = bag.rows.filter((row) => {
    if (bag.status === "hidden" && row.hidden !== "1") return false;
    if (bag.status === "featured" && row.is_featured !== "1") return false;
    if (bag.status !== "all" && bag.status !== "featured" && bag.status !== "hidden" && row.status !== bag.status) return false;
    return match(row, bag.search, ["id", "title", "subtitle", "prize"]);
  });
  const info = pageSlice(filtered, bag);
  return `
    ${toolbar({
      placeholder: "Filter by id or name",
      statuses: [["all", "All statuses"], ["active", "Active"], ["completed", "History"], ["featured", "Featured"], ["hidden", "Hidden"]],
      extra: `<button type="button" class="primary" data-act="new-draw">${svg(glyph.plus)} New lottery</button>`,
    })}
    ${tableHtml({
      name: "Lotteries",
      empty: "No lotteries match this filter.",
      columns: [
        { label: "ID", cell: (row) => `<span class="code">${esc(row.id)}</span>` },
        { label: "Lottery", cell: drawCell },
        { label: "Price", cell: (row) => esc(money(row.ticket_price)) },
        { label: "Sold", cell: (row) => `${esc(row.sold_tickets)} / ${esc(row.total_tickets)}` },
        { label: "Ends", cell: (row) => esc(when(row.end_date)) },
        { label: "Status", cell: (row) => `${badge(row.status)}${row.is_featured === "1" ? badge("featured") : ""}${row.hidden === "1" ? badge("hidden") : ""}` },
      ],
      rows: info.rows,
      actions: drawActions,
    })}
    ${pagerHtml(info, "page")}`;
}

function paymentsView() {
  const bag = state.payments;
  const pages = Math.max(1, Math.ceil(bag.total / bag.pageSize));
  const info = {
    rows: bag.rows,
    total: bag.total,
    pages,
    page: Math.min(bag.page, pages),
    start: (Math.min(bag.page, pages) - 1) * bag.pageSize,
  };
  const counts = bag.counts;
  return `
    ${toolbar({
      placeholder: "Filter by name, phone, tickets, or lottery id",
      statuses: [
        ["all", `All (${counts.all || 0})`],
        ["pending", `Pending (${counts.pending || 0})`],
        ["approved", `Approved (${counts.approved || 0})`],
        ["rejected", `Rejected (${counts.rejected || 0})`],
      ],
    })}
    ${tableHtml({
      name: "Payments",
      empty: "No payments match this filter.",
      columns: [
        { label: "Buyer", cell: (row) => `<strong>${esc(row.customer_name)}</strong>` },
        { label: "Phone", cell: (row) => esc(row.customer_phone) },
        { label: "Lottery", cell: (row) => esc(`${row.lottery_id} · ${row.lottery_title}`) },
        { label: "Tickets", cell: (row) => esc(row.ticket_numbers) },
        { label: "Amount", cell: (row) => esc(money(row.amount)) },
        { label: "Status", cell: (row) => badge(row.status) },
        { label: "Date", cell: (row) => esc(when(row.created_at)) },
      ],
      rows: info.rows,
      actions: (row) => {
        const pending = row.status === "pending";
        const src = safeSrc(row.screenshot_url);
        return iconSlots([
          iconButton({ act: "view-payment", id: row.id, label: "View", name: "eye" }),
          src ? iconButton({ act: "see-image", src, caption: `${row.customer_name} receipt`, label: "See receipt", name: "image" }) : "",
          pending ? iconButton({ act: "approve", id: row.id, label: "Approve", name: "check", tone: "good" }) : "",
          pending ? iconButton({ act: "reject", id: row.id, label: "Reject", name: "x", tone: "bad" }) : "",
        ]);
      },
    })}
    ${pagerHtml(info, "page")}`;
}

function banksView() {
  const bag = state.banks;
  const filtered = bag.rows.filter((row) => {
    if (bag.status !== "all" && row.status !== bag.status) return false;
    return match(row, bag.search, ["bank_name", "account_name", "account_number"]);
  });
  const info = pageSlice(filtered, bag);
  return `
    ${toolbar({
      placeholder: "Filter by bank or account",
      statuses: [["all", "All statuses"], ["active", "Active"], ["inactive", "Inactive"]],
      extra: `<button type="button" class="primary" data-act="new-bank">${svg(glyph.plus)} New account</button>`,
    })}
    ${tableHtml({
      name: "Bank accounts",
      empty: "No bank accounts match this filter.",
      columns: [
        { label: "Bank", cell: (row) => esc(row.bank_name) },
        { label: "Account name", cell: (row) => esc(row.account_name) },
        { label: "Account number", cell: (row) => esc(row.account_number) },
        { label: "Status", cell: (row) => badge(row.status) },
      ],
      rows: info.rows,
      actions: (row) => iconSlots([
        iconButton({ act: "edit-bank", id: row.id, label: "Edit", name: "edit" }),
        iconButton({
          act: "bank-status",
          id: row.id,
          label: row.status === "active" ? "Deactivate" : "Activate",
          name: "power",
          tone: row.status === "active" ? "bad" : "good",
        }),
      ]),
    })}
    ${pagerHtml(info, "page")}`;
}

function customersView() {
  const bag = state.customers;
  const filtered = bag.rows.filter((row) => match(row, bag.search, ["id", "name", "username", "phone", "telegram_id"]));
  const info = pageSlice(filtered, bag);
  return `
    ${toolbar({
      placeholder: "Filter by name, phone, or Telegram id",
      extra: `<div class="report-actions">
        <button type="button" class="primary" data-act="download-customers" data-format="csv">CSV</button>
        <button type="button" class="primary" data-act="download-customers" data-format="xls">Excel</button>
      </div>`,
    })}
    ${tableHtml({
      name: "Customers",
      empty: "No customers match this filter.",
      columns: [
        { label: "Name", cell: (row) => `<div class="who"><div><strong>${esc(row.name)}</strong><span>${esc(row.username ? `@${row.username}` : "—")}</span></div></div>` },
        { label: "Phone", cell: (row) => esc(row.phone) },
        { label: "Orders", cell: (row) => esc(row.orders) },
        { label: "Tickets", cell: (row) => esc(row.tickets) },
        { label: "Approved", cell: (row) => esc(money(row.approved)) },
        { label: "Registered", cell: (row) => esc(when(row.created_at)) },
      ],
      rows: info.rows,
      actions: (row) => iconSlots([
        iconButton({ act: "view-customer", id: row.id, label: "History", name: "eye" }),
      ]),
    })}
    ${pagerHtml(info, "page")}`;
}

function customerModal() {
  const row = state.modal.customer;
  const orders = state.modal.orders || [];
  if (state.modal.loading || !row) {
    return `<div class="modal-card"><h2>Customer</h2><p class="muted">Loading history…</p></div>`;
  }
  const history = orders.length
    ? `<div class="table-wrap"><table aria-label="Customer orders"><thead><tr><th scope="col">When</th><th scope="col">Lottery</th><th scope="col">Tickets</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${esc(when(order.created_at))}</td><td>${esc(order.title)}</td><td>${esc(order.tickets || "—")}</td><td>${esc(money(order.amount))}</td><td>${badge(order.status)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">No orders yet.</p>`;
  return `
    <div class="modal-card wide">
      <h2>${esc(row.name)}</h2>
      <dl>
        <div><dt>Phone</dt><dd>${esc(row.phone)}</dd></div>
        <div><dt>Telegram</dt><dd>${esc(row.username ? `@${row.username}` : row.telegram_id)}</dd></div>
        <div><dt>Registered</dt><dd>${esc(when(row.created_at))}</dd></div>
        <div><dt>Orders</dt><dd>${esc(row.orders)}</dd></div>
        <div><dt>Tickets</dt><dd>${esc(row.tickets)}</dd></div>
        <div><dt>Approved</dt><dd>${esc(money(row.approved))}</dd></div>
      </dl>
      ${history}
      <div class="modal-actions"><button type="button" class="ghost" data-act="close-modal">Close</button></div>
    </div>`;
}

function winnersView() {
  const bag = state.winners;
  const filtered = bag.rows.filter((row) => match(row, bag.search, ["id", "lottery_id", "lottery_title", "winner_name", "winning_ticket_number", "winner_phone"]));
  const info = pageSlice(filtered, bag);
  return `
    ${toolbar({ placeholder: "Filter by lottery id, winner, or ticket" })}
    ${tableHtml({
      name: "Winners",
      empty: "No winners match this filter.",
      columns: [
        { label: "ID", cell: (row) => `<span class="code">${esc(row.lottery_id || row.id)}</span>` },
        { label: "Lottery", cell: (row) => esc(row.lottery_title) },
        { label: "Ticket", cell: (row) => esc(row.winning_ticket_number) },
        { label: "Winner", cell: (row) => esc(row.winner_name) },
        { label: "Phone", cell: (row) => esc(row.winner_phone) },
        { label: "Announced", cell: (row) => esc(when(row.announced_at)) },
      ],
      rows: info.rows,
      actions: (row) => iconSlots([
        iconButton({ act: "view-winner", id: row.id, label: "View", name: "eye" }),
      ]),
    })}
    ${pagerHtml(info, "page")}`;
}

function ensureReportRange() {
  if (state.report.ready) return;
  const parts = nairobiParts(new Date());
  state.report.from = parts ? `${parts.year}-${parts.month}-01T00:00` : "";
  state.report.to = parts ? `${parts.year}-${parts.month}-${parts.day}T23:59` : "";
  state.report.ready = true;
}

function reportCell(label, value) {
  if (value === "" || value == null) return "";
  const wide = ["Buyer", "Lottery", "Tickets", "Bank", "Sender", "Subtitle", "Prize", "Winner", "Title", "Phone"].includes(label);
  let html = esc(value);
  if (label === "Amount" || label === "Price") html = esc(money(value));
  else if (label === "Status") html = badge(value);
  else if (label === "ID" || label === "Order" || label === "Lottery ID" || label === "Ticket") html = `<span class="code">${esc(value)}</span>`;
  return wide ? `<span class="clip" title="${esc(value)}">${html}</span>` : html;
}

function reportParams(format) {
  const bag = state.report;
  const params = new URLSearchParams({
    kind: bag.kind,
    format,
    status: bag.status,
    lottery: bag.lottery,
  });
  if (bag.from) params.set("from", asNairobi(bag.from).toISOString());
  if (bag.to) params.set("to", asNairobi(bag.to).toISOString());
  return params;
}

function reportView() {
  ensureReportRange();
  const bag = state.report;
  const statuses = bag.kind === "lotteries"
    ? [["all", "All"], ["active", "Active"], ["completed", "History"], ["hidden", "Hidden"]]
    : bag.kind === "winners"
      ? [["all", "All"]]
      : [["all", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]];
  const lotteries = [["all", "All lotteries"]].concat(
    (bag.lotteries || []).map((row) => [row.id, `${row.id} · ${row.title}`]),
  );
  const options = (list, current) => list.map(([value, label]) => (
    `<option value="${esc(value)}" ${String(current) === String(value) ? "selected" : ""}>${esc(label)}</option>`
  )).join("");
  const status = statuses.some(([value]) => value === bag.status) ? bag.status : "all";
  const busy = bag.progress;
  const locked = Boolean(busy || bag.loading);
  const spin = `<svg class="spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.28"></circle><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path></svg>`;
  const button = (format, label) => `
    <button type="button" class="primary" data-act="download-report" data-format="${format}" ${locked ? "disabled" : ""}>
      ${busy?.format === format ? spin : ""}${label}
    </button>`;
  const percent = busy?.percent;
  const progress = busy ? `
    <div class="report-progress" role="status" aria-live="polite">
      <div class="report-progress-row">
        <span class="report-progress-label">${esc(busy.label)}</span>
        <span class="report-progress-pct">${percent == null ? "" : `${percent}%`}</span>
      </div>
      <div class="report-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${percent == null ? "" : `aria-valuenow="${percent}"`}>
        <span class="${percent == null ? "indeterminate" : ""}" style="${percent == null ? "" : `width:${percent}%`}"></span>
      </div>
    </div>` : "";
  const sizes = pageSizes.map((size) => (
    `<option value="${size}" ${Number(bag.pageSize) === size ? "selected" : ""}>${size}</option>`
  )).join("");
  const info = pageSlice(bag.rows, bag);
  const nouns = { lotteries: ["lottery", "lotteries"], winners: ["winner", "winners"], payments: ["row", "rows"] };
  const [one, many] = nouns[bag.kind] || ["row", "rows"];
  const counted = `${bag.rows.length} ${bag.rows.length === 1 ? one : many}`;
  const summary = bag.loading
    ? "Loading the rows…"
    : bag.kind === "payments" && bag.amount != null
      ? `${counted} · ${money(bag.amount)}`
      : counted;
  const columns = bag.columns.length
    ? bag.columns.map((label, index) => ({ label, cell: (row) => reportCell(label, row[index]) }))
    : [{ label: "Report", cell: () => "" }];
  return `
    <div class="report-filters">
      <label>Report
        <select id="report-kind" aria-label="Report">${options([["payments", "Payments"], ["lotteries", "Lotteries"], ["winners", "Winners"]], bag.kind)}</select>
      </label>
      <label>From <input id="report-from" type="datetime-local" value="${esc(bag.from)}" aria-label="From"></label>
      <label>To <input id="report-to" type="datetime-local" value="${esc(bag.to)}" aria-label="To"></label>
      <label>Lottery
        <select id="report-lottery" aria-label="Lottery">${options(lotteries, bag.lottery)}</select>
      </label>
      <label>Status
        <select id="report-status" aria-label="Status">${options(statuses, status)}</select>
      </label>
    </div>
    <div class="report-sheet ${bag.loading ? "is-loading" : ""}">
      <div class="report-tools">
        <p>${esc(summary)}</p>
        <div class="report-tools-end">
          <label>Rows
            <select id="report-page-size" aria-label="Rows per page">${sizes}</select>
          </label>
          <div class="report-actions">
            ${button("csv", "CSV")}
            ${button("xls", "Excel")}
            ${button("pdf", "PDF")}
          </div>
        </div>
      </div>
      ${progress}
      ${tableHtml({
        name: bag.sheet || "Report",
        columns,
        rows: bag.columns.length ? info.rows : [],
        empty: bag.loading ? "Loading the rows…" : "No rows match these filters.",
      })}
      ${pagerHtml(info, "page")}
    </div>`;
}

function paintReportProgress() {
  const progress = state.report.progress;
  const label = document.querySelector(".report-progress-label");
  const pct = document.querySelector(".report-progress-pct");
  const bar = document.querySelector(".report-bar > span");
  const meter = document.querySelector(".report-bar");
  if (!progress || !label || !bar || !meter) return;
  label.textContent = progress.label;
  if (progress.percent == null) {
    pct.textContent = "";
    bar.classList.add("indeterminate");
    bar.style.width = "";
    meter.removeAttribute("aria-valuenow");
    return;
  }
  bar.classList.remove("indeterminate");
  bar.style.width = `${progress.percent}%`;
  pct.textContent = `${progress.percent}%`;
  meter.setAttribute("aria-valuenow", String(progress.percent));
}

function modalHtml() {
  if (!state.modal) return "";
  const inner = {
    draw: drawForm,
    bank: bankForm,
    tickets: ticketsModal,
    confirm: confirmModal,
    payment: paymentModal,
    winner: winnerModal,
    customer: customerModal,
    photo: photoModal,
    password: passwordForm,
  }[state.modal.kind];
  return `<div class="backdrop">${inner()}</div>`;
}

function drawPhotos() {
  const photos = state.modal.photos || [];
  if (!photos.length) return `<p class="muted">No images yet. The first image is the cover.</p>`;
  return `<div class="photo-strip">${photos.map((photo, index) => `
    <div class="photo-tile">
      <img alt="" src="${esc(photo.src)}">
      <button type="button" class="tile-x" data-act="drop-photo" data-index="${index}" aria-label="Remove image" title="Remove image">×</button>
      ${index === 0
        ? `<span class="tile-cover">Cover</span>`
        : `<button type="button" class="tile-cover" data-act="make-cover" data-index="${index}" aria-label="Make cover" title="Make cover">Cover</button>`}
    </div>`).join("")}</div>`;
}

function drawForm() {
  const row = state.modal.row;
  const editing = Boolean(row?.id);
  const start = row?.start_date ? localInput(row.start_date) : localInput(Date.now());
  const end = row?.end_date ? localInput(row.end_date) : localInput(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const price = row?.ticket_price ? Math.round(Number(row.ticket_price)) : "";
  return `
    <form id="draw-form" class="modal-card">
      <h2>${editing ? "Edit lottery" : "New lottery"}</h2>
      <label>Title <input name="title" required maxlength="160" value="${esc(row?.title || "")}"></label>
      <label>Subtitle <input name="subtitle" maxlength="160" value="${esc(row?.subtitle || "")}"></label>
      <label>Prize <input name="prize" maxlength="160" value="${esc(row?.prize || row?.title || "")}"></label>
      <div class="split">
        <label>Ticket price <input name="ticket_price" type="number" min="1" step="1" required value="${esc(price)}"></label>
        <label>Total tickets <input name="total_tickets" type="number" min="1" step="1" required value="${esc(row?.total_tickets || "")}"></label>
      </div>
      <div class="split">
        <label>Starts <input name="start_date" type="datetime-local" required value="${esc(start)}"></label>
        <label>Ends <input name="end_date" type="datetime-local" required value="${esc(end)}"></label>
      </div>
      ${editing ? `<label>Status <select name="status"><option value="active" ${row.status === "active" ? "selected" : ""}>Active</option><option value="completed" ${row.status === "completed" ? "selected" : ""}>Completed</option></select></label>` : ""}
      <div class="checks">
        <label><input name="featured" type="checkbox" value="1" ${row?.is_featured === "1" ? "checked" : ""}> Feature on the home page</label>
        <label><input name="hidden" type="checkbox" value="1" ${row?.hidden === "1" ? "checked" : ""}> Hide from customers</label>
      </div>
      <p class="muted">A hidden lottery leaves the customer site. A completed or hidden lottery is not featured.</p>
      <label>Images <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
      <p class="muted">Add up to 8. The first image is the cover shown on the home page.</p>
      ${drawPhotos()}
      <p id="modal-error" class="alert" ${state.modal.warning ? "" : "hidden"}>${esc(state.modal.warning || "")}</p>
      <div class="modal-actions">
        <button type="button" class="ghost" data-act="close-modal">Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>`;
}

function bankForm() {
  const row = state.modal.row;
  return `
    <form id="bank-form" class="modal-card">
      <h2>${row ? "Edit account" : "New account"}</h2>
      <label>Bank <input name="bank_name" required maxlength="80" value="${esc(row?.bank_name || "")}"></label>
      <label>Account name <input name="account_name" required maxlength="80" value="${esc(row?.account_name || "")}"></label>
      <label>Account number <input name="account_number" required maxlength="40" value="${esc(row?.account_number || "")}"></label>
      ${row ? `<label>Status <select name="status"><option value="active" ${row.status !== "inactive" ? "selected" : ""}>Active</option><option value="inactive" ${row.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>` : ""}
      <p id="modal-error" class="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="ghost" data-act="close-modal">Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>`;
}

function ticketsModal() {
  const modal = state.modal;
  const filtered = modal.rows.filter((row) => match(row, modal.search, ["customer_name", "customer_phone", "ticket_number"]));
  const info = pageSlice(filtered, modal);
  return `
    <div class="modal-card wide">
      <h2>Choose a winner · ${esc(modal.lotteryTitle)}</h2>
      <label>Filter <input id="modal-filter" type="search" value="${esc(modal.search)}" placeholder="Name, phone, or ticket" aria-label="Filter tickets"></label>
      ${tableHtml({
        name: "Approved tickets",
        empty: modal.rows.length ? "No approved tickets match this filter." : "This lottery has no approved tickets yet.",
        columns: [
          { label: "Ticket", cell: (row) => esc(row.ticket_number) },
          { label: "Buyer", cell: (row) => esc(row.customer_name) },
          { label: "Phone", cell: (row) => esc(row.customer_phone) },
        ],
        rows: info.rows,
        actions: (row) => iconSlots([
          iconButton({ act: "announce", id: row.id, ticket: row.ticket_number, label: "Announce", name: "trophy", tone: "gold" }),
        ]),
      })}
      ${pagerHtml(info, "modal-page")}
      <div class="modal-actions"><button type="button" class="ghost" data-act="close-modal">Close</button></div>
    </div>`;
}

function confirmModal() {
  const modal = state.modal;
  return `
    <form id="confirm-form" class="modal-card">
      <h2>${esc(modal.title)}</h2>
      <p>${esc(modal.message)}</p>
      <p id="modal-error" class="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="ghost" data-act="close-modal">Cancel</button>
        <button class="primary" type="submit">Confirm</button>
      </div>
    </form>`;
}

function paymentModal() {
  const row = state.modal.row;
  const src = safeSrc(row.screenshot_url);
  return `
    <div class="modal-card">
      <h2>Payment</h2>
      <dl>
        <div><dt>Buyer</dt><dd>${esc(row.customer_name)}</dd></div>
        <div><dt>Phone</dt><dd>${esc(row.customer_phone)}</dd></div>
        <div><dt>Lottery</dt><dd>${esc(row.lottery_title)}</dd></div>
        <div><dt>Tickets</dt><dd>${esc(row.ticket_numbers)}</dd></div>
        <div><dt>Amount</dt><dd>${esc(money(row.amount))}</dd></div>
        <div><dt>Bank</dt><dd>${esc(row.bank_name || "—")}</dd></div>
        <div><dt>Sender</dt><dd>${esc(row.sender_account || "—")}</dd></div>
        <div><dt>Status</dt><dd>${badge(row.status)}</dd></div>
        <div><dt>Date</dt><dd>${esc(when(row.created_at))}</dd></div>
      </dl>
      ${src ? `<img class="receipt" alt="Payment receipt" src="${esc(src)}">` : `<p class="muted">No receipt was uploaded.</p>`}
      <div class="modal-actions"><button type="button" class="ghost" data-act="close-modal">Close</button></div>
    </div>`;
}

function photoModal() {
  const images = (state.modal.images || [state.modal.src]).map((src) => safeSrc(src)).filter(Boolean);
  const index = Math.min(Math.max(state.modal.index || 0, 0), Math.max(images.length - 1, 0));
  const src = images[index] || "";
  const title = state.modal.title || "Image";
  return `
    <div class="modal-card photo">
      <h2>${esc(title)}</h2>
      ${src ? `<img class="photo-view" alt="${esc(title)}" src="${esc(src)}">` : ""}
      ${images.length > 1 ? `
        <div class="photo-nav">
          <button type="button" class="icon-btn" data-act="photo-step" data-dir="-1" aria-label="Previous image" title="Previous image">${svg(glyph.chevL)}</button>
          <span>${index + 1} / ${images.length}</span>
          <button type="button" class="icon-btn" data-act="photo-step" data-dir="1" aria-label="Next image" title="Next image">${svg(glyph.chevR)}</button>
        </div>` : ""}
      <div class="modal-actions"><button type="button" class="ghost" data-act="close-modal">Close</button></div>
    </div>`;
}

function passwordForm() {
  return `
    <form id="password-form" class="modal-card">
      <h2>Change password</h2>
      <label>Current password <input name="current_password" type="password" autocomplete="current-password" required></label>
      <label>New password <input name="new_password" type="password" autocomplete="new-password" minlength="4" maxlength="72" required></label>
      <label>Confirm new password <input name="confirm_password" type="password" autocomplete="new-password" minlength="4" maxlength="72" required></label>
      <p id="modal-error" class="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="ghost" data-act="close-modal">Cancel</button>
        <button class="primary" type="submit">Save password</button>
      </div>
    </form>`;
}

function winnerModal() {
  const row = state.modal.row;
  return `
    <div class="modal-card">
      <h2>${esc(row.lottery_title)}</h2>
      <dl>
        <div><dt>Ticket</dt><dd>${esc(row.winning_ticket_number)}</dd></div>
        <div><dt>Winner</dt><dd>${esc(row.winner_name)}</dd></div>
        <div><dt>Phone</dt><dd>${esc(row.winner_phone)}</dd></div>
        <div><dt>Prize</dt><dd>${esc(row.lottery_prize || row.prize_description || "—")}</dd></div>
        <div><dt>Announced</dt><dd>${esc(when(row.announced_at))}</dd></div>
      </dl>
      <div class="modal-actions"><button type="button" class="ghost" data-act="close-modal">Close</button></div>
    </div>`;
}

function showModalError(error) {
  const el = document.querySelector("#modal-error");
  if (!el) {
    state.error = error.message || "Something went wrong";
    render();
    return;
  }
  el.hidden = false;
  el.textContent = error.message || "Something went wrong";
}

function caught(error) {
  if (error.unauthorized) {
    state.admin = null;
    state.modal = null;
  }
  if (state.report) {
    state.report.progress = null;
    state.report.loading = false;
  }
  state.error = error.message || "Something went wrong";
  render();
}

async function refresh() {
  const seq = ++loadSeq;
  if (state.view === "dashboard") {
    ensureBoardRange();
    const params = new URLSearchParams({
      lottery: state.board.lottery,
      bank: state.board.bank,
      status: state.board.status,
    });
    if (state.board.from) params.set("from", asNairobi(state.board.from).toISOString());
    if (state.board.to) params.set("to", asNairobi(state.board.to).toISOString());
    const { res, body } = await request(`/api/dashboard.php?${params}`);
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load the dashboard"));
    state.board.summary = body.summary || state.board.summary;
    state.board.series = body.series || [];
    state.board.grain = body.grain || "day";
    state.board.draws = body.draws || [];
    state.board.banks = body.banks || [];
    state.board.options = body.options || state.board.options;
    state.pending = Number(body.pendingPayments || 0);
    return;
  }
  if (state.view === "payments") {
    const params = new URLSearchParams({
      status: state.payments.status,
      search: state.payments.search,
      page: String(state.payments.page),
      page_size: String(state.payments.pageSize),
    });
    const { res, body } = await request(`/api/payments.php?${params}`);
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load payments"));
    state.payments.rows = body.data || [];
    state.payments.total = Number(body.total || 0);
    state.payments.counts = body.counts || state.payments.counts;
    if (body.page) state.payments.page = body.page;
    state.pending = Number(body.counts?.pending || 0);
    return;
  }
  if (state.view === "banks") {
    const { res, body } = await request("/api/admin-bank-accounts.php");
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load bank accounts"));
    state.banks.rows = body.data || [];
  } else if (state.view === "winners") {
    const { res, body } = await request("/api/admin-winners.php");
    if (seq !== loadSeq) return;
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load winners"));
    state.winners.rows = body.data || [];
    const board = await request("/api/dashboard.php");
    if (seq !== loadSeq) return;
    if (board.res.ok && board.body.stats) state.pending = Number(board.body.stats.pendingPayments || 0);
    return;
  }
  if (state.view === "customers") {
    const { res, body } = await request("/api/admin-customers.php");
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load customers"));
    state.customers.rows = body.data || [];
    return;
  }
  if (state.view === "report") {
    ensureReportRange();
    const list = await request("/api/admin-lotteries.php");
    if (seq !== loadSeq) return;
    unauthorized(list.res);
    if (!list.res.ok || list.body.success === false) throw new Error(messageOf(list.body, "Could not load lotteries"));
    state.report.lotteries = (list.body.data || []).map((row) => ({ id: String(row.id), title: row.title }));
    if (state.report.from && state.report.to && asNairobi(state.report.from) > asNairobi(state.report.to)) {
      state.error = "The start is after the end";
      state.report.rows = [];
      state.report.columns = [];
      state.report.amount = null;
      state.report.loading = false;
      return;
    }
    const preview = await request(`/api/admin-report.php?${reportParams("json")}`);
    if (seq !== loadSeq) return;
    unauthorized(preview.res);
    if (!preview.res.ok || preview.body.success === false) throw new Error(messageOf(preview.body, "Could not load the report"));
    state.report.sheet = preview.body.sheet || "Report";
    state.report.columns = preview.body.columns || [];
    state.report.rows = preview.body.rows || [];
    state.report.amount = preview.body.amount;
    state.report.loading = false;
    const board = await request("/api/dashboard.php");
    if (seq !== loadSeq) return;
    if (board.res.ok && board.body.stats) state.pending = Number(board.body.stats.pendingPayments || 0);
    return;
  }
  const { res, body } = await request("/api/admin-lotteries.php");
  if (seq !== loadSeq) return;
  if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load lotteries"));
  state.draws.rows = body.data || [];
  const board = await request("/api/dashboard.php");
  if (seq !== loadSeq) return;
  if (board.res.ok && board.body.stats) state.pending = Number(board.body.stats.pendingPayments || 0);
}

function releasePhotos() {
  for (const photo of state.modal?.photos || []) {
    if (photo.file) URL.revokeObjectURL(photo.src);
  }
}

function rememberDraw() {
  const form = document.getElementById("draw-form");
  if (!form || state.modal?.kind !== "draw") return;
  const data = Object.fromEntries(new FormData(form));
  const row = state.modal.row || {};
  state.modal.row = {
    ...row,
    title: data.title ?? row.title ?? "",
    subtitle: data.subtitle ?? "",
    prize: data.prize ?? "",
    ticket_price: data.ticket_price || row.ticket_price || "",
    total_tickets: data.total_tickets || row.total_tickets || "",
    start_date: data.start_date || row.start_date,
    end_date: data.end_date || row.end_date,
    status: data.status || row.status || "active",
    is_featured: data.featured === "1" ? "1" : "0",
    hidden: data.hidden === "1" ? "1" : "0",
  };
}

function closeModal() {
  releasePhotos();
  state.modal = null;
}

function lotteryPhotos(row) {
  return imageList(row).map((src) => ({ src }));
}

async function onClick(event) {
  if (event.target.classList.contains("backdrop")) {
    closeModal();
    render();
    return;
  }
  const el = event.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  try {
    if (act === "close-modal") {
      closeModal();
      render();
      return;
    }
    if (act === "menu") {
      state.menuOpen = !state.menuOpen;
      render();
      return;
    }
    if (act === "theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
      state.menuOpen = false;
      render();
      return;
    }
    if (act === "password") {
      state.modal = { kind: "password" };
      state.menuOpen = false;
      state.error = "";
      render();
      return;
    }
    if (act === "see-image") {
      const draw = el.dataset.gallery === "1"
        ? state.draws.rows.find((row) => String(row.id) === String(id))
        : null;
      const images = draw ? imageList(draw) : [safeSrc(el.dataset.src)].filter(Boolean);
      if (!images.length) return;
      releasePhotos();
      state.modal = { kind: "photo", images, index: 0, title: el.dataset.title || "Image" };
      render();
      return;
    }
    if (act === "photo-step") {
      const images = state.modal?.images || [];
      if (state.modal?.kind !== "photo" || images.length < 2) return;
      const dir = Number(el.dataset.dir) || 1;
      state.modal.index = (Number(state.modal.index || 0) + dir + images.length) % images.length;
      render();
      return;
    }
    if (act === "drop-photo" || act === "make-cover") {
      if (state.modal?.kind !== "draw") return;
      rememberDraw();
      const index = Number(el.dataset.index);
      const photos = state.modal.photos || [];
      if (!Number.isInteger(index) || index < 0 || index >= photos.length) return;
      if (act === "drop-photo") {
        const [removed] = photos.splice(index, 1);
        if (removed?.file) URL.revokeObjectURL(removed.src);
      } else if (index > 0) {
        const [item] = photos.splice(index, 1);
        photos.unshift(item);
      }
      state.modal.warning = "";
      render();
      return;
    }
    if (act === "nav") {
      const view = el.dataset.view;
      if (el.dataset.status && state[view]) {
        state[view].status = el.dataset.status;
        state[view].page = 1;
        state[view].search = "";
      }
      const next = viewHash[view] || "dashboard";
      if (location.hash === `#${next}`) {
        state.menuOpen = false;
        render();
        return;
      }
      location.hash = next;
      return;
    }
    if (act === "logout") {
      await request("/api/admin-logout.php", { method: "POST" });
      state.admin = null;
      closeModal();
      state.notice = "";
      state.error = "";
      render();
      return;
    }
    if (act === "page" || act === "modal-page") {
      const bag = act === "page" ? state[state.view] : state.modal;
      const next = Number(el.dataset.page);
      if (!bag || next < 1) return;
      bag.page = next;
      if (act === "page" && state.view === "payments") await refresh();
      render();
      return;
    }
    if (act === "download-report") {
      if (state.report.progress) return;
      const kind = document.getElementById("report-kind");
      if (kind) {
        state.report.kind = kind.value;
        state.report.from = document.getElementById("report-from").value;
        state.report.to = document.getElementById("report-to").value;
        state.report.lottery = document.getElementById("report-lottery").value;
        state.report.status = document.getElementById("report-status").value;
      }
      if (state.report.from && state.report.to && asNairobi(state.report.from) > asNairobi(state.report.to)) {
        state.error = "The start is after the end";
        render();
        return;
      }
      const format = el.dataset.format;
      const name = { csv: "CSV", xls: "Excel", pdf: "PDF" }[format] || "file";
      const params = reportParams(format);
      state.error = "";
      state.notice = "";
      const started = performance.now();
      state.report.progress = { format, label: `Preparing the ${name}…`, percent: null };
      render();
      const res = await fetch(`/api/admin-report.php?${params}`, { credentials: "same-origin" });
      if (res.status === 401) unauthorized(res);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(messageOf(body, "Could not create the report"));
      }
      const total = Number(res.headers.get("Content-Length") || 0);
      const reader = res.body?.getReader();
      const chunks = [];
      let received = 0;
      state.report.progress = { format, label: `Downloading the ${name}…`, percent: total ? 0 : null };
      paintReportProgress();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          if (total) {
            state.report.progress.percent = Math.min(99, Math.round((received / total) * 100));
            paintReportProgress();
          }
        }
      } else {
        chunks.push(new Uint8Array(await res.arrayBuffer()));
      }
      state.report.progress.percent = 100;
      paintReportProgress();
      const blob = new Blob(chunks, { type: res.headers.get("Content-Type") || "" });
      const remain = 500 - (performance.now() - started);
      if (remain > 0) await new Promise((resolve) => setTimeout(resolve, remain));
      const link = document.createElement("a");
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
      link.href = URL.createObjectURL(blob);
      link.download = match?.[1] || `report.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      state.report.progress = null;
      state.error = "";
      state.notice = "Report downloaded";
      render();
      return;
    }
    if (act === "new-draw") {
      releasePhotos();
      state.modal = { kind: "draw", row: null, photos: [], warning: "" };
      state.error = "";
      render();
      return;
    }
    if (act === "edit-draw") {
      releasePhotos();
      const row = state.draws.rows.find((item) => String(item.id) === String(id));
      state.modal = { kind: "draw", row, photos: lotteryPhotos(row), warning: "" };
      render();
      return;
    }
    if (act === "hide-draw") {
      const row = state.draws.rows.find((item) => String(item.id) === String(id));
      const concealed = row?.hidden === "1";
      state.modal = {
        kind: "confirm",
        act: "hide-draw",
        id,
        hidden: concealed ? "0" : "1",
        title: concealed ? "Show this lottery" : "Hide this lottery",
        message: concealed
          ? "Customers will see this lottery again."
          : "Customers will no longer see this lottery. Tickets already sold stay in place.",
      };
      render();
      return;
    }
    if (act === "feature") {
      state.modal = {
        kind: "confirm",
        act: "feature",
        id,
        title: "Feature this lottery",
        message: "This replaces the lottery currently shown first on the home page.",
      };
      render();
      return;
    }
    if (act === "delete-draw") {
      state.modal = {
        kind: "confirm",
        act: "delete-draw",
        id,
        title: "Delete this lottery",
        message: "This removes the lottery. Lotteries that already have tickets stay.",
      };
      render();
      return;
    }
    if (act === "winner") {
      const draw = state.draws.rows.find((row) => String(row.id) === String(id));
      const { res, body } = await request(`/api/lottery-orders.php?lottery_id=${encodeURIComponent(id)}`);
      unauthorized(res);
      if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load tickets"));
      state.modal = {
        kind: "tickets",
        lotteryId: id,
        lotteryTitle: draw?.title || "Lottery",
        rows: body.data || [],
        search: "",
        page: 1,
        pageSize: 8,
      };
      render();
      return;
    }
    if (act === "announce") {
      const current = state.modal;
      const row = current.rows.find((item) => String(item.id) === String(id) && item.ticket_number === el.dataset.ticket);
      state.modal = {
        kind: "confirm",
        act: "announce",
        lotteryId: current.lotteryId,
        orderId: id,
        ticket: el.dataset.ticket,
        title: "Announce winner",
        message: `Announce ticket ${el.dataset.ticket} for ${row?.customer_name || "this buyer"} on ${current.lotteryTitle}?`,
      };
      render();
      return;
    }
    if (act === "view-payment") {
      state.modal = {
        kind: "payment",
        row: state.payments.rows.find((row) => String(row.id) === String(id))
          || (state.board.recentPayments || []).find((row) => String(row.id) === String(id)),
      };
      render();
      return;
    }
    if (act === "approve" || act === "reject") {
      const row = state.payments.rows.find((item) => String(item.id) === String(id));
      state.modal = {
        kind: "confirm",
        act,
        id,
        title: act === "approve" ? "Approve payment" : "Reject payment",
        message: `${act === "approve" ? "Approve" : "Reject"} ${row?.customer_name || "this payment"} for ${money(row?.amount)}?`,
      };
      render();
      return;
    }
    if (act === "new-bank") {
      state.modal = { kind: "bank", row: null };
      render();
      return;
    }
    if (act === "edit-bank") {
      state.modal = { kind: "bank", row: state.banks.rows.find((row) => String(row.id) === String(id)) };
      render();
      return;
    }
    if (act === "bank-status") {
      const row = state.banks.rows.find((item) => String(item.id) === String(id));
      if (!row) return;
      const active = row.status === "active";
      state.modal = {
        kind: "confirm",
        act: "bank-status",
        title: active ? "Deactivate account" : "Activate account",
        message: `${row.bank_name} · ${row.account_number}`,
        payload: {
          id: row.id,
          bank_name: row.bank_name,
          account_name: row.account_name,
          account_number: row.account_number,
          status: active ? "inactive" : "active",
        },
      };
      render();
      return;
    }
    if (act === "download-customers") {
      const params = new URLSearchParams({
        format: el.dataset.format || "csv",
        search: state.customers.search,
      });
      const res = await fetch(`/api/admin-customers.php?${params}`, { credentials: "same-origin" });
      unauthorized(res);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(messageOf(body, "Could not export customers"));
      }
      const blob = new Blob([await res.arrayBuffer()], { type: res.headers.get("Content-Type") || "" });
      const link = document.createElement("a");
      const matchName = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
      link.href = URL.createObjectURL(blob);
      link.download = matchName?.[1] || `customers.${el.dataset.format || "csv"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      state.error = "";
      state.notice = "Customers downloaded";
      render();
      return;
    }
    if (act === "view-customer") {
      const known = state.customers.rows.find((row) => String(row.id) === String(id));
      state.modal = { kind: "customer", loading: true, customer: known || null, orders: [] };
      state.error = "";
      render();
      const { res, body } = await request(`/api/admin-customer.php?id=${encodeURIComponent(id)}`);
      unauthorized(res);
      if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load this customer"));
      if (state.modal?.kind !== "customer") return;
      state.modal = { kind: "customer", loading: false, customer: body.customer, orders: body.orders || [] };
      render();
      return;
    }
    if (act === "view-winner") {
      state.modal = { kind: "winner", row: state.winners.rows.find((row) => String(row.id) === String(id)) };
      render();
    }
  } catch (error) {
    caught(error);
  }
}

function onInput(event) {
  if (event.target.id === "modal-filter" && state.modal) {
    state.modal.search = event.target.value;
    state.modal.page = 1;
    render();
    return;
  }
  if (event.target.id !== "filter") return;
  const bag = state[state.view];
  bag.search = event.target.value;
  bag.page = 1;
  if (state.view === "payments") {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (state.view !== "payments") return;
      refresh().then(render).catch(caught);
    }, 250);
    return;
  }
  render();
}

function onChange(event) {
  const form = event.target.form;
  if (form?.id === "draw-form" && (event.target.name === "hidden" || event.target.name === "featured" || event.target.name === "status")) {
    const featured = form.elements.featured;
    const hidden = form.elements.hidden;
    if (event.target.name === "hidden" && hidden?.checked && featured) featured.checked = false;
    if (event.target.name === "featured" && featured?.checked && hidden) hidden.checked = false;
    if (event.target.name === "status" && event.target.value === "completed" && featured) featured.checked = false;
  }
  if (String(event.target.id || "").startsWith("report-")) {
    if (event.target.id === "report-page-size") {
      state.report.pageSize = Number(event.target.value) || 10;
      state.report.page = 1;
      render();
      return;
    }
    state.report.kind = document.getElementById("report-kind").value;
    state.report.from = document.getElementById("report-from").value;
    state.report.to = document.getElementById("report-to").value;
    state.report.lottery = document.getElementById("report-lottery").value;
    state.report.status = document.getElementById("report-status").value;
    if (event.target.id === "report-kind") state.report.status = "all";
    state.report.page = 1;
    state.error = "";
    if (state.report.from && state.report.to && asNairobi(state.report.from) > asNairobi(state.report.to)) {
      state.error = "The start is after the end";
      state.report.rows = [];
      state.report.columns = [];
      state.report.amount = null;
      state.report.loading = false;
      render();
      return;
    }
    state.report.loading = true;
    render();
    refresh().then(render).catch(caught);
    return;
  }
  if (event.target.name === "images" && state.modal?.kind === "draw") {
    rememberDraw();
    const photos = state.modal.photos || [];
    const skipped = [];
    for (const file of event.target.files || []) {
      if (photos.length >= 8) {
        skipped.push("8");
        break;
      }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
        skipped.push(file.name);
        continue;
      }
      photos.push({ src: URL.createObjectURL(file), file });
    }
    state.modal.photos = photos;
    state.modal.warning = skipped.length ? "Use up to 8 JPEG, PNG, or WebP images, 5 MB each." : "";
    event.target.value = "";
    render();
    return;
  }
  if (state.view === "dashboard") {
    const id = event.target.id;
    if (id === "range") {
      state.board.preset = event.target.value;
      if (event.target.value !== "custom") ensureBoardRange();
      if (event.target.value === "all") {
        state.board.from = "";
        state.board.to = "";
      }
      state.error = "";
      refresh().then(render).catch(caught);
      return;
    }
    if (id === "from" || id === "to") {
      state.board.preset = "custom";
      state.board[id] = event.target.value;
      if (state.board.from && state.board.to && asNairobi(state.board.from) > asNairobi(state.board.to)) {
        state.error = "The start is after the end";
        render();
        return;
      }
      state.error = "";
      refresh().then(render).catch(caught);
      return;
    }
    if (id === "draw" || id === "account" || id === "flow") {
      const key = { draw: "lottery", account: "bank", flow: "status" }[id];
      state.board[key] = event.target.value;
      state.error = "";
      refresh().then(render).catch(caught);
      return;
    }
  }
  const bag = state[state.view];
  if (!bag) return;
  if (event.target.id === "status") {
    bag.status = event.target.value;
    bag.page = 1;
  } else if (event.target.id === "page-size") {
    bag.pageSize = Number(event.target.value) || 10;
    bag.page = 1;
  } else return;
  if (state.view === "payments") {
    refresh().then(render).catch(caught);
    return;
  }
  render();
}

async function submitLogin(form) {
  state.error = "";
  const data = Object.fromEntries(new FormData(form));
  const { res, body } = await request("/api/admin-login.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: data.username, password: data.password }),
  });
  if (!res.ok || body.success === false) {
    state.error = messageOf(body, "Invalid username or password");
    render();
    return;
  }
  state.admin = body.admin;
  state.view = viewFromHash();
  try {
    await refresh();
  } catch (error) {
    state.error = error.message;
  }
  render();
}

async function submitDraw(form) {
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const payload = {
      title: data.title,
      subtitle: data.subtitle,
      prize: data.prize,
      ticket_price: Number(data.ticket_price),
      total_tickets: Number(data.total_tickets),
      start_date: data.start_date,
      end_date: data.end_date,
      featured: data.featured === "1",
      hidden: data.hidden === "1",
      image_urls: [],
    };
    for (const photo of state.modal.photos || []) {
      if (photo.file) {
        const body = new FormData();
        body.append("image", photo.file);
        const uploaded = await request("/api/upload-lottery-image.php", { method: "POST", body });
        unauthorized(uploaded.res);
        if (!uploaded.res.ok || uploaded.body.success === false) {
          throw new Error(messageOf(uploaded.body, "Image upload failed"));
        }
        payload.image_urls.push(uploaded.body.image_url);
      } else if (photo.src && !photo.src.startsWith("blob:")) {
        payload.image_urls.push(photo.src);
      }
    }
    if (state.modal.row?.id) {
      payload.id = state.modal.row.id;
      payload.status = data.status;
    }
    const path = state.modal.row?.id ? "/api/admin-update-lottery.php" : "/api/admin-create-lottery.php";
    await postOk(path, payload);
    closeModal();
    state.notice = "Lottery saved";
    state.error = "";
    await refresh();
    render();
  } catch (error) {
    if (error.unauthorized) caught(error);
    else showModalError(error);
  } finally {
    button.disabled = false;
  }
}

async function submitBank(form) {
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const payload = {
      bank_name: data.bank_name,
      account_name: data.account_name,
      account_number: data.account_number,
      status: data.status || "active",
    };
    if (state.modal.row) {
      payload.id = state.modal.row.id;
      await postOk("/api/admin-update-bank-account.php", payload);
    } else {
      await postOk("/api/admin-create-bank-account.php", payload);
    }
    state.modal = null;
    state.notice = "Bank account saved";
    state.error = "";
    await refresh();
    render();
  } catch (error) {
    if (error.unauthorized) caught(error);
    else showModalError(error);
  } finally {
    button.disabled = false;
  }
}

async function submitConfirm() {
  const modal = state.modal;
  try {
    if (modal.act === "hide-draw") {
      await postOk("/api/admin-hide-lottery.php", { id: modal.id, hidden: modal.hidden });
      state.notice = modal.hidden === "1" ? "Lottery hidden from customers" : "Lottery visible to customers";
    } else if (modal.act === "feature") {
      await postOk("/api/admin-feature-lottery.php", { id: modal.id });
      state.notice = "Featured lottery updated";
    } else if (modal.act === "delete-draw") {
      await postOk("/api/admin-delete-lottery.php", { id: modal.id });
      state.notice = "Lottery deleted";
    } else if (modal.act === "announce") {
      await postOk("/api/announce-winner.php", {
        lottery_id: modal.lotteryId,
        order_id: modal.orderId,
        winning_ticket_number: modal.ticket,
      });
      state.notice = "Winner announced";
    } else if (modal.act === "bank-status") {
      await postOk("/api/admin-update-bank-account.php", modal.payload);
      state.notice = "Bank account updated";
    } else if (modal.act === "approve") {
      await postOk("/api/approve-payment.php", { payment_id: modal.id });
      state.notice = "Payment approved";
    } else if (modal.act === "reject") {
      await postOk("/api/reject-payment.php", { payment_id: modal.id });
      state.notice = "Payment rejected";
    }
    state.modal = null;
    state.error = "";
    await refresh();
    render();
  } catch (error) {
    if (error.unauthorized) caught(error);
    else showModalError(error);
  }
}

async function submitPassword(form) {
  const data = Object.fromEntries(new FormData(form));
  if (data.new_password !== data.confirm_password) {
    showModalError(new Error("New passwords do not match"));
    return;
  }
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    await postOk("/api/admin-password.php", {
      current_password: data.current_password,
      new_password: data.new_password,
    });
    state.modal = null;
    state.notice = "Password changed";
    state.error = "";
    render();
  } catch (error) {
    if (error.unauthorized) caught(error);
    else showModalError(error);
  } finally {
    button.disabled = false;
  }
}

function onSubmit(event) {
  event.preventDefault();
  if (event.target.id === "login-form") submitLogin(event.target);
  else if (event.target.id === "draw-form") submitDraw(event.target);
  else if (event.target.id === "bank-form") submitBank(event.target);
  else if (event.target.id === "confirm-form") submitConfirm();
  else if (event.target.id === "password-form") submitPassword(event.target);
}

document.addEventListener("click", (event) => { onClick(event); });
document.addEventListener("input", onInput);
document.addEventListener("change", onChange);
document.addEventListener("submit", onSubmit);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modal) {
    state.modal = null;
    render();
  }
});

async function followHash() {
  if (!state.admin) return;
  const view = viewFromHash();
  const same = view === state.view;
  state.view = view;
  state.menuOpen = false;
  if (same) {
    render();
    return;
  }
  state.error = "";
  state.notice = "";
  closeModal();
  try {
    await refresh();
  } catch (error) {
    state.error = error.message || "Could not load staff data";
  }
  render();
}

async function boot() {
  state.view = viewFromHash();
  const { res, body } = await request("/api/admin-session.php");
  if (res.ok && body.success) {
    state.admin = body.admin;
    try {
      await refresh();
    } catch (error) {
      state.error = error.message || "Could not load staff data";
    }
  }
  render();
}

window.addEventListener("hashchange", () => { followHash(); });

boot();

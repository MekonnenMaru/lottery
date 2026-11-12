let appName = document.querySelector('meta[name="app-name"]').content;
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
  admins: "admins",
  logs: "logs",
  settings: "settings",
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
  admins: "admins",
  admin: "admins",
  accounts: "admins",
  staff: "admins",
  logs: "logs",
  log: "logs",
  events: "logs",
  audit: "logs",
  settings: "settings",
  setting: "settings",
  branding: "settings",
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
  toasts: [],
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
  settings: {
    app_name: appName,
    developer_name: "Maraki Tech",
    developer_url: "https://marakitech.et",
    credit_prefix: "Developed by",
    ocr_scan_limit: 60,
    ocr_scan_window_minutes: 15,
    loaded: false,
  },
  admins: { rows: [], privileges: [], search: "", status: "all", page: 1, pageSize: 10 },
  logs: { rows: [], actions: [], search: "", status: "all", page: 1, pageSize: 25, total: 0 },
  modal: null,
};

const viewPrivilege = {
  dashboard: null,
  draws: "lotteries",
  payments: "payments",
  banks: "banks",
  winners: "winners",
  customers: "customers",
  report: "reports",
  logs: "logs",
  settings: "settings",
};

function isSuper() {
  return state.admin?.role === "super";
}

function hasPriv(id) {
  if (!state.admin) return false;
  if (isSuper()) return true;
  return (state.admin.privileges || []).includes(id);
}

function canView(view) {
  if (view === "admins") return isSuper();
  const need = viewPrivilege[view];
  return !need || hasPriv(need);
}

function firstAllowedView() {
  return ["dashboard", "payments", "draws", "banks", "winners", "customers", "report", "admins", "logs", "settings"].find(canView) || "dashboard";
}

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

let toastSeq = 0;
const toastTimers = Object.create(null);
const toastTypes = new Set(["success", "error", "warning", "info", "default"]);

function toastKind(type) {
  const name = String(type || "default").toLowerCase();
  if (name === "ok" || name === "done") return "success";
  if (name === "danger" || name === "fail" || name === "failed") return "error";
  if (name === "warn" || name === "caution") return "warning";
  return toastTypes.has(name) ? name : "default";
}

/** One shared notification API: notify(message, type). */
function notify(message, type = "default") {
  const text = String(message ?? "").trim();
  if (!text) return;
  const kind = toastKind(type);
  const id = ++toastSeq;
  state.toasts = [...state.toasts, { id, message: text, type: kind }];
  if (!state.admin && (kind === "error" || kind === "warning")) state.error = text;
  if (kind === "success") state.notice = "";
  if (state.admin && (kind === "error" || kind === "warning")) state.error = "";
  render();
  window.clearTimeout(toastTimers[id]);
  toastTimers[id] = window.setTimeout(() => dismissToast(id), 4500);
}

function dismissToast(id) {
  window.clearTimeout(toastTimers[id]);
  delete toastTimers[id];
  const next = state.toasts.filter((row) => row.id !== id);
  if (next.length === state.toasts.length) return;
  state.toasts = next;
  render();
}

function toastIcon(type) {
  if (type === "success") return glyph.check;
  if (type === "error") return glyph.x;
  if (type === "warning") return glyph.warn;
  if (type === "info") return glyph.info;
  return "";
}

function toastsHtml() {
  if (!state.toasts.length) return "";
  return `
    <div class="toast-stack" aria-live="polite" aria-relevant="additions">
      ${state.toasts.map((row) => `
        <div class="toast toast-${esc(row.type)}" role="${row.type === "error" || row.type === "warning" ? "alert" : "status"}">
          ${toastIcon(row.type) ? `<span class="toast-icon" aria-hidden="true">${svg(toastIcon(row.type))}</span>` : ""}
          <p class="toast-msg">${esc(row.message)}</p>
          <button type="button" class="toast-close" data-act="dismiss-toast" data-id="${esc(row.id)}" aria-label="Dismiss">${svg(glyph.x)}</button>
        </div>`).join("")}
    </div>`;
}

function appBase() {
  const match = location.pathname.match(/^(.*)\/manage(?:\/|$)/);
  return match ? match[1] : "";
}

function safeSrc(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return value;
  if (value.startsWith("https://images.pexels.com/")) return value;
  const base = appBase();
  // Split "/api" so embed path rewriting does not break this check.
  const receipt = "/" + "api/receipt-files/";
  if (base && value.startsWith(`${base}/uploads/`)) return value;
  if (base && value.startsWith(`${base}${receipt}`)) return value;
  if (value.startsWith("/uploads/")) return `${base}${value}`;
  if (value.startsWith(receipt)) return `${base}${value}`;
  if (value.startsWith("uploads/")) return `${base}/${value}`;
  return "";
}

const ZONE = "Africa/Addis_Ababa";
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

const LOGIN_SAVE_KEY = "lottery.manage.login";

function readSavedLogin() {
  try {
    const raw = localStorage.getItem(LOGIN_SAVE_KEY);
    if (!raw) return { remember: true, username: "", password: "" };
    const parsed = JSON.parse(raw);
    if (parsed?.remember === false) {
      return { remember: false, username: "", password: "" };
    }
    return {
      remember: true,
      username: String(parsed?.username || ""),
      password: String(parsed?.password || ""),
    };
  } catch {
    return { remember: true, username: "", password: "" };
  }
}

function writeSavedLogin({ remember, username, password }) {
  try {
    if (!remember) {
      localStorage.setItem(LOGIN_SAVE_KEY, JSON.stringify({ remember: false }));
      return;
    }
    localStorage.setItem(LOGIN_SAVE_KEY, JSON.stringify({
      remember: true,
      username: String(username || ""),
      password: String(password || ""),
    }));
  } catch {
    /* ignore quota / private mode */
  }
}

function login() {
  const themeLabel = state.theme === "dark" ? "Light theme" : "Dark theme";
  const saved = readSavedLogin();
  return `
    <main class="login">
      ${toastsHtml()}
      <button type="button" class="icon-btn login-theme" data-act="theme" aria-label="${esc(themeLabel)}" title="${esc(themeLabel)}">${svg(state.theme === "dark" ? glyph.sun : glyph.moon)}</button>
      <form id="login-form" class="card">
        <p class="eyebrow">${esc(appName)}</p>
        <h1>Sign in</h1>
        <label>Username <input id="username" name="username" autocomplete="username" required value="${esc(saved.username)}"></label>
        <label>Password <input id="password" name="password" type="password" autocomplete="current-password" required value="${esc(saved.password)}"></label>
        <label class="login-remember"><input name="remember" type="checkbox" value="1" ${saved.remember ? "checked" : ""}> Save username and password</label>
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
    ["admins", "Admin accounts", "", "key"],
    ["logs", "Event logs", "", "list"],
    ["settings", "Settings", "", "gear"],
  ].filter(([id]) => canView(id));
  const titles = {
    dashboard: ["Dashboard", "Collected, waiting, and rejected money for the period you choose."],
    draws: ["Lotteries", "Create a lottery, edit one, or choose its winner."],
    payments: ["Payments", "Receipts waiting for a decision."],
    banks: ["Banks", "Accounts buyers transfer to."],
    winners: ["Winners", "Announced results."],
    customers: ["Customers", "People registered with Telegram, and the orders they placed."],
    report: ["Report", "Review the rows, then export them."],
    admins: ["Admin accounts", "Create admins and choose what they can open."],
    logs: ["Event logs", "Track staff actions across payments, lotteries, banks, and accounts."],
    settings: ["Settings", "App name and OCR scan limits."],
  };
  if (!canView(state.view)) state.view = firstAllowedView();
  const [title, blurb] = titles[state.view] || titles.dashboard;
  const roleLabel = isSuper() ? "Super admin" : "Admin";
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
            <span class="foot-circle" aria-hidden="true">${esc(String(state.admin.name || state.admin.username || "?").slice(0, 1).toUpperCase())}</span>
            <span class="foot-role" title="${esc(state.admin.username)}">${esc(state.admin.name || state.admin.username)} · ${esc(roleLabel)}</span>
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
          ${viewBody()}
        </section>
      </div>
      ${toastsHtml()}
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
  if (state.view === "admins") return adminsView();
  if (state.view === "logs") return logsView();
  if (state.view === "settings") return settingsView();
  return drawsView();
}

function logsView() {
  const bag = state.logs;
  const pages = Math.max(1, Math.ceil(bag.total / bag.pageSize));
  const info = {
    rows: bag.rows,
    total: bag.total,
    pages,
    page: Math.min(bag.page, pages),
    start: (Math.min(bag.page, pages) - 1) * bag.pageSize,
  };
  const statuses = [
    ["all", "All actions"],
    ...(bag.actions || []).map((item) => [item.id, item.label]),
  ];
  return `
    ${toolbar({
      placeholder: "Filter by action, staff, or detail",
      statuses,
      extra: isSuper()
        ? `<button type="button" class="danger" data-act="clear-logs">${svg(glyph.trash)} Clear logs</button>`
        : "",
    })}
    ${tableHtml({
      name: "Event logs",
      empty: "No events match this filter.",
      columns: [
        { label: "When", cell: (row) => esc(when(row.created_at)) },
        {
          label: "Staff",
          cell: (row) => `<div class="who"><div><strong>${esc(row.admin_name)}</strong><span>${esc(row.admin_username || "—")}</span></div></div>`,
        },
        { label: "Action", cell: (row) => esc(row.action_label || row.action) },
        { label: "Detail", cell: (row) => esc(row.detail_text || "—") },
      ],
      rows: info.rows,
    })}
    ${pagerHtml(info, "page")}`;
}

function privilegeChecks(name, selected) {
  const picked = new Set(selected || []);
  return `
    <div class="priv-list">
      ${(state.admins.privileges || []).map((item) => `
        <label class="priv-item">
          <input type="checkbox" name="${esc(name)}" value="${esc(item.id)}" ${picked.has(item.id) ? "checked" : ""}>
          <span>${esc(item.label)}</span>
        </label>`).join("")}
    </div>`;
}

function privilegeText(row) {
  if (row.role === "super") return "All";
  const labels = (row.privileges || []).map((id) => {
    const match = (state.admins.privileges || []).find((item) => item.id === id);
    return match ? match.label : id;
  });
  return labels.join(", ") || "—";
}

function adminsView() {
  const bag = state.admins;
  const filtered = bag.rows.filter((row) => {
    if (bag.status === "active" && !row.active) return false;
    if (bag.status === "inactive" && row.active) return false;
    return match(row, bag.search, ["name", "username", "phone", "role"]);
  });
  const info = pageSlice(filtered, bag);
  return `
    ${toolbar({
      placeholder: "Filter by name, username, or phone",
      statuses: [["all", "All statuses"], ["active", "Active"], ["inactive", "Inactive"]],
      extra: `<button type="button" class="primary" data-act="new-admin">${svg(glyph.plus)} New admin</button>`,
    })}
    ${tableHtml({
      name: "Admin accounts",
      empty: "No admin accounts match this filter.",
      columns: [
        {
          label: "Name",
          cell: (row) => `<div class="who"><div><strong>${esc(row.name || row.username)}</strong><span>${esc(row.role === "super" ? "Super admin" : "Admin")}</span></div></div>`,
        },
        { label: "Username", cell: (row) => esc(row.username) },
        { label: "Phone", cell: (row) => esc(row.phone || "—") },
        { label: "Privileges", cell: (row) => esc(privilegeText(row)) },
        { label: "Status", cell: (row) => badge(row.active ? "active" : "inactive") },
      ],
      rows: info.rows,
      actions: (row) => row.role === "super"
        ? iconSlots([
          iconButton({ act: "edit-admin", id: row.id, label: "Edit", name: "edit" }),
          null,
        ])
        : iconSlots([
          iconButton({ act: "edit-admin", id: row.id, label: "Edit", name: "edit" }),
          iconButton({
            act: "admin-status",
            id: row.id,
            label: row.active ? "Disable" : "Enable",
            name: "power",
            tone: row.active ? "bad" : "good",
          }),
        ]),
    })}
    ${pagerHtml(info, "page")}`;
}

function settingsView() {
  const bag = state.settings;
  return `
    <form id="settings-form" class="panel settings-form">
      <h2>Branding</h2>
      <p class="muted">These names appear on the customer site, staff panel, reports, and the developer credit.</p>
      <label>App name <input name="app_name" required maxlength="40" value="${esc(bag.app_name)}"></label>
      <label>Credit line <input name="credit_prefix" maxlength="40" value="${esc(bag.credit_prefix)}" placeholder="Developed by"></label>
      <label>Developer name <input name="developer_name" required maxlength="60" value="${esc(bag.developer_name)}"></label>
      <label>Developer URL <input name="developer_url" type="url" required maxlength="200" value="${esc(bag.developer_url)}" placeholder="https://marakitech.et"></label>
      <h2>Receipt OCR</h2>
      <p class="muted">Limits how many receipt scans each staff account can run in a time window.</p>
      <div class="split">
        <label>Scan limit <input name="ocr_scan_limit" type="number" min="1" max="500" step="1" required value="${esc(bag.ocr_scan_limit)}"></label>
        <label>Window (minutes) <input name="ocr_scan_window_minutes" type="number" min="1" max="1440" step="1" required value="${esc(bag.ocr_scan_window_minutes)}"></label>
      </div>
      <div class="toolbar">
        <button class="primary" type="submit">Save settings</button>
      </div>
    </form>`;
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

function spinGlyph() {
  return `<svg class="spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.28"></circle><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path></svg>`;
}

/** Disable a button and show spinner + label. Returns restore fn, or null if already busy. */
function busyButton(button, label) {
  if (!button) return () => {};
  if (button.dataset.busy === "1") return null;
  const prevHtml = button.innerHTML;
  const prevDisabled = button.disabled;
  button.dataset.busy = "1";
  button.disabled = true;
  button.classList.add("is-busy");
  button.setAttribute("aria-busy", "true");
  button.innerHTML = `${spinGlyph()} <span>${esc(label)}</span>`;
  return () => {
    if (!button.isConnected) return;
    button.dataset.busy = "";
    button.disabled = prevDisabled;
    button.classList.remove("is-busy");
    button.removeAttribute("aria-busy");
    button.innerHTML = prevHtml;
  };
}

function lockForm(form, locked) {
  if (!form) return;
  form.querySelectorAll("input, select, textarea, button").forEach((el) => {
    if (el.dataset.busy === "1") return;
    if (locked) {
      if (!el.dataset.wasDisabled) el.dataset.wasDisabled = el.disabled ? "1" : "0";
      el.disabled = true;
    } else if (el.dataset.wasDisabled != null) {
      el.disabled = el.dataset.wasDisabled === "1";
      delete el.dataset.wasDisabled;
    }
  });
}

function setDrawSaving(next) {
  if (state.modal?.kind === "draw") state.modal.saving = next || null;
  const box = document.querySelector("#draw-saving");
  const button = document.querySelector("#draw-form [type=submit]");
  const form = document.querySelector("#draw-form");
  if (form) {
    form.querySelectorAll("input, select, button").forEach((el) => {
      if (el.type === "submit") return;
      el.disabled = Boolean(next);
    });
  }
  if (!box || !button) return;
  if (!next) {
    box.hidden = true;
    button.disabled = false;
    button.innerHTML = "Save";
    return;
  }
  box.hidden = false;
  const label = box.querySelector(".draw-saving-label");
  const pct = box.querySelector(".draw-saving-pct");
  const meter = box.querySelector(".report-bar");
  const bar = box.querySelector(".report-bar > span");
  if (label) label.textContent = next.label || "Saving…";
  if (pct) pct.textContent = next.percent == null ? "" : `${next.percent}%`;
  if (meter && bar) {
    if (next.percent == null) {
      bar.classList.add("indeterminate");
      bar.style.width = "";
      meter.removeAttribute("aria-valuenow");
    } else {
      bar.classList.remove("indeterminate");
      bar.style.width = `${next.percent}%`;
      meter.setAttribute("aria-valuenow", String(next.percent));
    }
  }
  button.disabled = true;
  button.innerHTML = `${spinGlyph()} ${esc(next.label || "Saving…")}`;
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
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="m4.2 4.2 1.4 1.4"/><path d="m18.4 18.4 1.4 1.4"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="m4.2 19.8 1.4-1.4"/><path d="m18.4 5.6 1.4-1.4"/><path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M7 12h10"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  warn: '<path d="M12 3 2 20h20Z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/>',
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
    iconButton({ act: "progress-draw", id: row.id, label: "Progress", name: "chart" }),
    iconButton({ act: "edit-draw", id: row.id, label: "Edit", name: "edit" }),
    open ? iconButton({ act: "winner", id: row.id, label: "Pick winner", name: "trophy" }) : "",
    isSuper() && !sold
      ? iconButton({ act: "delete-draw", id: row.id, label: "Delete", name: "trash", tone: "bad" })
      : "",
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
      placeholder: "Filter by name, phone, txn id, or staff",
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
        { label: "Txn ID", cell: (row) => row.transaction_id ? `<span class="code">${esc(row.transaction_id)}</span>` : `<span class="muted">—</span>` },
        { label: "Lottery", cell: (row) => esc(`${row.lottery_id} · ${row.lottery_title}`) },
        { label: "Tickets", cell: (row) => esc(row.ticket_numbers) },
        { label: "Amount", cell: (row) => esc(money(row.amount)) },
        { label: "Status", cell: (row) => badge(row.status) },
        {
          label: "Who",
          cell: (row) => {
            if (row.reviewed_by_name) return esc(row.reviewed_by_name);
            if (row.scanned_by_name) return esc(row.scanned_by_name);
            return `<span class="muted">—</span>`;
          },
        },
        { label: "Date", cell: (row) => esc(when(row.created_at)) },
      ],
      rows: info.rows,
      actions: (row) => {
        const src = safeSrc(row.screenshot_url);
        return iconSlots([
          iconButton({ act: "view-payment", id: row.id, label: "View", name: "eye" }),
          src ? iconButton({ act: "see-image", src, caption: `${row.customer_name} receipt`, label: "See receipt", name: "image" }) : "",
          isSuper()
            ? iconButton({ act: "delete-payment", id: row.id, label: "Delete", name: "trash", tone: "bad" })
            : "",
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

function modalClose() {
  return `<button type="button" class="modal-close" data-act="close-modal" aria-label="Close" title="Close">${svg(glyph.x)}</button>`;
}

function customerModal() {
  const row = state.modal.customer;
  const orders = state.modal.orders || [];
  if (state.modal.loading || !row) {
    return `<div class="modal-card">${modalClose()}<h2>Customer</h2><p class="muted">Loading history…</p></div>`;
  }
  const history = orders.length
    ? `<div class="table-wrap"><table aria-label="Customer orders"><thead><tr><th scope="col">When</th><th scope="col">Lottery</th><th scope="col">Tickets</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${esc(when(order.created_at))}</td><td>${esc(order.title)}</td><td>${esc(order.tickets || "—")}</td><td>${esc(money(order.amount))}</td><td>${badge(order.status)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">No orders yet.</p>`;
  return `
    <div class="modal-card wide">
      ${modalClose()}
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
    admin: adminForm,
    tickets: ticketsModal,
    progress: progressModal,
    confirm: confirmModal,
    payment: paymentModal,
    winner: winnerModal,
    customer: customerModal,
    photo: photoModal,
    password: passwordForm,
  }[state.modal.kind];
  return `<div class="backdrop">${inner()}</div>`;
}

function progressBoard(total, byNumber, filter) {
  const cells = [];
  for (let number = 1; number <= total; number += 1) {
    const hit = byNumber.get(number);
    const kind = hit?.status === "approved" ? "taken" : (hit ? "pending" : "free");
    if (filter === "taken" && kind !== "taken") continue;
    if (filter === "pending" && kind !== "pending") continue;
    if (filter === "free" && kind !== "free") continue;
    if (filter === "held" && kind === "free") continue;
    const label = padTicketDisplay(number);
    const tip = hit
      ? `${label} · ${hit.status} · ${hit.customer_name || hit.customer_phone || "Buyer"}`
      : `${label} · free`;
    cells.push(
      `<button type="button" class="num-cell is-${kind}" data-act="progress-number" data-number="${number}" title="${esc(tip)}" aria-label="${esc(tip)}">${esc(label)}</button>`,
    );
  }
  return cells.length
    ? `<div class="num-board">${cells.join("")}</div>`
    : `<p class="muted">No numbers in this filter.</p>`;
}

function padTicketDisplay(number) {
  return String(number).padStart(3, "0");
}

function progressModal() {
  const modal = state.modal;
  if (modal.loading) {
    return `<div class="modal-card wide">${modalClose()}<h2>Lottery progress</h2><p class="muted">Loading…</p></div>`;
  }
  const lottery = modal.lottery || {};
  const summary = modal.summary || {};
  const tickets = modal.tickets || [];
  const filter = modal.boardFilter || "all";
  const search = modal.search || "";
  const byNumber = new Map(tickets.map((row) => [Number(row.number), row]));
  const filteredBuyers = tickets.filter((row) => match(row, search, [
    "ticket_number", "customer_name", "customer_phone", "status", "order_id",
  ]));
  const focus = modal.focusNumber ? byNumber.get(Number(modal.focusNumber)) : null;
  const info = pageSlice(filteredBuyers, modal);
  const filters = [
    ["all", "All"],
    ["held", "Taken + pending"],
    ["taken", "Taken"],
    ["pending", "Pending"],
    ["free", "Free"],
  ];
  return `
    <div class="modal-card wide progress-modal">
      ${modalClose()}
      <div class="progress-head">
        <div>
          <h2>${esc(lottery.title || "Lottery progress")}</h2>
          <p class="muted">${esc(lottery.subtitle || lottery.prize || "")}</p>
        </div>
        <div class="progress-meta">
          ${badge(lottery.status || "active")}
          ${lottery.is_featured === "1" ? badge("featured") : ""}
          ${lottery.hidden === "1" ? badge("hidden") : ""}
        </div>
      </div>
      <div class="progress-stats">
        <div><span class="muted">Total</span><strong>${esc(summary.total || 0)}</strong></div>
        <div><span class="muted">Taken</span><strong>${esc(summary.taken || 0)}</strong></div>
        <div><span class="muted">Pending</span><strong>${esc(summary.pending || 0)}</strong></div>
        <div><span class="muted">Free</span><strong>${esc(summary.free || 0)}</strong></div>
        <div><span class="muted">Filled</span><strong>${esc(summary.fill_percent || 0)}%</strong></div>
        <div><span class="muted">Collected</span><strong>${esc(money(summary.collected || 0))}</strong></div>
        <div><span class="muted">In review</span><strong>${esc(money(summary.pending_amount || 0))}</strong></div>
        <div><span class="muted">Expected</span><strong>${esc(money(summary.expected || 0))}</strong></div>
      </div>
      <p class="muted progress-timing">
        ${esc(money(lottery.ticket_price || 0))} / ticket
        · Starts ${esc(when(lottery.start_date))}
        · Ends ${esc(when(lottery.end_date))}
        ${modal.winner ? ` · Winner #${esc(modal.winner.ticket_number)} (${esc(modal.winner.customer_name || modal.winner.customer_phone || "—")})` : ""}
      </p>
      <div class="progress-fill" aria-hidden="true"><span style="width:${Math.min(100, Number(summary.fill_percent) || 0)}%"></span></div>
      ${focus ? `<p class="progress-focus">#${esc(focus.ticket_number)} · ${badge(focus.status)} · ${esc(focus.customer_name || "—")} · ${esc(focus.customer_phone || "—")}</p>` : ""}
      <div class="progress-section">
        <div class="progress-section-head">
          <h3>Numbers</h3>
          <div class="chip-row">
            ${filters.map(([value, label]) => `
              <button type="button" class="chip ${filter === value ? "on" : ""}" data-act="progress-filter" data-filter="${value}">${esc(label)}</button>
            `).join("")}
          </div>
        </div>
        <div class="num-legend">
          <span class="is-taken">Taken</span>
          <span class="is-pending">Pending</span>
          <span class="is-free">Free</span>
        </div>
        ${progressBoard(Number(summary.total) || 0, byNumber, filter)}
      </div>
      <div class="progress-section">
        <div class="progress-section-head">
          <h3>Buyers</h3>
          <label class="progress-search">Filter
            <input id="modal-filter" type="search" value="${esc(search)}" placeholder="Ticket, name, phone" aria-label="Filter buyers">
          </label>
        </div>
        ${tableHtml({
          name: "Lottery buyers",
          empty: tickets.length ? "No buyers match this filter." : "No tickets taken yet.",
          columns: [
            { label: "Ticket", cell: (row) => esc(row.ticket_number) },
            { label: "Buyer", cell: (row) => esc(row.customer_name || "—") },
            { label: "Phone", cell: (row) => esc(row.customer_phone || "—") },
            { label: "Status", cell: (row) => badge(row.status) },
            { label: "When", cell: (row) => esc(when(row.created_at)) },
          ],
          rows: info.rows,
        })}
        ${pagerHtml(info, "modal-page")}
      </div>
    </div>`;
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
      ${modalClose()}
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
      <div id="draw-saving" class="draw-saving" role="status" aria-live="polite" ${state.modal.saving ? "" : "hidden"}>
        <div class="report-progress-row">
          <span class="draw-saving-label">${esc(state.modal.saving?.label || "Saving…")}</span>
          <span class="draw-saving-pct">${state.modal.saving?.percent == null ? "" : `${state.modal.saving.percent}%`}</span>
        </div>
        <div class="report-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${state.modal.saving?.percent == null ? "" : `aria-valuenow="${state.modal.saving.percent}"`}>
          <span class="${state.modal.saving?.percent == null ? "indeterminate" : ""}" style="${state.modal.saving?.percent == null ? "" : `width:${state.modal.saving.percent}%`}"></span>
        </div>
      </div>
      <p id="modal-error" class="alert" ${state.modal.warning ? "" : "hidden"}>${esc(state.modal.warning || "")}</p>
      <div class="modal-actions">
        <button class="primary" type="submit" ${state.modal.saving ? "disabled" : ""}>${state.modal.saving ? `${spinGlyph()} ${esc(state.modal.saving.label || "Saving…")}` : "Save"}</button>
      </div>
    </form>`;
}

function bankForm() {
  const row = state.modal.row;
  return `
    <form id="bank-form" class="modal-card">
      ${modalClose()}
      <h2>${row ? "Edit account" : "New account"}</h2>
      <label>Bank <input name="bank_name" required maxlength="80" value="${esc(row?.bank_name || "")}"></label>
      <label>Account name <input name="account_name" required maxlength="80" value="${esc(row?.account_name || "")}"></label>
      <label>Account number <input name="account_number" required maxlength="40" value="${esc(row?.account_number || "")}"></label>
      ${row ? `<label>Status <select name="status"><option value="active" ${row.status !== "inactive" ? "selected" : ""}>Active</option><option value="inactive" ${row.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>` : ""}
      <p id="modal-error" class="alert" hidden></p>
      <div class="modal-actions">
        <button class="primary" type="submit">Save</button>
      </div>
    </form>`;
}

function adminForm() {
  const row = state.modal.row;
  const editing = Boolean(row?.id);
  const isSuperRow = row?.role === "super";
  return `
    <form id="admin-form" class="modal-card">
      ${modalClose()}
      <h2>${editing ? "Edit admin" : "New admin"}</h2>
      ${editing ? `<input type="hidden" name="admin_id" value="${esc(row.id)}">` : ""}
      <label>Name <input name="name" required maxlength="80" value="${esc(row?.name || "")}" autocomplete="name"></label>
      ${editing
        ? `<p class="muted">Username <strong>${esc(row.username)}</strong></p>`
        : `<label>Username <input name="username" required maxlength="32" autocomplete="off" pattern="[A-Za-z0-9._-]{3,32}"></label>`}
      <label>Phone <input name="phone" maxlength="20" value="${esc(row?.phone || "")}" inputmode="tel" placeholder="Optional"></label>
      ${isSuperRow ? "" : `
        <label>${editing ? "New password" : "Password"}
          <input name="password" type="password" ${editing ? "" : "required"} minlength="4" maxlength="72" autocomplete="new-password" ${editing ? 'placeholder="Leave blank to keep"' : ""}>
        </label>
        <p class="muted">Privileges</p>
        ${privilegeChecks("privileges", editing ? row.privileges : [])}
      `}
      <p id="modal-error" class="alert" hidden></p>
      <div class="modal-actions">
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
      ${modalClose()}
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
    </div>`;
}

function confirmModal() {
  const modal = state.modal;
  return `
    <form id="confirm-form" class="modal-card">
      ${modalClose()}
      <h2>${esc(modal.title)}</h2>
      <p>${esc(modal.message)}</p>
      <p id="modal-error" class="alert" hidden></p>
      <div class="modal-actions">
        <button class="primary" type="submit">Confirm</button>
      </div>
    </form>`;
}

function emptyOcr() {
  return {
    loading: false,
    text: "",
    confidence: null,
    language: "eng",
    receipt: "",
    scanned_by: null,
    scanned_by_name: "",
    scanned_at: "",
    error: "",
    notice: "",
  };
}

/** Bank refs are CAPITAL letters + digits (e.g. FT26305GCDDP). Reject status words like COMPLETED. */
function normalizeBankTxn(value) {
  const text = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9][A-Z0-9-]{5,63}$/.test(text)) return "";
  if (!/[A-Z]/.test(text) || !/\d/.test(text)) return "";
  if (/^(COMPLETED|COMPLETE|SUCCESS|SUCCESSFUL|PENDING|APPROVED|REJECTED|FAILED|TRANSFER|REFERENCE)$/.test(text)) {
    return "";
  }
  return text;
}

/** Prefer a capital bank reference from the scan response (not OCR internals). */
function txnFromScanResponse(body, existing) {
  const kept = normalizeBankTxn(existing);
  if (kept) return kept;

  const fromFields = [
    body?.extracted_transaction_id,
    body?.transaction_id,
  ].map(normalizeBankTxn).find(Boolean);
  if (fromFields) return fromFields;

  const raw = String(body?.text || "");
  if (!raw) return "";

  const cbe = raw.match(/\b(FT[0-9]{5}[A-Z0-9]{4,16})\b/i);
  if (cbe?.[1]) {
    const hit = normalizeBankTxn(cbe[1]);
    if (hit) return hit;
  }

  const labeled = raw.match(
    /(?:transaction|txn|ref(?:erence)?|trace)\s*(?:id|no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{6,31})/i,
  );
  if (labeled?.[1]) {
    const hit = normalizeBankTxn(labeled[1]);
    if (hit) return hit;
  }

  const mixed = raw.match(/\b([A-Z]{2,5}\d{4,}[A-Z0-9]{2,16})\b/);
  if (mixed?.[1]) {
    const hit = normalizeBankTxn(mixed[1]);
    if (hit) return hit;
  }

  return "";
}

function ocrFromPayment(row) {
  const saved = row?.ocr;
  if (!saved?.text) return emptyOcr();
  return {
    ...emptyOcr(),
    text: saved.text || "",
    confidence: saved.confidence,
    language: saved.language || "eng",
    receipt: saved.receipt || "",
    scanned_by: saved.scanned_by,
    scanned_by_name: saved.scanned_by_name || "",
    scanned_at: saved.scanned_at || "",
  };
}

function paymentScanPanel(ocr, hasReceipt, locked = false) {
  if (!hasReceipt) return `<p class="muted">No receipt was uploaded.</p>`;
  if (ocr.loading) {
    return `
      <div class="scan-loading" role="status" aria-live="polite">
        <div class="scan-loader" aria-hidden="true">
          <span class="scan-loader-frame">${svg(glyph.scan)}</span>
          <span class="scan-loader-beam"></span>
        </div>
        <p>Reading receipt…</p>
      </div>`;
  }
  if (ocr.error) {
    return `
      <div class="scan-prompt">
        <p class="status-msg alert">${svg(glyph.x)} ${esc(ocr.error)}</p>
        <button type="button" class="ghost action-btn" data-act="scan-receipt" data-id="${esc(state.modal.row.id)}" ${locked ? "disabled" : ""}>${svg(glyph.scan)} Try again</button>
      </div>`;
  }
  if (!ocr.text) {
    return `
      <div class="scan-prompt">
        <p class="muted">${locked ? "No saved scan for this payment." : "Click Scan to read text from this receipt."}</p>
        ${locked ? "" : `<button type="button" class="ghost action-btn" data-act="scan-receipt" data-id="${esc(state.modal.row.id)}">${svg(glyph.scan)} Scan</button>`}
      </div>`;
  }
  const confidence = ocr.confidence == null ? "—" : `${esc(ocr.confidence)}%`;
  const copied = Boolean(ocr.notice);
  const receipt = ocr.receipt || "";
  const scanned = `${ocr.scanned_by_name || "—"}${ocr.scanned_at ? ` · ${when(ocr.scanned_at)}` : ""}`;
  return `
    <div class="scan-result">
      <div class="scan-bar">
        <div class="scan-facts">
          <span><em>Confidence</em> ${confidence}</span>
          <span><em>Language</em> ${esc(ocr.language || "eng")}</span>
          <span><em>Scanned by</em> ${esc(scanned)}</span>
        </div>
        <div class="scan-actions">
          <button type="button" class="ghost action-btn ${copied ? "copied" : ""}" data-act="copy-ocr" ${ocr.text ? "" : "disabled"}>${copied ? `${svg(glyph.check)} Copied` : `${svg(glyph.copy)} Copy text`}</button>
          <button type="button" class="ghost action-btn" data-act="scan-receipt" data-id="${esc(state.modal.row.id)}" ${locked ? "disabled" : ""}>${svg(glyph.scan)} Rescan</button>
          <button type="button" class="danger action-btn" data-act="clear-ocr" ${locked ? "disabled" : ""}>${svg(glyph.trash)} Clear</button>
        </div>
      </div>
      ${receipt ? `<p class="scan-ref"><em>Reference</em> <code title="${esc(receipt)}">${esc(receipt)}</code></p>` : ""}
      <pre class="ocr-text" id="ocr-text">${esc(ocr.text)}</pre>
    </div>`;
}

function paymentBanks() {
  const rows = state.modal?.banks || state.banks?.rows || state.board?.options?.banks || [];
  return rows.map((row) => ({
    id: String(row.id),
    name: row.bank_name || row.name || `Bank #${row.id}`,
  }));
}

function paymentFillable(row) {
  return {
    bank: !String(row.bank_name || "").trim() && !row.bank_account_id,
    sender: !String(row.sender_account || "").trim(),
  };
}

function paymentEditableValue(value, canEdit, label) {
  const text = String(value || "").trim() || "—";
  const edit = canEdit
    ? `<button type="button" class="value-edit" data-act="edit-transfer" aria-label="Fill ${esc(label)}" title="Fill ${esc(label)}">${svg(glyph.edit)}</button>`
    : "";
  return `<dd class="value-with-edit"><span>${esc(text)}</span>${edit}</dd>`;
}

function paymentTransferSheet(row) {
  if (!state.modal?.transferEdit) return "";
  const fill = paymentFillable(row);
  if (!fill.bank && !fill.sender) return "";
  const banks = paymentBanks();
  const bankOptions = banks.map((bank) => (
    `<option value="${esc(bank.id)}">${esc(bank.name)}</option>`
  )).join("");
  return `
    <div class="sheet-backdrop">
      <form id="transfer-form" class="modal-card transfer-sheet">
        <button type="button" class="modal-close" data-act="close-transfer" aria-label="Close" title="Close">${svg(glyph.x)}</button>
        <h2>Fill transfer details</h2>
        <p class="muted sheet-lead">From the receipt — only empty fields can be set.</p>
        <p class="sheet-warn" role="status">${svg(glyph.warn)} Once saved, bank and sender cannot be changed.</p>
        ${fill.bank ? `
          <label>Bank
            <select name="bank_account_id">
              <option value="">Choose bank</option>
              ${bankOptions}
            </select>
          </label>` : ""}
        ${fill.sender ? `
          <label>Sender
            <input name="sender_account" maxlength="40" autocomplete="off" placeholder="Sender account / name">
          </label>` : ""}
        <div class="row-actions">
          <button type="button" class="ghost" data-act="close-transfer">Cancel</button>
          <button type="submit" class="success">${svg(glyph.check)} Save</button>
        </div>
      </form>
    </div>`;
}

function paymentModal() {
  const modal = state.modal;
  const row = modal.row;
  const src = safeSrc(row.screenshot_url);
  const pending = row.status === "pending";
  const locked = !pending;
  const tab = modal.tab === "scan" ? "scan" : "receipt";
  const ocr = modal.ocr || emptyOcr();
  const fill = paymentFillable(row);
  return `
    <div class="modal-card wide payment-modal ${locked ? "is-locked" : ""}">
      ${modalClose()}
      <div class="payment-head">
        <h2>Payment</h2>
        <div class="payment-actions">
          ${isSuper() ? `<button type="button" class="danger action-btn" data-act="delete-payment" data-id="${esc(row.id)}">${svg(glyph.trash)} Delete</button>` : ""}
          <button type="button" class="danger action-btn" data-act="reject" data-id="${esc(row.id)}" ${locked ? "disabled" : ""}>${svg(glyph.x)} Reject</button>
          <button type="button" class="success action-btn" data-act="approve" data-id="${esc(row.id)}" ${locked ? "disabled" : ""}>${svg(glyph.check)} Approve</button>
        </div>
      </div>
      <dl class="payment-grid">
        <div><dt>Buyer</dt><dd>${esc(row.customer_name)}</dd></div>
        <div><dt>Phone</dt><dd>${esc(row.customer_phone)}</dd></div>
        <div><dt>Lottery</dt><dd>${esc(row.lottery_title)}</dd></div>
        <div><dt>Tickets</dt><dd>${esc(row.ticket_numbers)}</dd></div>
        <div><dt>Amount</dt><dd>${esc(money(row.amount))}</dd></div>
        <div><dt>Bank</dt>${paymentEditableValue(row.bank_name, fill.bank, "bank")}</div>
        <div><dt>Sender</dt>${paymentEditableValue(row.sender_account, fill.sender, "sender")}</div>
        <div><dt>Status</dt><dd>${badge(row.status)}</dd></div>
        <div><dt>Date</dt><dd>${esc(when(row.created_at))}</dd></div>
        <div><dt>Reviewed by</dt><dd>${esc(row.reviewed_by_name || "—")}${row.reviewed_at ? ` · ${esc(when(row.reviewed_at))}` : ""}</dd></div>
      </dl>
      <form id="txn-form" class="txn-form" data-id="${esc(row.id)}">
        <label class="txn-field">
          <span class="field-label">
            Transaction ID
            <button type="button" class="hint-q" aria-label="${locked ? "Approve/reject and transaction ID are locked." : "Unique bank reference. Required before approve. Blocks receipt reuse."}" data-tip="${locked ? "Approve/reject and transaction ID are locked." : "Unique bank reference. Required before approve. Blocks receipt reuse."}">?</button>
          </span>
          <input name="transaction_id" maxlength="64" spellcheck="false" autocomplete="off" placeholder="e.g. FT26305GCDDP" value="${esc(row.transaction_id || "")}" ${locked ? "readonly disabled" : ""}>
        </label>
        <button type="submit" class="ghost action-btn" ${locked ? "disabled" : ""}>${svg(glyph.check)} Save ID</button>
      </form>
      ${src ? `<div class="payment-tabs" role="tablist" aria-label="Payment media">
        <button type="button" class="payment-tab ${tab === "receipt" ? "on" : ""}" role="tab" aria-selected="${tab === "receipt" ? "true" : "false"}" data-act="payment-tab" data-tab="receipt">${svg(glyph.image)} Receipt</button>
        <button type="button" class="payment-tab ${tab === "scan" ? "on" : ""}" role="tab" aria-selected="${tab === "scan" ? "true" : "false"}" data-act="payment-tab" data-tab="scan">${svg(glyph.scan)} Scan</button>
      </div>
      <div class="payment-pane">
        <div class="payment-panel ${tab === "receipt" ? "on" : "off"}" role="tabpanel" aria-hidden="${tab === "receipt" ? "false" : "true"}">
          <img class="receipt" alt="Payment receipt" src="${esc(src)}">
        </div>
        <div class="payment-panel ${tab === "scan" ? "on" : "off"}" role="tabpanel" aria-hidden="${tab === "scan" ? "false" : "true"}">
          ${paymentScanPanel(ocr, true, locked)}
        </div>
      </div>` : `<div class="payment-pane"><p class="muted">No receipt was uploaded.</p></div>`}
      ${paymentTransferSheet(row)}
    </div>`;
}

function photoModal() {
  const images = (state.modal.images || [state.modal.src]).map((src) => safeSrc(src)).filter(Boolean);
  const index = Math.min(Math.max(state.modal.index || 0, 0), Math.max(images.length - 1, 0));
  const src = images[index] || "";
  const title = state.modal.title || "Image";
  return `
    <div class="modal-card photo">
      ${modalClose()}
      <h2>${esc(title)}</h2>
      ${src ? `<img class="photo-view" alt="${esc(title)}" src="${esc(src)}">` : ""}
      ${images.length > 1 ? `
        <div class="photo-nav">
          <button type="button" class="icon-btn" data-act="photo-step" data-dir="-1" aria-label="Previous image" title="Previous image">${svg(glyph.chevL)}</button>
          <span>${index + 1} / ${images.length}</span>
          <button type="button" class="icon-btn" data-act="photo-step" data-dir="1" aria-label="Next image" title="Next image">${svg(glyph.chevR)}</button>
        </div>` : ""}
    </div>`;
}

function passwordForm() {
  return `
    <form id="password-form" class="modal-card">
      ${modalClose()}
      <h2>Change password</h2>
      <label>Current password <input name="current_password" type="password" autocomplete="current-password" required></label>
      <label>New password <input name="new_password" type="password" autocomplete="new-password" minlength="4" maxlength="72" required></label>
      <label>Confirm new password <input name="confirm_password" type="password" autocomplete="new-password" minlength="4" maxlength="72" required></label>
      <p id="modal-error" class="alert" hidden></p>
      <div class="modal-actions">
        <button class="primary" type="submit">Save password</button>
      </div>
    </form>`;
}

function winnerModal() {
  const row = state.modal.row;
  return `
    <div class="modal-card">
      ${modalClose()}
      <h2>${esc(row.lottery_title)}</h2>
      <dl>
        <div><dt>Ticket</dt><dd>${esc(row.winning_ticket_number)}</dd></div>
        <div><dt>Winner</dt><dd>${esc(row.winner_name)}</dd></div>
        <div><dt>Phone</dt><dd>${esc(row.winner_phone)}</dd></div>
        <div><dt>Prize</dt><dd>${esc(row.lottery_prize || row.prize_description || "—")}</dd></div>
        <div><dt>Announced</dt><dd>${esc(when(row.announced_at))}</dd></div>
      </dl>
    </div>`;
}

function showModalError(error) {
  const message = error.message || "Something went wrong";
  const el = document.querySelector("#modal-error");
  if (el) {
    el.hidden = false;
    el.textContent = message;
  }
  notify(message, "error");
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
  notify(error.message || "Something went wrong", "error");
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
    const { res, body } = await request(`/api/dashboard?${params}`);
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
    const { res, body } = await request(`/api/payments?${params}`);
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
    const { res, body } = await request("/api/admin-bank-accounts");
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load bank accounts"));
    state.banks.rows = body.data || [];
  } else if (state.view === "winners") {
    const { res, body } = await request("/api/admin-winners");
    if (seq !== loadSeq) return;
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load winners"));
    state.winners.rows = body.data || [];
    const board = await request("/api/dashboard");
    if (seq !== loadSeq) return;
    if (board.res.ok && board.body.stats) state.pending = Number(board.body.stats.pendingPayments || 0);
    return;
  }
  if (state.view === "customers") {
    const { res, body } = await request("/api/admin-customers");
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load customers"));
    state.customers.rows = body.data || [];
    return;
  }
  if (state.view === "report") {
    ensureReportRange();
    const list = await request("/api/admin-lotteries");
    if (seq !== loadSeq) return;
    unauthorized(list.res);
    if (!list.res.ok || list.body.success === false) throw new Error(messageOf(list.body, "Could not load lotteries"));
    state.report.lotteries = (list.body.data || []).map((row) => ({ id: String(row.id), title: row.title }));
    if (state.report.from && state.report.to && asNairobi(state.report.from) > asNairobi(state.report.to)) {
      notify("The start is after the end", "warning");
      state.report.rows = [];
      state.report.columns = [];
      state.report.amount = null;
      state.report.loading = false;
      return;
    }
    const preview = await request(`/api/admin-report?${reportParams("json")}`);
    if (seq !== loadSeq) return;
    unauthorized(preview.res);
    if (!preview.res.ok || preview.body.success === false) throw new Error(messageOf(preview.body, "Could not load the report"));
    state.report.sheet = preview.body.sheet || "Report";
    state.report.columns = preview.body.columns || [];
    state.report.rows = preview.body.rows || [];
    state.report.amount = preview.body.amount;
    state.report.loading = false;
    const board = await request("/api/dashboard");
    if (seq !== loadSeq) return;
    if (board.res.ok && board.body.stats) state.pending = Number(board.body.stats.pendingPayments || 0);
    return;
  }
  if (state.view === "admins") {
    if (!isSuper()) throw new Error("Super admin only");
    const { res, body } = await request("/api/admin-staff");
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load admin accounts"));
    state.admins.rows = body.data || [];
    state.admins.privileges = body.privileges || [];
    return;
  }
  if (state.view === "logs") {
    if (!hasPriv("logs")) throw new Error("Not allowed for this account");
    const params = new URLSearchParams({
      search: state.logs.search,
      action: state.logs.status,
      page: String(state.logs.page),
      page_size: String(state.logs.pageSize),
    });
    const { res, body } = await request(`/api/admin-event-logs?${params}`);
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load event logs"));
    state.logs.rows = body.data || [];
    state.logs.total = Number(body.total || 0);
    state.logs.actions = body.actions || [];
    if (body.page) state.logs.page = body.page;
    return;
  }
  if (state.view === "settings") {
    const { res, body } = await request("/api/admin-settings");
    if (seq !== loadSeq) return;
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load settings"));
    const brand = body.branding || {};
    const ocr = body.ocr || {};
    state.settings = {
      app_name: brand.app_name || appName,
      developer_name: brand.developer_name || "",
      developer_url: brand.developer_url || "",
      credit_prefix: brand.credit_prefix || "Developed by",
      ocr_scan_limit: ocr.scan_limit ?? 60,
      ocr_scan_window_minutes: ocr.scan_window_minutes ?? 15,
      loaded: true,
    };
    return;
  }
  const { res, body } = await request("/api/admin-lotteries");
  if (seq !== loadSeq) return;
  if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load lotteries"));
  state.draws.rows = body.data || [];
  const board = await request("/api/dashboard");
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
  if (event.target.classList.contains("backdrop")) return;
  if (event.target.classList.contains("sheet-backdrop")) {
    if (state.modal?.kind === "payment") {
      state.modal.transferEdit = false;
      render();
    }
    return;
  }
  const el = event.target.closest("[data-act]");
  if (!el || el.disabled || el.dataset.busy === "1") return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  try {
    if (act === "close-modal") {
      if (state.modal?.kind === "draw" && state.modal.saving) return;
      if (state.modal?.busy) return;
      if (state.modal?.kind === "payment" && state.modal.transferEdit) {
        state.modal.transferEdit = false;
        render();
        return;
      }
      closeModal();
      render();
      return;
    }
    if (act === "dismiss-toast") {
      dismissToast(Number(id));
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
      if (!canView(view)) return;
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
      const done = busyButton(el, "Signing out…");
      if (!done) return;
      try {
        await request("/api/admin-logout", { method: "POST" });
      } catch {
        /* still clear local session */
      }
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
      if (act === "page" && (state.view === "payments" || state.view === "logs")) await refresh();
      render();
      return;
    }
    if (act === "clear-logs") {
      if (!isSuper()) {
        notify("Super admin only", "error");
        return;
      }
      state.modal = {
        kind: "confirm",
        act: "clear-logs",
        title: "Clear event logs",
        message: "Delete all event log rows? A single clear entry will be kept.",
      };
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
        notify("The start is after the end", "warning");
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
      const res = await fetch(`/api/admin-report?${params}`, { credentials: "same-origin" });
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
      notify("Report downloaded", "success");
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
      if (!isSuper()) {
        notify("Super admin only", "error");
        return;
      }
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
    if (act === "progress-draw") {
      const draw = state.draws.rows.find((row) => String(row.id) === String(id));
      state.modal = {
        kind: "progress",
        loading: true,
        lotteryId: id,
        lottery: draw ? { title: draw.title, subtitle: draw.subtitle } : null,
        summary: null,
        tickets: [],
        winner: null,
        boardFilter: "all",
        focusNumber: null,
        search: "",
        page: 1,
        pageSize: 10,
      };
      state.error = "";
      render();
      const { res, body } = await request(`/api/admin-lottery-progress?lottery_id=${encodeURIComponent(id)}`);
      unauthorized(res);
      if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not load lottery progress"));
      if (state.modal?.kind !== "progress" || String(state.modal.lotteryId) !== String(id)) return;
      const data = body.data || {};
      state.modal = {
        kind: "progress",
        loading: false,
        lotteryId: id,
        lottery: data.lottery || {},
        summary: data.summary || {},
        tickets: data.tickets || [],
        winner: data.winner || null,
        boardFilter: Number(data.summary?.total) > 500 ? "held" : "all",
        focusNumber: null,
        search: "",
        page: 1,
        pageSize: 10,
      };
      render();
      return;
    }
    if (act === "progress-filter") {
      if (state.modal?.kind !== "progress") return;
      state.modal.boardFilter = el.dataset.filter || "all";
      render();
      return;
    }
    if (act === "progress-number") {
      if (state.modal?.kind !== "progress") return;
      const number = Number(el.dataset.number);
      if (!number) return;
      state.modal.focusNumber = number;
      const hit = (state.modal.tickets || []).find((row) => Number(row.number) === number);
      if (hit) {
        state.modal.search = hit.ticket_number || "";
        state.modal.page = 1;
      }
      render();
      return;
    }
    if (act === "winner") {
      const draw = state.draws.rows.find((row) => String(row.id) === String(id));
      const { res, body } = await request(`/api/lottery-orders?lottery_id=${encodeURIComponent(id)}`);
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
      const row = state.payments.rows.find((item) => String(item.id) === String(id))
        || (state.board.recentPayments || []).find((item) => String(item.id) === String(id));
      if (!row) return;
      const ocr = ocrFromPayment(row);
      state.modal = {
        kind: "payment",
        row,
        tab: ocr.text ? "scan" : "receipt",
        ocr,
        banks: state.modal?.banks || state.banks?.rows || [],
        transferEdit: false,
      };
      render();
      return;
    }
    if (act === "edit-transfer") {
      if (state.modal?.kind !== "payment" || !state.modal.row) return;
      const fill = paymentFillable(state.modal.row);
      if (!fill.bank && !fill.sender) return;
      state.modal.transferEdit = true;
      render();
      if (!(state.modal.banks || []).length) {
        const banks = await request("/api/bank-accounts");
        if (state.modal?.kind === "payment" && banks.res.ok && banks.body.success !== false) {
          state.modal.banks = banks.body.data || [];
          render();
        }
      }
      return;
    }
    if (act === "close-transfer") {
      if (state.modal?.kind !== "payment") return;
      state.modal.transferEdit = false;
      render();
      return;
    }
    if (act === "payment-tab") {
      if (state.modal?.kind !== "payment") return;
      state.modal.tab = el.dataset.tab === "scan" ? "scan" : "receipt";
      if (state.modal.ocr) state.modal.ocr.notice = "";
      render();
      return;
    }
    if (act === "scan-receipt") {
      if (state.modal?.kind !== "payment" || !state.modal.row) return;
      if (state.modal.row.status !== "pending") return;
      const paymentRow = state.modal.row;
      const scanId = String(paymentRow.id);
      state.modal.tab = "scan";
      state.modal.ocr = {
        ...(state.modal.ocr || emptyOcr()),
        loading: true,
        error: "",
        notice: "",
      };
      render();
      try {
        const { res, body } = await request("/api/scan-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: paymentRow.id }),
        });
        unauthorized(res);
        if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not scan receipt"));
        if (state.modal?.kind !== "payment" || String(state.modal.row?.id) !== scanId) return;
        state.modal.ocr = {
          loading: false,
          text: body.text || "",
          confidence: body.confidence,
          language: body.language || "eng",
          receipt: body.receipt || "",
          scanned_by: body.scanned_by,
          scanned_by_name: body.scanned_by_name || "",
          scanned_at: body.scanned_at || "",
          error: "",
          notice: "",
        };
        let txn = txnFromScanResponse(body, state.modal.row.transaction_id);
        const savedRaw = String(body.transaction_id || "").trim().toUpperCase();
        const needsSave = Boolean(txn) && normalizeBankTxn(savedRaw) !== txn && !body.transaction_conflict;
        if (needsSave) {
          const saved = await request("/api/set-transaction-id", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_id: paymentRow.id, transaction_id: txn }),
          });
          unauthorized(saved.res);
          if (saved.res.ok && saved.body.success !== false) {
            txn = normalizeBankTxn(saved.body.transaction_id) || txn;
          }
        }
        state.modal.row = {
          ...state.modal.row,
          transaction_id: txn,
          scanned_by_name: body.scanned_by_name || state.modal.row.scanned_by_name || "",
          ocr: {
            text: state.modal.ocr.text,
            confidence: state.modal.ocr.confidence,
            language: state.modal.ocr.language,
            receipt: state.modal.ocr.receipt,
            scanned_at: state.modal.ocr.scanned_at,
            scanned_by: state.modal.ocr.scanned_by,
            scanned_by_name: state.modal.ocr.scanned_by_name,
          },
        };
        const listRow = state.payments.rows.find((item) => String(item.id) === scanId);
        if (listRow) {
          listRow.ocr = state.modal.row.ocr;
          listRow.transaction_id = txn;
          listRow.scanned_by_name = state.modal.row.scanned_by_name;
        }
        if (body.transaction_conflict) {
          notify(`Transaction ID from scan is already used on payment #${body.transaction_conflict}. Enter a different ID.`, "error");
        } else if (txn) {
          notify(`Transaction ID ${needsSave ? "saved" : "filled"}: ${txn}`, "success");
        }
      } catch (error) {
        if (error.unauthorized) {
          state.admin = null;
          state.modal = null;
          notify("Sign in again", "error");
          render();
          return;
        }
        if (state.modal?.kind !== "payment" || String(state.modal.row?.id) !== scanId) return;
        state.modal.ocr = {
          ...(state.modal.ocr || emptyOcr()),
          loading: false,
          error: error.message || "Could not scan receipt",
        };
      }
      render();
      return;
    }
    if (act === "copy-ocr") {
      const text = state.modal?.kind === "payment" ? state.modal.ocr?.text : "";
      if (!text || state.modal.ocr?.notice) return;
      try {
        await navigator.clipboard.writeText(text);
        state.modal.ocr.notice = "Copied";
        render();
        const paymentId = state.modal.row?.id;
        setTimeout(() => {
          if (state.modal?.kind !== "payment" || state.modal.row?.id !== paymentId || !state.modal.ocr) return;
          state.modal.ocr.notice = "";
          render();
        }, 1600);
      } catch {
        if (state.modal?.ocr) state.modal.ocr.notice = "";
        notify("Could not copy text", "error");
        render();
      }
      return;
    }
    if (act === "clear-ocr") {
      if (state.modal?.kind !== "payment" || !state.modal.row) return;
      if (state.modal.row.status !== "pending") return;
      const paymentId = state.modal.row.id;
      try {
        await postOk("/api/clear-receipt-ocr", { payment_id: paymentId });
        state.modal.ocr = emptyOcr();
        state.modal.tab = "scan";
        state.modal.row = { ...state.modal.row, ocr: null };
        const listRow = state.payments.rows.find((item) => String(item.id) === String(paymentId));
        if (listRow) listRow.ocr = null;
        notify("Scan cleared", "success");
      } catch (error) {
        if (error.unauthorized) {
          state.admin = null;
          state.modal = null;
          notify("Sign in again", "error");
        } else {
          notify(error.message || "Could not clear scan", "error");
        }
      }
      render();
      return;
    }
    if (act === "delete-payment") {
      if (!isSuper()) {
        notify("Super admin only", "error");
        return;
      }
      const row = state.payments.rows.find((item) => String(item.id) === String(id))
        || (state.modal?.kind === "payment" && String(state.modal.row?.id) === String(id) ? state.modal.row : null)
        || (state.board.recentPayments || []).find((item) => String(item.id) === String(id));
      state.modal = {
        kind: "confirm",
        act: "delete-payment",
        id,
        title: "Delete payment",
        message: `Permanently delete ${row?.customer_name || "this payment"} for ${money(row?.amount)}${row?.ticket_numbers ? ` · tickets ${row.ticket_numbers}` : ""}? Ticket numbers become free again.`,
      };
      render();
      return;
    }
    if (act === "approve" || act === "reject") {
      const row = state.payments.rows.find((item) => String(item.id) === String(id))
        || (state.modal?.kind === "payment" ? state.modal.row : null);
      if (!row || row.status !== "pending") return;
      if (act === "approve" && !String(row?.transaction_id || "").trim()) {
        notify("Enter and save the bank transaction ID before approving", "warning");
        if (state.modal?.kind === "payment") render();
        else {
          state.modal = { kind: "payment", row, tab: "receipt", ocr: ocrFromPayment(row) };
          render();
        }
        return;
      }
      state.modal = {
        kind: "confirm",
        act,
        id,
        title: act === "approve" ? "Approve payment" : "Reject payment",
        message: `${act === "approve" ? "Approve" : "Reject"} ${row?.customer_name || "this payment"} for ${money(row?.amount)}${row?.transaction_id ? ` · ${row.transaction_id}` : ""}?`,
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
    if (act === "new-admin") {
      state.modal = { kind: "admin", row: null };
      render();
      return;
    }
    if (act === "edit-admin") {
      const row = state.admins.rows.find((item) => String(item.id) === String(id));
      if (!row) return;
      state.modal = { kind: "admin", row };
      render();
      return;
    }
    if (act === "admin-status") {
      const row = state.admins.rows.find((item) => String(item.id) === String(id));
      if (!row || row.role === "super") return;
      state.modal = {
        kind: "confirm",
        act: "admin-status",
        title: row.active ? "Disable admin" : "Enable admin",
        message: `${row.username} will be ${row.active ? "unable to sign in" : "able to sign in again"}.`,
        payload: { id: row.id, active: !row.active },
      };
      render();
      return;
    }
    if (act === "download-customers") {
      const params = new URLSearchParams({
        format: el.dataset.format || "csv",
        search: state.customers.search,
      });
      const res = await fetch(`/api/admin-customers?${params}`, { credentials: "same-origin" });
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
      notify("Customers downloaded", "success");
      render();
      return;
    }
    if (act === "view-customer") {
      const known = state.customers.rows.find((row) => String(row.id) === String(id));
      state.modal = { kind: "customer", loading: true, customer: known || null, orders: [] };
      state.error = "";
      render();
      const { res, body } = await request(`/api/admin-customer?id=${encodeURIComponent(id)}`);
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
  if (state.view === "payments" || state.view === "logs") {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (state.view !== "payments" && state.view !== "logs") return;
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
      notify("The start is after the end", "warning");
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
        notify("The start is after the end", "warning");
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
  if (state.view === "payments" || state.view === "logs") {
    refresh().then(render).catch(caught);
    return;
  }
  render();
}

async function submitLogin(form) {
  const button = form.querySelector("[type=submit]");
  const done = busyButton(button, "Signing in…");
  if (!done) return;
  lockForm(form, true);
  state.error = "";
  const data = Object.fromEntries(new FormData(form));
  const remember = data.remember === "1";
  try {
    const { res, body } = await request("/api/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: data.username, password: data.password }),
    });
    if (!res.ok || body.success === false) {
      notify(messageOf(body, "Invalid username or password"), "error");
      lockForm(form, false);
      done();
      render();
      return;
    }
    writeSavedLogin({
      remember,
      username: data.username,
      password: data.password,
    });
    state.admin = body.admin;
    state.view = canView(viewFromHash()) ? viewFromHash() : firstAllowedView();
    location.hash = viewHash[state.view] || "dashboard";
    try {
      await refresh();
    } catch (error) {
      notify(error.message || "Something went wrong", "error");
    }
    render();
  } catch (error) {
    notify(error.message || "Could not sign in", "error");
    lockForm(form, false);
    done();
    render();
  }
}

async function submitDraw(form) {
  if (state.modal?.saving) return;
  const data = Object.fromEntries(new FormData(form));
  const photos = state.modal?.photos || [];
  const uploads = photos.filter((photo) => photo.file);
  try {
    setDrawSaving({
      label: uploads.length ? `Uploading images 0/${uploads.length}…` : "Saving lottery…",
      percent: uploads.length ? 0 : null,
    });
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
    let done = 0;
    for (const photo of photos) {
      if (photo.file) {
        setDrawSaving({
          label: `Uploading image ${done + 1}/${uploads.length}…`,
          percent: Math.round((done / uploads.length) * 90),
        });
        const body = new FormData();
        body.append("image", photo.file);
        const uploaded = await request("/api/upload-lottery-image", { method: "POST", body });
        unauthorized(uploaded.res);
        if (!uploaded.res.ok || uploaded.body.success === false) {
          throw new Error(messageOf(uploaded.body, "Image upload failed"));
        }
        payload.image_urls.push(uploaded.body.image_url);
        done += 1;
        setDrawSaving({
          label: `Uploaded ${done}/${uploads.length}`,
          percent: Math.round((done / uploads.length) * 90),
        });
      } else if (photo.src && !photo.src.startsWith("blob:")) {
        payload.image_urls.push(photo.src);
      }
    }
    if (state.modal.row?.id) {
      payload.id = state.modal.row.id;
      payload.status = data.status;
    }
    setDrawSaving({ label: "Saving lottery…", percent: uploads.length ? 95 : null });
    const path = state.modal.row?.id ? "/api/admin-update-lottery" : "/api/admin-create-lottery";
    await postOk(path, payload);
    setDrawSaving({ label: "Saved", percent: 100 });
    closeModal();
    notify("Lottery saved", "success");
    state.error = "";
    await refresh();
    render();
  } catch (error) {
    setDrawSaving(null);
    if (error.unauthorized) caught(error);
    else showModalError(error);
  }
}

async function submitBank(form) {
  const button = form.querySelector("[type=submit]");
  const done = busyButton(button, "Saving…");
  if (!done) return;
  lockForm(form, true);
  const data = Object.fromEntries(new FormData(form));
  try {
    const payload = {
      bank_name: data.bank_name,
      account_name: data.account_name,
      account_number: data.account_number,
      status: data.status || "active",
    };
    if (state.modal.row) {
      payload.id = state.modal.row.id;
      await postOk("/api/admin-update-bank-account", payload);
    } else {
      await postOk("/api/admin-create-bank-account", payload);
    }
    state.modal = null;
    notify("Bank account saved", "success");
    state.error = "";
    await refresh();
    render();
  } catch (error) {
    lockForm(form, false);
    done();
    if (error.unauthorized) caught(error);
    else showModalError(error);
  }
}

async function submitConfirm() {
  const modal = state.modal;
  if (!modal || modal.busy) return;
  const form = document.getElementById("confirm-form");
  const button = form?.querySelector("[type=submit]");
  const labels = {
    "hide-draw": modal.hidden === "1" ? "Hiding…" : "Showing…",
    feature: "Featuring…",
    "delete-draw": "Deleting…",
    announce: "Announcing…",
    "bank-status": "Updating…",
    "admin-status": "Updating…",
    "clear-logs": "Clearing…",
    approve: "Approving…",
    reject: "Rejecting…",
    "delete-payment": "Deleting…",
  };
  const done = busyButton(button, labels[modal.act] || "Working…");
  if (!done) return;
  modal.busy = true;
  try {
    if (modal.act === "hide-draw") {
      await postOk("/api/admin-hide-lottery", { id: modal.id, hidden: modal.hidden });
      notify(modal.hidden === "1" ? "Lottery hidden from customers" : "Lottery visible to customers", "success");
    } else if (modal.act === "feature") {
      await postOk("/api/admin-feature-lottery", { id: modal.id });
      notify("Featured lottery updated", "success");
    } else if (modal.act === "delete-draw") {
      await postOk("/api/admin-delete-lottery", { id: modal.id });
      notify("Lottery deleted", "success");
    } else if (modal.act === "announce") {
      await postOk("/api/announce-winner", {
        lottery_id: modal.lotteryId,
        order_id: modal.orderId,
        winning_ticket_number: modal.ticket,
      });
      notify("Winner announced", "success");
    } else if (modal.act === "bank-status") {
      await postOk("/api/admin-update-bank-account", modal.payload);
      notify("Bank account updated", "success");
    } else if (modal.act === "admin-status") {
      await postOk("/api/admin-staff-update", modal.payload);
      notify(modal.payload.active ? "Admin enabled" : "Admin disabled", "success");
    } else if (modal.act === "clear-logs") {
      await postOk("/api/admin-event-logs-clear", {});
      notify("Event logs cleared", "success");
    } else if (modal.act === "approve") {
      await postOk("/api/approve-payment", { payment_id: modal.id });
      notify("Payment approved", "success");
    } else if (modal.act === "reject") {
      await postOk("/api/reject-payment", { payment_id: modal.id });
      notify("Payment rejected", "success");
    } else if (modal.act === "delete-payment") {
      await postOk("/api/admin-delete-payment", { payment_id: modal.id });
      notify("Payment deleted", "success");
    }
    state.modal = null;
    state.error = "";
    await refresh();
    render();
  } catch (error) {
    if (state.modal) state.modal.busy = false;
    done();
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
  const done = busyButton(button, "Saving…");
  if (!done) return;
  lockForm(form, true);
  try {
    await postOk("/api/admin-password", {
      current_password: data.current_password,
      new_password: data.new_password,
    });
    state.modal = null;
    notify("Password changed", "success");
    state.error = "";
    render();
  } catch (error) {
    lockForm(form, false);
    done();
    if (error.unauthorized) caught(error);
    else showModalError(error);
  }
}

function formPrivileges(form) {
  return [...form.querySelectorAll('input[name="privileges"]:checked')].map((input) => input.value);
}

async function submitAdmin(form) {
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector("[type=submit]");
  const adminId = data.admin_id || data.id;
  const editing = Boolean(adminId);
  const editingRow = editing
    ? state.admins.rows.find((row) => String(row.id) === String(adminId))
    : null;
  const isSuperRow = editingRow?.role === "super";
  const done = busyButton(button, editing ? "Saving…" : "Creating…");
  if (!done) return;
  lockForm(form, true);
  try {
    if (editing) {
      const payload = {
        id: Number(adminId),
        name: data.name,
        phone: data.phone || "",
      };
      if (!isSuperRow) {
        const privileges = formPrivileges(form);
        if (!privileges.length) throw new Error("Pick at least one privilege");
        payload.privileges = privileges;
        if (data.password) payload.password = data.password;
      }
      await postOk("/api/admin-staff-update", payload);
      notify("Admin updated", "success");
    } else {
      const privileges = formPrivileges(form);
      if (!privileges.length) throw new Error("Pick at least one privilege");
      await postOk("/api/admin-staff", {
        name: data.name,
        username: data.username,
        phone: data.phone || "",
        password: data.password,
        privileges,
      });
      notify("Admin created", "success");
    }
    state.modal = null;
    state.error = "";
    await refresh();
    render();
  } catch (error) {
    lockForm(form, false);
    done();
    if (error.unauthorized) caught(error);
    else showModalError(error);
  }
}

async function submitSettings(form) {
  const button = form.querySelector("[type=submit]");
  const done = busyButton(button, "Saving…");
  if (!done) return;
  lockForm(form, true);
  const data = Object.fromEntries(new FormData(form));
  try {
    const { res, body } = await request("/api/admin-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_name: data.app_name,
        developer_name: data.developer_name,
        developer_url: data.developer_url,
        credit_prefix: data.credit_prefix,
        ocr_scan_limit: data.ocr_scan_limit,
        ocr_scan_window_minutes: data.ocr_scan_window_minutes,
      }),
    });
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not save settings"));
    const brand = body.branding || {};
    const ocr = body.ocr || {};
    state.settings = {
      app_name: brand.app_name,
      developer_name: brand.developer_name,
      developer_url: brand.developer_url,
      credit_prefix: brand.credit_prefix,
      ocr_scan_limit: ocr.scan_limit ?? Number(data.ocr_scan_limit),
      ocr_scan_window_minutes: ocr.scan_window_minutes ?? Number(data.ocr_scan_window_minutes),
      loaded: true,
    };
    appName = brand.app_name;
    const meta = document.querySelector('meta[name="app-name"]');
    if (meta) meta.content = appName;
    document.title = appName;
    notify("Settings saved", "success");
    state.error = "";
    render();
  } catch (error) {
    lockForm(form, false);
    done();
    caught(error);
  }
}

async function submitTxn(form) {
  if (state.modal?.kind !== "payment" || !state.modal.row) return;
  if (state.modal.row.status !== "pending") return;
  const button = form.querySelector("[type=submit]");
  const done = busyButton(button, "Saving…");
  if (!done) return;
  const data = Object.fromEntries(new FormData(form));
  try {
    const { res, body } = await request("/api/set-transaction-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_id: state.modal.row.id,
        transaction_id: data.transaction_id,
      }),
    });
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not save transaction ID"));
    const txn = body.transaction_id || "";
    state.modal.row = { ...state.modal.row, transaction_id: txn };
    const listRow = state.payments.rows.find((item) => String(item.id) === String(state.modal.row.id));
    if (listRow) listRow.transaction_id = txn;
    notify(`Transaction ID saved: ${txn}`, "success");
    state.error = "";
    render();
  } catch (error) {
    done();
    if (error.unauthorized) {
      state.admin = null;
      state.modal = null;
      notify("Sign in again", "error");
      render();
    } else {
      notify(error.message || "Could not save transaction ID", "error");
      render();
    }
  }
}

async function submitTransfer(form) {
  if (state.modal?.kind !== "payment" || !state.modal.row) return;
  const button = form.querySelector("[type=submit]");
  const done = busyButton(button, "Saving…");
  if (!done) return;
  const data = Object.fromEntries(new FormData(form));
  try {
    const payload = { payment_id: state.modal.row.id };
    if (data.bank_account_id) payload.bank_account_id = Number(data.bank_account_id);
    if (data.sender_account != null) payload.sender_account = data.sender_account;
    const { res, body } = await request("/api/set-payment-transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    unauthorized(res);
    if (!res.ok || body.success === false) throw new Error(messageOf(body, "Could not save payment details"));
    state.modal.row = {
      ...state.modal.row,
      bank_account_id: body.bank_account_id,
      bank_name: body.bank_name || state.modal.row.bank_name || "",
      sender_account: body.sender_account || "",
    };
    const listRow = state.payments.rows.find((item) => String(item.id) === String(state.modal.row.id));
    if (listRow) {
      listRow.bank_account_id = state.modal.row.bank_account_id;
      listRow.bank_name = state.modal.row.bank_name;
      listRow.sender_account = state.modal.row.sender_account;
    }
    if (state.modal) state.modal.transferEdit = false;
    notify("Payment bank/sender saved", "success");
    state.error = "";
    render();
  } catch (error) {
    done();
    if (error.unauthorized) {
      state.admin = null;
      state.modal = null;
      notify("Sign in again", "error");
      render();
    } else {
      notify(error.message || "Could not save payment details", "error");
      render();
    }
  }
}

function onSubmit(event) {
  event.preventDefault();
  // Prefer getAttribute: a control named "id" shadows form.id
  const formId = event.target.getAttribute?.("id") || "";
  if (formId === "login-form") submitLogin(event.target);
  else if (formId === "draw-form") submitDraw(event.target);
  else if (formId === "bank-form") submitBank(event.target);
  else if (formId === "confirm-form") submitConfirm();
  else if (formId === "password-form") submitPassword(event.target);
  else if (formId === "settings-form") submitSettings(event.target);
  else if (formId === "admin-form") submitAdmin(event.target);
  else if (formId === "txn-form") submitTxn(event.target);
  else if (formId === "transfer-form") submitTransfer(event.target);
}

document.addEventListener("click", (event) => { onClick(event); });
document.addEventListener("input", onInput);
document.addEventListener("change", onChange);
document.addEventListener("submit", onSubmit);
async function followHash() {
  if (!state.admin) return;
  let view = viewFromHash();
  if (!canView(view)) {
    view = firstAllowedView();
    location.hash = viewHash[view] || "dashboard";
  }
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
    notify(error.message || "Could not load staff data", "error");
  }
  render();
}

async function boot() {
  let view = viewFromHash();
  const { res, body } = await request("/api/admin-session");
  if (res.ok && body.success) {
    state.admin = body.admin;
    if (!canView(view)) view = firstAllowedView();
    state.view = view;
    try {
      await refresh();
    } catch (error) {
      notify(error.message || "Could not load staff data", "error");
    }
  } else {
    state.view = view;
  }
  render();
}

window.addEventListener("hashchange", () => { followHash(); });

boot();

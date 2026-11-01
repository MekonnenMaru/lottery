(() => {
const panel = document.createElement("section");
panel.dataset.own = "1";
panel.className = "mk-tickets";
panel.setAttribute("aria-label", "My tickets");

const style = document.createElement("style");
style.textContent = `
[data-maraki-tickets] > :not([data-own]) { display: none !important; }
.mk-tickets { color: #111827; font: 500 14px/1.4 Inter, "Segoe UI", system-ui, sans-serif; }
.dark .mk-tickets { color: #f5f5f5; }
.mk-tickets h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.03em; }
.mk-tickets .mk-lead { margin: 4px 0 0; color: #6b7280; font-size: 13px; }
.dark .mk-tickets .mk-lead { color: rgba(255,255,255,.62); }
.mk-search {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(6, 95, 70, 0.16);
}
.dark .mk-search { background: rgba(255,255,255,.04); border-color: rgba(250, 204, 21, 0.22); }
.mk-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: 600 14px/1 Inter, "Segoe UI", system-ui, sans-serif;
  padding: 14px 0;
}
.mk-search input::placeholder { color: #9ca3af; font-weight: 500; }
.mk-chips { display: flex; gap: 8px; margin-top: 12px; overflow-x: auto; }
.mk-chips button {
  border: 0;
  border-radius: 999px;
  padding: 8px 12px;
  background: rgba(17, 24, 39, 0.06);
  color: inherit;
  font: 700 12px/1 Inter, "Segoe UI", system-ui, sans-serif;
  cursor: pointer;
  white-space: nowrap;
}
.dark .mk-chips button { background: rgba(255,255,255,.06); }
.mk-chips button[aria-pressed="true"] { background: #facc15; color: #111; }
.mk-count { margin: 12px 0 0; color: #6b7280; font-size: 12px; font-weight: 700; }
.mk-list { display: grid; gap: 12px; margin-top: 12px; }
.mk-card {
  display: grid;
  grid-template-columns: 92px 1fr;
  overflow: hidden;
  border-radius: 22px;
  background: #fff;
  border: 1px solid rgba(6, 95, 70, 0.14);
}
.dark .mk-card { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.08); }
.mk-stub {
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #facc15, #f59e0b);
  color: #111;
  font-weight: 900;
  letter-spacing: -0.04em;
}
.mk-stub strong { font-size: 22px; }
.mk-stub span { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.mk-body { min-width: 0; padding: 12px 14px; }
.mk-body h2 { margin: 0; font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mk-meta { margin-top: 4px; color: #6b7280; font-size: 12px; }
.dark .mk-meta, .dark .mk-count { color: rgba(255,255,255,.55); }
.mk-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
.mk-badge {
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 800;
  background: rgba(16, 185, 129, 0.14);
  color: #047857;
}
.dark .mk-badge { color: #6ee7b7; }
.mk-badge.pending { background: rgba(250, 204, 21, 0.2); color: #a16207; }
.dark .mk-badge.pending { color: #facc15; }
.mk-badge.ended, .mk-badge.declined { background: rgba(107, 114, 128, 0.16); color: #6b7280; }
.mk-badge.won { background: #facc15; color: #111; }
.mk-shot { width: 42px; height: 42px; border-radius: 12px; object-fit: cover; background: rgba(0,0,0,.08); }
.mk-empty, .mk-gate {
  margin-top: 18px;
  padding: 22px 16px;
  text-align: center;
  border-radius: 22px;
  background: rgba(250, 204, 21, 0.08);
  border: 1px solid rgba(250, 204, 21, 0.2);
}
.mk-gate button, .mk-empty strong { font-weight: 800; }
.mk-gate button {
  margin-top: 12px;
  border: 0;
  border-radius: 14px;
  background: #facc15;
  color: #111;
  padding: 12px 14px;
  cursor: pointer;
}
.mk-wait { margin-top: 18px; color: #6b7280; font-weight: 700; }
`;
document.head.appendChild(style);

const copy = {
  en: {
    title: "My Tickets",
    lead: "Your tickets, ready to search.",
    search: "Ticket, lottery, or date",
    all: "All",
    pending: "Pending",
    approved: "Active",
    ended: "Ended",
    one: "ticket",
    count: "tickets",
    none: "No tickets yet.",
    miss: "Nothing matches that search.",
    gate: "Sign in with Telegram to see your tickets.",
    profile: "Go to Profile",
    loading: "Loading your tickets…",
    winner: "Winner",
    declined: "Declined",
    lottery: "Lottery",
    ticket: "Ticket",
  },
  am: {
    title: "የእኔ ቲኬቶች",
    lead: "ቲኬቶችዎን እዚህ ይፈልጉ።",
    search: "ቲኬት፣ ሎተሪ ወይም ቀን",
    all: "ሁሉ",
    pending: "በመጠባበቅ",
    approved: "ንቁ",
    ended: "ያለቀ",
    one: "ቲኬት",
    count: "ቲኬቶች",
    none: "እስካሁን ቲኬት የለም።",
    miss: "ምንም አልተገኘም።",
    gate: "ቲኬቶችዎን ለማየት በቴሌግራም ይግቡ።",
    profile: "ወደ መገለጫ",
    loading: "ቲኬቶች እየመጡ ነው…",
    winner: "አሸናፊ",
    declined: "ተቀባይነት የለውም",
    lottery: "ሎተሪ",
    ticket: "ቲኬት",
  },
  or: {
    title: "Tikeetii koo",
    lead: "Tikeetii kee asitti barbaadi.",
    search: "Tikeetii, lottery ykn guyyaa",
    all: "Hunda",
    pending: "Eegaa",
    approved: "Hojiirra",
    ended: "Xumurame",
    one: "tikeetii",
    count: "tikeetii",
    none: "Ammaaf tikeettiin hin jiru.",
    miss: "Waan barbaadame hin argamne.",
    gate: "Tikeetii kee ilaaluuf Telegram'n seeni.",
    profile: "Gara piroofaayilii",
    loading: "Tikeetiin dhufaa jira…",
    winner: "Mo'ataa",
    declined: "Dide",
    lottery: "Lottery",
    ticket: "Tikeetii",
  },
};

let tickets = [];
let signedIn = false;
let query = "";
let filter = "all";
let mode = "";
let loading = false;
let shown = null;

function lang() {
  const select = document.querySelector("header select");
  return copy[select?.value] ? select.value : "en";
}

function text(key) {
  return (copy[lang()] || copy.en)[key] || key;
}

function page() {
  const input = document.querySelector('input[placeholder="Enter your phone number"]');
  return input ? input.closest(".space-y-6") : null;
}

function picture(url) {
  const value = String(url || "");
  if (!value) return "";
  if (value.startsWith("http") || value.startsWith("/")) return value;
  return `/${value.replace(/^\/+/, "")}`;
}

function when(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function kind(ticket) {
  if (ticket.won) return "won";
  if (ticket.payment_status === "pending") return "pending";
  if (ticket.payment_status === "rejected") return "declined";
  if (ticket.lottery_status !== "active") return "ended";
  return "approved";
}

function matches(ticket) {
  const state = kind(ticket);
  if (filter === "pending" && state !== "pending") return false;
  if (filter === "approved" && state !== "approved" && state !== "won") return false;
  if (filter === "ended" && state !== "ended" && state !== "declined") return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const date = new Date(ticket.created_at);
  const dates = Number.isNaN(date.getTime()) ? [] : [
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date),
    date.toLocaleDateString(undefined, { timeZone: "Africa/Nairobi" }),
    date.toLocaleDateString(undefined, { timeZone: "Africa/Nairobi", month: "long", day: "numeric", year: "numeric" }),
  ];
  const number = String(ticket.ticket_number || "");
  const plain = String(Number(number));
  return [number, plain, ticket.ticket_id, ticket.lottery_id, ticket.order_id, ticket.title, ...dates]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function openProfile() {
  const rows = [...document.querySelectorAll("div")].filter((el) => {
    const buttons = [...el.children].filter((child) => child.tagName === "BUTTON");
    return buttons.length === 3;
  });
  rows.at(-1)?.lastElementChild?.click();
}

function badge(ticket) {
  const state = kind(ticket);
  const label = state === "won" ? text("winner")
    : state === "pending" ? text("pending")
      : state === "declined" ? text("declined")
        : state === "ended" ? text("ended")
          : text("approved");
  return { state, label };
}

function card(ticket) {
  const article = document.createElement("article");
  article.className = "mk-card";
  const stub = document.createElement("div");
  stub.className = "mk-stub";
  const strong = document.createElement("strong");
  strong.textContent = ticket.ticket_number;
  const small = document.createElement("span");
  small.textContent = text("ticket");
  stub.append(strong, small);
  const body = document.createElement("div");
  body.className = "mk-body";
  const title = document.createElement("h2");
  title.textContent = ticket.title || text("lottery");
  const meta = document.createElement("div");
  meta.className = "mk-meta";
  meta.textContent = [
    ticket.ticket_id ? `ID ${ticket.ticket_id}` : "",
    `${text("lottery")} ${ticket.lottery_id}`,
    when(ticket.created_at),
  ].filter(Boolean).join(" · ");
  const row = document.createElement("div");
  row.className = "mk-row";
  const mark = badge(ticket);
  const pill = document.createElement("span");
  pill.className = `mk-badge ${mark.state}`;
  pill.textContent = mark.label;
  row.append(pill);
  const src = picture(ticket.image_url);
  if (src) {
    const img = document.createElement("img");
    img.className = "mk-shot";
    img.alt = "";
    img.src = src;
    row.append(img);
  }
  body.append(title, meta, row);
  article.append(stub, body);
  return article;
}

function paint() {
  const list = panel.querySelector(".mk-list");
  const count = panel.querySelector(".mk-count");
  if (!list || !count) return;
  const rows = tickets.filter(matches);
  count.textContent = `${rows.length} ${text(rows.length === 1 ? "one" : "count")}`;
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "mk-empty";
    empty.textContent = query.trim() || filter !== "all" ? text("miss") : text("none");
    list.append(empty);
    return;
  }
  for (const ticket of rows) list.append(card(ticket));
}

function shell(next) {
  mode = next;
  panel.replaceChildren();
  const title = document.createElement("h1");
  title.textContent = text("title");
  const lead = document.createElement("p");
  lead.className = "mk-lead";
  if (next === "loading") {
    lead.textContent = text("loading");
    panel.append(title, lead);
    return;
  }
  if (next === "out") {
    lead.textContent = text("gate");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text("profile");
    button.addEventListener("click", openProfile);
    const gate = document.createElement("div");
    gate.className = "mk-gate";
    gate.append(lead, button);
    panel.append(title, gate);
    return;
  }
  lead.textContent = text("lead");
  const search = document.createElement("label");
  search.className = "mk-search";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = text("search");
  input.value = query;
  input.addEventListener("input", () => {
    query = input.value;
    paint();
  });
  search.append(input);
  const chips = document.createElement("div");
  chips.className = "mk-chips";
  for (const key of ["all", "pending", "approved", "ended"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text(key);
    button.setAttribute("aria-pressed", filter === key ? "true" : "false");
    button.addEventListener("click", () => {
      filter = key;
      for (const item of chips.querySelectorAll("button")) {
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      }
      paint();
    });
    chips.append(button);
  }
  const count = document.createElement("p");
  count.className = "mk-count";
  const list = document.createElement("div");
  list.className = "mk-list";
  panel.append(title, lead, search, chips, count, list);
  paint();
}

function show(next) {
  if (mode !== next) shell(next);
  else if (next === "in") paint();
}

async function load() {
  loading = true;
  show("loading");
  try {
    const response = await fetch("/api/my-tickets.php", { credentials: "same-origin" });
    const body = await response.json();
    signedIn = Boolean(body.signedIn);
    tickets = Array.isArray(body.data) ? body.data : [];
  } catch {
    signedIn = false;
    tickets = [];
  }
  loading = false;
  show(signedIn ? "in" : "out");
}

function sync() {
  const root = page();
  if (!root) return;
  root.dataset.marakiTickets = "1";
  for (const child of root.children) {
    if (child !== panel) child.setAttribute("aria-hidden", "true");
  }
  if (!panel.isConnected || panel.parentElement !== root) root.appendChild(panel);
  if (shown !== root) {
    shown = root;
    load();
  }
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    sync();
  });
}

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.closest("header") && shown) {
    mode = "";
    show(loading ? "loading" : signedIn ? "in" : "out");
  }
});
const root = document.getElementById("root");
if (root) new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
schedule();
setInterval(sync, 400);
})();

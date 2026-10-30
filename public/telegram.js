const panel = document.createElement("section");
panel.className = "tg-panel";
panel.setAttribute("aria-label", "Telegram");

const style = document.createElement("style");
style.textContent = `
.tg-panel {
  border-radius: 24px;
  padding: 16px;
  background: #fff;
  border: 1px solid rgba(6, 95, 70, 0.18);
  color: #111827;
  font: 500 14px/1.4 Inter, "Segoe UI", system-ui, sans-serif;
}
.dark .tg-panel {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(250, 204, 21, 0.18);
  color: #f5f5f5;
}
.tg-panel .tg-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tg-panel .tg-mark {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(135deg, #facc15, #f59e0b);
  color: #111;
}
.tg-panel svg { width: 18px; height: 18px; display: block; }
.tg-panel strong { display: block; font-size: 14px; }
.tg-panel .tg-hint, .tg-panel .tg-note {
  margin: 10px 0 0;
  color: #4b5563;
  font-size: 12px;
  font-weight: 500;
}
.dark .tg-panel .tg-hint, .dark .tg-panel .tg-note { color: rgba(255, 255, 255, 0.68); }
.tg-panel .tg-note { color: #b45309; }
.dark .tg-panel .tg-note { color: #fca5a5; }
.tg-panel button.tg-go {
  width: 100%;
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 14px;
  background: #facc15;
  color: #111;
  font: 700 14px/1 Inter, "Segoe UI", system-ui, sans-serif;
  padding: 12px 14px;
  cursor: pointer;
}
.tg-panel button.tg-out {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #92400e;
  font: 700 13px/1 Inter, "Segoe UI", system-ui, sans-serif;
  padding: 8px 0 8px 12px;
  cursor: pointer;
}
.dark .tg-panel button.tg-out { color: #facc15; }
`;
document.head.appendChild(style);

const plane = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;

const copy = {
  en: {
    signIn: "Sign in with Telegram",
    signOut: "Sign out",
    signed: "Signed in with Telegram",
    hint: "Your name and phone number come from Telegram.",
    opening: "Opening Telegram…",
    share: "Tap Share phone in Telegram, then return here.",
  },
  am: {
    signIn: "በቴሌግራም ይግቡ",
    signOut: "ውጣ",
    signed: "በቴሌግራም ገብተዋል",
    hint: "ስም እና ስልክ ቁጥር ከቴሌግራም ይመጣሉ።",
    opening: "ቴሌግራም እየተከፈተ ነው…",
    share: "በቴሌግራም ስልክ ቁጥር ያጋሩ፣ ከዚያ ወደዚህ ይመለሱ።",
  },
  or: {
    signIn: "Telegram'n seeni",
    signOut: "Ba'i",
    signed: "Telegram'n seentaniittu",
    hint: "Maqaan fi lakkoofsi bilbilaa Telegram irraa dhufa.",
    opening: "Telegram banamaa jira…",
    share: "Telegram irratti bilbila kee qoodi, sana booda as deebi'i.",
  },
};

let waiting = null;
let currentUser = null;
let currentNote = "";
let queued = false;

function lang() {
  const select = document.querySelector("header select");
  return copy[select?.value] ? select.value : "en";
}

function text(key) {
  return (copy[lang()] || copy.en)[key] || key;
}

function profileSlot() {
  return document.querySelector("main .min-h-\\[70vh\\] .space-y-6");
}

function sync() {
  const slot = profileSlot();
  if (!slot) {
    if (panel.isConnected) panel.remove();
    return;
  }
  if (panel.parentElement !== slot) slot.appendChild(panel);
}

function scheduleSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    sync();
  });
}

function view(user, note) {
  currentUser = user || null;
  currentNote = note || "";
  const message = currentNote ? text(currentNote) : "";
  if (currentUser) {
    panel.innerHTML = `<div class="tg-row"><span class="tg-mark">${plane}</span><strong></strong><button type="button" class="tg-out"></button></div>`;
    panel.querySelector("strong").textContent = text("signed");
    const button = panel.querySelector("button");
    button.textContent = text("signOut");
    button.addEventListener("click", signOut);
  } else {
    panel.innerHTML = `<div class="tg-row"><span class="tg-mark">${plane}</span><strong></strong></div><button type="button" class="tg-go">${plane}<span></span></button>${message ? `<p class="tg-note"></p>` : `<p class="tg-hint"></p>`}`;
    panel.querySelector("strong").textContent = "Telegram";
    panel.querySelector(".tg-go span").textContent = text("signIn");
    panel.querySelector("button").addEventListener("click", start);
    const line = panel.querySelector(".tg-note, .tg-hint");
    line.textContent = message || text("hint");
  }
  scheduleSync();
}

async function read(url, options) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.message || "Could not use Telegram");
  return body;
}

function storeUser(user) {
  if (user?.phone) localStorage.setItem("maraki_phone", user.phone);
  else localStorage.removeItem("maraki_phone");
  if (user?.name) localStorage.setItem("maraki_name", user.name);
  else localStorage.removeItem("maraki_name");
}

async function refresh() {
  try {
    const body = await read("/api/telegram.php");
    const before = localStorage.getItem("maraki_phone") || "";
    const next = body.user?.phone || "";
    storeUser(body.user || null);
    if (next !== before) {
      location.reload();
      return;
    }
    view(body.user || null);
  } catch {
    view(null);
  }
}

async function start() {
  view(null, "opening");
  try {
    const body = await read("/api/telegram-login.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    window.open(body.url, "_blank", "noopener");
    waiting = body.code;
    view(null, "share");
    poll(body.code);
  } catch (error) {
    view(null, error.message);
  }
}

async function poll(code) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (waiting === code && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (waiting !== code) return;
    try {
      const body = await read(`/api/telegram-login.php?code=${code}`);
      if (!body.pending) {
        waiting = null;
        storeUser(body.user);
        location.reload();
        return;
      }
    } catch (error) {
      waiting = null;
      view(null, error.message);
      return;
    }
  }
}

async function signOut() {
  waiting = null;
  await fetch("/api/telegram-logout.php", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  localStorage.removeItem("maraki_phone");
  localStorage.removeItem("maraki_name");
  location.reload();
}

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.closest("header")) view(currentUser, currentNote);
});
window.addEventListener("resize", scheduleSync);
const root = document.getElementById("root");
if (root) new MutationObserver(scheduleSync).observe(root, { childList: true, subtree: true });
refresh();

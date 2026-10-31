import crypto from "node:crypto";
import { get, run } from "../../db.js";
import { createSession } from "../auth/service.js";
import { httpError, normalizePhone } from "../../util.js";
import { verifyTelegramToken } from "./verify.js";

const LOGIN_MS = 10 * 60 * 1000;

export function telegramBot() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const username = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  const enabled = /^\d+:[A-Za-z0-9_-]{20,}$/.test(token) && /^[A-Za-z0-9_]{5,32}$/.test(username);
  return { enabled, token: enabled ? token : "", username: enabled ? username : "" };
}

export function telegramClientId() {
  const explicit = String(process.env.TELEGRAM_CLIENT_ID || "").trim();
  if (/^\d{5,16}$/.test(explicit)) return explicit;
  const id = String(process.env.TELEGRAM_BOT_TOKEN || "").split(":")[0];
  return /^\d{5,16}$/.test(id) ? id : "";
}

export function customerProfile(row) {
  if (!row) return null;
  return {
    name: row.name,
    phone: row.phone,
    username: row.username || "",
  };
}

export async function customerFromSession(session) {
  if (!session) return null;
  const id = Number(session.subject);
  if (!Number.isInteger(id) || id < 1) return null;
  return get("SELECT id, name, username, phone FROM customers WHERE id = ?", [id]);
}

export async function beginTelegramLogin() {
  const bot = telegramBot();
  if (!bot.enabled) throw httpError(400, "Telegram sign-in is not set up yet");
  const code = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + LOGIN_MS;
  await run("DELETE FROM telegram_logins WHERE expires_at < ?", [Date.now()]);
  await run(
    "INSERT INTO telegram_logins (code, expires_at) VALUES (?, ?)",
    [code, expiresAt],
  );
  return {
    code,
    url: `https://t.me/${bot.username}?start=${code}`,
  };
}

export async function telegramLoginStatus(code) {
  if (!/^[a-f0-9]{32}$/.test(String(code || ""))) return null;
  const row = await get("SELECT * FROM telegram_logins WHERE code = ?", [code]);
  if (!row || Number(row.expires_at) < Date.now()) return null;
  if (!row.session_id || !row.customer_id) return { pending: true };
  const customer = await get("SELECT id, name, username, phone FROM customers WHERE id = ?", [row.customer_id]);
  if (!customer) return null;
  return { pending: false, sessionId: row.session_id, customer };
}

export async function consumeTelegramLogin(code) {
  await run("DELETE FROM telegram_logins WHERE code = ?", [code]);
}

export async function rememberTelegramUser(code, telegramId) {
  const id = Number(telegramId);
  if (!/^[a-f0-9]{32}$/.test(String(code || "")) || !Number.isSafeInteger(id) || id < 1) return false;
  const result = await run(
    "UPDATE telegram_logins SET telegram_user_id = ? WHERE code = ? AND session_id IS NULL AND expires_at >= ?",
    [id, code, Date.now()],
  );
  return result.affectedRows === 1;
}

function customerName(firstName, lastName, fullName) {
  const combined = String(fullName || "").trim() || [firstName, lastName].filter(Boolean).join(" ");
  return combined.replace(/\s+/g, " ").trim().slice(0, 80) || "Telegram user";
}

function customerHandle(username) {
  return String(username || "").replace(/[^\w]/g, "").slice(0, 64);
}

async function saveCustomer({ telegramId, name, username, phone }) {
  const id = Number(telegramId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const handle = customerHandle(username);
  const existing = await get("SELECT id FROM customers WHERE telegram_id = ?", [id]);
  let customerId = existing?.id;
  if (!customerId) {
    const result = await run(
      "INSERT INTO customers (telegram_id, name, username, phone) VALUES (?, ?, ?, ?)",
      [id, name, handle, normalized],
    );
    customerId = result.insertId;
  } else {
    await run(
      "UPDATE customers SET name = ?, username = ?, phone = ? WHERE id = ?",
      [name, handle, normalized, customerId],
    );
  }
  return { id: customerId, name, username: handle, phone: normalized };
}

export async function beginTelegramOidc() {
  const clientId = telegramClientId();
  if (!clientId) throw httpError(400, "Add the Telegram client id from BotFather, then restart the app.");
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + LOGIN_MS;
  await run("DELETE FROM telegram_logins WHERE expires_at < ?", [Date.now()]);
  await run("INSERT INTO telegram_logins (code, expires_at) VALUES (?, ?)", [nonce, expiresAt]);
  return { nonce, clientId };
}

export async function completeTelegramOidc(idToken) {
  const clientId = telegramClientId();
  if (!clientId) throw httpError(400, "Add the Telegram client id from BotFather, then restart the app.");
  const payload = await verifyTelegramToken(idToken, clientId);
  const nonce = String(payload.nonce || "");
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw httpError(400, "This sign-in expired");
  const spent = await run(
    "DELETE FROM telegram_logins WHERE code = ? AND session_id IS NULL AND expires_at >= ?",
    [nonce, Date.now()],
  );
  if (spent.affectedRows !== 1) throw httpError(400, "This sign-in expired");
  const telegramId = Number(payload.id);
  const phone = payload.phone_number;
  if (!Number.isSafeInteger(telegramId) || telegramId < 1) throw httpError(400, "Telegram sign-in was rejected");
  if (!phone || payload.phone_number_verified === false) {
    throw httpError(400, "Allow your phone number in Telegram to sign in.");
  }
  const customer = await saveCustomer({
    telegramId,
    name: customerName(payload.given_name, payload.family_name, payload.name),
    username: payload.preferred_username,
    phone,
  });
  if (!customer) throw httpError(400, "That phone number cannot be used. Use an Ethiopian mobile number.");
  const session = await createSession("buyer", String(customer.id), 30 * 24 * 60 * 60 * 1000);
  return { customer, session };
}

export async function finishTelegramLogin({ telegramId, firstName, lastName, username, phone }) {
  const id = Number(telegramId);
  if (!Number.isSafeInteger(id) || id < 1) return "expired";
  const login = await get(
    `SELECT * FROM telegram_logins
     WHERE telegram_user_id = ? AND session_id IS NULL AND expires_at >= ?
     ORDER BY expires_at DESC LIMIT 1`,
    [id, Date.now()],
  );
  if (!login) return "expired";
  const customer = await saveCustomer({
    telegramId: id,
    name: customerName(firstName, lastName),
    username,
    phone,
  });
  if (!customer) return "phone";
  const session = await createSession("buyer", String(customer.id), 30 * 24 * 60 * 60 * 1000);
  await run(
    "UPDATE telegram_logins SET customer_id = ?, session_id = ? WHERE code = ? AND session_id IS NULL",
    [customer.id, session.id, login.code],
  );
  return "ready";
}

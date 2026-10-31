import crypto from "node:crypto";
import { get, run } from "../../db.js";
import { createSession } from "../auth/service.js";
import { httpError, normalizePhone } from "../../util.js";
import { verifyTelegramToken } from "./verify.js";

const LOGIN_MS = 10 * 60 * 1000;

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

function customerName(firstName, lastName, fullName) {
  const combined = String(fullName || "").trim() || [firstName, lastName].filter(Boolean).join(" ");
  return combined.replace(/\s+/g, " ").trim().slice(0, 80) || "Telegram user";
}

function customerHandle(username) {
  return String(username || "").replace(/[^\w]/g, "").slice(0, 64);
}

function telegramUserId(payload) {
  for (const raw of [payload?.id, payload?.sub, payload?.user_id]) {
    const text = String(raw ?? "").trim();
    if (!/^\d{1,19}$/.test(text)) continue;
    try {
      const value = BigInt(text);
      if (value >= 1n && value <= 9223372036854775807n) return text;
    } catch {
      /* try the next claim */
    }
  }
  return "";
}

async function saveCustomer({ telegramId, name, username, phone }) {
  const id = String(telegramId);
  if (!/^\d{1,19}$/.test(id)) return null;
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
  const telegramId = telegramUserId(payload);
  const phone = payload.phone_number;
  if (!telegramId) {
    console.error(`Telegram sign-in rejected: user id missing (${Object.keys(payload).join(",")})`);
    throw httpError(400, "Telegram sign-in was rejected");
  }
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

function botToken() {
  const value = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  return /^\d{5,16}:[A-Za-z0-9_-]{20,}$/.test(value) ? value : "";
}

export function readWebAppUser(initData) {
  const secret = botToken();
  if (!secret) throw httpError(400, "Add the bot token in .env, then restart the app.");
  const text = String(initData || "");
  if (text.length < 20 || text.length > 4096) throw httpError(400, "Open Equb again from the bot.");
  const params = new URLSearchParams(text);
  const hash = String(params.get("hash") || "");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw httpError(400, "Open Equb again from the bot.");
  const lines = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") lines.push(`${key}=${value}`);
  }
  lines.sort();
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(secret).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(lines.join("\n")).digest("hex");
  const left = Buffer.from(calculated, "hex");
  const right = Buffer.from(hash, "hex");
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw httpError(400, "Open Equb again from the bot.");
  }
  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate > now + 300 || now - authDate > 60 * 60) {
    throw httpError(400, "Open Equb again from the bot.");
  }
  let user;
  try {
    user = JSON.parse(params.get("user") || "");
  } catch {
    throw httpError(400, "Open Equb again from the bot.");
  }
  const telegramId = String(user?.id ?? "");
  if (!/^\d{1,19}$/.test(telegramId)) throw httpError(400, "Open Equb again from the bot.");
  return telegramId;
}

export async function completeTelegramWebApp(initData) {
  const telegramId = readWebAppUser(initData);
  const customer = await get(
    "SELECT id, name, username, phone FROM customers WHERE telegram_id = ?",
    [telegramId],
  );
  if (!customer?.phone) throw httpError(400, "Share your phone number with the bot first.");
  const session = await createSession("buyer", String(customer.id), 30 * 24 * 60 * 60 * 1000);
  return { customer, session };
}

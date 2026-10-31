import { get, run } from "../../db.js";
import { normalizePhone } from "../../util.js";

function appUrl() {
  const value = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value) ? `${value}/` : "";
}

function token() {
  const value = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  return /^\d{5,16}:[A-Za-z0-9_-]{20,}$/.test(value) ? value : "";
}

function delay(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function call(botToken, method, body, signal) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Telegram did not answer");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Telegram did not answer");
  }
  if (!data.ok) throw new Error(data.description || method);
  return data.result;
}

async function customer(telegramId) {
  const id = String(telegramId ?? "");
  if (!/^\d{1,19}$/.test(id)) return null;
  const row = await get("SELECT id, name, phone FROM customers WHERE telegram_id = ?", [id]);
  return row?.phone ? row : null;
}

async function remember(message, phone) {
  const id = String(message.from.id);
  const name = [message.contact.first_name, message.contact.last_name]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Telegram user";
  const username = String(message.from.username || "").replace(/[^\w]/g, "").slice(0, 64);
  const existing = await get("SELECT id FROM customers WHERE telegram_id = ?", [id]);
  if (existing?.id) {
    await run(
      "UPDATE customers SET name = ?, username = ?, phone = ? WHERE id = ?",
      [name, username, phone, existing.id],
    );
    return name;
  }
  await run(
    "INSERT INTO customers (telegram_id, name, username, phone) VALUES (?, ?, ?, ?)",
    [id, name, username, phone],
  );
  return name;
}

function openButton() {
  return {
    inline_keyboard: [[{ text: "Open Equb", web_app: { url: appUrl() } }]],
  };
}

async function hideReplyKeyboard(botToken, chatId, signal) {
  try {
    const sent = await call(botToken, "sendMessage", {
      chat_id: chatId,
      text: "\u200b",
      reply_markup: { remove_keyboard: true },
    }, signal);
    if (sent?.message_id != null) {
      await call(botToken, "deleteMessage", {
        chat_id: chatId,
        message_id: sent.message_id,
      }, signal);
    }
  } catch {
    /* the phone button may already be gone */
  }
}

async function sendPlay(botToken, chatId, text, signal) {
  await hideReplyKeyboard(botToken, chatId, signal);
  await call(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: openButton(),
  }, signal);
}

async function askPhone(botToken, chatId, signal) {
  await call(botToken, "sendMessage", {
    chat_id: chatId,
    text: "Please register by clicking the button below.\nበስልክ ቁጥርዎ ለመመዝገብ ከታች ያለውን በተን ይንኩ።",
    reply_markup: {
      keyboard: [[{ text: "Share phone number", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  }, signal);
}

async function onStart(botToken, message, signal) {
  const row = await customer(message.from?.id);
  if (row) {
    const name = row.name ? `Welcome back, ${row.name}.\n` : "";
    await sendPlay(botToken, message.chat.id, `${name}Click the button below to open Equb.`, signal);
    return;
  }
  await askPhone(botToken, message.chat.id, signal);
}

async function onContact(botToken, message, signal) {
  const own = message.contact?.user_id && String(message.contact.user_id) === String(message.from?.id);
  if (!own) {
    await askPhone(botToken, message.chat.id, signal);
    return;
  }
  const phone = normalizePhone(message.contact.phone_number);
  if (!phone) {
    await call(botToken, "sendMessage", {
      chat_id: message.chat.id,
      text: "Use an Ethiopian mobile number.",
    }, signal);
    return;
  }
  const name = await remember(message, phone);
  const hello = name ? `You are registered, ${name}.\n` : "You are registered.\n";
  await sendPlay(botToken, message.chat.id, `${hello}Click the button below to open Equb.`, signal);
}

function isStart(text) {
  return /^\/start(?:@\w+)?(?:\s|$)/.test(String(text || ""));
}

async function handle(botToken, message, signal) {
  if (!message?.chat?.id || !message.from?.id) return;
  if (message.contact) {
    await onContact(botToken, message, signal);
    return;
  }
  if (isStart(message.text)) await onStart(botToken, message, signal);
}

async function poll(botToken, signal) {
  await call(botToken, "deleteWebhook", { drop_pending_updates: false }, signal);
  await call(botToken, "setMyCommands", {
    commands: [{ command: "start", description: "Open Equb" }],
  }, signal);
  await call(botToken, "setChatMenuButton", {
    menu_button: { type: "commands" },
  }, signal);
  console.log("Telegram bot is listening for /start.");
  let offset = 0;
  while (!signal.aborted) {
    let updates = [];
    try {
      updates = await call(botToken, "getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      }, signal);
    } catch (error) {
      if (signal.aborted || error.name === "AbortError") return;
      console.error(`Telegram bot: ${String(error.message || "unavailable").replaceAll(botToken, "…")}`);
      await delay(3000, signal);
      continue;
    }
    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        await handle(botToken, update.message, signal);
      } catch (error) {
        if (signal.aborted || error.name === "AbortError") return;
        console.error(`Telegram bot: ${String(error.message || "message failed").replaceAll(botToken, "…")}`);
      }
    }
  }
}

export function startTelegramBot() {
  const botToken = token();
  if (!botToken) {
    console.log("Telegram bot is off until TELEGRAM_BOT_TOKEN is set.");
    return;
  }
  if (!appUrl()) {
    console.log("Telegram bot is off until APP_URL is an https address in .env.");
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  poll(botToken, controller.signal).catch((error) => {
    if (error.name === "AbortError") return;
    console.error(`Telegram bot: ${String(error.message || "stopped").replaceAll(botToken, "…")}`);
  });
}

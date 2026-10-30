import { finishTelegramLogin, rememberTelegramUser, telegramBot } from "./service.js";

let started = false;

function api(token, method, body) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function reply(token, chatId, text, markup) {
  await api(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: markup,
  });
}

const shareKeyboard = {
  keyboard: [[{ text: "Share phone", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

async function handleUpdate(token, update) {
  const message = update.message;
  if (!message?.chat?.id) return;
  const chatId = message.chat.id;
  const from = message.from || {};
  if (message.contact) {
    const own = Number(message.contact.user_id) === Number(from.id);
    if (!own) {
      await reply(token, chatId, "Share your own phone number.", shareKeyboard);
      return;
    }
    const result = await finishTelegramLogin({
      telegramId: from.id,
      firstName: from.first_name,
      lastName: from.last_name,
      username: from.username,
      phone: message.contact.phone_number,
    });
    if (result === "ready") {
      await reply(token, chatId, "Signed in. Return to the website.", { remove_keyboard: true });
      return;
    }
    const text = result === "phone"
      ? "That phone number cannot be used. Share an Ethiopian mobile number."
      : "This sign-in expired. Open the website and tap Telegram again.";
    await reply(token, chatId, text, result === "phone" ? shareKeyboard : { remove_keyboard: true });
    return;
  }
  const text = String(message.text || "");
  const start = /^\/start(?:@\w+)?(?:\s+([a-f0-9]{32}))?/.exec(text);
  if (!start) return;
  const code = start[1] || "";
  if (!code) {
    await reply(token, chatId, "Open the website and tap Telegram to sign in.");
    return;
  }
  const saved = await rememberTelegramUser(code, from.id);
  if (!saved) {
    await reply(token, chatId, "This sign-in expired. Open the website and tap Telegram again.");
    return;
  }
  await reply(token, chatId, "Tap Share phone. We use your Telegram name and that phone number to sign you in.", shareKeyboard);
}

export function startTelegramBot() {
  const bot = telegramBot();
  if (!bot.enabled || started) return;
  started = true;
  const token = bot.token;
  let offset = 0;
  const loop = async () => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
          console.error("Telegram bot token was rejected.");
          started = false;
          return;
        }
        console.error("Telegram bot could not read updates.");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
      const body = await response.json();
      for (const update of body.result || []) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(token, update);
        } catch (error) {
          console.error("Telegram sign-in failed.", error.message);
        }
      }
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (started) setTimeout(loop, 200);
  };
  setTimeout(loop, 200);
  console.log(`Telegram sign-in: @${bot.username}`);
}

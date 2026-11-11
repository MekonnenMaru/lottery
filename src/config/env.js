import path from "node:path";
import dotenv from "dotenv";
import { root } from "./paths.js";
import { LOTTERY_BASE_PATH } from "./embed.js";

let loaded = false;

function text(value) {
  return String(value ?? "").trim();
}

function first(...values) {
  for (const value of values) {
    const t = text(value);
    if (t) return t;
  }
  return "";
}

function appUrl() {
  const value = first(process.env.LOTTERY_APP_URL, process.env.APP_URL)
    .replace(/\/+$/, "");
  if (/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value)) return value;
  // Embed fallback: bingo public URL + /lottery
  const bingo = first(process.env.APP_BASE_URL, process.env.BASE_URL).replace(/\/+$/, "");
  if (/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(bingo)) {
    return `${bingo}${LOTTERY_BASE_PATH}`;
  }
  return "";
}

function telegramToken() {
  // WebApp / client id: prefer lottery token, then bingo TELEGRAM_TOKEN when embedded.
  // Standalone lottery bot polling still uses only LOTTERY_TELEGRAM_BOT_TOKEN in bot.js.
  const raw = first(
    process.env.LOTTERY_TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_TOKEN,
  );
  const value = raw.split(/\s+/)[0] || "";
  return /^\d{5,16}:[A-Za-z0-9_-]{20,}$/.test(value) ? value : "";
}

function telegramClientId() {
  const explicit = first(process.env.LOTTERY_TELEGRAM_CLIENT_ID, process.env.TELEGRAM_CLIENT_ID);
  if (/^\d{5,16}$/.test(explicit)) return explicit;
  const fromToken = telegramToken().split(":")[0];
  return /^\d{5,16}$/.test(fromToken) ? fromToken : "";
}

function isEmbed() {
  return text(process.env.LOTTERY_EMBED) === "1" || text(process.env.LOTTERY_EMBED).toLowerCase() === "yes";
}

/** Snapshot of validated runtime config from `.env`. */
export function env() {
  const nodeEnv = text(process.env.NODE_ENV) || "development";
  const embed = isEmbed();
  const database = first(process.env.LOTTERY_DB_NAME, process.env.DB_NAME) || "maraki_ekub";
  const poolSize = Number(process.env.LOTTERY_DB_POOL_SIZE || process.env.DB_POOL_SIZE || 10);
  // Standalone defaults to 3010 so it does not fight bingo's PORT.
  const portRaw = embed
    ? first(process.env.LOTTERY_PORT, process.env.PORT) || "3000"
    : first(process.env.LOTTERY_PORT) || "3010";
  const port = Number(portRaw);
  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    isEmbed: embed,
    basePath: LOTTERY_BASE_PATH,
    port: Number.isFinite(port) && port > 0 ? port : (embed ? 3000 : 3010),
    host: text(process.env.LOTTERY_HOST) || text(process.env.HOST) || "127.0.0.1",
    sessionSecret: first(
      process.env.LOTTERY_SESSION_SECRET,
      process.env.SESSION_SECRET,
      process.env.MANAGEMENT_JWT_SECRET,
    ),
    adminUsername: first(process.env.LOTTERY_ADMIN_USERNAME, process.env.ADMIN_USERNAME) || "lotteryadmin",
    adminPassword: first(process.env.LOTTERY_ADMIN_PASSWORD, process.env.ADMIN_PASSWORD),
    appUrl: appUrl(),
    db: {
      host: first(process.env.LOTTERY_DB_HOST, process.env.DB_HOST) || "localhost",
      port: Number(process.env.LOTTERY_DB_PORT || process.env.DB_PORT || 3306),
      user: first(process.env.LOTTERY_DB_USER, process.env.DB_USER) || "root",
      password: process.env.LOTTERY_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
      name: database,
      poolSize: Number.isFinite(poolSize) && poolSize > 0 ? poolSize : 10,
    },
    telegram: {
      clientId: telegramClientId(),
      botUsername: first(process.env.LOTTERY_TELEGRAM_BOT_USERNAME, process.env.TELEGRAM_BOT_USERNAME).replace(/^@/, ""),
      botToken: telegramToken(),
    },
  };
}

/** Load `.env`, validate required secrets, apply once. */
export function loadEnv({ soft = false } = {}) {
  if (!loaded) {
    // lottery/.env wins (override) so embed can keep secrets out of bingo .env.
    // Parent bingo .env only fills missing keys (DB_HOST, MANAGEMENT_JWT_SECRET, etc.).
    dotenv.config({ path: path.join(root, ".env"), override: true });
    const inheritParent = text(process.env.LOTTERY_INHERIT_PARENT_ENV).toLowerCase();
    const skipParent = inheritParent === "no" || inheritParent === "false" || inheritParent === "0";
    if (!skipParent) {
      dotenv.config({ path: path.join(root, "..", ".env"), override: false });
    }
    loaded = true;
  }

  const config = env();
  const fail = (message) => {
    if (soft || config.isEmbed) {
      const err = new Error(message);
      err.code = "LOTTERY_ENV";
      throw err;
    }
    console.error(message);
    process.exit(1);
  };

  if (!config.sessionSecret || config.sessionSecret.length < 12) {
    fail("Set LOTTERY_SESSION_SECRET (or SESSION_SECRET / MANAGEMENT_JWT_SECRET) before starting lottery.");
  }
  if (!config.adminPassword) {
    fail("Set LOTTERY_ADMIN_PASSWORD in .env before starting lottery.");
  }
  if (config.isProduction) {
    for (const [key, value] of [
      ["LOTTERY_SESSION_SECRET", config.sessionSecret],
      ["LOTTERY_ADMIN_PASSWORD", config.adminPassword],
    ]) {
      if (/change|replace|example|sample/i.test(value)) {
        fail(`${key} still looks like a sample value — update it in .env.`);
      }
    }
  }
  if (!/^[A-Za-z0-9_]+$/.test(config.db.name)) {
    fail("LOTTERY_DB_NAME / DB_NAME may only contain letters, numbers, and underscores");
  }

  return config;
}

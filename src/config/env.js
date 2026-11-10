import path from "node:path";
import dotenv from "dotenv";
import { root } from "./paths.js";

let loaded = false;

function text(value) {
  return String(value ?? "").trim();
}

function appUrl() {
  const value = text(process.env.APP_URL).replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value) ? value : "";
}

function telegramToken() {
  const value = text(process.env.TELEGRAM_BOT_TOKEN);
  return /^\d{5,16}:[A-Za-z0-9_-]{20,}$/.test(value) ? value : "";
}

function telegramClientId() {
  const explicit = text(process.env.TELEGRAM_CLIENT_ID);
  if (/^\d{5,16}$/.test(explicit)) return explicit;
  const fromToken = telegramToken().split(":")[0];
  return /^\d{5,16}$/.test(fromToken) ? fromToken : "";
}

/** Snapshot of validated runtime config from `.env`. */
export function env() {
  const nodeEnv = text(process.env.NODE_ENV) || "development";
  const database = text(process.env.DB_NAME) || "maraki_ekub";
  const poolSize = Number(process.env.DB_POOL_SIZE || 10);
  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: Number(process.env.PORT) || 3000,
    host: text(process.env.HOST) || "127.0.0.1",
    sessionSecret: text(process.env.SESSION_SECRET),
    adminUsername: text(process.env.ADMIN_USERNAME) || "admin",
    adminPassword: text(process.env.ADMIN_PASSWORD),
    appUrl: appUrl(),
    db: {
      host: text(process.env.DB_HOST) || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: text(process.env.DB_USER) || "root",
      password: process.env.DB_PASSWORD ?? "",
      name: database,
      poolSize: Number.isFinite(poolSize) && poolSize > 0 ? poolSize : 10,
    },
    telegram: {
      clientId: telegramClientId(),
      botUsername: text(process.env.TELEGRAM_BOT_USERNAME).replace(/^@/, ""),
      botToken: telegramToken(),
    },
  };
}

/** Load `.env`, validate required secrets, apply once. */
export function loadEnv() {
  if (!loaded) {
    dotenv.config({ path: path.join(root, ".env") });
    loaded = true;
  }

  const config = env();

  if (!config.sessionSecret || config.sessionSecret.length < 12) {
    console.error("Set a long SESSION_SECRET in .env before starting.");
    process.exit(1);
  }
  if (!config.adminPassword) {
    console.error("Set ADMIN_PASSWORD in .env before starting.");
    process.exit(1);
  }
  if (config.isProduction) {
    for (const [key, value] of [
      ["SESSION_SECRET", config.sessionSecret],
      ["ADMIN_PASSWORD", config.adminPassword],
    ]) {
      if (/change|replace|example|sample/i.test(value)) {
        console.error(`${key} still looks like a sample value update it in .env.`);
        process.exit(1);
      }
    }
  }
  if (!/^[A-Za-z0-9_]+$/.test(config.db.name)) {
    console.error("DB_NAME may only contain letters, numbers, and underscores");
    process.exit(1);
  }

  return config;
}

import express from "express";
import { APP_TIMEZONE, loadEnv } from "./src/config/index.js";
import { closeDatabase, openDatabase, syncLotteryImages } from "./src/db.js";
import { ensureAdmin } from "./src/features/admin/service.js";
import { seedCatalog } from "./src/features/lotteries/seed.js";
import { seedBanks } from "./src/features/banks/service.js";
import { createApp } from "./src/app.js";
import { startTelegramBot } from "./src/features/telegram/bot.js";
import { appName, loadSettings } from "./src/features/settings/service.js";

// Standalone lottery process (not mounted inside bingo).
process.env.LOTTERY_EMBED = "0";
const config = loadEnv();

function publicBasePath() {
  const raw = String(config.basePath || "/lottery").trim().replace(/\/+$/, "");
  if (!raw || raw === "/") return "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

async function start() {
  await openDatabase();
  await loadSettings();
  const adminUsername = await ensureAdmin();
  await seedBanks();
  await seedCatalog();
  await syncLotteryImages();
  startTelegramBot();

  const basePath = publicBasePath();
  const lotteryApp = createApp({
    basePath,
    embed: false,
    trustProxy: 1,
  });

  const { port, host } = config;
  const root = express();
  root.disable("x-powered-by");

  if (basePath) {
    root.use(basePath, lotteryApp);
    root.get("/", (_req, res) => res.redirect(302, `${basePath}/`));
  } else {
    root.use(lotteryApp);
  }

  const server = root.listen(port, host, () => {
    const url = `http://${host}:${port}${basePath || ""}`;
    const lines = [
      `${appName()} (lottery-only)`,
      `Open: ${url}`,
      `Staff: ${url}/manage  (${adminUsername})`,
      `DB: ${config.db.name}`,
      `Timezone: ${APP_TIMEZONE}`,
    ];
    const width = Math.max(...lines.map((line) => line.length));
    const edge = "=".repeat(width + 4);
    console.log(edge);
    for (const line of lines) console.log(`= ${line.padEnd(width)} =`);
    console.log(edge);
  });
  server.on("error", (error) => {
    console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use` : error);
    process.exit(1);
  });

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`${signal}: closing…`);
    await new Promise((resolve) => server.close(resolve));
    try {
      await closeDatabase();
    } catch (error) {
      console.error(error);
    }
    process.exit(0);
  }
  process.once("SIGINT", () => { shutdown("SIGINT"); });
  process.once("SIGTERM", () => { shutdown("SIGTERM"); });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

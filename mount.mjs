/**
 * Mount lottery as an isolated Express sub-app under /lottery inside maraki_bingo.
 * Does not start a second HTTP server. Bingo gameplay is untouched.
 */
import { lotteryEnabled, lotteryTelegramEnabled, LOTTERY_BASE_PATH } from "./src/config/embed.js";
import { loadEnv } from "./src/config/env.js";
import { openDatabase, closeDatabase } from "./src/db.js";
import { ensureAdmin } from "./src/features/admin/service.js";
import { seedCatalog } from "./src/features/lotteries/seed.js";
import { seedBanks } from "./src/features/banks/service.js";
import { loadSettings, appName } from "./src/features/settings/service.js";
import { createApp } from "./src/app.js";
import { startTelegramBot } from "./src/features/telegram/bot.js";
import { syncLotteryImages } from "./src/db.js";

let started = false;
let lotteryApp = null;

export async function attachLottery(bingoExpressApp) {
  if (!lotteryEnabled()) {
    console.log("[lottery] disabled (LOTTERY_ENABLED=no)");
    return { enabled: false, basePath: LOTTERY_BASE_PATH };
  }
  if (started) {
    return { enabled: true, basePath: LOTTERY_BASE_PATH, reused: true };
  }

  process.env.LOTTERY_EMBED = "1";
  const config = loadEnv({ soft: true });

  await openDatabase();
  await loadSettings();
  const adminUsername = await ensureAdmin();
  await seedBanks();
  await seedCatalog();
  await syncLotteryImages();

  lotteryApp = createApp({
    basePath: LOTTERY_BASE_PATH,
    embed: true,
    trustProxy: 1,
  });

  bingoExpressApp.use(LOTTERY_BASE_PATH, lotteryApp);
  started = true;

  if (lotteryTelegramEnabled()) {
    startTelegramBot();
  } else {
    console.log("[lottery] Telegram bot off (set LOTTERY_TELEGRAM_ENABLED=yes for a dedicated lottery bot token)");
  }

  console.log(
    `[lottery] mounted at ${LOTTERY_BASE_PATH} · staff: ${adminUsername} · db: ${config.db.name} · ${appName()}`,
  );
  return {
    enabled: true,
    basePath: LOTTERY_BASE_PATH,
    adminUsername,
    dbName: config.db.name,
  };
}

export async function stopLottery() {
  if (!started) return;
  try {
    await closeDatabase();
  } catch (err) {
    console.warn("[lottery] close db:", err.message);
  }
  started = false;
  lotteryApp = null;
}

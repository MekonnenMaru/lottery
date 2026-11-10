import { APP_TIMEZONE, loadEnv } from "./src/config/index.js";
import { closeDatabase, openDatabase, syncLotteryImages } from "./src/db.js";
import { ensureAdmin } from "./src/features/admin/service.js";
import { seedCatalog } from "./src/features/lotteries/seed.js";
import { seedBanks } from "./src/features/banks/service.js";
import { createApp } from "./src/app.js";
import { startTelegramBot } from "./src/features/telegram/bot.js";
import { appName, loadSettings } from "./src/features/settings/service.js";

const config = loadEnv();

async function start() {
  await openDatabase();
  await loadSettings();
  const adminUsername = await ensureAdmin();
  await seedBanks();
  await seedCatalog();
  await syncLotteryImages();
  startTelegramBot();

  const { port, host } = config;
  const server = createApp().listen(port, host, () => {
    console.log(`${appName()} running at http://${host}:${port}`);
    console.log(`Staff sign-in: ${adminUsername}`);
    console.log(`Platform timezone: ${APP_TIMEZONE} (timestamps stored in UTC)`);
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

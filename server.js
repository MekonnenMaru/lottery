import "./src/time.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { openDatabase, syncLotteryImages } from "./src/db.js";
import { ensureAdmin } from "./src/features/admin/service.js";
import { seedCatalog } from "./src/features/lotteries/seed.js";
import { seedBanks } from "./src/features/banks/service.js";
import { createApp } from "./src/app.js";
import { startTelegramBot } from "./src/features/telegram/bot.js";
import { appName, loadSettings } from "./src/features/settings/service.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, ".env") });

for (const key of ["SESSION_SECRET"]) {
  if (!process.env[key] || process.env[key].length < 12) {
    console.error(`Set a long ${key} in .env before starting.`);
    process.exit(1);
  }
}
if (!process.env.ADMIN_PASSWORD) {
  console.error("Set ADMIN_PASSWORD in .env before starting.");
  process.exit(1);
}

const production = process.env.NODE_ENV === "production";
if (production) {
  for (const key of ["SESSION_SECRET", "ADMIN_PASSWORD"]) {
    if (/change|replace|example|sample/i.test(process.env[key])) {
      console.error(`${key} still looks like a sample value.`);
      process.exit(1);
    }
  }
}

async function start() {
  await openDatabase();
  await loadSettings();
  const adminUsername = await ensureAdmin();
  await seedBanks();
  await seedCatalog();
  await syncLotteryImages();
  startTelegramBot();

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";
  const server = createApp().listen(port, host, () => {
    console.log(`${appName()} running at http://${host}:${port}`);
    console.log(`Staff sign-in: ${adminUsername}`);
  });
  server.on("error", (error) => {
    console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use` : error);
    process.exit(1);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

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

const { openDatabase, syncLotteryImages } = await import("./src/db.js");
const { ensureAdmin } = await import("./src/features/admin/service.js");
const { seedCatalog } = await import("./src/features/lotteries/seed.js");
const { seedBanks } = await import("./src/features/banks/service.js");
const { createApp } = await import("./src/app.js");
const { appName } = await import("./src/util.js");
const { startTelegramBot } = await import("./src/features/telegram/bot.js");

await openDatabase();
const adminUsername = await ensureAdmin();
await seedBanks();
await seedCatalog();
await syncLotteryImages();

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const server = createApp().listen(port, host, () => {
  console.log(`${appName()} running at http://${host}:${port}`);
  console.log(`Staff sign-in: ${adminUsername}`);
  startTelegramBot();
});
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use` : error);
  process.exit(1);
});

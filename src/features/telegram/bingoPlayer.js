import mysql from "mysql2/promise";

/**
 * Read-only lookup of bingo players for lottery Mini App SSO.
 * Uses bingo DB_NAME (not LOTTERY_DB_NAME). Does not write bingo tables.
 */

let pool;

function text(value) {
  return String(value ?? "").trim();
}

function bingoDbName() {
  // Prefer an explicit override; otherwise the parent bingo DB_NAME.
  // Lottery's own database is LOTTERY_DB_NAME and must not be used here.
  const lotteryDb = text(process.env.LOTTERY_DB_NAME);
  const explicit = text(process.env.BINGO_DB_NAME);
  if (explicit) return explicit;
  const dbName = text(process.env.DB_NAME);
  if (dbName && dbName !== lotteryDb) return dbName;
  return "bingo_online";
}

function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: text(process.env.BINGO_DB_HOST) || text(process.env.DB_HOST) || "localhost",
    port: Number(process.env.BINGO_DB_PORT || process.env.DB_PORT || 3306),
    user: text(process.env.BINGO_DB_USER) || text(process.env.DB_USER) || "root",
    password: process.env.BINGO_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
    database: bingoDbName(),
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 20,
  });
  return pool;
}

/**
 * @param {string} telegramId
 * @returns {Promise<{ phone_number: string, first_name: string, last_name: string, telegram_username: string } | null>}
 */
export async function findBingoPlayerByTelegram(telegramId) {
  const id = text(telegramId);
  if (!/^\d{1,19}$/.test(id)) return null;
  try {
    const [rows] = await getPool().query(
      `SELECT phone_number, first_name, last_name, telegram_username
       FROM players
       WHERE telegram_user_id = ?
         AND phone_number IS NOT NULL
         AND phone_number != ''
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  } catch (error) {
    console.error(`[lottery] bingo player lookup failed: ${error.message}`);
    return null;
  }
}

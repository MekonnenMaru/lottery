import mysql from "mysql2/promise";
import { databaseConfig } from "./config/database.js";
import { runMigrations } from "./migrations.js";

let pool;

function requirePool() {
  if (!pool) throw new Error("Database is not open");
  return pool;
}

function client(conn) {
  return {
    async get(sql, params = []) {
      const [rows] = await conn.query(sql, params);
      return rows[0];
    },
    async all(sql, params = []) {
      const [rows] = await conn.query(sql, params);
      return rows;
    },
    async run(sql, params = []) {
      const [result] = await conn.query(sql, params);
      return result;
    },
  };
}

export function countOf(row) {
  return Number(row?.count || 0);
}

export function flag(value) {
  return Number(value) === 1;
}

export function iso(value) {
  if (!value) return value ?? null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

export async function get(sql, params) {
  return client(requirePool()).get(sql, params);
}

export async function all(sql, params) {
  return client(requirePool()).all(sql, params);
}

export async function run(sql, params) {
  return client(requirePool()).run(sql, params);
}

export async function withTransaction(fn, { retries = 1 } = {}) {
  let attempt = 0;
  for (;;) {
    const conn = await requirePool().getConnection();
    const tx = client(conn);
    try {
      await conn.beginTransaction();
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (error) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      const deadlock = error?.code === "ER_LOCK_DEADLOCK" || error?.errno === 1213;
      if (deadlock && attempt < retries) {
        attempt += 1;
        continue;
      }
      throw error;
    } finally {
      conn.release();
    }
  }
}

export async function openDatabase() {
  if (pool) return pool;

  const { host, port, user, password, database, poolSize } = databaseConfig();
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("DB_NAME may only contain letters, numbers, and underscores");
  }

  const bootstrap = await mysql.createConnection({ host, port, user, password });
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await bootstrap.end();
  }

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: poolSize,
    maxIdle: poolSize,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "Z",
    charset: "utf8mb4",
    dateStrings: false,
  });

  // Every pooled connection stores/reads DATETIME in UTC.
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });

  pool.on("error", (error) => {
    console.error("MySQL pool error:", error.code || error.message);
  });

  // Verify connectivity and timezone once (also warms one connection).
  const probe = await pool.getConnection();
  try {
    await probe.query("SET time_zone = '+00:00'");
    const [rows] = await probe.query("SELECT @@session.time_zone AS tz, UTC_TIMESTAMP(3) AS utc_now");
    if (rows[0]?.tz !== "+00:00" && rows[0]?.tz !== "UTC") {
      throw new Error(`MySQL session time_zone must be UTC, got ${rows[0]?.tz}`);
    }
  } finally {
    probe.release();
  }

  await runMigrations(pool);
  await syncLotteryImages();
  return pool;
}

export async function closeDatabase() {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}

/**
 * Backfill lottery_images from the legacy single lotteries.image_path column.
 * Safe to re-run: skips lotteries that already have rows in lottery_images.
 */
export async function syncLotteryImages() {
  await requirePool().query(`
    INSERT INTO lottery_images (lottery_id, image_path, sort_order)
    SELECT l.id, l.image_path, 0
    FROM lotteries l
    WHERE l.image_path IS NOT NULL AND l.image_path <> ''
      AND NOT EXISTS (SELECT 1 FROM lottery_images i WHERE i.lottery_id = l.id)
  `);
}

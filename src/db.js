import mysql from "mysql2/promise";

let pool;

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
  return client(pool).get(sql, params);
}

export async function all(sql, params) {
  return client(pool).all(sql, params);
}

export async function run(sql, params) {
  return client(pool).run(sql, params);
}

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  const tx = client(conn);
  try {
    await conn.beginTransaction();
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (error) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    throw error;
  } finally {
    conn.release();
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(32) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id CHAR(64) PRIMARY KEY,
    kind VARCHAR(10) NOT NULL,
    subject VARCHAR(32) NOT NULL,
    expires_at BIGINT NOT NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS bank_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bank_name VARCHAR(80) NOT NULL,
    account_name VARCHAR(80) NOT NULL,
    account_number VARCHAR(40) NOT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS lotteries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    subtitle VARCHAR(160) NOT NULL DEFAULT '',
    prize VARCHAR(160) NOT NULL DEFAULT '',
    ticket_price INT NOT NULL,
    total_tickets INT NOT NULL,
    start_at DATETIME(3) NOT NULL,
    end_at DATETIME(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_featured TINYINT NOT NULL DEFAULT 0,
    image_path VARCHAR(255) NULL,
    winner_ticket_id INT NULL,
    announced_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lottery_id INT NOT NULL,
    phone VARCHAR(16) NOT NULL,
    customer_name VARCHAR(80) NULL,
    sender_account VARCHAR(40) NULL,
    bank_account_id INT NULL,
    amount INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    receipt_path VARCHAR(255) NULL,
    reserved_until BIGINT NULL,
    ticket_numbers TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    reviewed_at DATETIME(3) NULL,
    reviewed_by INT NULL,
    CONSTRAINT fk_orders_lottery FOREIGN KEY (lottery_id) REFERENCES lotteries(id),
    KEY idx_orders_phone (phone),
    KEY idx_orders_lottery_status (lottery_id, status)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lottery_id INT NOT NULL,
    ticket_number INT NOT NULL,
    order_id INT NOT NULL,
    phone VARCHAR(16) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_lottery_ticket (lottery_id, ticket_number),
    CONSTRAINT fk_tickets_lottery FOREIGN KEY (lottery_id) REFERENCES lotteries(id),
    CONSTRAINT fk_tickets_order FOREIGN KEY (order_id) REFERENCES orders(id),
    KEY idx_tickets_lottery (lottery_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS lottery_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lottery_id INT NOT NULL,
    image_path VARCHAR(512) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_lottery_images_lottery FOREIGN KEY (lottery_id) REFERENCES lotteries(id) ON DELETE CASCADE,
    KEY idx_lottery_images_order (lottery_id, sort_order)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NULL,
    action VARCHAR(40) NOT NULL,
    detail TEXT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_id BIGINT NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    username VARCHAR(64) NULL,
    phone VARCHAR(16) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS telegram_logins (
    code CHAR(32) PRIMARY KEY,
    expires_at BIGINT NOT NULL,
    telegram_user_id BIGINT NULL,
    customer_id INT NULL,
    session_id CHAR(64) NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`,
];

export async function openDatabase() {
  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_NAME || "maraki_ekub";
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("DB_NAME may only contain letters, numbers, and underscores");
  }
  const bootstrap = await mysql.createConnection({ host, port, user, password });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await bootstrap.end();
  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: "Z",
    charset: "utf8mb4",
  });
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  const held = [];
  for (let i = 0; i < 10; i += 1) {
    const connection = await pool.getConnection();
    await connection.query("SET time_zone = '+00:00'");
    held.push(connection);
  }
  for (const connection of held) connection.release();
  for (const statement of SCHEMA) {
    await pool.query(statement);
  }
  await ensureColumn("orders", "customer_name", "VARCHAR(80) NULL");
  await ensureColumn("orders", "sender_account", "VARCHAR(40) NULL");
  await ensureColumn("orders", "bank_account_id", "INT NULL");
  await ensureColumn("lotteries", "announced_at", "DATETIME(3) NULL");
  await ensureColumn("lotteries", "hidden", "TINYINT NOT NULL DEFAULT 0");
  await ensureColumn("telegram_logins", "telegram_user_id", "BIGINT NULL");
  await pool.query("ALTER TABLE lotteries MODIFY title VARCHAR(160) NOT NULL");
  await pool.query("ALTER TABLE lotteries MODIFY subtitle VARCHAR(160) NOT NULL");
  await pool.query("ALTER TABLE lotteries MODIFY prize VARCHAR(160) NOT NULL");
  await syncLotteryImages();
}

export async function syncLotteryImages() {
  await pool.query(`
    INSERT INTO lottery_images (lottery_id, image_path, sort_order)
    SELECT l.id, l.image_path, 0
    FROM lotteries l
    WHERE l.image_path IS NOT NULL AND l.image_path <> ''
      AND NOT EXISTS (SELECT 1 FROM lottery_images i WHERE i.lottery_id = l.id)
  `);
}

async function ensureColumn(table, column, definition) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (Number(rows[0].count) === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

/**
 * Versioned, additive MySQL migrations.
 * Each id runs at most once. CREATE/ALTER statements must be safe for existing data.
 */

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0].count) > 0;
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return Number(rows[0].count) > 0;
}

async function ensureColumn(conn, table, column, definition) {
  if (await columnExists(conn, table, column)) return;
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function ensureIndex(conn, table, indexName, ddl) {
  if (await indexExists(conn, table, indexName)) return;
  await conn.query(ddl);
}

const MIGRATIONS = [
  {
    id: "001_baseline",
    async up(conn) {
      const statements = [
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
          hidden TINYINT NOT NULL DEFAULT 0,
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
      for (const sql of statements) await conn.query(sql);
    },
  },
  {
    id: "002_legacy_columns",
    async up(conn) {
      // Older installs created tables before these columns existed.
      await ensureColumn(conn, "orders", "customer_name", "VARCHAR(80) NULL");
      await ensureColumn(conn, "orders", "sender_account", "VARCHAR(40) NULL");
      await ensureColumn(conn, "orders", "bank_account_id", "INT NULL");
      await ensureColumn(conn, "lotteries", "announced_at", "DATETIME(3) NULL");
      await ensureColumn(conn, "lotteries", "hidden", "TINYINT NOT NULL DEFAULT 0");
      await ensureColumn(conn, "telegram_logins", "telegram_user_id", "BIGINT NULL");
    },
  },
  {
    id: "003_lottery_text_widths",
    async up(conn) {
      await conn.query("ALTER TABLE lotteries MODIFY title VARCHAR(160) NOT NULL");
      await conn.query("ALTER TABLE lotteries MODIFY subtitle VARCHAR(160) NOT NULL");
      await conn.query("ALTER TABLE lotteries MODIFY prize VARCHAR(160) NOT NULL");
    },
  },
  {
    id: "004_reservation_guards",
    async up(conn) {
      await ensureIndex(
        conn,
        "orders",
        "idx_orders_reserved",
        "ALTER TABLE orders ADD KEY idx_orders_reserved (status, reserved_until)",
      );
      await ensureIndex(
        conn,
        "tickets",
        "idx_tickets_order",
        "ALTER TABLE tickets ADD KEY idx_tickets_order (order_id)",
      );
      // One receipt file may only back one order (NULLs remain allowed).
      const [dupes] = await conn.query(`
        SELECT receipt_path, COUNT(*) AS count
        FROM orders
        WHERE receipt_path IS NOT NULL AND receipt_path <> ''
        GROUP BY receipt_path
        HAVING COUNT(*) > 1
        LIMIT 1
      `);
      if (!dupes.length) {
        await ensureIndex(
          conn,
          "orders",
          "uniq_orders_receipt",
          "ALTER TABLE orders ADD UNIQUE KEY uniq_orders_receipt (receipt_path)",
        );
      }
    },
  },
  {
    id: "005_receipt_ocr_audit",
    async up(conn) {
      // Latest OCR result + who scanned it (sub-admin accountability).
      await ensureColumn(conn, "orders", "ocr_text", "MEDIUMTEXT NULL");
      await ensureColumn(conn, "orders", "ocr_confidence", "DECIMAL(5,1) NULL");
      await ensureColumn(conn, "orders", "ocr_language", "VARCHAR(16) NULL");
      await ensureColumn(conn, "orders", "ocr_receipt", "VARCHAR(255) NULL");
      await ensureColumn(conn, "orders", "ocr_scanned_at", "DATETIME(3) NULL");
      await ensureColumn(conn, "orders", "ocr_scanned_by", "INT NULL");
      await ensureIndex(
        conn,
        "orders",
        "idx_orders_ocr_scanned_by",
        "ALTER TABLE orders ADD KEY idx_orders_ocr_scanned_by (ocr_scanned_by)",
      );
      await ensureIndex(
        conn,
        "orders",
        "idx_orders_reviewed_by",
        "ALTER TABLE orders ADD KEY idx_orders_reviewed_by (reviewed_by)",
      );
    },
  },
  {
    id: "006_transaction_id",
    async up(conn) {
      // Bank transfer reference (e.g. CBE FT26305GCDDP). Unique when set — blocks receipt reuse.
      await ensureColumn(conn, "orders", "transaction_id", "VARCHAR(64) NULL");
      await ensureIndex(
        conn,
        "orders",
        "uniq_orders_transaction_id",
        "ALTER TABLE orders ADD UNIQUE KEY uniq_orders_transaction_id (transaction_id)",
      );
    },
  },
  {
    id: "007_admin_roles",
    async up(conn) {
      // Existing account(s) become super admin; new staff get role=admin + privilege list.
      await ensureColumn(conn, "admins", "role", "VARCHAR(16) NOT NULL DEFAULT 'admin'");
      await ensureColumn(conn, "admins", "privileges", "TEXT NULL");
      await ensureColumn(conn, "admins", "active", "TINYINT NOT NULL DEFAULT 1");
      // First existing account becomes super; ensureAdmin() also promotes the env username.
      await conn.query("UPDATE admins SET role = 'super' ORDER BY id ASC LIMIT 1");
    },
  },
  {
    id: "008_admin_profile",
    async up(conn) {
      await ensureColumn(conn, "admins", "name", "VARCHAR(80) NOT NULL DEFAULT ''");
      await ensureColumn(conn, "admins", "phone", "VARCHAR(20) NULL");
      await conn.query("UPDATE admins SET name = username WHERE name = '' OR name IS NULL");
    },
  },
];

export async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(64) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB
  `);

  const [appliedRows] = await pool.query("SELECT id FROM schema_migrations");
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("SET time_zone = '+00:00'");
      await migration.up(conn);
      await conn.query("INSERT INTO schema_migrations (id) VALUES (?)", [migration.id]);
      await conn.commit();
      console.log(`Migration ${migration.id} applied`);
    } catch (error) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw error;
    } finally {
      conn.release();
    }
  }
}

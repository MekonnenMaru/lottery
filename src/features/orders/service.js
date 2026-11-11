import fs from "node:fs";
import path from "node:path";
import { countOf, withTransaction } from "../../db.js";
import { receiptDir } from "../../paths.js";
import { nowMs } from "../../time.js";
import { httpError, normalizePhone, optionalText, parseTicketNumbers, requiredText } from "../../util.js";
import { writeAudit } from "../audit/service.js";

async function expireReservedRows(tx, { lotteryId = null, now = nowMs() } = {}) {
  const params = [now];
  let sql = `
    SELECT id FROM orders
    WHERE status = 'reserved'
      AND reserved_until IS NOT NULL
      AND reserved_until < ?
  `;
  if (lotteryId != null) {
    sql += " AND lottery_id = ?";
    params.push(lotteryId);
  }
  sql += " FOR UPDATE";
  const rows = await tx.all(sql, params);
  for (const row of rows) {
    await tx.run("DELETE FROM tickets WHERE order_id = ?", [row.id]);
    await tx.run(
      "UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'reserved'",
      [row.id],
    );
  }
  return rows.length;
}

/** Drop held tickets whose reservation window has passed (server clock). */
export async function expireReservations() {
  await withTransaction(async (tx) => {
    await expireReservedRows(tx);
  });
}

function assertOpen(lottery, now = nowMs()) {
  if (!lottery || lottery.status !== "active" || Number(lottery.hidden) === 1) {
    throw httpError(400, "This lottery is not open");
  }
  if (new Date(lottery.start_at).getTime() > now) throw httpError(400, "This lottery has not started");
  if (new Date(lottery.end_at).getTime() <= now) throw httpError(400, "This lottery has ended");
}

export function receiptNameFromUrl(url) {
  const name = path.basename(String(url || "").replaceAll("\\", "/"));
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return null;
  if (!fs.existsSync(path.join(receiptDir, name))) return null;
  return name;
}

export async function createStoreOrder({ lotteryId, phone, name, numbers, receiptUrl, bankAccountId, senderAccount }) {
  const normalized = normalizePhone(phone);
  const customerName = requiredText(name, 80);
  const sender = optionalText(senderAccount, 40);
  const receiptName = receiptNameFromUrl(receiptUrl);
  if (!normalized) throw httpError(400, "Enter an Ethiopian mobile number");
  if (!customerName) throw httpError(400, "Enter your name");
  if (sender === null) throw httpError(400, "Sender account is too long");
  if (!receiptName) throw httpError(400, "Upload the payment receipt again");

  try {
    return await withTransaction(async (tx) => {
      const now = nowMs();
      // Free expired holds for this lottery before locking inventory.
      await expireReservedRows(tx, { lotteryId, now });

      const lottery = await tx.get("SELECT * FROM lotteries WHERE id = ? FOR UPDATE", [lotteryId]);
      assertOpen(lottery, now);

      const parsed = parseTicketNumbers(numbers, 100);
      if (!parsed) throw httpError(400, "Choose at least one ticket number");
      for (const number of parsed) {
        if (number > lottery.total_tickets) throw httpError(400, "That ticket number is not in this lottery");
      }

      if (bankAccountId) {
        const bank = await tx.get("SELECT id FROM bank_accounts WHERE id = ? AND active = 1", [bankAccountId]);
        if (!bank) throw httpError(400, "Choose a bank account");
      }

      const takenReceipt = await tx.get(
        "SELECT id FROM orders WHERE receipt_path = ? FOR UPDATE",
        [receiptName],
      );
      if (takenReceipt) throw httpError(400, "Upload the payment receipt again");

      const openOrders = countOf(await tx.get(`
        SELECT COUNT(*) AS count FROM orders
        WHERE phone = ? AND lottery_id = ? AND status IN ('reserved', 'pending')
      `, [normalized, lotteryId]));
      if (openOrders >= 30) throw httpError(429, "You already have open orders for this lottery");

      // Lock any existing rows for these numbers (active holds/sales). Missing rows are fine.
      const placeholders = parsed.map(() => "?").join(",");
      const held = await tx.all(
        `SELECT ticket_number FROM tickets
         WHERE lottery_id = ? AND ticket_number IN (${placeholders})
         FOR UPDATE`,
        [lotteryId, ...parsed],
      );
      if (held.length) throw httpError(409, "One of those numbers was just taken");

      const amount = lottery.ticket_price * parsed.length;
      const order = await tx.run(`
        INSERT INTO orders (
          lottery_id, phone, customer_name, sender_account, bank_account_id,
          amount, status, receipt_path, ticket_numbers
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `, [
        lotteryId,
        normalized,
        customerName,
        sender || null,
        bankAccountId || null,
        amount,
        receiptName,
        JSON.stringify(parsed),
      ]);
      const orderId = Number(order.insertId);
      for (const number of parsed) {
        await tx.run(`
          INSERT INTO tickets (lottery_id, ticket_number, order_id, phone, status)
          VALUES (?, ?, ?, ?, 'pending')
        `, [lotteryId, number, orderId, normalized]);
      }
      return orderId;
    }, { retries: 2 });
  } catch (error) {
    if (error.status) throw error;
    const constraint = `${error.code || ""} ${error.message || ""}`;
    if (constraint.includes("ER_DUP_ENTRY") || constraint.includes("Duplicate")) {
      if (constraint.includes("uniq_orders_receipt") || constraint.includes("receipt_path")) {
        throw httpError(400, "Upload the payment receipt again");
      }
      throw httpError(409, "One of those numbers was just taken");
    }
    throw error;
  }
}

export async function approveOrder(orderId, adminId) {
  await withTransaction(async (tx) => {
    const order = await tx.get("SELECT * FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (!order) throw httpError(404, "Order not found");
    if (order.status !== "pending") throw httpError(400, "Only a receipt waiting for review can be approved");
    if (!String(order.transaction_id || "").trim()) {
      throw httpError(400, "Enter the bank transaction ID before approving");
    }
    await tx.run(
      "UPDATE orders SET status = 'approved', reviewed_at = UTC_TIMESTAMP(3), reviewed_by = ? WHERE id = ?",
      [adminId, orderId],
    );
    await tx.run("UPDATE tickets SET status = 'approved' WHERE order_id = ?", [orderId]);
    await writeAudit(tx, adminId, "approve_payment", {
      orderId,
      lotteryId: order.lottery_id,
      receipt: order.receipt_path || order.ocr_receipt || null,
      transactionId: order.transaction_id || null,
      ocrScannedBy: order.ocr_scanned_by || null,
    });
  });
}

export async function rejectOrder(orderId, adminId) {
  await withTransaction(async (tx) => {
    const order = await tx.get("SELECT * FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (!order) throw httpError(404, "Order not found");
    if (order.status !== "pending") throw httpError(400, "Only a receipt waiting for review can be rejected");
    await tx.run("DELETE FROM tickets WHERE order_id = ?", [orderId]);
    await tx.run(
      "UPDATE orders SET status = 'rejected', reviewed_at = UTC_TIMESTAMP(3), reviewed_by = ? WHERE id = ?",
      [adminId, orderId],
    );
    await writeAudit(tx, adminId, "reject_payment", {
      orderId,
      lotteryId: order.lottery_id,
      receipt: order.receipt_path || order.ocr_receipt || null,
      transactionId: order.transaction_id || null,
      ocrScannedBy: order.ocr_scanned_by || null,
    });
  });
}

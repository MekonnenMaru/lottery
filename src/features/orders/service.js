import fs from "node:fs";
import path from "node:path";
import { all, countOf, get, withTransaction } from "../../db.js";
import { receiptDir } from "../../paths.js";
import { httpError, normalizePhone, optionalText, parseTicketNumbers, requiredText } from "../../util.js";
import { writeAudit } from "../audit/service.js";

export async function expireReservations() {
  const rows = await all(`
    SELECT id FROM orders
    WHERE status = 'reserved' AND reserved_until IS NOT NULL AND reserved_until < ?
  `, [Date.now()]);
  for (const row of rows) {
    await withTransaction(async (tx) => {
      await tx.run("DELETE FROM tickets WHERE order_id = ?", [row.id]);
      await tx.run("UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'reserved'", [row.id]);
    });
  }
}

function assertOpen(lottery) {
  if (!lottery || lottery.status !== "active" || Number(lottery.hidden) === 1) throw httpError(400, "This lottery is not open");
  const now = Date.now();
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
  await expireReservations();
  const normalized = normalizePhone(phone);
  const customerName = requiredText(name, 80);
  const sender = optionalText(senderAccount, 40);
  const receiptName = receiptNameFromUrl(receiptUrl);
  if (!normalized) throw httpError(400, "Enter an Ethiopian mobile number");
  if (!customerName) throw httpError(400, "Enter your name");
  if (sender === null) throw httpError(400, "Sender account is too long");
  if (!receiptName) throw httpError(400, "Upload the payment receipt again");
  const taken = await get("SELECT id FROM orders WHERE receipt_path = ?", [receiptName]);
  if (taken) throw httpError(400, "Upload the payment receipt again");
  try {
    return await withTransaction(async (tx) => {
      const lottery = await tx.get("SELECT * FROM lotteries WHERE id = ? FOR UPDATE", [lotteryId]);
      assertOpen(lottery);
      const parsed = parseTicketNumbers(numbers, 100);
      if (!parsed) throw httpError(400, "Choose at least one ticket number");
      for (const number of parsed) {
        if (number > lottery.total_tickets) throw httpError(400, "That ticket number is not in this lottery");
      }
      if (bankAccountId) {
        const bank = await tx.get("SELECT id FROM bank_accounts WHERE id = ? AND active = 1", [bankAccountId]);
        if (!bank) throw httpError(400, "Choose a bank account");
      }
      const openOrders = countOf(await tx.get(`
        SELECT COUNT(*) AS count FROM orders
        WHERE phone = ? AND lottery_id = ? AND status IN ('reserved', 'pending')
      `, [normalized, lotteryId]));
      if (openOrders >= 30) throw httpError(429, "You already have open orders for this lottery");
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
    });
  } catch (error) {
    const constraint = `${error.code || ""} ${error.message || ""}`;
    if (constraint.includes("ER_DUP_ENTRY") || constraint.includes("Duplicate")) {
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
    await tx.run(
      "UPDATE orders SET status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE id = ?",
      [new Date(), adminId, orderId],
    );
    await tx.run("UPDATE tickets SET status = 'approved' WHERE order_id = ?", [orderId]);
    await writeAudit(tx, adminId, "approve_payment", { orderId, lotteryId: order.lottery_id });
  });
}

export async function rejectOrder(orderId, adminId) {
  await withTransaction(async (tx) => {
    const order = await tx.get("SELECT * FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (!order) throw httpError(404, "Order not found");
    if (order.status !== "pending") throw httpError(400, "Only a receipt waiting for review can be rejected");
    await tx.run("DELETE FROM tickets WHERE order_id = ?", [orderId]);
    await tx.run(
      "UPDATE orders SET status = 'rejected', reviewed_at = ?, reviewed_by = ? WHERE id = ?",
      [new Date(), adminId, orderId],
    );
    await writeAudit(tx, adminId, "reject_payment", { orderId, lotteryId: order.lottery_id });
  });
}

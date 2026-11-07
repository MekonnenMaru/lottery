import fs from "node:fs";
import path from "node:path";
import { all, countOf, get, run, withTransaction } from "../../db.js";
import { lotteryImageDir } from "../../paths.js";
import { nowMs } from "../../time.js";
import { httpError, intValue, optionalText, parseWhen, requiredText } from "../../util.js";
import { writeAudit } from "../audit/service.js";
import { expireReservations } from "../orders/service.js";

const UPLOADED_IMAGE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

async function dropUnusedImages(previous, next) {
  const keep = new Set(next);
  for (const imagePath of previous) {
    if (!imagePath || keep.has(imagePath) || !imagePath.startsWith("uploads/lotteries/")) continue;
    const name = path.basename(imagePath);
    if (!UPLOADED_IMAGE.test(name)) continue;
    const used = await get("SELECT id FROM lottery_images WHERE image_path = ? LIMIT 1", [imagePath]);
    if (used) continue;
    const full = path.resolve(lotteryImageDir, name);
    if (!full.startsWith(path.resolve(lotteryImageDir))) continue;
    fs.rmSync(full, { force: true });
  }
}

export async function saveLotteryImages(lotteryId, paths) {
  const lottery = await get("SELECT id FROM lotteries WHERE id = ?", [lotteryId]);
  if (!lottery) throw httpError(404, "Lottery not found");
  const previous = await all("SELECT image_path FROM lottery_images WHERE lottery_id = ?", [lotteryId]);
  await withTransaction(async (tx) => {
    await tx.run("DELETE FROM lottery_images WHERE lottery_id = ?", [lotteryId]);
    for (let index = 0; index < paths.length; index += 1) {
      await tx.run(
        "INSERT INTO lottery_images (lottery_id, image_path, sort_order) VALUES (?, ?, ?)",
        [lotteryId, paths[index], index],
      );
    }
    await tx.run("UPDATE lotteries SET image_path = ? WHERE id = ?", [paths[0] || null, lotteryId]);
  });
  await dropUnusedImages(previous.map((row) => row.image_path), paths);
}

export async function createLottery(body) {
  const title = requiredText(body.title, 160);
  const subtitle = optionalText(body.subtitle, 160);
  const prizeInput = optionalText(body.prize, 160);
  const ticketPrice = intValue(body.ticketPrice, 1, 10_000_000);
  const totalTickets = intValue(body.totalTickets, 1, 100_000);
  const start = parseWhen(body.startAt);
  const end = parseWhen(body.endAt);
  if (!title || subtitle === null || prizeInput === null) {
    throw httpError(400, "Check the title, subtitle, and prize");
  }
  if (!ticketPrice || !totalTickets) throw httpError(400, "Price and ticket count must be whole numbers");
  if (!start || !end || end.getTime() - start.getTime() < 60_000) {
    throw httpError(400, "End must be at least a minute after the start");
  }
  if (end.getTime() - start.getTime() > 730 * 24 * 60 * 60 * 1000) {
    throw httpError(400, "A lottery can run for at most two years");
  }
  if (end.getTime() <= nowMs()) throw httpError(400, "End time is already in the past");
  const hidden = body.hidden === true || body.hidden === 1 || body.hidden === "1" || body.hidden === "true";
  const featured = !hidden && (body.featured === "1" || body.featured === "true" || body.featured === true);
  const id = await withTransaction(async (tx) => {
    if (featured) await tx.run("UPDATE lotteries SET is_featured = 0");
    const result = await tx.run(`
      INSERT INTO lotteries (
        title, subtitle, prize, ticket_price, total_tickets, start_at, end_at, status, is_featured, hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `, [title, subtitle, prizeInput || title, ticketPrice, totalTickets, start, end, featured ? 1 : 0, hidden ? 1 : 0]);
    return Number(result.insertId);
  });
  return id;
}

export async function updateLottery(id, body) {
  const existing = await get("SELECT * FROM lotteries WHERE id = ?", [id]);
  if (!existing) throw httpError(404, "Lottery not found");
  const title = requiredText(body.title, 160);
  const subtitle = optionalText(body.subtitle, 160);
  const prizeInput = optionalText(body.prize, 160);
  const ticketPrice = intValue(body.ticketPrice, 1, 10_000_000);
  const totalTickets = intValue(body.totalTickets, 1, 100_000);
  const start = parseWhen(body.startAt);
  const end = parseWhen(body.endAt);
  const status = body.status === "completed" ? "completed" : body.status === "active" ? "active" : null;
  if (!title || subtitle === null || prizeInput === null || !ticketPrice || !totalTickets || !start || !end || !status) {
    throw httpError(400, "Check the lottery details");
  }
  if (end.getTime() <= start.getTime()) throw httpError(400, "End must be after the start");
  const highest = await get("SELECT MAX(ticket_number) AS count FROM tickets WHERE lottery_id = ?", [id]);
  if (Number(highest?.count || 0) > totalTickets) {
    throw httpError(400, "Ticket count is lower than a number already sold");
  }
  const hidden = body.hidden === true || body.hidden === 1 || body.hidden === "1" || body.hidden === "true";
  const featured = !hidden && status === "active" && (body.featured === true || body.featured === 1 || body.featured === "1" || body.featured === "true");
  await withTransaction(async (tx) => {
    if (featured) await tx.run("UPDATE lotteries SET is_featured = 0");
    await tx.run(`
      UPDATE lotteries
      SET title = ?, subtitle = ?, prize = ?, ticket_price = ?, total_tickets = ?,
          start_at = ?, end_at = ?, status = ?, is_featured = ?, hidden = ?
      WHERE id = ?
    `, [title, subtitle, prizeInput || title, ticketPrice, totalTickets, start, end, status, featured ? 1 : 0, hidden ? 1 : 0, id]);
  });
}

export async function deleteLottery(id) {
  const existing = await get("SELECT id FROM lotteries WHERE id = ?", [id]);
  if (!existing) throw httpError(404, "Lottery not found");
  const held = countOf(await get("SELECT COUNT(*) AS count FROM tickets WHERE lottery_id = ?", [id]));
  if (held > 0) throw httpError(400, "This lottery already has tickets");
  const images = await all("SELECT image_path FROM lottery_images WHERE lottery_id = ?", [id]);
  await run("DELETE FROM lottery_images WHERE lottery_id = ?", [id]);
  await run("DELETE FROM orders WHERE lottery_id = ?", [id]);
  await run("DELETE FROM lotteries WHERE id = ?", [id]);
  await dropUnusedImages(images.map((row) => row.image_path), []);
}

export async function announceTicket({ lotteryId, orderId, ticketNumber, adminId }) {
  await expireReservations();
  await withTransaction(async (tx) => {
    const lottery = await tx.get("SELECT * FROM lotteries WHERE id = ? FOR UPDATE", [lotteryId]);
    if (!lottery) throw httpError(404, "Lottery not found");
    if (lottery.status !== "active") throw httpError(400, "This lottery is already finished");
    const ticket = await tx.get(`
      SELECT id FROM tickets
      WHERE lottery_id = ? AND order_id = ? AND ticket_number = ? AND status = 'approved'
    `, [lotteryId, orderId, ticketNumber]);
    if (!ticket) throw httpError(400, "That paid ticket was not found");
    await tx.run(
      "UPDATE lotteries SET status = 'completed', is_featured = 0, winner_ticket_id = ?, announced_at = ? WHERE id = ?",
      [ticket.id, new Date(), lotteryId],
    );
    await writeAudit(tx, adminId, "announce_winner", { lotteryId, ticketNumber });
  });
}

export async function featureLottery(id) {
  await withTransaction(async (tx) => {
    const lottery = await tx.get("SELECT * FROM lotteries WHERE id = ?", [id]);
    if (!lottery) throw httpError(404, "Lottery not found");
    if (Number(lottery.hidden) === 1) throw httpError(400, "Show this lottery to customers before featuring it");
    if (lottery.status !== "active") throw httpError(400, "Only an open lottery can be featured");
    await tx.run("UPDATE lotteries SET is_featured = 0");
    await tx.run("UPDATE lotteries SET is_featured = 1 WHERE id = ?", [id]);
  });
}

export async function setLotteryHidden(id, hidden) {
  const existing = await get("SELECT id FROM lotteries WHERE id = ?", [id]);
  if (!existing) throw httpError(404, "Lottery not found");
  if (hidden) {
    await run("UPDATE lotteries SET hidden = 1, is_featured = 0 WHERE id = ?", [id]);
    return;
  }
  await run("UPDATE lotteries SET hidden = 0 WHERE id = ?", [id]);
}

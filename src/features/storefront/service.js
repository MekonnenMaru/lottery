import { all, countOf, get, iso } from "../../db.js";
import { APP_TZ_MINUTES } from "../../time.js";
import { httpError, intValue, maskPhone, normalizePhone, parseWhen } from "../../util.js";
import { listBanks } from "../banks/service.js";
import { expireReservations } from "../orders/service.js";

function padTicket(number) {
  return String(number).padStart(3, "0");
}

function paymentStatus(status) {
  return status === "reserved" ? "pending" : status;
}

export async function storeLotteries({ includeHidden = false } = {}) {
  await expireReservations();
  const rows = await all(
    includeHidden
      ? "SELECT * FROM lotteries ORDER BY id DESC"
      : "SELECT * FROM lotteries WHERE hidden = 0 AND status = 'active' ORDER BY id DESC",
  );
  const counts = await all("SELECT lottery_id, COUNT(*) AS count FROM tickets GROUP BY lottery_id");
  const sold = new Map(counts.map((row) => [Number(row.lottery_id), Number(row.count)]));
  const imageRows = await all(
    "SELECT lottery_id, image_path FROM lottery_images ORDER BY lottery_id, sort_order, id",
  );
  const images = new Map();
  for (const image of imageRows) {
    const lotteryId = Number(image.lottery_id);
    if (!images.has(lotteryId)) images.set(lotteryId, []);
    images.get(lotteryId).push(image.image_path);
  }
  return rows.map((row) => {
    const pictures = images.get(Number(row.id)) || (row.image_path ? [row.image_path] : []);
    return {
    id: String(row.id),
    title: row.title,
    description: null,
    total_tickets: String(row.total_tickets),
    ticket_price: Number(row.ticket_price).toFixed(2),
    start_date: iso(row.start_at),
    end_date: iso(row.end_at),
    status: row.status,
    image_url: pictures[0] || null,
    images: pictures,
    prize: row.prize || row.title,
    subtitle: row.subtitle || "",
    created_by: "1",
    created_at: iso(row.created_at),
    is_featured: Number(row.is_featured) === 1 ? "1" : "0",
    hidden: Number(row.hidden) === 1 ? "1" : "0",
    sold_tickets: String(sold.get(Number(row.id)) || 0),
  };
  });
}

export async function storeSoldTickets(lotteryId) {
  await expireReservations();
  const lottery = await get("SELECT id, hidden, status FROM lotteries WHERE id = ?", [lotteryId]);
  if (!lottery || Number(lottery.hidden) === 1 || lottery.status !== "active") throw httpError(404, "Lottery not found");
  const rows = await all(
    "SELECT ticket_number FROM tickets WHERE lottery_id = ? ORDER BY ticket_number",
    [lotteryId],
  );
  return rows.map((row) => ({ ticket_number: padTicket(row.ticket_number) }));
}

export async function storeMyTickets(phone) {
  await expireReservations();
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const rows = await all(`
    SELECT o.id, o.lottery_id, o.status, o.ticket_numbers, o.created_at,
           l.title, l.image_path, l.status AS lottery_status, l.winner_ticket_id,
           t.id AS ticket_id, t.ticket_number
    FROM orders o
    JOIN lotteries l ON l.id = o.lottery_id
    LEFT JOIN tickets t ON t.order_id = o.id
    WHERE o.phone = ? AND o.status IN ('pending', 'approved', 'rejected', 'reserved')
    ORDER BY o.id DESC, t.ticket_number
  `, [normalized]);
  const seen = new Set();
  const data = [];
  for (const row of rows) {
    const numbers = row.ticket_number == null ? JSON.parse(row.ticket_numbers || "[]") : [row.ticket_number];
    for (const number of numbers) {
      const key = `${row.id}:${number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const payment = paymentStatus(row.status);
      data.push({
        lottery_id: String(row.lottery_id),
        order_id: String(row.id),
        ticket_id: row.ticket_id == null ? "" : String(row.ticket_id),
        title: row.title,
        image_url: row.image_path || null,
        ticket_number: padTicket(number),
        created_at: iso(row.created_at),
        payment_status: payment,
        order_status: payment,
        lottery_status: row.lottery_status,
        won: row.ticket_id != null && Number(row.ticket_id) === Number(row.winner_ticket_id),
      });
    }
  }
  return data;
}

export async function storeWinners(includeHidden = false) {
  const rows = await all(`
    SELECT l.id AS lottery_id, l.title, l.prize, l.announced_at, l.created_at,
           t.id AS ticket_id, t.ticket_number, t.phone, o.id AS order_id, o.customer_name
    FROM lotteries l
    JOIN tickets t ON t.id = l.winner_ticket_id
    JOIN orders o ON o.id = t.order_id
    WHERE l.winner_ticket_id IS NOT NULL
      AND (? = 1 OR l.hidden = 0)
    ORDER BY l.id DESC
  `, [includeHidden ? 1 : 0]);
  return rows.map((row) => ({
    id: String(row.lottery_id),
    lottery_id: String(row.lottery_id),
    order_id: String(row.order_id),
    winning_ticket_id: String(row.ticket_id),
    winning_ticket_number: padTicket(row.ticket_number),
    winner_name: row.customer_name || "Winner",
    winner_phone: maskPhone(row.phone),
    prize_description: row.prize,
    announced_at: iso(row.announced_at || row.created_at),
    lottery_title: row.title,
    lottery_prize: row.prize,
  }));
}

export async function storeBanks(activeOnly) {
  const rows = await listBanks(activeOnly);
  return rows.map((row) => ({
    id: String(row.id),
    bank_name: row.bankName,
    account_name: row.accountName,
    account_number: row.accountNumber,
    phone_number: "",
    status: row.active ? "active" : "inactive",
  }));
}

function paymentDto(row) {
  let numbers = [];
  try {
    numbers = JSON.parse(row.ticket_numbers || "[]");
  } catch {
    numbers = [];
  }
  const hasOcr = Boolean(row.ocr_text);
  return {
    id: row.id,
    customer_name: row.customer_name || "",
    customer_phone: row.phone,
    lottery_id: String(row.lottery_id),
    lottery_title: row.title,
    ticket_numbers: numbers.map(padTicket).join(", "),
    amount: row.amount,
    total_amount: row.amount,
    status: paymentStatus(row.status),
    screenshot_url: row.receipt_path ? `/api/receipt-files/${row.receipt_path}` : "",
    created_at: iso(row.created_at),
    bank_name: row.bank_name || "",
    sender_account: row.sender_account || "",
    transaction_id: row.transaction_id || "",
    reviewed_at: row.reviewed_at ? iso(row.reviewed_at) : "",
    reviewed_by: row.reviewed_by == null ? null : Number(row.reviewed_by),
    reviewed_by_name: row.reviewed_by_name || "",
    scanned_by_name: row.ocr_scanned_by_name || "",
    ocr: hasOcr
      ? {
          text: String(row.ocr_text || ""),
          confidence: row.ocr_confidence == null ? null : Number(row.ocr_confidence),
          language: row.ocr_language || "eng",
          receipt: row.ocr_receipt || row.receipt_path || "",
          scanned_at: row.ocr_scanned_at ? iso(row.ocr_scanned_at) : "",
          scanned_by: row.ocr_scanned_by == null ? null : Number(row.ocr_scanned_by),
          scanned_by_name: row.ocr_scanned_by_name || "",
        }
      : null,
  };
}

export async function storePayments({ status, search, limit, page, pageSize }) {
  await expireReservations();
  const allowed = new Set(["all", "pending", "approved", "rejected"]);
  const chosen = allowed.has(status) ? status : "all";
  const term = `%${String(search || "").trim().slice(0, 40)}%`;
  const filtering = Boolean(String(search || "").trim());
  const where = filtering
    ? "WHERE (o.phone LIKE ? OR o.customer_name LIKE ? OR o.ticket_numbers LIKE ? OR l.title LIKE ? OR CAST(l.id AS CHAR) LIKE ? OR o.transaction_id LIKE ? OR reviewer.username LIKE ? OR scanner.username LIKE ?)"
    : "";
  const params = filtering ? [term, term, term, term, term, term, term, term] : [];
  const rows = await all(`
    SELECT o.*, l.title, b.bank_name,
           scanner.username AS ocr_scanned_by_name,
           reviewer.username AS reviewed_by_name
    FROM orders o
    JOIN lotteries l ON l.id = o.lottery_id
    LEFT JOIN bank_accounts b ON b.id = o.bank_account_id
    LEFT JOIN admins scanner ON scanner.id = o.ocr_scanned_by
    LEFT JOIN admins reviewer ON reviewer.id = o.reviewed_by
    ${where}
    ORDER BY o.id DESC
  `, params);
  const visible = rows.filter((row) => ["pending", "approved", "rejected", "reserved"].includes(row.status));
  const counts = { all: visible.length, pending: 0, approved: 0, rejected: 0 };
  for (const row of visible) {
    const name = paymentStatus(row.status);
    if (counts[name] !== undefined) counts[name] += 1;
  }
  const filtered = chosen === "all" ? visible : visible.filter((row) => paymentStatus(row.status) === chosen);
  const total = filtered.length;
  if (page) {
    const size = pageSize || 10;
    const pages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(page, pages);
    const start = (current - 1) * size;
    return {
      data: filtered.slice(start, start + size).map(paymentDto),
      counts,
      total,
      page: current,
      page_size: size,
    };
  }
  return { data: filtered.slice(0, limit).map(paymentDto), counts, total };
}

const DASHBOARD_STATUSES = {
  all: ["pending", "reserved", "approved", "rejected"],
  approved: ["approved"],
  pending: ["pending", "reserved"],
  rejected: ["rejected"],
};

function parseInstant(value) {
  if (value === undefined || value === null || value === "") return null;
  return parseWhen(value);
}

function dashboardQuery(query) {
  const from = parseInstant(query.from);
  const to = parseInstant(query.to);
  if (query.from && !from) throw httpError(400, "Choose a valid start");
  if (query.to && !to) throw httpError(400, "Choose a valid end");
  if (to) to.setSeconds(59, 999);
  if (from && to && from > to) throw httpError(400, "The start is after the end");
  const lottery = query.lottery && query.lottery !== "all" ? intValue(query.lottery, 1, 1_000_000_000) : null;
  if (query.lottery && query.lottery !== "all" && !lottery) throw httpError(400, "Choose a lottery");
  const bank = query.bank && query.bank !== "all" ? intValue(query.bank, 1, 1_000_000_000) : null;
  if (query.bank && query.bank !== "all" && !bank) throw httpError(400, "Choose a bank");
  const status = DASHBOARD_STATUSES[query.status] ? query.status : "all";
  return { from, to, lottery, bank, status, tz: APP_TZ_MINUTES };
}

function orderWhere(filter, statuses, bounds = filter) {
  const clauses = [`o.status IN (${statuses.map(() => "?").join(", ")})`];
  const params = [...statuses];
  if (bounds.from) {
    clauses.push("o.created_at >= ?");
    params.push(bounds.from);
  }
  if (bounds.to) {
    clauses.push("o.created_at <= ?");
    params.push(bounds.to);
  }
  if (filter.lottery) {
    clauses.push("o.lottery_id = ?");
    params.push(filter.lottery);
  }
  if (filter.bank) {
    clauses.push("o.bank_account_id = ?");
    params.push(filter.bank);
  }
  return { sql: clauses.join(" AND "), params };
}

function moneyGrain(from, to) {
  if (!from || !to) return "month";
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days <= 2) return "hour";
  if (days <= 62) return "day";
  if (days <= 370) return "week";
  return "month";
}

function localParts(date, tz) {
  const local = new Date(date.getTime() - tz * 60_000);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    h: local.getUTCHours(),
  };
}

function snapParts(parts, grain) {
  if (grain === "hour") return parts;
  if (grain === "day") return { ...parts, h: 0 };
  if (grain === "month") return { y: parts.y, m: parts.m, d: 1, h: 0 };
  const utc = new Date(Date.UTC(parts.y, parts.m, parts.d));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - day + 1);
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth(), d: utc.getUTCDate(), h: 0 };
}

function nextParts(parts, grain) {
  const date = new Date(Date.UTC(parts.y, parts.m, parts.d, parts.h));
  if (grain === "hour") date.setUTCHours(date.getUTCHours() + 1);
  else if (grain === "day") date.setUTCDate(date.getUTCDate() + 1);
  else if (grain === "week") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate(), h: date.getUTCHours() };
}

function seriesKey(parts, grain) {
  const y = parts.y;
  const m = String(parts.m + 1).padStart(2, "0");
  const d = String(parts.d).padStart(2, "0");
  const h = String(parts.h).padStart(2, "0");
  if (grain === "hour") return `${y}-${m}-${d}T${h}`;
  if (grain === "month") return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

function partsFromKey(key, grain) {
  if (grain === "hour") {
    const [date, hour] = key.split("T");
    const [y, m, d] = date.split("-").map(Number);
    return { y, m: m - 1, d, h: Number(hour) };
  }
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m - 1, d: d || 1, h: 0 };
}

function fillSeries(rows, grain, from, to, tz) {
  const totals = new Map();
  for (const row of rows) {
    const when = new Date(row.created_at);
    if (Number.isNaN(when.getTime())) continue;
    const parts = snapParts(localParts(when, tz), grain);
    const key = seriesKey(parts, grain);
    totals.set(key, (totals.get(key) || 0) + Number(row.amount || 0));
  }
  let start;
  let end;
  if (from && to) {
    start = snapParts(localParts(from, tz), grain);
    end = snapParts(localParts(to, tz), grain);
  } else if (totals.size) {
    const keys = [...totals.keys()].sort();
    start = partsFromKey(keys[0], grain);
    end = partsFromKey(keys[keys.length - 1], grain);
  } else {
    return [];
  }
  const points = [];
  let cursor = start;
  for (let i = 0; i < 500; i += 1) {
    const key = seriesKey(cursor, grain);
    points.push({ key, amount: totals.get(key) || 0 });
    if (key === seriesKey(end, grain)) break;
    cursor = nextParts(cursor, grain);
  }
  return points;
}

function topMoney(rows, label) {
  const sorted = rows
    .map((row) => ({ label: row.label, amount: Number(row.amount || 0) }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((sum, row) => sum + row.amount, 0);
  if (rest > 0) top.push({ label: label, amount: rest });
  return top;
}

export async function storeDashboard(query = {}) {
  const filter = dashboardQuery(query);
  const periodWhere = orderWhere(filter, DASHBOARD_STATUSES.all);
  const focusedWhere = orderWhere(filter, DASHBOARD_STATUSES[filter.status]);
  const [pendingPayments, grouped, focused, tickets, buyers, timed, drawRows, bankRows, lotteries, banks] = await Promise.all([
    get("SELECT COUNT(*) AS count FROM orders WHERE status IN ('pending', 'reserved')"),
    all(`SELECT o.status, COUNT(*) AS orders, COALESCE(SUM(o.amount), 0) AS amount FROM orders o WHERE ${periodWhere.sql} GROUP BY o.status`, periodWhere.params),
    all(`SELECT COUNT(*) AS orders, COALESCE(SUM(o.amount), 0) AS amount FROM orders o WHERE ${focusedWhere.sql}`, focusedWhere.params),
    get(`SELECT COUNT(*) AS count FROM tickets t JOIN orders o ON o.id = t.order_id WHERE ${focusedWhere.sql}`, focusedWhere.params),
    get(`SELECT COUNT(DISTINCT o.phone) AS count FROM orders o WHERE ${focusedWhere.sql}`, focusedWhere.params),
    all(`SELECT o.created_at, o.amount FROM orders o WHERE ${focusedWhere.sql}`, focusedWhere.params),
    all(`
      SELECT l.title AS label, COALESCE(SUM(o.amount), 0) AS amount
      FROM orders o JOIN lotteries l ON l.id = o.lottery_id
      WHERE ${focusedWhere.sql}
      GROUP BY l.id, l.title
    `, focusedWhere.params),
    all(`
      SELECT COALESCE(b.bank_name, 'No bank') AS label, COALESCE(SUM(o.amount), 0) AS amount
      FROM orders o LEFT JOIN bank_accounts b ON b.id = o.bank_account_id
      WHERE ${focusedWhere.sql}
      GROUP BY COALESCE(b.bank_name, 'No bank')
    `, focusedWhere.params),
    all("SELECT id, title FROM lotteries ORDER BY title"),
    all("SELECT id, bank_name FROM bank_accounts ORDER BY bank_name"),
  ]);
  const totals = { approved: 0, pending: 0, rejected: 0 };
  for (const row of grouped) {
    const name = row.status === "reserved" ? "pending" : row.status;
    if (totals[name] === undefined) continue;
    totals[name] += Number(row.amount || 0);
  }
  const moneyTotal = totals.approved + totals.pending + totals.rejected;
  let previous = null;
  let change = null;
  if (filter.from && filter.to) {
    const span = filter.to.getTime() - filter.from.getTime();
    const prevWhere = orderWhere(filter, ["approved"], {
      from: new Date(filter.from.getTime() - span),
      to: new Date(filter.from.getTime() - 1),
    });
    const prev = await get(`SELECT COALESCE(SUM(o.amount), 0) AS amount FROM orders o WHERE ${prevWhere.sql}`, prevWhere.params);
    previous = Number(prev?.amount || 0);
    if (previous > 0) change = Math.round(((totals.approved - previous) / previous) * 1000) / 10;
  }
  const orders = Number(focused[0]?.orders || 0);
  const amount = Number(focused[0]?.amount || 0);
  return {
    pendingPayments: countOf(pendingPayments),
    stats: { pendingPayments: countOf(pendingPayments) },
    grain: moneyGrain(filter.from, filter.to),
    summary: {
      collected: totals.approved,
      waiting: totals.pending,
      rejected: totals.rejected,
      rate: moneyTotal > 0 ? Math.round((totals.approved / moneyTotal) * 1000) / 10 : null,
      previous,
      change,
      orders,
      tickets: countOf(tickets),
      buyers: countOf(buyers),
      average: orders > 0 ? Math.round(amount / orders) : 0,
    },
    series: fillSeries(timed, moneyGrain(filter.from, filter.to), filter.from, filter.to, filter.tz),
    draws: topMoney(drawRows, "Other lotteries"),
    banks: topMoney(bankRows, "Other banks"),
    options: {
      lotteries: lotteries.map((row) => ({ id: String(row.id), title: row.title })),
      banks: banks.map((row) => ({ id: String(row.id), name: row.bank_name })),
    },
  };
}

export async function storeTicketCheck(lotteryId, rawNumber) {
  const ticketNumber = intValue(String(rawNumber ?? "").replace(/\D/g, ""), 1, 100_000);
  if (!ticketNumber) throw httpError(404, "Ticket not found");
  const row = await get(`
    SELECT t.ticket_number, t.status, o.customer_name, o.phone, l.title
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    JOIN lotteries l ON l.id = t.lottery_id
    WHERE t.lottery_id = ? AND t.ticket_number = ?
  `, [lotteryId, ticketNumber]);
  if (!row) throw httpError(404, "Ticket not found");
  return {
    ticket_number: padTicket(row.ticket_number),
    payment_status: paymentStatus(row.status),
    customer_name: row.customer_name || "",
    customer_phone: row.phone,
    lottery_title: row.title,
  };
}

export async function storeLotteryOrders(lotteryId) {
  const rows = await all(`
    SELECT o.id, o.customer_name, o.phone, t.ticket_number
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE t.lottery_id = ? AND t.status = 'approved'
    ORDER BY t.ticket_number
  `, [lotteryId]);
  return rows.map((row) => ({
    id: row.id,
    customer_name: row.customer_name || "",
    customer_phone: row.phone,
    ticket_number: padTicket(row.ticket_number),
    payment_status: "approved",
  }));
}

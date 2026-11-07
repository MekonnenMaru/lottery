import { all } from "../../db.js";
import { APP_TZ_MINUTES } from "../../time.js";
import { httpError, intValue, parseWhen } from "../../util.js";
import { appName } from "../settings/service.js";
import { expireReservations } from "../orders/service.js";
import { renderReport } from "./files.js";

const KINDS = new Set(["payments", "lotteries", "winners"]);
const FORMATS = new Set(["csv", "xls", "pdf"]);
const PAYMENT_STATUS = {
  all: ["pending", "reserved", "approved", "rejected"],
  pending: ["pending", "reserved"],
  approved: ["approved"],
  rejected: ["rejected"],
};
const LOTTERY_STATUS = new Set(["all", "active", "completed", "hidden"]);

function parseInstant(value) {
  if (value === undefined || value === null || value === "") return null;
  return parseWhen(value);
}

function stamp(value, tzMinutes) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - tzMinutes * 60 * 1000);
  const pad = (part) => String(part).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

function tickets(value) {
  try {
    const numbers = JSON.parse(value || "[]");
    return numbers.map((number) => String(number).padStart(3, "0")).join(", ");
  } catch {
    return "";
  }
}

function filters(query) {
  const from = parseInstant(query.from);
  const to = parseInstant(query.to);
  if (query.from && !from) throw httpError(400, "Choose a valid start");
  if (query.to && !to) throw httpError(400, "Choose a valid end");
  if (to) to.setSeconds(59, 999);
  if (from && to && from > to) throw httpError(400, "The start is after the end");
  const lottery = query.lottery && query.lottery !== "all" ? intValue(query.lottery, 1, 1_000_000_000) : null;
  if (query.lottery && query.lottery !== "all" && !lottery) throw httpError(400, "Choose a lottery");
  return { from, to, lottery, tz: APP_TZ_MINUTES };
}

async function paymentRows(filter, status) {
  await expireReservations();
  const chosen = PAYMENT_STATUS[status] ? status : "all";
  const params = [...PAYMENT_STATUS[chosen]];
  let where = `WHERE o.status IN (${PAYMENT_STATUS[chosen].map(() => "?").join(", ")})`;
  if (filter.from) {
    where += " AND o.created_at >= ?";
    params.push(filter.from);
  }
  if (filter.to) {
    where += " AND o.created_at <= ?";
    params.push(filter.to);
  }
  if (filter.lottery) {
    where += " AND o.lottery_id = ?";
    params.push(filter.lottery);
  }
  const rows = await all(`
    SELECT o.id, o.customer_name, o.phone, o.amount, o.status, o.ticket_numbers, o.sender_account, o.created_at,
           l.id AS lottery_id, l.title, b.bank_name
    FROM orders o
    JOIN lotteries l ON l.id = o.lottery_id
    LEFT JOIN bank_accounts b ON b.id = o.bank_account_id
    ${where}
    ORDER BY o.id DESC
    LIMIT 10000
  `, params);
  const records = rows.map((row) => [
    Number(row.id),
    row.customer_name || "",
    row.phone || "",
    Number(row.lottery_id),
    row.title || "",
    tickets(row.ticket_numbers),
    Number(row.amount || 0),
    row.status === "reserved" ? "pending" : row.status,
    row.bank_name || "",
    row.sender_account || "",
    stamp(row.created_at, filter.tz),
  ]);
  const total = records.reduce((sum, row) => sum + Number(row[6] || 0), 0);
  return {
    amount: total,
    summaryRow: ["", "", "", "", "", `${records.length} rows`, total, "", "", "", ""],
    sheet: "Payments",
    columns: [
      { label: "Order", width: 42, number: true },
      { label: "Buyer", width: 90 },
      { label: "Phone", width: 78 },
      { label: "Lottery ID", width: 52, number: true },
      { label: "Lottery", width: 120 },
      { label: "Tickets", width: 80 },
      { label: "Amount", width: 58, number: true },
      { label: "Status", width: 58 },
      { label: "Bank", width: 80 },
      { label: "Sender", width: 70 },
      { label: "Date", width: 78 },
    ],
    rows: records,
  };
}

async function lotteryRows(filter, status) {
  const chosen = LOTTERY_STATUS.has(status) ? status : "all";
  const params = [];
  const where = [];
  if (filter.from) {
    where.push("l.end_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("l.start_at <= ?");
    params.push(filter.to);
  }
  if (filter.lottery) {
    where.push("l.id = ?");
    params.push(filter.lottery);
  }
  if (chosen === "hidden") where.push("l.hidden = 1");
  else if (chosen === "active" || chosen === "completed") {
    where.push("l.status = ?");
    params.push(chosen);
  }
  const rows = await all(`
    SELECT l.id, l.title, l.subtitle, l.ticket_price, l.total_tickets, l.status, l.is_featured, l.hidden, l.start_at, l.end_at,
           (SELECT COUNT(*) FROM tickets t WHERE t.lottery_id = l.id) AS sold
    FROM lotteries l
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY l.id DESC
    LIMIT 10000
  `, params);
  const records = rows.map((row) => [
    Number(row.id),
    row.title || "",
    row.subtitle || "",
    Number(row.ticket_price || 0),
    Number(row.sold || 0),
    Number(row.total_tickets || 0),
    row.status || "",
    Number(row.is_featured) === 1 ? "yes" : "",
    Number(row.hidden) === 1 ? "yes" : "",
    stamp(row.start_at, filter.tz),
    stamp(row.end_at, filter.tz),
  ]);
  return {
    summaryRow: ["", "", "", "", "", `${records.length} lotteries`, "", "", "", "", ""],
    sheet: "Lotteries",
    columns: [
      { label: "ID", width: 36, number: true },
      { label: "Title", width: 120 },
      { label: "Subtitle", width: 90 },
      { label: "Price", width: 52, number: true },
      { label: "Sold", width: 40, number: true },
      { label: "Total", width: 44, number: true },
      { label: "Status", width: 58 },
      { label: "Featured", width: 52 },
      { label: "Hidden", width: 46 },
      { label: "Starts", width: 78 },
      { label: "Ends", width: 78 },
    ],
    rows: records,
  };
}

async function winnerRows(filter) {
  const params = [];
  const where = ["l.winner_ticket_id IS NOT NULL"];
  if (filter.from) {
    where.push("COALESCE(l.announced_at, l.created_at) >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("COALESCE(l.announced_at, l.created_at) <= ?");
    params.push(filter.to);
  }
  if (filter.lottery) {
    where.push("l.id = ?");
    params.push(filter.lottery);
  }
  const rows = await all(`
    SELECT l.id, l.title, l.prize, l.announced_at, l.created_at, t.ticket_number, t.phone, o.customer_name
    FROM lotteries l
    JOIN tickets t ON t.id = l.winner_ticket_id
    JOIN orders o ON o.id = t.order_id
    WHERE ${where.join(" AND ")}
    ORDER BY l.id DESC
    LIMIT 10000
  `, params);
  const records = rows.map((row) => [
    Number(row.id),
    row.title || "",
    String(row.ticket_number).padStart(3, "0"),
    row.customer_name || "",
    row.phone || "",
    row.prize || "",
    stamp(row.announced_at || row.created_at, filter.tz),
  ]);
  return {
    summaryRow: ["", `${records.length} winners`, "", "", "", "", ""],
    sheet: "Winners",
    columns: [
      { label: "Lottery ID", width: 58, number: true },
      { label: "Lottery", width: 140 },
      { label: "Ticket", width: 50 },
      { label: "Winner", width: 110 },
      { label: "Phone", width: 80 },
      { label: "Prize", width: 120 },
      { label: "Announced", width: 90 },
    ],
    rows: records,
  };
}

function noteFor(filter, status) {
  const from = filter.from ? stamp(filter.from, filter.tz) : "the beginning";
  const to = filter.to ? stamp(filter.to, filter.tz) : "now";
  const lottery = filter.lottery ? `Lottery ${filter.lottery}` : "All lotteries";
  return `${from} to ${to}. ${lottery}. Status ${status || "all"}.`;
}

async function reportTable(query) {
  const kind = KINDS.has(query.kind) ? query.kind : "";
  if (!kind) throw httpError(400, "Choose a report");
  const filter = filters(query);
  const status = String(query.status || "all");
  const table = kind === "payments"
    ? await paymentRows(filter, status)
    : kind === "lotteries"
      ? await lotteryRows(filter, status)
      : await winnerRows(filter);
  return { kind, filter, status, table };
}

export async function reportData(query) {
  const { table } = await reportTable(query);
  return {
    sheet: table.sheet,
    columns: table.columns.map((column) => column.label),
    rows: table.rows,
    amount: table.amount ?? null,
  };
}

export async function buildReport(query) {
  const format = FORMATS.has(query.format) ? query.format : "";
  if (!format) throw httpError(400, "Choose a report and a file type");
  const { kind, filter, status, table } = await reportTable(query);
  const title = `${appName()} ${table.sheet.toLowerCase()}`;
  const file = renderReport({
    title,
    note: noteFor(filter, kind === "winners" ? "all" : status),
    sheet: table.sheet,
    columns: table.columns,
    rows: table.summaryRow ? [...table.rows, table.summaryRow] : table.rows,
    format,
  });
  const day = stamp(new Date(), filter.tz).slice(0, 10) || "report";
  return {
    name: `${kind}-${day}.${file.name}`,
    type: file.type,
    body: file.body,
  };
}

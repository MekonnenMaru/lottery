import { all, get, iso } from "../../db.js";
import { appName, httpError } from "../../util.js";
import { renderReport } from "../reports/files.js";

function padTicket(number) {
  return String(number).padStart(3, "0");
}

function paymentStatus(status) {
  return status === "reserved" ? "pending" : status;
}

function shown(value, tzMinutes) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - Number(tzMinutes || 0) * 60 * 1000);
  const pad = (part) => String(part).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

function shape(row, orders, tickets) {
  const order = orders.get(row.phone) || { orders: 0, approved: 0, last_order: null };
  return {
    id: String(row.id),
    telegram_id: String(row.telegram_id),
    name: row.name,
    username: row.username || "",
    phone: row.phone,
    created_at: iso(row.created_at),
    orders: order.orders,
    tickets: tickets.get(row.phone) || 0,
    approved: order.approved,
    last_order: order.last_order ? iso(order.last_order) : null,
  };
}

async function loadCustomers() {
  const people = await all(
    "SELECT id, telegram_id, name, username, phone, created_at FROM customers ORDER BY id DESC",
  );
  const orderRows = await all(`
    SELECT phone,
           COUNT(*) AS orders,
           COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS approved,
           MAX(created_at) AS last_order
    FROM orders
    GROUP BY phone
  `);
  const ticketRows = await all("SELECT phone, COUNT(*) AS tickets FROM tickets GROUP BY phone");
  const orders = new Map(orderRows.map((row) => [row.phone, {
    orders: Number(row.orders),
    approved: Number(row.approved),
    last_order: row.last_order,
  }]));
  const tickets = new Map(ticketRows.map((row) => [row.phone, Number(row.tickets)]));
  return people.map((row) => shape(row, orders, tickets));
}

function wanted(rows, search) {
  const needle = String(search || "").trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => [row.id, row.name, row.username, row.phone, row.telegram_id]
    .join(" ")
    .toLowerCase()
    .includes(needle));
}

export async function listCustomers() {
  return loadCustomers();
}

export async function exportCustomers(query) {
  const format = query.format === "xls" || query.format === "csv" ? query.format : "";
  if (!format) throw httpError(400, "Choose CSV or Excel");
  const tz = Number(query.tz);
  const tzMinutes = Number.isFinite(tz) ? tz : 0;
  const rows = wanted(await loadCustomers(), query.search);
  const columns = [
    { label: "ID", number: true, width: 40 },
    { label: "Name", width: 140 },
    { label: "Username", width: 110 },
    { label: "Phone", width: 110 },
    { label: "Telegram", width: 130 },
    { label: "Registered", width: 120 },
    { label: "Orders", number: true, width: 60 },
    { label: "Tickets", number: true, width: 60 },
    { label: "Approved", number: true, width: 80 },
    { label: "Last order", width: 120 },
  ];
  const file = renderReport({
    title: `${appName()} customers`,
    note: `${rows.length} registered customers`,
    sheet: "Customers",
    columns,
    rows: rows.map((row) => [
      Number(row.id),
      row.name,
      row.username,
      row.phone,
      row.telegram_id,
      shown(row.created_at, tzMinutes),
      row.orders,
      row.tickets,
      row.approved,
      shown(row.last_order, tzMinutes),
    ]),
    format,
  });
  const day = shown(new Date(), tzMinutes).slice(0, 10) || "customers";
  return {
    name: `customers-${day}.${file.name}`,
    type: file.type,
    body: file.body,
  };
}

function ticketText(raw, numbers) {
  if (numbers?.length) return numbers.map(padTicket).join(", ");
  try {
    const parsed = JSON.parse(raw || "[]");
    return parsed.map(padTicket).join(", ");
  } catch {
    return "";
  }
}

export async function customerHistory(id) {
  const row = await get(
    "SELECT id, telegram_id, name, username, phone, created_at FROM customers WHERE id = ?",
    [id],
  );
  if (!row) throw httpError(404, "Customer not found");
  const orders = await all(`
    SELECT o.id, o.lottery_id, l.title, o.status, o.amount, o.ticket_numbers, o.created_at
    FROM orders o
    JOIN lotteries l ON l.id = o.lottery_id
    WHERE o.phone = ?
    ORDER BY o.id DESC
  `, [row.phone]);
  const tickets = await all(
    "SELECT order_id, ticket_number FROM tickets WHERE phone = ? ORDER BY ticket_number",
    [row.phone],
  );
  const byOrder = new Map();
  for (const ticket of tickets) {
    const key = Number(ticket.order_id);
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(ticket.ticket_number);
  }
  const approved = orders.reduce((sum, item) => (
    sum + (item.status === "approved" ? Number(item.amount) : 0)
  ), 0);
  return {
    customer: shape(
      row,
      new Map([[row.phone, { orders: orders.length, approved, last_order: orders[0]?.created_at || null }]]),
      new Map([[row.phone, tickets.length]]),
    ),
    orders: orders.map((item) => ({
      id: String(item.id),
      lottery_id: String(item.lottery_id),
      title: item.title,
      status: paymentStatus(item.status),
      amount: Number(item.amount),
      tickets: ticketText(item.ticket_numbers, byOrder.get(Number(item.id))),
      created_at: iso(item.created_at),
    })),
  };
}

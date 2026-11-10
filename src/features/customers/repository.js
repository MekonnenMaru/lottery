import { all, get, iso } from "../../db.js";

export async function findAllCustomers() {
  return all(
    "SELECT id, telegram_id, name, username, phone, created_at FROM customers ORDER BY id DESC",
  );
}

export async function findCustomerById(id) {
  return get(
    "SELECT id, telegram_id, name, username, phone, created_at FROM customers WHERE id = ?",
    [id],
  );
}

export async function orderStatsByPhone() {
  return all(`
    SELECT phone,
           COUNT(*) AS orders,
           COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS approved,
           MAX(created_at) AS last_order
    FROM orders
    GROUP BY phone
  `);
}

export async function ticketCountsByPhone() {
  return all("SELECT phone, COUNT(*) AS tickets FROM tickets GROUP BY phone");
}

export async function ordersForPhone(phone) {
  return all(`
    SELECT o.id, o.lottery_id, l.title, o.status, o.amount, o.ticket_numbers, o.created_at
    FROM orders o
    JOIN lotteries l ON l.id = o.lottery_id
    WHERE o.phone = ?
    ORDER BY o.id DESC
  `, [phone]);
}

export async function ticketsForPhone(phone) {
  return all(
    "SELECT order_id, ticket_number FROM tickets WHERE phone = ? ORDER BY ticket_number",
    [phone],
  );
}

export { iso };

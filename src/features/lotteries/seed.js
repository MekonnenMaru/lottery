import { all, run, withTransaction } from "../../db.js";
import { appName } from "../settings/service.js";

const PEOPLE = [
  ["Abel Bekele", "251911100001"],
  ["Sara Mekonnen", "251922100002"],
  ["Dawit Tesfaye", "251933100003"],
  ["Helen Alemu", "251944100004"],
  ["Yonas Kebede", "251911100005"],
  ["Marta Hailu", "251922100006"],
  ["Biruk Tadesse", "251933100007"],
  ["Liya Girma", "251944100008"],
  ["Nahom Desta", "251911100009"],
  ["Selam Assefa", "251922100010"],
  ["Kalkidan Worku", "251933100011"],
  ["Ephrem Bekele", "251944100012"],
];

function at(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

const DRAWS = [
  {
    title: "Yuan UP",
    subtitle: "Time Grey",
    prize: "Yuan UP",
    price: 3000,
    total: 24,
    sold: 24,
    start: -80,
    end: -70,
    featured: 0,
    status: "completed",
    winner: "Helen Alemu",
    image: "https://images.pexels.com/photos/116675/pexels-photo-116675.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "Sealion 6",
    subtitle: "Shark Grey",
    prize: "Sealion 6",
    price: 3500,
    total: 30,
    sold: 30,
    start: -55,
    end: -40,
    featured: 0,
    status: "completed",
    winner: "Dawit Tesfaye",
    image: "https://images.pexels.com/photos/244206/pexels-photo-244206.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "Song Plus",
    subtitle: "Smoke Grey",
    prize: "Song Plus",
    price: 3500,
    total: 36,
    sold: 36,
    start: -30,
    end: -12,
    featured: 0,
    status: "completed",
    winner: "Sara Mekonnen",
    image: "https://images.pexels.com/photos/358070/pexels-photo-358070.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "RAV4 Hybrid",
    subtitle: "Popular round",
    prize: "RAV4 Hybrid",
    price: 5000,
    total: 50,
    sold: 31,
    start: -20,
    end: 12,
    featured: 0,
    status: "active",
    image: "https://images.pexels.com/photos/210019/pexels-photo-210019.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "Corolla Cross",
    subtitle: "Ending this week",
    prize: "Corolla Cross",
    price: 6000,
    total: 40,
    sold: 27,
    start: -18,
    end: 2,
    featured: 0,
    status: "active",
    image: "https://images.pexels.com/photos/112460/pexels-photo-112460.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "City EV",
    subtitle: "New this week",
    prize: "City EV",
    price: 4500,
    total: 60,
    sold: 6,
    start: -1,
    end: 14,
    featured: 0,
    status: "active",
    image: "https://images.pexels.com/photos/3802510/pexels-photo-3802510.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
  {
    title: "Hilux Double Cab 2022",
    subtitle: `${appName()} 4`,
    prize: "Hilux Double Cab 2022",
    price: 8000,
    total: 80,
    sold: 18,
    start: -4,
    end: 6,
    featured: 1,
    status: "active",
    image: "https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg?auto=compress&cs=tinysrgb&w=800",
  },
];

async function sellTickets(tx, draw, lotteryId, bankId) {
  let number = 1;
  let remaining = draw.sold;
  let personIndex = 0;
  let winnerTicketId = null;
  const start = at(draw.start);
  while (remaining > 0) {
    const [name, phone] = PEOPLE[personIndex % PEOPLE.length];
    const count = Math.min(remaining, 3);
    const numbers = [];
    for (let i = 0; i < count; i += 1) numbers.push(number++);
    const order = await tx.run(`
      INSERT INTO orders (
        lottery_id, phone, customer_name, bank_account_id, amount, status, ticket_numbers, created_at, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?)
    `, [lotteryId, phone, name, bankId, draw.price * count, JSON.stringify(numbers), start, at(draw.end)]);
    const orderId = Number(order.insertId);
    for (const ticketNumber of numbers) {
      const ticket = await tx.run(`
        INSERT INTO tickets (lottery_id, ticket_number, order_id, phone, status, created_at)
        VALUES (?, ?, ?, ?, 'approved', ?)
      `, [lotteryId, ticketNumber, orderId, phone, start]);
      if (draw.winner === name && winnerTicketId === null) winnerTicketId = Number(ticket.insertId);
    }
    remaining -= count;
    personIndex += 1;
  }
  if (draw.status === "completed" && winnerTicketId) {
    await tx.run(
      "UPDATE lotteries SET winner_ticket_id = ?, announced_at = ? WHERE id = ?",
      [winnerTicketId, at(draw.end), lotteryId],
    );
  }
}

function seedDemoEnabled() {
  const raw = String(process.env.LOTTERY_SEED_DEMO || "").trim().toLowerCase();
  return raw === "1" || raw === "yes" || raw === "true";
}

/** Wipe lotteries + related tickets/orders so deploy can start empty. */
export async function clearCatalog() {
  await withTransaction(async (tx) => {
    await tx.run("UPDATE lotteries SET winner_ticket_id = NULL");
    await tx.run("DELETE FROM tickets");
    await tx.run("DELETE FROM orders");
    await tx.run("DELETE FROM lottery_images");
    await tx.run("DELETE FROM lotteries");
  });
}

/** Demo catalog for local testing only. Off by default so deploy starts empty. */
export async function seedCatalog() {
  if (!seedDemoEnabled()) return;

  const name = appName();
  await run(
    "UPDATE bank_accounts SET account_name = ? WHERE account_number IN ('1000123456789', '0911001100')",
    [name],
  );
  await run(
    "UPDATE lotteries SET subtitle = ? WHERE title = 'Hilux Double Cab 2022' AND subtitle LIKE '%Ekub 4'",
    [`${name} 4`],
  );

  const existing = await all("SELECT id, title FROM lotteries");
  const onlyDemo = existing.length === 1 && existing[0].title === "Demo Pickup Draw";
  if (existing.length > 0 && !onlyDemo) return;

  await withTransaction(async (tx) => {
    if (onlyDemo) {
      const id = existing[0].id;
      await tx.run("UPDATE lotteries SET winner_ticket_id = NULL WHERE id = ?", [id]);
      await tx.run("DELETE FROM tickets WHERE lottery_id = ?", [id]);
      await tx.run("DELETE FROM orders WHERE lottery_id = ?", [id]);
      await tx.run("DELETE FROM lotteries WHERE id = ?", [id]);
    }
    const sample = await tx.get("SELECT id FROM bank_accounts WHERE bank_name = ?", ["Sample Bank"]);
    let bankId = null;
    if (sample) {
      await tx.run(
        "UPDATE bank_accounts SET bank_name = ?, account_name = ?, account_number = ? WHERE id = ?",
        ["Commercial Bank of Ethiopia", appName(), "1000123456789", sample.id],
      );
      bankId = sample.id;
    }
    const telebirr = await tx.get("SELECT id FROM bank_accounts WHERE bank_name = ?", ["Telebirr"]);
    if (!telebirr) {
      const inserted = await tx.run(
        "INSERT INTO bank_accounts (bank_name, account_name, account_number, active) VALUES (?, ?, ?, 1)",
        ["Telebirr", appName(), "0911001100"],
      );
      bankId = bankId || Number(inserted.insertId);
    }
    if (!bankId) {
      const anyBank = await tx.get("SELECT id FROM bank_accounts ORDER BY id LIMIT 1");
      bankId = anyBank ? anyBank.id : null;
    }
    for (const draw of DRAWS) {
      const created = await tx.run(`
        INSERT INTO lotteries (
          title, subtitle, prize, ticket_price, total_tickets, start_at, end_at,
          status, is_featured, image_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        draw.title,
        draw.subtitle,
        draw.prize,
        draw.price,
        draw.total,
        at(draw.start),
        at(draw.end),
        draw.status,
        draw.featured,
        draw.image,
        at(draw.start),
      ]);
      await sellTickets(tx, draw, Number(created.insertId), bankId);
    }
  });
}

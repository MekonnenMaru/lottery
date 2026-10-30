import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { cookieOptions, siteLimiter } from "../../http.js";
import { lotteryImageDir, receiptDir } from "../../paths.js";
import { lotteryUpload, screenshotUpload } from "../../uploads.js";
import { httpError, intValue } from "../../util.js";
import { changeAdminPassword, findAdmin, findAdminById } from "../admin/service.js";
import { createSession, destroySession, readSession } from "../auth/service.js";
import { addBank, setBankActive, updateBank } from "../banks/service.js";
import {
  announceTicket,
  createLottery,
  deleteLottery,
  featureLottery,
  saveLotteryImages,
  setLotteryHidden,
  updateLottery,
} from "../lotteries/service.js";
import { buildReport, reportData } from "../reports/service.js";
import {
  beginTelegramLogin,
  beginTelegramOidc,
  completeTelegramOidc,
  consumeTelegramLogin,
  customerFromSession,
  customerProfile,
  telegramBot,
  telegramClientId,
  telegramLoginStatus,
} from "../telegram/service.js";
import { approveOrder, createStoreOrder, rejectOrder } from "../orders/service.js";
import {
  storeBanks,
  storeDashboard,
  storeLotteries,
  storeLotteryOrders,
  storeMyTickets,
  storePayments,
  storeSoldTickets,
  storeTicketCheck,
  storeWinners,
} from "./service.js";

const router = Router();
const dummyPasswordHash = bcrypt.hashSync("not-a-real-admin-password", 12);

function wrap(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      const status = error.status || 500;
      if (status >= 500) console.error(error);
      if (!res.headersSent) {
        res.status(status).json({
          success: false,
          message: status >= 500 ? "Something went wrong" : error.message,
        });
      }
    });
  };
}

async function staff(req, res, next) {
  try {
    const session = await readSession(req.cookies?.admin_sid, "admin");
    const admin = session ? await findAdminById(Number(session.subject)) : null;
    if (!admin) {
      res.status(401).json({ success: false, message: "Staff sign-in required" });
      return;
    }
    req.admin = admin;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
}

function idOf(value) {
  return intValue(value, 1, 1_000_000_000);
}

function whole(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number);
}

const MAX_LOTTERY_IMAGES = 8;

function storedImage(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (text.startsWith("https://images.pexels.com/")) {
    if (text.length > 512 || /[\s"'<>]/.test(text)) throw httpError(400, "Lottery image was not uploaded");
    return text;
  }
  const name = path.basename(text.replaceAll("\\", "/"));
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) {
    throw httpError(400, "Lottery image was not uploaded");
  }
  if (!fs.existsSync(path.join(lotteryImageDir, name))) {
    throw httpError(400, "Lottery image was not uploaded");
  }
  return `uploads/lotteries/${name}`;
}

function storedImages(value) {
  const list = Array.isArray(value) ? value : [];
  if (list.length > MAX_LOTTERY_IMAGES) throw httpError(400, "A lottery can have at most 8 images");
  const seen = new Set();
  const paths = [];
  for (const item of list) {
    const image = storedImage(item);
    if (!image || seen.has(image)) continue;
    seen.add(image);
    paths.push(image);
  }
  return paths;
}

function lotteryBody(body) {
  return {
    title: body?.title,
    subtitle: body?.subtitle || "",
    prize: body?.prize || body?.title,
    ticketPrice: whole(body?.ticket_price),
    totalTickets: whole(body?.total_tickets),
    startAt: body?.start_date,
    endAt: body?.end_date,
    status: body?.status || "active",
    featured: body?.featured,
    hidden: body?.hidden,
  };
}

router.get("/lotteries.php", wrap(async (req, res) => {
  res.json({ success: true, data: await storeLotteries() });
}));

router.get("/telegram.php", wrap(async (req, res) => {
  const bot = telegramBot();
  const session = await readSession(req.cookies?.buyer_sid, "buyer");
  const customer = await customerFromSession(session);
  res.json({
    success: true,
    enabled: bot.enabled,
    clientId: telegramClientId(),
    user: customerProfile(customer),
  });
}));

router.post("/telegram-oidc.php", siteLimiter(20), wrap(async (req, res) => {
  if (req.body?.id_token) {
    const done = await completeTelegramOidc(req.body.id_token);
    res.cookie("buyer_sid", done.session.id, cookieOptions(done.session.expiresAt));
    res.json({ success: true, user: customerProfile(done.customer) });
    return;
  }
  const begun = await beginTelegramOidc();
  res.json({ success: true, nonce: begun.nonce, clientId: begun.clientId });
}));

router.post("/telegram-login.php", siteLimiter(10), wrap(async (req, res) => {
  const login = await beginTelegramLogin();
  res.json({ success: true, ...login });
}));

router.get("/telegram-login.php", wrap(async (req, res) => {
  const status = await telegramLoginStatus(req.query.code);
  if (!status) throw httpError(400, "This sign-in expired");
  if (status.pending) {
    res.json({ success: true, pending: true });
    return;
  }
  const session = await readSession(status.sessionId, "buyer");
  if (!session) throw httpError(400, "This sign-in expired");
  res.cookie("buyer_sid", session.id, cookieOptions(Number(session.expires_at)));
  await consumeTelegramLogin(req.query.code);
  res.json({ success: true, pending: false, user: customerProfile(status.customer) });
}));

router.post("/telegram-logout.php", wrap(async (req, res) => {
  await destroySession(req.cookies?.buyer_sid);
  res.clearCookie("buyer_sid", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  res.json({ success: true });
}));

router.get("/tickets.php", wrap(async (req, res) => {
  const lotteryId = idOf(req.query.lottery_id);
  if (!lotteryId) throw httpError(404, "Lottery not found");
  res.json({ success: true, data: await storeSoldTickets(lotteryId) });
}));

router.get("/my-tickets.php", siteLimiter(30), wrap(async (req, res) => {
  res.json({ success: true, data: await storeMyTickets(req.query.phone) });
}));

router.get("/winners.php", wrap(async (req, res) => {
  res.json({ success: true, data: await storeWinners() });
}));

router.get("/bank-accounts.php", wrap(async (req, res) => {
  res.json({ success: true, data: await storeBanks(true) });
}));

router.get("/ticket-check.php", staff, wrap(async (req, res) => {
  const lotteryId = idOf(req.query.lottery_id);
  if (!lotteryId) throw httpError(400, "Please select lottery and enter ticket number.");
  res.json({ success: true, data: await storeTicketCheck(lotteryId, req.query.ticket_number) });
}));

router.post("/upload-payment.php", siteLimiter(20), (req, res) => {
  screenshotUpload.single("screenshot")(req, res, (error) => {
    if (error || !req.file) {
      res.status(400).json({ success: false, message: "Upload a JPEG, PNG, or WebP receipt under 10 MB" });
      return;
    }
    res.json({ success: true, url: `/api/receipt-files/${req.file.filename}` });
  });
});

router.post("/create-order.php", siteLimiter(20), wrap(async (req, res) => {
  const lotteryId = idOf(req.body?.lottery_id);
  if (!lotteryId) throw httpError(400, "Choose a lottery");
  const orderId = await createStoreOrder({
    lotteryId,
    phone: req.body?.customer_phone,
    name: req.body?.customer_name,
    numbers: req.body?.selected_numbers,
    receiptUrl: req.body?.screenshot_url,
    bankAccountId: idOf(req.body?.bank_account_id),
    senderAccount: req.body?.sender_account,
  });
  res.json({ success: true, order_id: orderId });
}));

router.get("/receipt-files/:name", staff, (req, res) => {
  const name = path.basename(req.params.name);
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) {
    res.status(404).json({ success: false, message: "Not found" });
    return;
  }
  const full = path.resolve(receiptDir, name);
  if (!full.startsWith(path.resolve(receiptDir)) || !fs.existsSync(full)) {
    res.status(404).json({ success: false, message: "Not found" });
    return;
  }
  res.sendFile(full);
});

router.get("/admin-session.php", staff, wrap(async (req, res) => {
  res.json({ success: true, admin: { id: req.admin.id, username: req.admin.username } });
}));

router.post("/admin-password.php", staff, siteLimiter(10), wrap(async (req, res) => {
  await changeAdminPassword(req.admin.id, req.body?.current_password, req.body?.new_password);
  res.json({ success: true });
}));

router.post("/admin-logout.php", staff, wrap(async (req, res) => {
  await destroySession(req.cookies?.admin_sid);
  res.clearCookie("admin_sid", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  res.json({ success: true });
}));

router.post("/admin-login.php", siteLimiter(10), wrap(async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const admin = await findAdmin(username);
  const match = await bcrypt.compare(password, admin?.password_hash || dummyPasswordHash);
  if (!admin || !match) throw httpError(401, "Invalid username or password");
  const session = await createSession("admin", String(admin.id), 12 * 60 * 60 * 1000);
  res.cookie("admin_sid", session.id, cookieOptions(session.expiresAt));
  res.json({ success: true, admin: { id: admin.id, username: admin.username } });
}));

router.get("/dashboard.php", staff, wrap(async (req, res) => {
  const board = await storeDashboard({
    from: req.query.from,
    to: req.query.to,
    lottery: req.query.lottery,
    bank: req.query.bank,
    status: req.query.status,
    tz: req.query.tz,
  });
  res.json({ success: true, ...board });
}));

router.get("/payments.php", staff, wrap(async (req, res) => {
  const page = intValue(req.query.page, 1, 100_000);
  const result = await storePayments({
    status: String(req.query.status || "all"),
    search: String(req.query.search || ""),
    limit: intValue(req.query.limit ?? 50, 1, 200) || 50,
    page: page || undefined,
    pageSize: intValue(req.query.page_size ?? 10, 1, 100) || 10,
  });
  res.json({
    success: true,
    data: result.data,
    counts: result.counts,
    total: result.total,
    page: result.page,
    page_size: result.page_size,
  });
}));

router.post("/approve-payment.php", staff, wrap(async (req, res) => {
  const orderId = idOf(req.body?.payment_id);
  if (!orderId) throw httpError(404, "Order not found");
  await approveOrder(orderId, req.admin.id);
  res.json({ success: true });
}));

router.post("/reject-payment.php", staff, wrap(async (req, res) => {
  const orderId = idOf(req.body?.payment_id);
  if (!orderId) throw httpError(404, "Order not found");
  await rejectOrder(orderId, req.admin.id);
  res.json({ success: true });
}));

router.post("/update-payment-status.php", staff, wrap(async (req, res) => {
  const orderId = idOf(req.body?.payment_id);
  const nextStatus = String(req.body?.new_status || "");
  if (!orderId) throw httpError(404, "Order not found");
  if (nextStatus === "approved") await approveOrder(orderId, req.admin.id);
  else if (nextStatus === "rejected") await rejectOrder(orderId, req.admin.id);
  else throw httpError(400, "Choose approved or rejected");
  res.json({ success: true });
}));

router.post("/upload-lottery-image.php", staff, (req, res) => {
  lotteryUpload.single("image")(req, res, (error) => {
    if (error || !req.file) {
      res.status(400).json({ success: false, message: "Upload a JPEG, PNG, or WebP image under 5 MB" });
      return;
    }
    res.json({ success: true, image_url: `uploads/lotteries/${req.file.filename}` });
  });
});

router.post("/admin-create-lottery.php", staff, wrap(async (req, res) => {
  const id = await createLottery(lotteryBody(req.body));
  const images = Array.isArray(req.body?.image_urls)
    ? storedImages(req.body.image_urls)
    : storedImages(req.body?.image_url ? [req.body.image_url] : []);
  await saveLotteryImages(id, images);
  res.json({ success: true });
}));

router.post("/admin-update-lottery.php", staff, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Lottery not found");
  await updateLottery(id, lotteryBody(req.body));
  if (Array.isArray(req.body?.image_urls)) await saveLotteryImages(id, storedImages(req.body.image_urls));
  else if (req.body?.image_url) await saveLotteryImages(id, storedImages([req.body.image_url]));
  res.json({ success: true });
}));

router.post("/admin-delete-lottery.php", staff, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Lottery not found");
  await deleteLottery(id);
  res.json({ success: true });
}));

router.post("/admin-feature-lottery.php", staff, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Lottery not found");
  await featureLottery(id);
  res.json({ success: true });
}));

router.get("/admin-lotteries.php", staff, wrap(async (req, res) => {
  res.json({ success: true, data: await storeLotteries({ includeHidden: true }) });
}));

router.get("/admin-report.php", staff, wrap(async (req, res) => {
  if (req.query.format === "json") {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, ...(await reportData(req.query)) });
    return;
  }
  const file = await buildReport(req.query);
  res.set("Content-Type", file.type);
  res.set("Content-Disposition", `attachment; filename="${file.name}"`);
  res.set("Cache-Control", "no-store");
  res.send(file.body);
}));

router.post("/admin-hide-lottery.php", staff, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Lottery not found");
  const hidden = req.body?.hidden === true || req.body?.hidden === 1 || req.body?.hidden === "1";
  await setLotteryHidden(id, hidden);
  res.json({ success: true });
}));

router.get("/admin-winners.php", staff, wrap(async (req, res) => {
  res.json({ success: true, data: await storeWinners(true) });
}));

router.get("/admin-bank-accounts.php", staff, wrap(async (req, res) => {
  res.json({ success: true, data: await storeBanks(false) });
}));

router.post("/admin-create-bank-account.php", staff, wrap(async (req, res) => {
  const id = await addBank({
    bankName: req.body?.bank_name,
    accountName: req.body?.account_name,
    accountNumber: req.body?.account_number,
  });
  if (req.body?.status === "inactive") await setBankActive(id, false);
  res.json({ success: true });
}));

router.post("/admin-update-bank-account.php", staff, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Bank account not found");
  await updateBank(id, {
    bankName: req.body?.bank_name,
    accountName: req.body?.account_name,
    accountNumber: req.body?.account_number,
    status: req.body?.status,
  });
  res.json({ success: true });
}));

router.get("/completed-lotteries.php", staff, wrap(async (req, res) => {
  const rows = await storeLotteries({ includeHidden: true });
  res.json({ success: true, data: rows.filter((row) => row.status === "completed") });
}));

router.get("/lottery-orders.php", staff, wrap(async (req, res) => {
  const lotteryId = idOf(req.query.lottery_id);
  if (!lotteryId) throw httpError(404, "Lottery not found");
  res.json({ success: true, data: await storeLotteryOrders(lotteryId) });
}));

router.post("/announce-winner.php", staff, wrap(async (req, res) => {
  const lotteryId = idOf(req.body?.lottery_id);
  const orderId = idOf(req.body?.order_id);
  const ticketNumber = intValue(String(req.body?.winning_ticket_number || "").replace(/\D/g, ""), 1, 100_000);
  if (!lotteryId || !orderId || !ticketNumber) throw httpError(400, "Choose the winning ticket");
  await announceTicket({ lotteryId, orderId, ticketNumber, adminId: req.admin.id });
  res.json({ success: true });
}));

router.get("/lottery-backup.php", staff, (req, res) => {
  res.status(400).json({ success: false, message: "Backup is not available yet" });
});

export default router;

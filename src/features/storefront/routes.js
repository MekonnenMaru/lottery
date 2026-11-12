import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { clearCookieOptions, cookieOptions } from "../../config/security.js";
import { clockPayload } from "../../config/time.js";
import { lotteryImageDir, receiptDir } from "../../config/paths.js";
import { requirePrivilege, requireStaff as staff, requireSuper } from "../../middleware/auth.js";
import { wrap } from "../../middleware/error-handler.js";
import { siteLimiter } from "../../middleware/rate-limit.js";
import { idOf } from "../../middleware/validate.js";
import { lotteryUpload, screenshotUpload } from "../../uploads.js";
import { httpError, intValue } from "../../util.js";
import { destroySession, readSession } from "../auth/session.js";
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
  beginTelegramOidc,
  completeTelegramOidc,
  completeTelegramWebApp,
  customerFromSession,
  customerProfile,
  telegramClientId,
} from "../telegram/service.js";
import { logEvent } from "../audit/service.js";
import { approveOrder, createStoreOrder, rejectOrder } from "../orders/service.js";
import { getAdminSettings, updateAdminSettings } from "../settings/service.js";
import { invalidateBuyerBundle, publishBuyerBundle } from "./buyer-bundle.js";
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

router.get("/time", wrap(async (req, res) => {
  res.json(clockPayload());
}));

router.get("/lotteries", wrap(async (req, res) => {
  res.json({ success: true, data: await storeLotteries() });
}));

router.get("/telegram", wrap(async (req, res) => {
  const session = await readSession(req.cookies?.buyer_sid, "buyer");
  const customer = await customerFromSession(session);
  res.json({
    success: true,
    clientId: telegramClientId(),
    user: customerProfile(customer),
  });
}));

// Click and Telegram's window live in public/telegram.js. This checks the signature and starts the session.
router.post("/telegram-oidc", siteLimiter(20), wrap(async (req, res) => {
  if (req.body?.id_token) {
    const done = await completeTelegramOidc(req.body.id_token);
    res.cookie("buyer_sid", done.session.id, cookieOptions(done.session.expiresAt));
    res.json({ success: true, user: customerProfile(done.customer) });
    return;
  }
  const begun = await beginTelegramOidc();
  res.json({ success: true, nonce: begun.nonce, clientId: begun.clientId });
}));

router.post("/telegram-webapp", siteLimiter(20), wrap(async (req, res) => {
  const done = await completeTelegramWebApp(req.body?.initData);
  res.cookie("buyer_sid", done.session.id, cookieOptions(done.session.expiresAt));
  res.json({ success: true, user: customerProfile(done.customer) });
}));

router.post("/telegram-logout", wrap(async (req, res) => {
  await destroySession(req.cookies?.buyer_sid);
  res.clearCookie("buyer_sid", clearCookieOptions());
  res.json({ success: true });
}));

router.get("/tickets", wrap(async (req, res) => {
  const lotteryId = idOf(req.query.lottery_id);
  if (!lotteryId) throw httpError(404, "Lottery not found");
  res.json({ success: true, data: await storeSoldTickets(lotteryId) });
}));

router.get("/my-tickets", siteLimiter(30), wrap(async (req, res) => {
  const session = await readSession(req.cookies?.buyer_sid, "buyer");
  const customer = await customerFromSession(session);
  if (!customer?.phone) {
    res.json({ success: true, signedIn: false, data: [] });
    return;
  }
  res.json({ success: true, signedIn: true, data: await storeMyTickets(customer.phone) });
}));

router.get("/winners", wrap(async (req, res) => {
  res.json({ success: true, data: await storeWinners() });
}));

router.get("/bank-accounts", wrap(async (req, res) => {
  res.json({ success: true, data: await storeBanks(true) });
}));

const pay = [staff, requirePrivilege("payments")];
const lot = [staff, requirePrivilege("lotteries")];
const banks = [staff, requirePrivilege("banks")];
const winners = [staff, requirePrivilege("winners")];
const reports = [staff, requirePrivilege("reports")];
const settings = [staff, requirePrivilege("settings")];
const lotOrReport = [staff, requirePrivilege("lotteries", "reports", "winners")];

router.get("/ticket-check", ...pay, wrap(async (req, res) => {
  const lotteryId = idOf(req.query.lottery_id);
  if (!lotteryId) throw httpError(400, "Please select lottery and enter ticket number.");
  res.json({ success: true, data: await storeTicketCheck(lotteryId, req.query.ticket_number) });
}));

router.post("/upload-payment", siteLimiter(20), (req, res) => {
  screenshotUpload.single("screenshot")(req, res, (error) => {
    if (error || !req.file) {
      res.status(400).json({ success: false, message: "Upload a JPEG, PNG, or WebP receipt under 10 MB" });
      return;
    }
    res.json({ success: true, url: `/api/receipt-files/${req.file.filename}` });
  });
});

router.post("/create-order", siteLimiter(20), wrap(async (req, res) => {
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

router.get("/receipt-files/:name", ...pay, (req, res) => {
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

router.get("/admin-settings", ...settings, wrap(async (req, res) => {
  const bag = await getAdminSettings();
  res.json({ success: true, ...bag });
}));

router.post("/admin-settings", ...settings, siteLimiter(20), wrap(async (req, res) => {
  const bag = await updateAdminSettings(req.body || {});
  invalidateBuyerBundle();
  publishBuyerBundle();
  await logEvent(req.admin.id, "update_settings", {
    app_name: bag?.branding?.app_name || "",
  });
  res.json({ success: true, ...bag });
}));

router.get("/dashboard", staff, wrap(async (req, res) => {
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

router.get("/payments", ...pay, wrap(async (req, res) => {
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

router.post("/approve-payment", ...pay, wrap(async (req, res) => {
  const orderId = idOf(req.body?.payment_id);
  if (!orderId) throw httpError(404, "Order not found");
  await approveOrder(orderId, req.admin.id);
  res.json({ success: true });
}));

router.post("/reject-payment", ...pay, wrap(async (req, res) => {
  const orderId = idOf(req.body?.payment_id);
  if (!orderId) throw httpError(404, "Order not found");
  await rejectOrder(orderId, req.admin.id);
  res.json({ success: true });
}));

router.post("/update-payment-status", ...pay, wrap(async (req, res) => {
  const orderId = idOf(req.body?.payment_id);
  const nextStatus = String(req.body?.new_status || "");
  if (!orderId) throw httpError(404, "Order not found");
  if (nextStatus === "approved") await approveOrder(orderId, req.admin.id);
  else if (nextStatus === "rejected") await rejectOrder(orderId, req.admin.id);
  else throw httpError(400, "Choose approved or rejected");
  res.json({ success: true });
}));

router.post("/upload-lottery-image", ...lot, (req, res) => {
  lotteryUpload.single("image")(req, res, (error) => {
    if (error || !req.file) {
      res.status(400).json({ success: false, message: "Upload a JPEG, PNG, or WebP image under 5 MB" });
      return;
    }
    res.json({ success: true, image_url: `uploads/lotteries/${req.file.filename}` });
  });
});

router.post("/admin-create-lottery", ...lot, wrap(async (req, res) => {
  const id = await createLottery(lotteryBody(req.body));
  const images = Array.isArray(req.body?.image_urls)
    ? storedImages(req.body.image_urls)
    : storedImages(req.body?.image_url ? [req.body.image_url] : []);
  await saveLotteryImages(id, images);
  await logEvent(req.admin.id, "create_lottery", { lotteryId: id, title: req.body?.title || "" });
  res.json({ success: true });
}));

router.post("/admin-update-lottery", ...lot, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Lottery not found");
  await updateLottery(id, lotteryBody(req.body));
  if (Array.isArray(req.body?.image_urls)) await saveLotteryImages(id, storedImages(req.body.image_urls));
  else if (req.body?.image_url) await saveLotteryImages(id, storedImages([req.body.image_url]));
  await logEvent(req.admin.id, "update_lottery", { lotteryId: id, title: req.body?.title || "" });
  res.json({ success: true });
}));

router.post("/admin-delete-lottery", staff, requireSuper, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Lottery not found");
  await deleteLottery(id);
  await logEvent(req.admin.id, "delete_lottery", { lotteryId: id });
  res.json({ success: true });
}));

router.post("/admin-feature-lottery", ...lot, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Lottery not found");
  await featureLottery(id);
  await logEvent(req.admin.id, "feature_lottery", { lotteryId: id });
  res.json({ success: true });
}));

router.get("/admin-lotteries", ...lotOrReport, wrap(async (req, res) => {
  res.json({ success: true, data: await storeLotteries({ includeHidden: true }) });
}));

router.get("/admin-report", ...reports, wrap(async (req, res) => {
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

router.post("/admin-hide-lottery", ...lot, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Lottery not found");
  const hidden = req.body?.hidden === true || req.body?.hidden === 1 || req.body?.hidden === "1";
  await setLotteryHidden(id, hidden);
  await logEvent(req.admin.id, "hide_lottery", { lotteryId: id, hidden });
  res.json({ success: true });
}));

router.get("/admin-winners", ...winners, wrap(async (req, res) => {
  res.json({ success: true, data: await storeWinners(true) });
}));

router.get("/admin-bank-accounts", ...banks, wrap(async (req, res) => {
  res.json({ success: true, data: await storeBanks(false) });
}));

router.post("/admin-create-bank-account", ...banks, wrap(async (req, res) => {
  const id = await addBank({
    bankName: req.body?.bank_name,
    accountName: req.body?.account_name,
    accountNumber: req.body?.account_number,
  });
  if (req.body?.status === "inactive") await setBankActive(id, false);
  await logEvent(req.admin.id, "create_bank", {
    bankId: id,
    bank_name: req.body?.bank_name || "",
  });
  res.json({ success: true });
}));

router.post("/admin-update-bank-account", ...banks, wrap(async (req, res) => {
  const id = idOf(req.body?.id);
  if (!id) throw httpError(404, "Bank account not found");
  await updateBank(id, {
    bankName: req.body?.bank_name,
    accountName: req.body?.account_name,
    accountNumber: req.body?.account_number,
    status: req.body?.status,
  });
  await logEvent(req.admin.id, "update_bank", {
    bankId: id,
    bank_name: req.body?.bank_name || "",
    status: req.body?.status || "",
  });
  res.json({ success: true });
}));

router.get("/completed-lotteries", ...winners, wrap(async (req, res) => {
  const rows = await storeLotteries({ includeHidden: true });
  res.json({ success: true, data: rows.filter((row) => row.status === "completed") });
}));

router.get("/lottery-orders", ...winners, wrap(async (req, res) => {
  const lotteryId = idOf(req.query.lottery_id);
  if (!lotteryId) throw httpError(404, "Lottery not found");
  res.json({ success: true, data: await storeLotteryOrders(lotteryId) });
}));

router.post("/announce-winner", ...winners, wrap(async (req, res) => {
  const lotteryId = idOf(req.body?.lottery_id);
  const orderId = idOf(req.body?.order_id);
  const ticketNumber = intValue(String(req.body?.winning_ticket_number || "").replace(/\D/g, ""), 1, 100_000);
  if (!lotteryId || !orderId || !ticketNumber) throw httpError(400, "Choose the winning ticket");
  await announceTicket({ lotteryId, orderId, ticketNumber, adminId: req.admin.id });
  res.json({ success: true });
}));

router.get("/lottery-backup", staff, (req, res) => {
  res.status(400).json({ success: false, message: "Backup is not available yet" });
});

export default router;

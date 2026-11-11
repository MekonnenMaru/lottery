import fs from "node:fs/promises";
import path from "node:path";
import { receiptDir } from "../../config/paths.js";
import { get, iso, withTransaction } from "../../db.js";
import { httpError } from "../../util.js";
import { writeAudit } from "../audit/service.js";
import { normalizeTransactionId, preprocessReceipt, receiptKind, recognizeText } from "./ocr.js";

const RECEIPT_NAME = /^[a-f0-9]{32}\.(jpg|jpeg|png|webp|pdf)$/i;

function basenameSafe(value) {
  const name = path.basename(String(value || "").replaceAll("\\", "/"));
  if (!RECEIPT_NAME.test(name)) return null;
  return name;
}

async function resolveReceiptFile(fileName) {
  const name = basenameSafe(fileName);
  if (!name) throw httpError(400, "Invalid receipt reference");
  const full = path.resolve(receiptDir, name);
  if (!full.startsWith(path.resolve(receiptDir))) {
    throw httpError(400, "Invalid receipt reference");
  }
  try {
    await fs.access(full);
  } catch {
    throw httpError(404, "Receipt file not found");
  }
  return { name, full, kind: receiptKind(name) };
}

async function adminName(adminId) {
  if (!adminId) return "";
  const row = await get("SELECT username FROM admins WHERE id = ?", [adminId]);
  return row?.username || "";
}

async function transactionOwner(transactionId, exceptPaymentId) {
  if (!transactionId) return null;
  const row = await get(
    "SELECT id FROM orders WHERE transaction_id = ? AND id <> ? LIMIT 1",
    [transactionId, exceptPaymentId || 0],
  );
  return row ? Number(row.id) : null;
}

function scanPayload(order, fileName, result, scannerName, extra = {}) {
  return {
    payment_id: Number(order.id),
    receipt: fileName,
    text: result.text,
    confidence: result.confidence,
    language: result.language,
    transaction_id: order.transaction_id || result.transactionId || "",
    scanned_by: order.ocr_scanned_by == null ? null : Number(order.ocr_scanned_by),
    scanned_by_name: scannerName || "",
    scanned_at: order.ocr_scanned_at ? iso(order.ocr_scanned_at) : "",
    ...extra,
  };
}

/**
 * Scan an existing order receipt, persist full text + receipt reference + scanner.
 * Does not upload or copy the receipt file.
 */
export async function scanPaymentReceipt(paymentId, adminId) {
  if (!adminId) throw httpError(401, "Staff sign-in required");

  const order = await get(
    "SELECT id, receipt_path, transaction_id FROM orders WHERE id = ?",
    [paymentId],
  );
  if (!order) throw httpError(404, "Payment not found");
  if (!order.receipt_path) throw httpError(404, "This payment has no receipt");

  const file = await resolveReceiptFile(order.receipt_path);
  let bytes;
  try {
    bytes = await fs.readFile(file.full);
  } catch {
    throw httpError(404, "Receipt file not found");
  }

  const prepared = await preprocessReceipt(bytes, file.kind);
  const result = await recognizeText(prepared);

  let nextTxn = result.transactionId || null;
  let transactionConflict = null;
  if (nextTxn) {
    const owner = await transactionOwner(nextTxn, paymentId);
    if (owner) {
      transactionConflict = owner;
      nextTxn = null;
    }
  }

  // Keep a manually saved id unless OCR found a free one and the field is empty.
  const keepExisting = Boolean(order.transaction_id);
  const transactionId = keepExisting ? order.transaction_id : nextTxn;

  await withTransaction(async (tx) => {
    await tx.run(
      `UPDATE orders SET
         ocr_text = ?,
         ocr_confidence = ?,
         ocr_language = ?,
         ocr_receipt = ?,
         ocr_scanned_at = UTC_TIMESTAMP(3),
         ocr_scanned_by = ?,
         transaction_id = ?
       WHERE id = ?`,
      [
        result.text,
        result.confidence,
        result.language,
        file.name,
        adminId,
        transactionId,
        paymentId,
      ],
    );
    await writeAudit(tx, adminId, "scan_receipt", {
      orderId: paymentId,
      receipt: file.name,
      confidence: result.confidence,
      language: result.language,
      chars: result.text.length,
      transactionId: transactionId || null,
      extractedTransactionId: result.transactionId || null,
      transactionConflict,
    });
  });

  const saved = await get(
    "SELECT id, ocr_scanned_by, ocr_scanned_at, transaction_id FROM orders WHERE id = ?",
    [paymentId],
  );
  const scannerName = await adminName(adminId);
  return scanPayload(
    {
      id: paymentId,
      ocr_scanned_by: adminId,
      ocr_scanned_at: saved?.ocr_scanned_at,
      transaction_id: saved?.transaction_id || "",
    },
    file.name,
    result,
    scannerName,
    {
      extracted_transaction_id: result.transactionId || "",
      transaction_conflict: transactionConflict,
    },
  );
}

/**
 * Scan by receipt filename only (no order save). Prefer payment_id for accountability.
 */
export async function scanReceiptFile(receiptRef) {
  const file = await resolveReceiptFile(receiptRef);
  let bytes;
  try {
    bytes = await fs.readFile(file.full);
  } catch {
    throw httpError(404, "Receipt file not found");
  }

  const prepared = await preprocessReceipt(bytes, file.kind);
  const result = await recognizeText(prepared);

  return {
    payment_id: null,
    receipt: file.name,
    text: result.text,
    confidence: result.confidence,
    language: result.language,
    transaction_id: result.transactionId || "",
    scanned_by: null,
    scanned_by_name: "",
    scanned_at: null,
  };
}

/** Clear saved OCR text for an order (keeps receipt file + transaction id). */
export async function clearPaymentOcr(paymentId, adminId) {
  if (!adminId) throw httpError(401, "Staff sign-in required");
  const order = await get("SELECT id, receipt_path FROM orders WHERE id = ?", [paymentId]);
  if (!order) throw httpError(404, "Payment not found");

  await withTransaction(async (tx) => {
    await tx.run(
      `UPDATE orders SET
         ocr_text = NULL,
         ocr_confidence = NULL,
         ocr_language = NULL,
         ocr_receipt = NULL,
         ocr_scanned_at = NULL,
         ocr_scanned_by = NULL
       WHERE id = ?`,
      [paymentId],
    );
    await writeAudit(tx, adminId, "clear_receipt_ocr", {
      orderId: paymentId,
      receipt: order.receipt_path || null,
    });
  });

  return { payment_id: Number(paymentId), cleared: true };
}

/** Manually set / correct bank transaction id (unique — blocks reuse). */
export async function setPaymentTransactionId(paymentId, rawTransactionId, adminId) {
  if (!adminId) throw httpError(401, "Staff sign-in required");
  const transactionId = normalizeTransactionId(rawTransactionId);
  if (!transactionId) {
    throw httpError(400, "Enter a valid transaction ID (e.g. FT26305GCDDP)");
  }

  const order = await get("SELECT id, status FROM orders WHERE id = ?", [paymentId]);
  if (!order) throw httpError(404, "Payment not found");

  const owner = await transactionOwner(transactionId, paymentId);
  if (owner) {
    throw httpError(409, `Transaction ID already used on payment #${owner}`);
  }

  try {
    await withTransaction(async (tx) => {
      await tx.run("UPDATE orders SET transaction_id = ? WHERE id = ?", [transactionId, paymentId]);
      await writeAudit(tx, adminId, "set_transaction_id", {
        orderId: paymentId,
        transactionId,
      });
    });
  } catch (error) {
    const code = `${error.code || ""} ${error.message || ""}`;
    if (code.includes("ER_DUP_ENTRY") || code.includes("uniq_orders_transaction")) {
      throw httpError(409, "This transaction ID was already used on another payment");
    }
    throw error;
  }

  return {
    payment_id: Number(paymentId),
    transaction_id: transactionId,
  };
}

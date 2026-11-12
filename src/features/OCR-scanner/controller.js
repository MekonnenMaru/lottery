import { idOf } from "../../middleware/validate.js";
import { httpError } from "../../util.js";
import * as scanner from "./service.js";

export async function scan(req, res) {
  const paymentId = idOf(req.body?.payment_id ?? req.query?.payment_id);
  if (!paymentId) {
    throw httpError(400, "Provide a payment_id so the scan can be saved for accountability");
  }

  const result = await scanner.scanPaymentReceipt(paymentId, req.admin.id);

  res.json({
    success: true,
    payment_id: result.payment_id,
    receipt: result.receipt,
    text: result.text,
    confidence: result.confidence,
    language: result.language,
    transaction_id: result.transaction_id || "",
    extracted_transaction_id: result.extracted_transaction_id || "",
    transaction_conflict: result.transaction_conflict || null,
    scanned_by: result.scanned_by,
    scanned_by_name: result.scanned_by_name,
    scanned_at: result.scanned_at,
  });
}

export async function clear(req, res) {
  const paymentId = idOf(req.body?.payment_id ?? req.query?.payment_id);
  if (!paymentId) throw httpError(400, "Provide a payment_id");
  const result = await scanner.clearPaymentOcr(paymentId, req.admin.id);
  res.json({ success: true, ...result });
}

export async function setTransactionId(req, res) {
  const paymentId = idOf(req.body?.payment_id);
  if (!paymentId) throw httpError(400, "Provide a payment_id");
  const result = await scanner.setPaymentTransactionId(
    paymentId,
    req.body?.transaction_id,
    req.admin.id,
  );
  res.json({ success: true, ...result });
}

export async function setTransferDetails(req, res) {
  const paymentId = idOf(req.body?.payment_id);
  if (!paymentId) throw httpError(400, "Provide a payment_id");
  const result = await scanner.setPaymentTransferDetails(
    paymentId,
    {
      bankAccountId: idOf(req.body?.bank_account_id),
      senderAccount: req.body?.sender_account,
    },
    req.admin.id,
  );
  res.json({ success: true, ...result });
}

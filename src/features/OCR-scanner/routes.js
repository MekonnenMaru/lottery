import { Router } from "express";
import { requirePrivilege, requireStaff } from "../../middleware/auth.js";
import { wrap } from "../../middleware/error-handler.js";
import * as controller from "./controller.js";
import { ocrScanLimiter } from "./limiter.js";

const router = Router();
const payments = [requireStaff, requirePrivilege("payments")];

// CPU-heavy; staff-only. Limit comes from Admin → Settings.
router.post("/scan-receipt", ...payments, ocrScanLimiter, wrap(controller.scan));
router.get("/scan-receipt", ...payments, ocrScanLimiter, wrap(controller.scan));
router.post("/clear-receipt-ocr", ...payments, wrap(controller.clear));
router.post("/set-transaction-id", ...payments, wrap(controller.setTransactionId));
router.post("/set-payment-transfer", ...payments, wrap(controller.setTransferDetails));

export default router;

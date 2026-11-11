import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { httpError } from "../../util.js";

/** English first; Amharic (amh) can be added later when traineddata is available. */
const OCR_LANG = "eng";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const PDF_EXT = new Set([".pdf"]);

let workerPromise = null;

async function worker() {
  if (!workerPromise) {
    workerPromise = createWorker(OCR_LANG).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export function receiptKind(fileName) {
  const ext = String(fileName || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  if (IMAGE_EXT.has(ext)) return "image";
  if (PDF_EXT.has(ext)) return "pdf";
  return "unsupported";
}

/**
 * Preprocess receipt bytes for OCR. Returns a PNG buffer (not written to disk).
 */
export async function preprocessReceipt(input, kind) {
  if (kind === "pdf") {
    throw httpError(400, "PDF receipt scanning is not available yet. Upload a JPG, PNG, or WebP receipt.");
  }
  if (kind !== "image") {
    throw httpError(400, "Unsupported receipt format. Use JPG, JPEG, PNG, or WebP.");
  }
  try {
    return await sharp(input, { failOn: "none" })
      .rotate()
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    throw httpError(400, "Could not read this receipt image.");
  }
}

/**
 * Run Tesseract on an in-memory image buffer. Does not write files.
 * @returns {{ text: string, confidence: number, language: string }}
 */
export async function recognizeText(imageBuffer) {
  let data;
  try {
    const active = await worker();
    ({ data } = await active.recognize(imageBuffer));
  } catch (error) {
    workerPromise = null;
    throw httpError(500, error?.message || "OCR failed");
  }

  const text = String(data?.text || "").replace(/\r/g, "").trim();
  const confidence = Number.isFinite(Number(data?.confidence))
    ? Math.round(Number(data.confidence) * 10) / 10
    : 0;

  if (!text) {
    throw httpError(422, "No readable text was found on this receipt.");
  }

  return {
    text,
    confidence,
    language: OCR_LANG,
    transactionId: extractTransactionId(text),
  };
}

/**
 * Pull a bank transaction / reference id from OCR text (CBE-style FT… and labeled IDs).
 */
export function extractTransactionId(text) {
  const raw = String(text || "").replace(/\s+/g, " ");
  if (!raw) return null;

  const labeled = raw.match(
    /transaction\s*(?:id|ref(?:erence)?|no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{6,31})/i,
  );
  if (labeled?.[1]) return normalizeTransactionId(labeled[1]);

  const cbe = raw.match(/\b(FT[0-9]{5}[A-Z0-9]{4,16})\b/i);
  if (cbe?.[1]) return normalizeTransactionId(cbe[1]);

  const generic = raw.match(
    /\b(?:txn|ref(?:erence)?|trace)\s*(?:id|no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{6,31})\b/i,
  );
  if (generic?.[1]) return normalizeTransactionId(generic[1]);

  return null;
}

export function normalizeTransactionId(value) {
  const text = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9][A-Z0-9-]{5,63}$/.test(text)) return null;
  return text;
}

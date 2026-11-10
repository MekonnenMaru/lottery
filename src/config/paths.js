import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const publicDir = path.join(root, "public");
export const receiptDir = path.join(root, "storage", "receipts");
export const lotteryImageDir = path.join(publicDir, "uploads", "lotteries");

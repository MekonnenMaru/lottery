import crypto from "node:crypto";
import multer from "multer";
import { httpError } from "./util.js";
import { lotteryImageDir, receiptDir } from "./paths.js";

const IMAGE_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function imageUpload(destination, fileSize = 5 * 1024 * 1024) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, callback) => callback(null, destination),
      filename: (req, file, callback) => {
        const extension = IMAGE_TYPES[file.mimetype];
        if (!extension) {
          callback(httpError(400, "Upload a JPEG, PNG, or WebP image"));
          return;
        }
        callback(null, `${crypto.randomBytes(16).toString("hex")}${extension}`);
      },
    }),
    limits: { fileSize, files: 1 },
    fileFilter: (req, file, callback) => {
      if (!IMAGE_TYPES[file.mimetype]) {
        callback(httpError(400, "Upload a JPEG, PNG, or WebP image"));
        return;
      }
      callback(null, true);
    },
  });
}

export const screenshotUpload = imageUpload(receiptDir, 10 * 1024 * 1024);
export const lotteryUpload = imageUpload(lotteryImageDir);

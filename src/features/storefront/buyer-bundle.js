import fs from "node:fs";
import path from "node:path";
import { publicDir } from "../../paths.js";
import { branding } from "../settings/service.js";

/** Brand-neutral customer SPA template (placeholders filled from admin settings). */
const SOURCE_BUNDLE = path.join(publicDir, "assets", "buyer-source.js");
const OUTPUT_BUNDLE = path.join(publicDir, "assets", "maraki.js");

let cached = null;
let cachedStamp = "";

function stampOf(brand) {
  return [
    brand.app_name,
    brand.developer_name,
    brand.developer_url,
    brand.credit_prefix,
  ].join("\0");
}

function fill(source, brand) {
  return source
    .replaceAll("__APP_NAME__", brand.app_name)
    .replaceAll("__DEVELOPER_NAME__", brand.developer_name)
    .replaceAll("__DEVELOPER_URL__", brand.developer_url)
    .replaceAll("__CREDIT_PREFIX__", brand.credit_prefix);
}

export function invalidateBuyerBundle() {
  cached = null;
  cachedStamp = "";
}

export function buyerScript() {
  const brand = branding();
  const stamp = stampOf(brand);
  if (cached && cachedStamp === stamp) return cached;
  const source = fs.readFileSync(SOURCE_BUNDLE, "utf8");
  cached = fill(source, brand);
  cachedStamp = stamp;
  return cached;
}

export function publishBuyerBundle() {
  const body = buyerScript();
  fs.writeFileSync(OUTPUT_BUNDLE, body);
  return body;
}

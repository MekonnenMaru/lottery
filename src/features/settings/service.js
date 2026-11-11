import { BRANDING_DEFAULTS } from "../../config/branding.js";
import { all, run } from "../../db.js";
import { httpError, intValue, optionalText, requiredText } from "../../util.js";

export { BRANDING_DEFAULTS };

const BRANDING_KEYS = Object.keys(BRANDING_DEFAULTS);

/** App settings stored in the same settings table (admin-editable). */
export const APP_DEFAULTS = Object.freeze({
  ocr_scan_limit: "60",
  ocr_scan_window_minutes: "15",
});

const APP_KEYS = Object.keys(APP_DEFAULTS);

let brandCache = { ...BRANDING_DEFAULTS };
let appCache = { ...APP_DEFAULTS };

function cleanAppName(value) {
  const text = requiredText(value, 40);
  if (!text) return null;
  return text;
}

function cleanDeveloperName(value) {
  const text = requiredText(value, 60);
  if (!text) return null;
  return text;
}

function cleanDeveloperUrl(value) {
  const text = requiredText(value, 200);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function cleanCreditPrefix(value) {
  const text = optionalText(value, 40);
  if (text === null) return null;
  return text || BRANDING_DEFAULTS.credit_prefix;
}

function cleanOcrLimit(value) {
  return intValue(value, 1, 500);
}

function cleanOcrWindow(value) {
  return intValue(value, 1, 1440);
}

export function branding() {
  return { ...brandCache };
}

export function appName() {
  return brandCache.app_name;
}

export function ocrSettings() {
  return {
    scan_limit: Number(appCache.ocr_scan_limit) || Number(APP_DEFAULTS.ocr_scan_limit),
    scan_window_minutes: Number(appCache.ocr_scan_window_minutes) || Number(APP_DEFAULTS.ocr_scan_window_minutes),
  };
}

async function getAllSettings() {
  return all("SELECT setting_key, setting_value FROM settings");
}

async function upsertSetting(key, value) {
  await run(
    `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value],
  );
}

export async function loadSettings() {
  const rows = await getAllSettings();
  const nextBrand = { ...BRANDING_DEFAULTS };
  const nextApp = { ...APP_DEFAULTS };
  for (const row of rows) {
    const key = row.setting_key;
    const value = row.setting_value != null ? String(row.setting_value).trim() : "";
    if (!value) continue;
    if (BRANDING_KEYS.includes(key)) nextBrand[key] = value;
    if (APP_KEYS.includes(key)) nextApp[key] = value;
  }

  const hasBrand = rows.some((row) => BRANDING_KEYS.includes(row.setting_key));
  if (!hasBrand) {
    for (const key of BRANDING_KEYS) await upsertSetting(key, nextBrand[key]);
  }
  for (const key of APP_KEYS) {
    if (!rows.some((row) => row.setting_key === key)) {
      await upsertSetting(key, nextApp[key]);
    }
  }

  brandCache = nextBrand;
  appCache = nextApp;
  return branding();
}

export async function getBrandingSettings() {
  return branding();
}

export async function getAdminSettings() {
  return {
    branding: branding(),
    ocr: ocrSettings(),
  };
}

export async function updateBrandingSettings(input = {}) {
  const next = {
    app_name: cleanAppName(input.app_name ?? brandCache.app_name),
    developer_name: cleanDeveloperName(input.developer_name ?? brandCache.developer_name),
    developer_url: cleanDeveloperUrl(input.developer_url ?? brandCache.developer_url),
    credit_prefix: cleanCreditPrefix(input.credit_prefix ?? brandCache.credit_prefix),
  };
  if (!next.app_name) throw httpError(400, "Enter an app name (max 40 characters)");
  if (!next.developer_name) throw httpError(400, "Enter a developer name");
  if (!next.developer_url) throw httpError(400, "Enter a valid developer URL (http or https)");
  if (next.credit_prefix === null) throw httpError(400, "Credit line is too long");

  for (const key of BRANDING_KEYS) await upsertSetting(key, next[key]);
  brandCache = next;
  return branding();
}

export async function updateOcrSettings(input = {}) {
  const scanLimit = cleanOcrLimit(input.ocr_scan_limit ?? input.scan_limit ?? appCache.ocr_scan_limit);
  const windowMinutes = cleanOcrWindow(
    input.ocr_scan_window_minutes ?? input.scan_window_minutes ?? appCache.ocr_scan_window_minutes,
  );
  if (!scanLimit) throw httpError(400, "OCR scan limit must be between 1 and 500");
  if (!windowMinutes) throw httpError(400, "OCR window must be between 1 and 1440 minutes");

  const next = {
    ocr_scan_limit: String(scanLimit),
    ocr_scan_window_minutes: String(windowMinutes),
  };
  for (const key of APP_KEYS) await upsertSetting(key, next[key]);
  appCache = next;
  return ocrSettings();
}

export async function updateAdminSettings(input = {}) {
  const brandingNext = await updateBrandingSettings(input);
  const ocrNext = await updateOcrSettings(input);
  return { branding: brandingNext, ocr: ocrNext };
}

import { all, run } from "../../db.js";
import { httpError, optionalText, requiredText } from "../../util.js";

export const BRANDING_DEFAULTS = Object.freeze({
  app_name: "Maraki Car Sale",
  developer_name: "Maraki Tech",
  developer_url: "https://marakitech.et",
  credit_prefix: "Developed by",
});

const KEYS = Object.keys(BRANDING_DEFAULTS);

let cache = { ...BRANDING_DEFAULTS };

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

export function branding() {
  return { ...cache };
}

export function appName() {
  return cache.app_name;
}

export async function loadSettings() {
  const rows = await getAllSettings();
  const next = { ...BRANDING_DEFAULTS };
  for (const row of rows) {
    if (KEYS.includes(row.setting_key) && row.setting_value != null && String(row.setting_value).trim()) {
      next[row.setting_key] = String(row.setting_value).trim();
    }
  }
  const seeded = rows.some((row) => KEYS.includes(row.setting_key));
  if (!seeded) {
    for (const key of KEYS) {
      await run(
        `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, next[key]],
      );
    }
  }
  cache = next;
  return branding();
}

async function getAllSettings() {
  return all("SELECT setting_key, setting_value FROM settings");
}

export async function getBrandingSettings() {
  return branding();
}

export async function updateBrandingSettings(input = {}) {
  const next = {
    app_name: cleanAppName(input.app_name ?? cache.app_name),
    developer_name: cleanDeveloperName(input.developer_name ?? cache.developer_name),
    developer_url: cleanDeveloperUrl(input.developer_url ?? cache.developer_url),
    credit_prefix: cleanCreditPrefix(input.credit_prefix ?? cache.credit_prefix),
  };
  if (!next.app_name) throw httpError(400, "Enter an app name (max 40 characters)");
  if (!next.developer_name) throw httpError(400, "Enter a developer name");
  if (!next.developer_url) throw httpError(400, "Enter a valid developer URL (http or https)");
  if (next.credit_prefix === null) throw httpError(400, "Credit line is too long");

  for (const key of KEYS) {
    await run(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, next[key]],
    );
  }
  cache = next;
  return branding();
}

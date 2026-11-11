'use strict';

/** Public URL prefix when lottery runs inside maraki_bingo (e.g. "/lottery"). */
export const LOTTERY_BASE_PATH = String(process.env.LOTTERY_BASE_PATH || '/lottery')
  .trim()
  .replace(/\/+$/, '') || '/lottery';

export function lotteryEnabled() {
  const v = String(process.env.LOTTERY_ENABLED ?? 'yes').trim().toLowerCase();
  return !(v === 'no' || v === 'false' || v === '0' || v === 'off');
}

export function lotteryTelegramEnabled() {
  const v = String(process.env.LOTTERY_TELEGRAM_ENABLED || 'no').trim().toLowerCase();
  return v === 'yes' || v === 'true' || v === '1' || v === 'on';
}

/**
 * Rewrite root-absolute asset/API paths so the SPA works under LOTTERY_BASE_PATH.
 * Idempotent for already-prefixed paths.
 */
export function rewritePublicPaths(body, basePath = LOTTERY_BASE_PATH) {
  const base = String(basePath || '').replace(/\/+$/, '');
  if (!base) return String(body ?? '');
  let text = String(body ?? '');
  // Skip if already rewritten heavily
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text.replace(new RegExp(`(["'\`])${esc}/api`, 'g'), `$1${base}/api`);
  text = text.replace(/(["'`])\/api/g, `$1${base}/api`);
  text = text.replace(/(href|src|content)=(["'])\/(?!\/)/g, `$1=$2${base}/`);
  text = text.replace(/url\(\//g, `url(${base}/`);
  text = text.replaceAll(`${base}${base}/`, `${base}/`);
  return text;
}

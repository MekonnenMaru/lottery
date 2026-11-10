/**
 * Platform clock.
 * - Store and compare instants in UTC.
 * - Show and accept wall clocks as Africa/Addis_Ababa (UTC+3, no DST).
 * - Server Date (NTP-synced OS clock) is the only source of "now".
 */

export const APP_TIMEZONE = "Africa/Addis_Ababa";
export const APP_OFFSET = "+03:00";
/** Minutes to add to an Addis wall clock to reach UTC. Same sign as Date#getTimezoneOffset. */
export const APP_TZ_MINUTES = -180;

/** @deprecated Same offset as Addis; kept for existing imports. */
export const NAIROBI_OFFSET = APP_OFFSET;
/** @deprecated Same offset as Addis; kept for existing imports. */
export const NAIROBI_TZ_MINUTES = APP_TZ_MINUTES;

process.env.TZ = APP_TIMEZONE;

export function nowMs() {
  return Date.now();
}

export function nowDate() {
  return new Date();
}

export function clockPayload() {
  return {
    success: true,
    now: nowDate().toISOString(),
    timezone: APP_TIMEZONE,
    offset: APP_OFFSET,
  };
}

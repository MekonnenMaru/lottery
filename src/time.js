/** Platform clock: Africa/Nairobi (UTC+3, no daylight saving). The server clock is the source. */

export const APP_TIMEZONE = "Africa/Nairobi";
export const NAIROBI_OFFSET = "+03:00";
/** Minutes to add to a Nairobi wall clock to reach UTC. Same sign as Date#getTimezoneOffset. */
export const NAIROBI_TZ_MINUTES = -180;

process.env.TZ = APP_TIMEZONE;

export function clockPayload() {
  return {
    success: true,
    now: new Date().toISOString(),
    timezone: APP_TIMEZONE,
    offset: NAIROBI_OFFSET,
  };
}

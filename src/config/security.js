import { env } from "./env.js";
import { LOTTERY_BASE_PATH } from "./embed.js";

/** Auth, cookie, and hashing settings. */
export function securityConfig() {
  const config = env();
  const base = String(config.basePath || LOTTERY_BASE_PATH || "").replace(/\/+$/, "");
  // Standalone under /lottery must scope cookies to that path (reverse-proxy friendly).
  const cookiePath = base && base !== "/" ? `${base}/` : "/";
  const httpsApp = /^https:\/\//i.test(String(config.appUrl || ""));
  return {
    isProduction: config.isProduction,
    sessionSecret: config.sessionSecret,
    adminUsername: config.adminUsername,
    adminPassword: config.adminPassword,
    adminSessionTtlMs: 12 * 60 * 60 * 1000,
    buyerSessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    bcryptRounds: 12,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction || httpsApp,
      path: cookiePath,
    },
  };
}

export function cookieOptions(expiresAt) {
  return {
    ...securityConfig().cookie,
    expires: new Date(expiresAt),
  };
}

export function clearCookieOptions() {
  return { ...securityConfig().cookie };
}

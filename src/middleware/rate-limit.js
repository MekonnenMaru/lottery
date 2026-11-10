import rateLimit from "express-rate-limit";

export function siteLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many attempts. Try again later." },
  });
}

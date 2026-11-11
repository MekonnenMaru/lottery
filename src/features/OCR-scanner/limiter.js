import { ocrSettings } from "../settings/service.js";

/** In-memory OCR scan counters keyed by client IP (or admin id when present). */
const buckets = new Map();

function clientKey(req) {
  if (req.admin?.id != null) return `admin:${req.admin.id}`;
  return `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
}

function prune(now) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Dynamic rate limit from Admin → Settings (OCR scan limit / window).
 */
export function ocrScanLimiter(req, res, next) {
  const { scan_limit: limit, scan_window_minutes: minutes } = ocrSettings();
  const windowMs = Math.max(1, minutes) * 60 * 1000;
  const now = Date.now();
  prune(now);

  const key = clientKey(req);
  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  res.set("X-RateLimit-Limit", String(limit));
  res.set("X-RateLimit-Remaining", String(remaining));
  res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > limit) {
    const retrySec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.set("Retry-After", String(retrySec));
    res.status(429).json({ success: false, message: "Too many attempts. Try again later." });
    return;
  }
  next();
}

import crypto from "node:crypto";
import { httpError } from "../../util.js";

const ISSUER = "https://oauth.telegram.org";
let keysCache = { at: 0, keys: [] };

async function signingKeys(force) {
  if (!force && keysCache.keys.length && Date.now() - keysCache.at < 60 * 60 * 1000) return keysCache.keys;
  const response = await fetch(`${ISSUER}/.well-known/jwks.json`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw httpError(400, "Could not confirm the Telegram sign-in");
  const body = await response.json();
  const keys = Array.isArray(body.keys) ? body.keys : [];
  keysCache = { at: Date.now(), keys };
  return keys;
}

function decode(part) {
  const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

const SIGNING_ALGS = new Set(["RS256", "ES256", "EdDSA", "ES256K"]);

function signedByTelegram(alg, key, data, signature) {
  if (alg === "RS256") return crypto.verify("RSA-SHA256", data, key, signature);
  if (alg === "ES256" || alg === "ES256K") {
    return crypto.verify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, signature);
  }
  if (alg === "EdDSA") return crypto.verify(null, data, key, signature);
  return false;
}

// Step 4. Trust the user only after Telegram's signature and claims check out.
export async function verifyTelegramToken(idToken, clientId) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3 || parts.some((part) => !part || part.length > 8000)) {
    throw httpError(400, "Telegram sign-in was rejected");
  }
  let header;
  let payload;
  try {
    header = JSON.parse(decode(parts[0]).toString("utf8"));
    payload = JSON.parse(decode(parts[1]).toString("utf8"));
  } catch {
    throw httpError(400, "Telegram sign-in was rejected");
  }
  if (!header?.kid || !SIGNING_ALGS.has(header.alg)) {
    throw httpError(400, "Telegram sign-in was rejected");
  }
  let keys = await signingKeys(false);
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    keys = await signingKeys(true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  let key;
  try {
    key = jwk ? crypto.createPublicKey({ key: jwk, format: "jwk" }) : null;
  } catch {
    key = null;
  }
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  if (!key || !signedByTelegram(header.alg, key, data, decode(parts[2]))) {
    throw httpError(400, "Telegram sign-in was rejected");
  }
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== ISSUER || !audience.map(String).includes(String(clientId))) {
    throw httpError(400, "Telegram sign-in was rejected");
  }
  if (!Number.isFinite(payload.exp) || payload.exp < now - 60) throw httpError(400, "This sign-in expired");
  if (Number.isFinite(payload.nbf) && payload.nbf > now + 60) throw httpError(400, "Telegram sign-in was rejected");
  return payload;
}

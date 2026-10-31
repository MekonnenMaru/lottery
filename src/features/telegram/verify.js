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
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function reject(reason) {
  const detail = String(reason).slice(0, 80);
  console.error(`Telegram sign-in rejected: ${detail}`);
  throw httpError(400, `Telegram sign-in was rejected (${detail})`);
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
function publicKey(jwk) {
  if (!jwk) return null;
  const copy = { ...jwk };
  delete copy.key_ops;
  delete copy.ext;
  try {
    return crypto.createPublicKey({ key: copy, format: "jwk" });
  } catch {
    return null;
  }
}

export async function verifyTelegramToken(idToken, clientId) {
  const parts = String(idToken || "").trim().split(".");
  if (parts.length !== 3 || parts.some((part) => !part || part.length > 20000)) reject("token shape");
  let header;
  let payload;
  try {
    header = JSON.parse(decode(parts[0]).toString("utf8"));
    payload = JSON.parse(decode(parts[1]).toString("utf8"));
  } catch {
    reject("token unreadable");
  }
  if (!header?.kid || !SIGNING_ALGS.has(header.alg)) reject(`algorithm ${header?.alg || "missing"}`);
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = decode(parts[2]);
  let keys = await signingKeys(false);
  let key = publicKey(keys.find((item) => item.kid === header.kid));
  if (!key || !signedByTelegram(header.alg, key, data, signature)) {
    keys = await signingKeys(true);
    key = publicKey(keys.find((item) => item.kid === header.kid));
    if (!key || !signedByTelegram(header.alg, key, data, signature)) {
      reject(`signature kid ${header.kid}`);
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const issuer = String(payload.iss || "").replace(/\/+$/, "");
  if (issuer !== ISSUER) reject(`issuer ${issuer || "missing"}`);
  const audience = (Array.isArray(payload.aud) ? payload.aud : [payload.aud]).map(String);
  if (!audience.includes(String(clientId))) reject(`audience ${audience.join(",") || "missing"}`);
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp < now - 300) throw httpError(400, "This sign-in expired");
  const nbf = Number(payload.nbf);
  if (Number.isFinite(nbf) && nbf > now + 300) reject("not active yet");
  return payload;
}

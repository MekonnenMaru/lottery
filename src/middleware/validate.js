import { httpError, intValue } from "../util.js";

export function idOf(value) {
  return intValue(value, 1, 1_000_000_000);
}

export function requireId(value, message = "Not found") {
  const id = idOf(value);
  if (!id) throw httpError(404, message);
  return id;
}

export function requiredString(value, message) {
  const text = String(value ?? "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

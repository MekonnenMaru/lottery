import crypto from "node:crypto";
import { get, run } from "../../db.js";

export async function createSession(kind, subject, ttlMs) {
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ttlMs;
  await run(
    "INSERT INTO sessions (id, kind, subject, expires_at) VALUES (?, ?, ?, ?)",
    [id, kind, subject, expiresAt],
  );
  return { id, expiresAt };
}

export async function destroySession(id) {
  if (!id || !/^[a-f0-9]{64}$/.test(id)) return;
  await run("DELETE FROM sessions WHERE id = ?", [id]);
}

export async function readSession(id, kind) {
  if (!id || !/^[a-f0-9]{64}$/.test(id)) return null;
  const row = await get("SELECT * FROM sessions WHERE id = ? AND kind = ?", [id, kind]);
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await run("DELETE FROM sessions WHERE id = ?", [id]);
    return null;
  }
  return row;
}

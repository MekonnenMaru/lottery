import bcrypt from "bcryptjs";
import { get, run } from "../../db.js";
import { httpError } from "../../util.js";

export async function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  const passwordHash = bcrypt.hashSync(password, 12);
  const existing = await get("SELECT id, password_hash FROM admins WHERE username = ?", [username]);
  if (!existing) {
    await run("INSERT INTO admins (username, password_hash) VALUES (?, ?)", [username, passwordHash]);
  }
  return username;
}

export async function changeAdminPassword(id, currentPassword, newPassword) {
  const admin = await get("SELECT id, password_hash FROM admins WHERE id = ?", [id]);
  if (!admin) throw httpError(404, "Account not found");
  const current = String(currentPassword ?? "");
  const next = String(newPassword ?? "");
  const match = await bcrypt.compare(current, admin.password_hash);
  if (!match) throw httpError(400, "Current password is wrong");
  if (next.length < 4 || next.length > 72) throw httpError(400, "Use 4 to 72 characters");
  if (next === current) throw httpError(400, "Choose a different password");
  const passwordHash = await bcrypt.hash(next, 12);
  await run("UPDATE admins SET password_hash = ? WHERE id = ?", [passwordHash, admin.id]);
}

export async function findAdmin(username) {
  return get("SELECT * FROM admins WHERE username = ?", [username]);
}

export async function findAdminById(id) {
  return get("SELECT id, username FROM admins WHERE id = ?", [id]);
}

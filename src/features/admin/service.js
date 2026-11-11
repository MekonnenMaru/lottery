import bcrypt from "bcryptjs";
import { securityConfig } from "../../config/security.js";
import { all, get, run } from "../../db.js";
import { httpError } from "../../util.js";

/** Fixed privilege checklist shown when creating/editing staff. */
export const PRIVILEGES = [
  { id: "payments", label: "Payments" },
  { id: "lotteries", label: "Lotteries" },
  { id: "banks", label: "Banks" },
  { id: "winners", label: "Winners" },
  { id: "customers", label: "Customers" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

const PRIVILEGE_IDS = new Set(PRIVILEGES.map((row) => row.id));

export function parsePrivileges(raw) {
  if (Array.isArray(raw)) {
    return raw.map(String).filter((id) => PRIVILEGE_IDS.has(id));
  }
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter((id) => PRIVILEGE_IDS.has(id));
  } catch {
    return [];
  }
}

export function isSuper(admin) {
  return admin?.role === "super";
}

export function can(admin, privilege) {
  if (!admin || admin.active === 0 || admin.active === false) return false;
  if (isSuper(admin)) return true;
  return parsePrivileges(admin.privileges).includes(privilege);
}

export function adminPublic(admin) {
  if (!admin) return null;
  const role = isSuper(admin) ? "super" : "admin";
  return {
    id: admin.id,
    name: admin.name || admin.username,
    username: admin.username,
    phone: admin.phone || "",
    role,
    privileges: role === "super" ? PRIVILEGES.map((row) => row.id) : parsePrivileges(admin.privileges),
    active: admin.active !== 0 && admin.active !== false,
  };
}

export async function ensureAdmin() {
  const { adminUsername: username, adminPassword: password, bcryptRounds } = securityConfig();
  const passwordHash = bcrypt.hashSync(password, bcryptRounds);
  const existing = await get("SELECT id, password_hash, name FROM admins WHERE username = ?", [username]);
  if (!existing) {
    await run(
      "INSERT INTO admins (username, password_hash, name, phone, role, privileges, active) VALUES (?, ?, ?, NULL, 'super', NULL, 1)",
      [username, passwordHash, "Super Admin"],
    );
  } else {
    await run("UPDATE admins SET role = 'super', active = 1, name = COALESCE(NULLIF(name, ''), ?) WHERE id = ?", [
      "Super Admin",
      existing.id,
    ]);
  }
  // Only the configured account stays super; other accounts keep full access as regular admins.
  const allPriv = JSON.stringify(PRIVILEGES.map((row) => row.id));
  await run(
    "UPDATE admins SET role = 'admin', privileges = COALESCE(NULLIF(privileges, ''), ?) WHERE username <> ? AND role = 'super'",
    [allPriv, username],
  );
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
  const passwordHash = await bcrypt.hash(next, securityConfig().bcryptRounds);
  await run("UPDATE admins SET password_hash = ? WHERE id = ?", [passwordHash, admin.id]);
}

export async function findAdmin(username) {
  return get("SELECT * FROM admins WHERE username = ?", [username]);
}

export async function findAdminById(id) {
  const row = await get(
    "SELECT id, username, name, phone, role, privileges, active FROM admins WHERE id = ?",
    [id],
  );
  if (!row) return null;
  return {
    ...row,
    name: row.name || row.username,
    phone: row.phone || "",
    privileges: parsePrivileges(row.privileges),
    active: Number(row.active) === 1,
  };
}

function cleanName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw httpError(400, "Name must be 2–80 characters");
  return name;
}

function cleanUsername(value) {
  const username = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw httpError(400, "Username must be 3–32 letters, numbers, . _ or -");
  }
  return username;
}

function cleanPhone(value) {
  const phone = String(value ?? "").trim();
  if (!phone) return null;
  if (!/^\+?[0-9][0-9\s-]{6,18}[0-9]$/.test(phone)) {
    throw httpError(400, "Enter a valid phone number or leave it blank");
  }
  return phone.replace(/\s+/g, " ");
}

function cleanPassword(value) {
  const password = String(value ?? "");
  if (password.length < 4 || password.length > 72) throw httpError(400, "Use 4 to 72 characters");
  return password;
}

function cleanPrivilegeList(value) {
  const list = Array.isArray(value) ? value.map(String).filter((id) => PRIVILEGE_IDS.has(id)) : [];
  return [...new Set(list)];
}

function staffRow(row) {
  return {
    id: row.id,
    name: row.name || row.username,
    username: row.username,
    phone: row.phone || "",
    role: row.role === "super" ? "super" : "admin",
    privileges: row.role === "super" ? PRIVILEGES.map((item) => item.id) : parsePrivileges(row.privileges),
    active: Number(row.active) === 1,
    created_at: row.created_at,
  };
}

export async function listStaff() {
  const rows = await all(
    "SELECT id, name, username, phone, role, privileges, active, created_at FROM admins ORDER BY role DESC, name ASC, username ASC",
  );
  return rows.map(staffRow);
}

export async function createStaff({ name, username, phone, password, privileges }) {
  const displayName = cleanName(name);
  const user = cleanUsername(username);
  const mobile = cleanPhone(phone);
  const pass = cleanPassword(password);
  const list = cleanPrivilegeList(privileges);
  if (!list.length) throw httpError(400, "Pick at least one privilege");
  const taken = await get("SELECT id FROM admins WHERE username = ?", [user]);
  if (taken) throw httpError(400, "That username is already used");
  const passwordHash = await bcrypt.hash(pass, securityConfig().bcryptRounds);
  const result = await run(
    "INSERT INTO admins (username, password_hash, name, phone, role, privileges, active) VALUES (?, ?, ?, ?, 'admin', ?, 1)",
    [user, passwordHash, displayName, mobile, JSON.stringify(list)],
  );
  return {
    id: result.insertId,
    name: displayName,
    username: user,
    phone: mobile || "",
    role: "admin",
    privileges: list,
    active: true,
  };
}

export async function updateStaff(actorId, { id, name, phone, privileges, active, password }) {
  const staffId = Number(id);
  if (!Number.isInteger(staffId) || staffId < 1) throw httpError(404, "Admin not found");
  const row = await get("SELECT id, role FROM admins WHERE id = ?", [staffId]);
  if (!row) throw httpError(404, "Admin not found");
  const superRow = row.role === "super";

  if (name !== undefined || phone !== undefined) {
    const nextName = name !== undefined ? cleanName(name) : null;
    const nextPhone = phone !== undefined ? cleanPhone(phone) : undefined;
    if (nextName != null && nextPhone !== undefined) {
      await run("UPDATE admins SET name = ?, phone = ? WHERE id = ?", [nextName, nextPhone, staffId]);
    } else if (nextName != null) {
      await run("UPDATE admins SET name = ? WHERE id = ?", [nextName, staffId]);
    } else if (nextPhone !== undefined) {
      await run("UPDATE admins SET phone = ? WHERE id = ?", [nextPhone, staffId]);
    }
  }

  if (superRow) {
    if (privileges !== undefined || active !== undefined || (password !== undefined && password !== "")) {
      throw httpError(400, "Super admin privileges cannot be edited here");
    }
    return (await listStaff()).find((item) => item.id === staffId);
  }

  if (privileges !== undefined) {
    const list = cleanPrivilegeList(privileges);
    if (!list.length) throw httpError(400, "Pick at least one privilege");
    await run("UPDATE admins SET privileges = ? WHERE id = ?", [JSON.stringify(list), staffId]);
  }

  if (active !== undefined) {
    const next = active === true || active === 1 || active === "1" ? 1 : 0;
    if (staffId === Number(actorId) && next === 0) throw httpError(400, "You cannot disable your own account");
    await run("UPDATE admins SET active = ? WHERE id = ?", [next, staffId]);
  }

  if (password !== undefined && password !== "") {
    const pass = cleanPassword(password);
    const passwordHash = await bcrypt.hash(pass, securityConfig().bcryptRounds);
    await run("UPDATE admins SET password_hash = ? WHERE id = ?", [passwordHash, staffId]);
  }

  return (await listStaff()).find((item) => item.id === staffId);
}

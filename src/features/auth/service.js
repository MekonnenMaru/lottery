import bcrypt from "bcryptjs";
import { securityConfig } from "../../config/security.js";
import { httpError } from "../../util.js";
import { changeAdminPassword, findAdmin } from "../admin/service.js";
import { createSession, destroySession } from "./session.js";

const dummyPasswordHash = bcrypt.hashSync("not-a-real-admin-password", 12);

export async function loginStaff(username, password) {
  const admin = await findAdmin(username);
  const match = await bcrypt.compare(password, admin?.password_hash || dummyPasswordHash);
  if (!admin || !match) throw httpError(401, "Invalid username or password");
  const session = await createSession("admin", String(admin.id), securityConfig().adminSessionTtlMs);
  return {
    admin: { id: admin.id, username: admin.username },
    session,
  };
}

export async function logoutStaff(sessionId) {
  await destroySession(sessionId);
}

export async function changeStaffPassword(adminId, currentPassword, newPassword) {
  await changeAdminPassword(adminId, currentPassword, newPassword);
}

/** @deprecated Use `./session.js` for session storage helpers. */
export { createSession, destroySession, readSession } from "./session.js";

import { clearCookieOptions, cookieOptions } from "../../config/security.js";
import { adminPublic } from "../admin/service.js";
import { logEvent } from "../audit/service.js";
import { changeStaffPassword, loginStaff, logoutStaff } from "./service.js";
import { parseLoginBody, parsePasswordChangeBody } from "./validation.js";

export async function session(req, res) {
  res.json({ success: true, admin: adminPublic(req.admin) });
}

export async function login(req, res) {
  const { username, password } = parseLoginBody(req.body);
  const result = await loginStaff(username, password);
  res.cookie("admin_sid", result.session.id, cookieOptions(result.session.expiresAt));
  await logEvent(result.admin.id, "login", { username: result.admin.username });
  res.json({ success: true, admin: result.admin });
}

export async function logout(req, res) {
  const adminId = req.admin?.id;
  await logoutStaff(req.cookies?.admin_sid);
  res.clearCookie("admin_sid", clearCookieOptions());
  if (adminId) await logEvent(adminId, "logout", {});
  res.json({ success: true });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = parsePasswordChangeBody(req.body);
  await changeStaffPassword(req.admin.id, currentPassword, newPassword);
  await logEvent(req.admin.id, "change_password", {});
  res.json({ success: true });
}

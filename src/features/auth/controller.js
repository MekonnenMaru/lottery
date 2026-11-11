import { clearCookieOptions, cookieOptions } from "../../config/security.js";
import { adminPublic } from "../admin/service.js";
import { changeStaffPassword, loginStaff, logoutStaff } from "./service.js";
import { parseLoginBody, parsePasswordChangeBody } from "./validation.js";

export async function session(req, res) {
  res.json({ success: true, admin: adminPublic(req.admin) });
}

export async function login(req, res) {
  const { username, password } = parseLoginBody(req.body);
  const result = await loginStaff(username, password);
  res.cookie("admin_sid", result.session.id, cookieOptions(result.session.expiresAt));
  res.json({ success: true, admin: result.admin });
}

export async function logout(req, res) {
  await logoutStaff(req.cookies?.admin_sid);
  res.clearCookie("admin_sid", clearCookieOptions());
  res.json({ success: true });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = parsePasswordChangeBody(req.body);
  await changeStaffPassword(req.admin.id, currentPassword, newPassword);
  res.json({ success: true });
}

import { httpError } from "../../util.js";

export function parseLoginBody(body = {}) {
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) throw httpError(400, "Enter username and password");
  return { username, password };
}

export function parsePasswordChangeBody(body = {}) {
  const currentPassword = String(body.current_password ?? "");
  const newPassword = String(body.new_password ?? "");
  if (!currentPassword || !newPassword) throw httpError(400, "Enter your current and new password");
  return { currentPassword, newPassword };
}

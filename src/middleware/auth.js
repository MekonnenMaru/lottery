import { findAdminById } from "../features/admin/service.js";
import { readSession } from "../features/auth/session.js";

/** Require a valid staff (admin) session cookie. */
export async function requireStaff(req, res, next) {
  try {
    const session = await readSession(req.cookies?.admin_sid, "admin");
    const admin = session ? await findAdminById(Number(session.subject)) : null;
    if (!admin) {
      res.status(401).json({ success: false, message: "Staff sign-in required" });
      return;
    }
    req.admin = admin;
    req.adminSession = session;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
}
